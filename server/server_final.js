require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const redis = require('redis');
const multer = require('multer');
const { authenticator } = require('otplib');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const cors = require('cors');
const { RecursiveCharacterTextSplitter } = require("@langchain/textsplitters");
const Groq = require('groq-sdk');

// --- CONFIGURATION ---
const app = express();
const PORT = process.env.PORT || 8000;
const SECRET_KEY = process.env.ANTNET_SECRET; // Pulled from .env
const WORKER_TIMEOUT_SEC = 15;

// Serve Static Frontend (Next.js Export)
const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY // Pulled from .env
});
app.use(express.static(path.join(__dirname, 'antnet-frontend/out')));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 1. ENABLE CORS 
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST','PUT','DELETE']
}));

// Database Config (Postgres) - Uses DATABASE_URL from .env
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

// Redis Config - Uses REDIS_URL from .env
const redisClient = redis.createClient({
    url: process.env.REDIS_URL
});

redisClient.on('error', (err) => console.log('Redis Client Error', err));

// Multer (Memory storage for file uploads)
const upload = multer({ storage: multer.memoryStorage() });

// --- STATE TRACKING (IN-MEMORY) ---
let workerRegistry = {};
let workerState = {};

// --- BACKGROUND REAPER SERVICE ---
async function monitorWorkers() {
    // JS Date.now() is in ms, convert to seconds
    const now = Date.now() / 1000;
    const deadWorkers = [];

    // 1. Identify Dead Workers
    for (const [wid, state] of Object.entries(workerState)) {
        if ((now - state.last_seen) > WORKER_TIMEOUT_SEC) {
            console.log(`💀 Reaper: Worker ${wid} is DEAD.`);

            // 2. Check for Lost Tasks
            if (state.current_task) {
                const lostTask = state.current_task;
                console.log(`   🔄 Re-queueing Chunk ${lostTask.chunk_index} for Job ${lostTask.injection_id}`);

                // Push back to Redis (High Priority - Push to LEFT)
                try {
                    await redisClient.lPush("job_queue", JSON.stringify(lostTask));
                } catch (e) {
                    console.error("Redis Error re-queueing:", e);
                }
            }
            deadWorkers.push(wid);
        }
    }

    // 3. Clean up Registry
    deadWorkers.forEach(wid => {
        delete workerState[wid];
        delete workerRegistry[wid];
    });
}

// Start Reaper Loop (runs every 5 seconds)
setInterval(monitorWorkers, 5000);

// --- ROUTES ---

// Heartbeat
app.post('/heartbeat', async (req, res) => {
    const { worker_id, status, cpu, ram, gpu } = req.body; // Added GPU

    const now = Date.now() / 1000;

    // Initialize Worker State if new
    if (!workerState[worker_id]) {
        workerState[worker_id] = {};
    }
    workerState[worker_id].last_seen = now;

    // Initialize Registry with History if new
    if (!workerRegistry[worker_id]) {
        workerRegistry[worker_id] = {
            status: status,
            history: [] // <--- New: Array to store graph data
        };
    }

    // Update Status
    workerRegistry[worker_id].status = status;
    workerRegistry[worker_id].seen = new Date().toLocaleTimeString();

    // Add new data point
    const dataPoint = {
        time: new Date().toLocaleTimeString('en-US', { hour12: false }),
        cpu: cpu || 0,
        ram: ram || 0,
        gpu: gpu || 0 // Handle GPU if sent
    };

    // Push to history and keep only last 20 points (Rolling Window)
    workerRegistry[worker_id].history.push(dataPoint);
    if (workerRegistry[worker_id].history.length > 20) {
        workerRegistry[worker_id].history.shift();
    }

    res.json({ command: "continue" });
});

