import psycopg2
from psycopg2 import sql

# DATABASE CONFIG (Change this to your credentials)
DB_CONFIG = {
    "dbname": "postgres",
    "user": "postgres",
    "password": "password",
    "host": "127.0.0.1",
    "port": "5435"
}

def create_tables():
    commands = (
        """
        CREATE TABLE IF NOT EXISTS injections (
            injection_id VARCHAR(50) PRIMARY KEY,
            original_prompt TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            status VARCHAR(20) DEFAULT 'PROCESSING'
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS reports (
            report_id SERIAL PRIMARY KEY,
            injection_id VARCHAR(50) REFERENCES injections(injection_id),
            worker_id VARCHAR(50),
            chunk_index INTEGER,
            total_chunks INTEGER,
            heading VARCHAR(255),
            content TEXT,
            received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    
    conn = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cur = conn.cursor()
        for command in commands:
            cur.execute(command)
        cur.close()
        conn.commit()
        print("✅ Tables 'injections' and 'reports' created successfully.")
    except (Exception, psycopg2.DatabaseError) as error:
        print(f"❌ Error: {error}")
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    create_tables()