import os
import redis
import pyotp
import json
import time
import asyncio
import uuid
import psycopg2
from fastapi import FastAPI, HTTPException, Header, UploadFile, File, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from typing import Optional, Dict
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

app = FastAPI()
templates = Jinja2Templates(directory="templates")

# --- CONFIGURATION ---
SECRET_KEY = os.getenv("ANTNET_SECRET", "JBSWY3DPEHPK3PXP")

# Database Config (Postgres)
DB_PARAMS = {
    "dbname": "postgres",
    "user": "postgres",
    "password": "password",
    "host": "127.0.0.1",
    "port": "5435"
}

# Redis Config
redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
r = redis.from_url(redis_url, decode_responses=True)

# --- STATE TRACKING (IN-MEMORY) ---
# 1. For Frontend UI (Simpler view)
worker_registry = {} 

# 2. For Fault Tolerance (The Reaper's View)
# Format: { "laptop-1": { "last_seen": 1234567.89, "current_task": {...} } }
worker_state = {} 

WORKER_TIMEOUT = 15 # Seconds before a worker is declared DEAD

# --- MODELS ---
class Heartbeat(BaseModel):
    worker_id: str
    status: str
    cpu: float = 0.0
    ram: float = 0.0

class TaskResult(BaseModel):
    worker_id: str
    injection_id: str
    chunk_index: int
    total_chunks: int
    heading: str
    content: str

# --- BACKGROUND REAPER SERVICE ---
@app.on_event("startup")
async def startup_event():
    """Start the Reaper background task."""
    asyncio.create_task(monitor_workers())

async def monitor_workers():
    """Checks for dead workers and re-queues their tasks."""
    print("💀 Reaper Service Started: Watching for dead workers...")
    while True:
        now = time.time()
        dead_workers = []

        # 1. Identify Dead Workers
        for wid, state in list(worker_state.items()):
            if now - state["last_seen"] > WORKER_TIMEOUT:
                print(f"⚠️ Worker {wid} is DEAD (No heartbeat for {int(now - state['last_seen'])}s)")
                
                # 2. Check for Lost Tasks
                if state.get("current_task"):
                    lost_task = state["current_task"]
                    print(f"   🔄 Re-queueing Chunk {lost_task.get('chunk_index')} for Job {lost_task.get('injection_id')}")
                    
                    # Push back to Redis (High Priority - Push to LEFT)
                    r.lpush("job_queue", json.dumps(lost_task))
                
                dead_workers.append(wid)

        # 3. Clean up Registry
        for wid in dead_workers:
            if wid in worker_state: del worker_state[wid]
            if wid in worker_registry: del worker_registry[wid]

        await asyncio.sleep(5) # Check every 5 seconds

# --- ROUTES ---

@app.get("/", response_class=HTMLResponse)
async def dashboard(request: Request):
    """Serves the Dashboard UI"""
    # Create templates/index.html if you haven't already!
    try:
        return templates.TemplateResponse("index.html", {"request": request})
    except:
        return HTMLResponse("<h1>AntNet Master Online</h1><p>Create templates/index.html for the full dashboard.</p>")

@app.post("/heartbeat")
def heartbeat(
    hb: Heartbeat, 
    x_auth_token: Optional[str] = Header(None)
):
    """
    Workers ping this every 5s. Updates state and Vital Signs.
    """
    # 1. Security Check
    totp = pyotp.TOTP(SECRET_KEY)
    # Allow a small window or skip auth for debug if token is missing
    if x_auth_token and not totp.verify(x_auth_token, valid_window=1):
        raise HTTPException(status_code=403, detail="Invalid Authentication Token")

    # 2. Update Reaper State (Last Seen)
    if hb.worker_id not in worker_state:
        worker_state[hb.worker_id] = {}
    worker_state[hb.worker_id]["last_seen"] = time.time()

    # 3. Update Frontend Registry (Vitals)
    worker_registry[hb.worker_id] = {
        "status": hb.status,
        "cpu": hb.cpu,
        "ram": hb.ram,
        "seen": "Just now"
    }

    return {"command": "continue"}

