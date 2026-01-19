require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const redis = require('redis');
const multer = require('multer');
const { authenticator } = require('otplib');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const cors = require('cors'); // <--- IMPORT CORS

// --- CONFIGURATION ---
const app = express();
const PORT = process.env.PORT || 8000;
const SECRET_KEY = process.env.ANTNET_SECRET || "JBSWY3DPEHPK3PXP";
const WORKER_TIMEOUT_SEC = 15; // Seconds before a worker is declared DEAD

// Setup View Engine (EJS)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'templates'));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 1. ENABLE CORS (Crucial for Next.js Frontend)
app.use(cors({
    origin: '*', // Allows connections from localhost:3000 and others
    methods: ['GET', 'POST']
}));

// Database Config (Postgres)
const pool = new Pool({
    user: process.env.DB_USER || "postgres",
    host: process.env.DB_HOST || "127.0.0.1",
    database: process.env.DB_NAME || "postgres",
    password: process.env.DB_PASSWORD || "password",
    port: process.env.DB_PORT || 5435,
});

// Redis Config
const redisClient = redis.createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379'
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

// Dashboard (Legacy EJS view)
app.get('/', (req, res) => {
    res.render('index', { req: req }); 
});

// Heartbeat
app.post('/heartbeat', async (req, res) => {
    const { worker_id, status, cpu, ram } = req.body;
    const xAuthToken = req.headers['x-auth-token'];

    // 1. Security Check
    try {
        if (xAuthToken) {
            const isValid = authenticator.check(xAuthToken, SECRET_KEY);
            if (!isValid) {
                return res.status(403).json({ detail: "Invalid Authentication Token" });
            }
        }
    } catch (err) {
         if (xAuthToken) return res.status(403).json({ detail: "Auth Error" });
    }

    const now = Date.now() / 1000;

    // 2. Update Reaper State (Last Seen)
    if (!workerState[worker_id]) {
        workerState[worker_id] = {};
    }
    workerState[worker_id].last_seen = now;

    // 3. Update Frontend Registry
    workerRegistry[worker_id] = {
        status: status,
        cpu: cpu,
        ram: ram,
        seen: "Just now"
    };

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
    res.json(workerRegistry);
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
            [injection_id, `File: ${req.file.originalname}`]
        );
    } catch (e) {
        return res.status(500).json({ error: e.toString() });
    }

    const chunk_size = 2000;
    const chunks = [];
    for (let i = 0; i < text.length; i += chunk_size) {
        chunks.push(text.substring(i, i + chunk_size));
    }
    const total = chunks.length;

    console.log(`📦 Job ${injection_id}: Splitting into ${total} chunks...`);

    for (let i = 0; i < total; i++) {
        const strict_prompt = `
        INSTRUCTION: Summarize the text below. Output ONLY the summary. No intro words.
        TEXT: "${chunks[i]}"
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