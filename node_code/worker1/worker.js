const axios = require('axios');
const os = require('os');
const si = require('systeminformation');
const speakeasy = require('speakeasy');

// --- CONFIGURATION ---
const MASTER_URL = "https://antnet.zeabur.app"; // <--- NO TRAILING SLASH
const SECRET_KEY = "JBSWY3DPEHPK3PXP";      // Must match Master
const WORKER_ID = `laptop-${os.userInfo().username}`;

// Configure global Axios defaults
axios.defaults.timeout = 300000; // 300s global timeout for AI tasks

// --- HELPERS ---

function getAuthHeaders() {
    try {
        const token = speakeasy.totp({
            secret: SECRET_KEY,
            encoding: 'base32'
        });

        return {
            "x-auth-token": token,
            "ngrok-skip-browser-warning": "69420",
            "User-Agent": "AntNet-Worker/Node-1.0"
        };
    } catch (e) {
        return { "ngrok-skip-browser-warning": "69420" };
    }
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- HEARTBEAT SERVICE ---

async function startHeartbeatLoop() {
    console.log("💓 Heartbeat service started (Running every 5s)...");

    setInterval(async () => {
        try {
            const mem = await si.mem();
            const cpu = await si.currentLoad();

            // Note: Getting real GPU load requires 'nvidia-smi' or complex calls.
            // For now, we default to 0. If you have a way to get it, put it here.
            const gpuPercent = 0;

            const ramPercent = (mem.active / mem.total) * 100;
            const cpuPercent = cpu.currentLoad;

            await axios.post(`${MASTER_URL}/heartbeat`, {
                worker_id: WORKER_ID,
                status: "ALIVE",
                cpu: parseFloat(cpuPercent.toFixed(1)),
                ram: parseFloat(ramPercent.toFixed(1)),
                gpu: gpuPercent // <--- Sending GPU field
            }, {
                headers: getAuthHeaders(),
                timeout: 2000
            });

        } catch (error) {
            // Silent fail
        }
    }, 5000); // 5 Seconds
}

// --- OLLAMA INTEGRATION ---

async function runOllamaInference(prompt, model = "phi3:mini") {
    try {
        const url = "http://localhost:11434/api/generate";
        const response = await axios.post(url, {
            model: model,
            prompt: prompt,
            stream: false
        });

        if (response.status !== 200) return `Ollama HTTP ${response.status}`;

        return response.data.response || "Error: No response field";

    } catch (error) {
        return `Ollama Error: ${error.message}`;
    }
}

// --- MAIN LOOP ---

async function main() {
    console.log(`🚀 AntNet Worker Started: ${WORKER_ID}`);

    // 1. Start the Heartbeat loop (Non-blocking)
    startHeartbeatLoop();

    while (true) {
        try {
            // 2. Ask for work
            let response;
            try {
                response = await axios.get(`${MASTER_URL}/get_task`, {
                    params: { worker_id: WORKER_ID },
                    headers: getAuthHeaders()
                });
            } catch (err) {
                // If error is NOT a connection refusal, show it
                if (err.code !== 'ECONNREFUSED') {
                    // console.log(`Connection error: ${err.message}`);
                }
                process.stdout.write("Waiting for Master...\r");
                await sleep(3000);
                continue;
            }

            const data = response.data;

            if (data.has_task) {
                console.log("\n⚡ Task Received!");

                // Parse Task
                let taskObj = typeof data.task_data === 'string' ? JSON.parse(data.task_data) : data.task_data;

                // Do Work
                const aiResult = await runOllamaInference(taskObj.prompt);

                // Submit
                await axios.post(`${MASTER_URL}/submit_result`, {
                    worker_id: WORKER_ID,
                    injection_id: taskObj.injection_id,
                    chunk_index: taskObj.chunk_index,
                    total_chunks: taskObj.total_chunks,
                    heading: "Summary",
                    content: aiResult
                }, { headers: getAuthHeaders() });

                console.log("✅ Task Submitted.");
            } else {
                await sleep(3000);
            }
        } catch (error) {
            console.error(`❌ Error: ${error.message}`);
            await sleep(3000);
        }
    }
}


main();