// Get Task
app.get('/get_task', async (req, res) => {
    const worker_id = req.query.worker_id;

    try {
        const taskJson = await redisClient.lPop("job_queue");

        if (taskJson) {
            const taskData = JSON.parse(taskJson);

            // Assign to Worker
            if (!workerState[worker_id]) {
                workerState[worker_id] = { last_seen: Date.now() / 1000 };
            }
            workerState[worker_id].current_task = taskData;

            return res.json({ has_task: true, task_data: taskJson });
        }

        return res.json({ has_task: false });
    } catch (e) {
        console.error("Redis Error:", e);
        return res.status(500).json({ error: "Queue Error" });
    }
});

// Submit Result
app.post('/submit_result', async (req, res) => {
    const result = req.body;
    console.log(`📥 Received Chunk ${result.chunk_index} from ${result.worker_id}`);

    const sql = `
        INSERT INTO reports (injection_id, worker_id, chunk_index, total_chunks, heading, content)
        VALUES ($1, $2, $3, $4, $5, $6)
    `;

    try {
        await pool.query(sql, [
            result.injection_id,
            result.worker_id,
            result.chunk_index,
            result.total_chunks,
            result.heading,
            result.content
        ]);

        // Clear Assignment
        if (workerState[result.worker_id]) {
            workerState[result.worker_id].current_task = null;
        }

        res.json({ status: "saved_to_postgres" });
    } catch (e) {
        console.error("❌ DB Error:", e);
        res.json({ status: "error", detail: e.toString() });
    }
});

// --- FRONTEND API ENDPOINTS ---

app.get('/api/workers', (req, res) => {
    const combinedData = {};

    // Loop through all known workers
    for (const [id, data] of Object.entries(workerRegistry)) {
        combinedData[id] = {
            ...data,
            // Check the internal state to see if a task is currently assigned
            // If workerState[id].current_task exists, they are genuinely working
            current_task: workerState[id]?.current_task || null
        };
    }

    res.json(combinedData);
});

// 2. NEW: Database Stats Endpoint (For Frontend Tables)
app.get('/api/database', async (req, res) => {
    try {
        // Fetch 5 most recent jobs
        const injections = await pool.query("SELECT * FROM injections ORDER BY created_at DESC LIMIT 5");

        // Fetch 10 most recent reports
        const reports = await pool.query("SELECT * FROM reports ORDER BY received_at DESC LIMIT 10");

        res.json({
            injections: injections.rows,
            reports: reports.rows
        });
    } catch (e) {
        console.error("DB Fetch Error:", e);
        res.status(500).json({ error: e.toString() });
    }
});

app.post('/api/upload_job', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    // 1. Get Params from Frontend
    let preferred_chunk_size = parseInt(req.body.chunk_size) || 2000;

    // NEW: Get User Prompt (Default to summary if empty)
    const user_prompt = req.body.user_prompt || "Summarize the text below. Output ONLY the summary.";

    // Safety Clamps
    if (preferred_chunk_size < 100) preferred_chunk_size = 100;
    if (preferred_chunk_size > 10000) preferred_chunk_size = 10000;

    const overlap = Math.floor(preferred_chunk_size * 0.1);

    let text;
    try {
        text = req.file.buffer.toString('utf-8');
    } catch (e) {
        return res.status(400).json({ error: "File must be text/utf-8" });
    }

    const injection_id = uuidv4().substring(0, 8);

    try {
        await pool.query(
            "INSERT INTO injections (injection_id, original_prompt) VALUES ($1, $2)",
            [injection_id, `File: ${req.file.originalname} | Task: ${user_prompt.substring(0, 30)}...`]
        );
    } catch (e) {
        return res.status(500).json({ error: e.toString() });
    }

    // --- LANGCHAIN IMPLEMENTATION ---
    const { RecursiveCharacterTextSplitter } = require("@langchain/textsplitters");

    const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: preferred_chunk_size,
        chunkOverlap: overlap,
    });

    const output = await splitter.createDocuments([text]);
    const chunks = output.map(doc => doc.pageContent);
    const total = chunks.length;

    console.log(`📦 Job ${injection_id}: Processing with prompt: "${user_prompt.substring(0, 20)}..."`);

    for (let i = 0; i < total; i++) {
        // --- DYNAMIC PROMPT INJECTION ---
        const strict_prompt = `
        INSTRUCTION: ${user_prompt}
        
        CONTEXT TEXT:
        "${chunks[i]}"
        `;

        const payload = {
            injection_id: injection_id,
            chunk_index: i + 1,
            total_chunks: total,
            prompt: strict_prompt
        };

        await redisClient.rPush("job_queue", JSON.stringify(payload));
    }

    res.json({ status: "queued", injection_id: injection_id, total_chunks: total });
});

