import time
import requests
import pyotp
import json
import os
import threading
import psutil  

# --- CONFIGURATION ---
MASTER_URL = "http://localhost:8000"  # <--- NO TRAILING SLASH /
SECRET_KEY = "JBSWY3DPEHPK3PXP"       # Must match Master
WORKER_ID = f"laptop-{os.getlogin()}" 

def get_auth_header():
    """Generates the 6-digit rolling code AND bypasses ngrok warning"""
    totp = pyotp.TOTP(SECRET_KEY)
    return {
        "x-auth-token": totp.now(),
        "ngrok-skip-browser-warning": "69420",  # <--- Magic Key
        "User-Agent": "AntNet-Worker/1.0"
    }

def heartbeat_loop():
    """Runs in background: Sends pulse every 5 seconds no matter what."""
    print("💓 Heartbeat thread started.")
    while True:
        try:
            # Gather Vitals
            cpu = psutil.cpu_percent(interval=None)
            ram = psutil.virtual_memory().percent
            
            # Send Pulse with Headers
            requests.post(
                f"{MASTER_URL}/heartbeat", 
                json={
                    "worker_id": WORKER_ID, 
                    "status": "ALIVE", # Or toggle to 'WORKING' based on state
                    "cpu": cpu,
                    "ram": ram
                },
                headers=get_auth_header(), # Use the safe headers
                timeout=2 
            )
        except Exception:
            pass # Ignore network blips in background thread
        
        time.sleep(5) 

def run_ollama_inference(prompt, model="phi3:mini", timeout=300):
    """Talks to the local Ollama instance."""
    try:
        url = "http://localhost:11434/api/generate"
        payload = {
            "model": "phi3:mini", 
            "prompt": prompt,
            "stream": False
        }
        response = requests.post(url, json=payload, timeout=timeout)

        if response.status_code != 200:
            return f"Ollama HTTP {response.status_code}: {response.text[:200]}"

        try:
            data = response.json()
        except Exception:
            return f"Ollama returned non-JSON response: {response.text[:200]}"

        if "response" in data:
            return data["response"]
        
        return f"Error in AI generation: missing 'response' field. JSON: {data}"

    except Exception as e:
        return f"Ollama Error: {str(e)} (Is Ollama running?)"

def main_loop():
    print(f"🚀 AntNet Worker Started: {WORKER_ID}")
    
    # 1. START HEARTBEAT THREAD (Daemon = dies when main program dies)
    hb_thread = threading.Thread(target=heartbeat_loop, daemon=True)
    hb_thread.start()

    while True:
        try:
            # 2. ASK FOR WORK
            # (We don't need to send heartbeat here anymore, the thread does it!)
            
            response = requests.get(
                f"{MASTER_URL}/get_task", 
                params={"worker_id": WORKER_ID},
                headers=get_auth_header() # <--- Crucial for Ngrok
            )

            # --- DEBUGGING FOR NGROK ERRORS ---
            if response.status_code != 200:
                print(f"\n⚠️ SERVER ERROR {response.status_code}")
                # Print just enough to see if it's HTML
                print(f"📄 RESPONSE: {response.text[:100]}...") 
                time.sleep(3)
                continue
            # ----------------------------------

            data = response.json()

            if data.get("has_task"):
                print("⚡ Task Received! Processing...")
                
                # --- PARSE METADATA ---
                raw_data = data["task_data"]
                try:
                    task_obj = json.loads(raw_data)
                    prompt_text = task_obj.get("prompt", raw_data)
                    injection_id = task_obj.get("injection_id", "manual_run")
                    chunk_index = task_obj.get("chunk_index", 1)
                    total_chunks = task_obj.get("total_chunks", 1)
                except (json.JSONDecodeError, TypeError):
                    prompt_text = raw_data
                    injection_id = "legacy_job"
                    chunk_index = 1
                    total_chunks = 1

                print(f"   📄 Processing Chunk {chunk_index}/{total_chunks}...")

                # DO THE WORK (This blocks the loop, but Heartbeat thread keeps going!)
                ai_result = run_ollama_inference(prompt_text)
                
                # SUBMIT RESULT
                requests.post(
                    f"{MASTER_URL}/submit_result",
                    json={
                        "worker_id": WORKER_ID,
                        "injection_id": injection_id,
                        "chunk_index": chunk_index,
                        "total_chunks": total_chunks,
                        "heading": "General Section", 
                        "content": ai_result
                    },
                    headers=get_auth_header() # <--- Don't forget headers here too
                )
                print("✅ Task Submitted.")
            
            else:
                print("💤 No tasks. Sleeping...", end="\r")

        except Exception as e:
            print(f"❌ Connection Error: {e}")
        
        time.sleep(3) # Wait before asking for work again

if __name__ == "__main__":
    main_loop()