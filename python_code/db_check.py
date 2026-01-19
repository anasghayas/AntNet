import psycopg2

DB_CONFIG = {
    "dbname": "postgres",
    "user": "postgres",
    "password": "password",
    "host": "127.0.0.1",
    "port": "5435"
}

try:
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()
    
    # Get the latest report
    cur.execute("SELECT chunk_index, total_chunks, content FROM reports ORDER BY received_at DESC LIMIT 5")
    rows = cur.fetchall()
    
    print(f"\n📊 Found {len(rows)} recent reports:\n")
    for row in rows:
        print(f"[Chunk {row[0]}/{row[1]}] Content Preview: {row[2][:50]}...")
        print(row)
        
    conn.close()

except Exception as e:
    print(e)