app.get('/api/results/:injection_id', async (req, res) => {
    const { injection_id } = req.params;
    try {
        // Get progress stats
        const countRes = await pool.query("SELECT COUNT(*) FROM reports WHERE injection_id = $1", [injection_id]);
        const completed_count = parseInt(countRes.rows[0].count);

        // Get actual chunks sorted by index
        const rowsRes = await pool.query("SELECT worker_id, chunk_index, total_chunks, content, received_at FROM reports WHERE injection_id = $1 ORDER BY chunk_index", [injection_id]);

        // Assemble text for download (optional usage)
        const full_text = rowsRes.rows.map(r => r.content).join("\n\n");

        res.json({
            completed: completed_count,
            chunks: rowsRes.rows, // <--- SEND RAW CHUNKS ARRAY
            full_text: full_text
        });

    } catch (e) {
        res.status(500).json({ error: e.toString() });
    }
});
app.post('/api/cancel_job', async (req, res) => {
    const { injection_id } = req.body;
    if (!injection_id) return res.status(400).json({ error: "Missing injection_id" });

    console.log(`🛑 Cancelling Job ${injection_id}...`);

    try {
        // 1. Scrub Redis Queue
        // We fetch the whole queue, filter out the bad job, and rewrite it.
        // (Note: For massive queues, this approach should be optimized, but it works for <10k items)
        const queue = await redisClient.lRange("job_queue", 0, -1);
        const newQueue = queue.filter(item => {
            try {
                const task = JSON.parse(item);
                return task.injection_id !== injection_id;
            } catch (e) { return true; } // Keep malformed items to be safe
        });

        // Atomic-ish Rewrite
        await redisClient.del("job_queue");
        if (newQueue.length > 0) {
            await redisClient.rPush("job_queue", newQueue);
        }

        // 2. Delete from Database
        // Delete reports first (Foreign Key constraint), then the job itself
        await pool.query("DELETE FROM reports WHERE injection_id = $1", [injection_id]);
        await pool.query("DELETE FROM injections WHERE injection_id = $1", [injection_id]);

        console.log(`✅ Job ${injection_id} scrubbed from system.`);
        res.json({ status: "cancelled" });

    } catch (e) {
        console.error("Cancel Error:", e);
        res.status(500).json({ error: e.toString() });
    }
});
app.post('/api/chat', async (req, res) => {
    const { messages } = req.body;

    try {
        const completion = await groq.chat.completions.create({
            messages: messages,
            // Recommended models: 
            // - "llama3-70b-8192" (Smartest, Good for RAG)
            // - "mixtral-8x7b-32768" (Longer context window if you have huge jobs)
            model: "openai/gpt-oss-20b",
            temperature: 0.5,
            max_tokens: 1024,
        });

        // The structure is identical to OpenAI, so the Frontend works without changes!
        res.json({ result: completion.choices[0].message });
    } catch (e) {
        console.error("Groq API Error:", e);
        res.status(500).json({ error: "Failed to fetch AI response" });
    }
});
// --- SERVER STARTUP ---
(async () => {
    try {
        await redisClient.connect();
        console.log("✅ Redis Connected");

        app.listen(PORT, '0.0.0.0', () => {
            console.log(`🕷️ AntNet Master Server (Node.js) running on port ${PORT}`);
        });
    } catch (e) {
        console.error("Startup Failed:", e);
    }
})();