@app.get("/get_task")
def get_task(worker_id: str):
    """
    Assigns a task to a worker and tracks it.
    """
    # 1. Get task from Redis
    task_json = r.lpop("job_queue")
    
    if task_json:
        # 2. Assign to Worker (Save State for Reaper)
        task_data = json.loads(task_json)
        
        # Ensure worker exists in state
        if worker_id not in worker_state:
            worker_state[worker_id] = {"last_seen": time.time()}
            
        worker_state[worker_id]["current_task"] = task_data
        
        return {"has_task": True, "task_data": task_json}
    
    return {"has_task": False}

@app.post("/submit_result")
def submit_result(result: TaskResult):
    """
    Saves result to Postgres and clears the worker's assignment.
    """
    print(f"📥 Received Chunk {result.chunk_index}/{result.total_chunks} from {result.worker_id}")
    
    # 1. Save to Postgres
    sql = """
    INSERT INTO reports (injection_id, worker_id, chunk_index, total_chunks, heading, content)
    VALUES (%s, %s, %s, %s, %s, %s)
    """
    try:
        conn = psycopg2.connect(**DB_PARAMS)
        cur = conn.cursor()
        cur.execute(sql, (
            result.injection_id,
            result.worker_id,
            result.chunk_index,
            result.total_chunks,
            result.heading,
            result.content
        ))
        conn.commit()
        cur.close()
        conn.close()
        
        # 2. Clear Assignment (Tell Reaper the job is done)
        if result.worker_id in worker_state:
            worker_state[result.worker_id]["current_task"] = None
            
        return {"status": "saved_to_postgres"}
        
    except Exception as e:
        print(f"❌ DB Error: {e}")
        # Don't raise 500 here, or worker will retry forever. 
        # Just log it.
        return {"status": "error", "detail": str(e)}

# --- FRONTEND API ENDPOINTS ---

@app.get("/api/workers")
def get_workers_api():
    """Frontend calls this to get live stats"""
    return worker_registry

@app.post("/api/upload_job")
async def upload_job(file: UploadFile = File(...)):
    """Handles File Upload -> Chunking -> Queueing"""
    content = await file.read()
    try:
        text = content.decode("utf-8")
    except:
        return JSONResponse(status_code=400, content={"error": "File must be text/utf-8"})
    
    # 1. Generate ID
    injection_id = str(uuid.uuid4())[:8]
    
    # 2. Save Metadata to DB
    try:
        conn = psycopg2.connect(**DB_PARAMS)
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO injections (injection_id, original_prompt) VALUES (%s, %s)",
            (injection_id, f"File: {file.filename}")
        )
        conn.commit()
        conn.close()
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

    # 3. Chunk and Push to Redis
    chunk_size = 2000 # Characters (approx 400 words)
    chunks = [text[i:i+chunk_size] for i in range(0, len(text), chunk_size)]
    total = len(chunks)

    print(f"📦 Job {injection_id}: Splitting into {total} chunks...")

    for i, chunk in enumerate(chunks):
        strict_prompt = f"""
        INSTRUCTION: Summarize the text below. Output ONLY the summary. No intro words.
        TEXT: "{chunk}"
        """
        payload = {
            "injection_id": injection_id,
            "chunk_index": i + 1,
            "total_chunks": total,
            "prompt": strict_prompt
        }
        r.rpush("job_queue", json.dumps(payload))

    return {"status": "queued", "injection_id": injection_id, "total_chunks": total}

@app.get("/api/results/{injection_id}")
def get_results_api(injection_id: str):
    """Frontend polls this to check progress"""
    try:
        conn = psycopg2.connect(**DB_PARAMS)
        cur = conn.cursor()
        
        # Get progress
        cur.execute("SELECT COUNT(*) FROM reports WHERE injection_id = %s", (injection_id,))
        completed_count = cur.fetchone()[0]
        
        # Get content (ordered)
        cur.execute("SELECT chunk_index, content FROM reports WHERE injection_id = %s ORDER BY chunk_index", (injection_id,))
        rows = cur.fetchall()
        conn.close()
        
        # Assemble text
        assembled_text = "\n\n".join([f"--- Section {r[0]} ---\n{r[1]}" for r in rows])
        
        return {
            "completed": completed_count,
            "text": assembled_text
        }
    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    import uvicorn
    print("🕷️ AntNet Master Server Starting...")
    uvicorn.run(app, host="0.0.0.0", port=8000)