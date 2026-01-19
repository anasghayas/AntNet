import redis
import psycopg2
import uuid
import json

# Configs
r = redis.Redis(host='localhost', port=6379, decode_responses=True)
DB_PARAMS = {
    "dbname": "postgres",
    "user": "postgres",
    "password": "password",
    "host": "127.0.0.1",
    "port": "5435"            # <--- The New Port
}

def chunk_text(text, limit=500):
    words = text.split()
    return [" ".join(words[i:i+limit]) for i in range(0, len(words), limit)]

def inject_tracked_job():
    # 1. Read File (Added encoding='utf-8' for safety)
    try:
        with open("task_input1.txt", "r", encoding="utf-8") as f:
            full_text = f.read()
    except FileNotFoundError:
        print("❌ Error: 'task_input1.txt' not found.")
        return
    
    # 2. Generate Unique Injection ID
    injection_id = str(uuid.uuid4())[:8]
    
    # 3. Register in Postgres FIRST
    try:
        conn = psycopg2.connect(**DB_PARAMS)
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO injections (injection_id, original_prompt) VALUES (%s, %s)",
            (injection_id, "Summarize task_input1.txt")
        )
        conn.commit()
        conn.close()
        print(f"✅ Registered Job {injection_id} in Database.")
    except Exception as e:
        print(f"❌ Failed to register job: {e}")
        return

    # 4. Chunk & Push to Redis
    chunks = chunk_text(full_text)
    total = len(chunks)

    print(f"📦 Split text into {total} chunks. Pushing to queue...")

    for i, chunk in enumerate(chunks):
        # --- THE FIX: WRAP THE TEXT IN STRICT INSTRUCTIONS ---
        # This tells the AI exactly what to do, preventing long ramblings.
        strict_prompt = f"""
        INSTRUCTION: Summarize the following text to 30% of its original length.
        - Output ONLY the summary.
        - Do NOT add introductory phrases like "Here is the summary".
        - Focus on key facts and technical details.

        TEXT TO SUMMARIZE:
        "{chunk}"
        """
        # -----------------------------------------------------

        payload = {
            "injection_id": injection_id,
            "chunk_index": i + 1,
            "total_chunks": total,
            "prompt": strict_prompt # <--- Sending the instruction, not just raw text
        }
        r.rpush("job_queue", json.dumps(payload))
        print(f"   👉 Pushed Chunk {i+1}/{total}")

if __name__ == "__main__":
    inject_tracked_job()