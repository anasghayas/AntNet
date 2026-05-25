const fs = require('fs');
const { createClient } = require('redis');
const { Client } = require('pg');
const { v4: uuidv4 } = require('uuid');

// --- CONFIGURATION ---
const REDIS_URL = 'redis://localhost:6379';
const DB_PARAMS = {
    user: 'postgres',
    host: '127.0.0.1',
    database: 'postgres',
    password: 'password',
    port: 5435, // <--- The New Port
};

// --- HELPER: Chunk Text ---
function chunkText(text, limit = 500) {
    // Split by whitespace to mimic Python's .split()
    const words = text.split(/\s+/); 
    const chunks = [];
    
    for (let i = 0; i < words.length; i += limit) {
        chunks.push(words.slice(i, i + limit).join(" "));
    }
    return chunks;
}

// --- MAIN INJECTION LOGIC ---
async function injectTrackedJob() {
    console.log("🚀 Starting Job Injection...");

    // 1. Read File
    let fullText;
    try {
        fullText = fs.readFileSync('task_input1.txt', 'utf-8');
    } catch (err) {
        console.error("❌ Error: 'task_input1.txt' not found.");
        return;
    }

    // 2. Generate Unique Injection ID (First 8 chars)
    const injectionId = uuidv4().substring(0, 8);

    // 3. Register in Postgres FIRST
    const pgClient = new Client(DB_PARAMS);
    
    try {
        await pgClient.connect();
        
        const query = "INSERT INTO injections (injection_id, original_prompt) VALUES ($1, $2)";
        const values = [injectionId, "Summarize task_input1.txt"];
        
        await pgClient.query(query, values);
        console.log(`✅ Registered Job ${injectionId} in Database.`);
        
    } catch (err) {
        console.error(`❌ Failed to register job in DB: ${err.message}`);
        await pgClient.end();
        return;
    } finally {
        await pgClient.end();
    }

    // 4. Chunk & Push to Redis
    const redisClient = createClient({ url: REDIS_URL });
    redisClient.on('error', (err) => console.error('Redis Client Error', err));

    try {
        await redisClient.connect();

        const chunks = chunkText(fullText);
        const total = chunks.length;

        console.log(`📦 Split text into ${total} chunks. Pushing to queue...`);

        for (let i = 0; i < total; i++) {
            const chunk = chunks[i];

            //THE FIX: STRICT INSTRUCTIONS
            const strictPrompt = `
            INSTRUCTION: Summarize the following text to 30% of its original length.
            - Output ONLY the summary.
            - Do NOT add introductory phrases like "Here is the summary".
            - Focus on key facts and technical details.

            TEXT TO SUMMARIZE:
            "${chunk}"
            `;
            // ------------------------------------

            const payload = {
                injection_id: injectionId,
                chunk_index: i + 1,
                total_chunks: total,
                prompt: strictPrompt
            };

            // Push to Redis List (rpush equivalent)
            await redisClient.rPush('job_queue', JSON.stringify(payload));
            console.log(`👉 Pushed Chunk ${i + 1}/${total}`);
        }

    } catch (err) {
        console.error(`❌Redis Error: ${err.message}`);
    } finally {
        await redisClient.disconnect();
    }
}

// Run the script
injectTrackedJob();
