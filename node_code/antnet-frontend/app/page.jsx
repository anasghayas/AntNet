'use client';
import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Activity, Upload, Server, Cpu, Zap, Terminal, List, ChevronDown, ChevronRight, FileText, CheckCircle, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const API_URL = "http://localhost:8000";

export default function Dashboard() {
  const [workers, setWorkers] = useState({});
  const [dbData, setDbData] = useState({ injections: [], reports: [] });
  const [logs, setLogs] = useState([]);
  
  // New State for Expansion
  const [expandedJob, setExpandedJob] = useState(null); 
  const [jobDetails, setJobDetails] = useState([]); 
  const [loadingDetails, setLoadingDetails] = useState(false);

  const fileInputRef = useRef(null);

  // --- POLLING ---
  useEffect(() => {
    const fetchData = async () => {
      try {
        const wRes = await axios.get(`${API_URL}/api/workers`);
        setWorkers(wRes.data);
        const dbRes = await axios.get(`${API_URL}/api/database`);
        setDbData(dbRes.data);
      } catch (err) {}
    };
    fetchData();
    const interval = setInterval(fetchData, 2000);
    return () => clearInterval(interval);
  }, []);

  // --- ACTIONS ---
  const uploadJob = async () => {
    const file = fileInputRef.current.files[0];
    if (!file) return alert("Select a file first!");
    const formData = new FormData();
    formData.append('file', file);
    try {
      await axios.post(`${API_URL}/api/upload_job`, formData);
      alert("Job Queued!");
    } catch (err) { alert("Upload Failed"); }
  };

  // Fetch chunks when a job row is clicked
  const toggleJob = async (jobId) => {
    if (expandedJob === jobId) {
      setExpandedJob(null); // Collapse
      return;
    }
    
    setExpandedJob(jobId);
    setLoadingDetails(true);
    try {
      const res = await axios.get(`${API_URL}/api/results/${jobId}`);
      setJobDetails(res.data.chunks || []);
    } catch (e) {
      console.error(e);
    }
    setLoadingDetails(false);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* HEADER */}
        <header className="flex justify-between items-center border-b border-slate-800 pb-6">
          <h1 className="text-3xl font-extrabold bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent flex items-center gap-3">
            <Activity className="text-emerald-400" /> AntNet Control
          </h1>
          <div className="flex items-center gap-2 px-3 py-1 bg-slate-900 rounded-full border border-slate-800 text-xs font-mono text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> SYSTEM ONLINE
          </div>
        </header>

        {/* WORKERS & UPLOAD */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            <h2 className="text-xl font-semibold flex items-center gap-2"><Server size={20}/> Active Workers</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <AnimatePresence>
                {Object.keys(workers).length === 0 ? (
                   <div className="col-span-full py-8 border-2 border-dashed border-slate-800 rounded-xl text-center text-slate-500">Waiting for nodes...</div>
                ) : (
                  Object.entries(workers).map(([id, stats]) => <WorkerCard key={id} id={id} stats={stats} />)
                )}
              </AnimatePresence>
            </div>
          </div>
          <div className="space-y-4">
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
              <h3 className="text-lg font-semibold mb-3 flex items-center gap-2"><Upload size={18}/> Dispatch</h3>
              <input type="file" ref={fileInputRef} className="block w-full text-sm text-slate-400 file:bg-slate-800 file:text-blue-400 file:border-0 file:py-2 file:px-4 file:rounded-lg mb-3"/>
              <button onClick={uploadJob} className="w-full py-2 bg-blue-600 rounded-lg font-medium hover:bg-blue-500 transition">🚀 Launch Job</button>
            </div>
          </div>
        </div>

        {/* --- JOB LIST (TASK GROUPING) --- */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-800 bg-slate-800/50 flex items-center gap-2">
            <List size={18} className="text-purple-400"/> 
            <h3 className="font-semibold">Task Queue (Click to View Chunks)</h3>
          </div>
          
          <div className="divide-y divide-slate-800">
            {dbData.injections.length === 0 ? (
              <div className="p-8 text-center text-slate-500 italic">No jobs submitted yet.</div>
            ) : (
              dbData.injections.map((job) => (
                <div key={job.injection_id} className="bg-slate-900">
                  
                  {/* JOB ROW (Clickable) */}
                  <div 
                    onClick={() => toggleJob(job.injection_id)}
                    className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-800/50 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      {expandedJob === job.injection_id ? <ChevronDown className="text-blue-400"/> : <ChevronRight className="text-slate-500"/>}
                      <div>
                        <p className="font-mono text-emerald-400 font-bold">{job.injection_id}</p>
                        <p className="text-xs text-slate-400 truncate max-w-[300px]">{job.original_prompt}</p>
                      </div>
                    </div>
                    <div className="text-xs text-slate-500 font-mono">
                      {new Date(job.created_at).toLocaleTimeString()}
                    </div>
                  </div>

                  {/* EXPANDED CHUNK VIEW */}
                  <AnimatePresence>
                    {expandedJob === job.injection_id && (
                      <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden bg-slate-950/50 border-t border-slate-800"
                      >
                        <div className="p-6 relative">
                          
                          {/* Vertical Connector Line */}
                          <div className="absolute left-8 top-6 bottom-6 w-0.5 bg-slate-800"></div>

                          {loadingDetails ? (
                            <div className="ml-10 text-slate-500 animate-pulse">Loading chunks...</div>
                          ) : jobDetails.length === 0 ? (
                            <div className="ml-10 text-slate-500">No chunks processed yet.</div>
                          ) : (
                            jobDetails.map((chunk, idx) => (
                              <div key={idx} className="relative ml-10 mb-6 last:mb-0">
                                
                                {/* Connector Dot */}
                                <div className="absolute -left-[2.85rem] top-1 w-5 h-5 rounded-full bg-slate-900 border-2 border-blue-500 flex items-center justify-center">
                                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                                </div>

                                {/* Chunk Card */}
                                <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 shadow-lg">
                                  <div className="flex justify-between items-start mb-2 border-b border-slate-800 pb-2">
                                    <h4 className="font-bold text-sm text-blue-300 flex items-center gap-2">
                                      <FileText size={14}/> 
                                      Chunk {chunk.chunk_index} <span className="text-slate-500">of</span> {chunk.total_chunks}
                                    </h4>
                                    <span className="text-[10px] font-mono bg-slate-800 px-2 py-1 rounded text-slate-400">
                                      Worker: {chunk.worker_id}
                                    </span>
                                  </div>
                                  <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap font-mono">
                                    {chunk.content}
                                  </p>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

// --- WORKER CARD COMPONENT ---
function WorkerCard({ id, stats }) {
  const color = stats.cpu < 50 ? 'bg-emerald-500' : stats.cpu < 80 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <motion.div layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-slate-900 border border-slate-800 rounded-lg p-5 relative overflow-hidden">
      <div className="flex justify-between mb-4 relative z-10">
        <h3 className="font-bold">{id}</h3>
        <div className={`w-3 h-3 rounded-full ${stats.status === 'ALIVE' ? 'bg-emerald-500 shadow-[0_0_10px_#10b981]' : 'bg-red-500'}`}></div>
      </div>
      <div className="space-y-2 text-xs relative z-10">
        <div className="flex justify-between"><span className="text-slate-500">CPU</span> {stats.cpu}%</div>
        <div className="h-1.5 bg-slate-800 rounded-full"><div className={`h-full ${color} transition-all duration-500`} style={{width: `${stats.cpu}%`}}></div></div>
        <div className="flex justify-between"><span className="text-slate-500">RAM</span> {stats.ram}%</div>
        <div className="h-1.5 bg-slate-800 rounded-full"><div className={`h-full bg-purple-500 transition-all duration-500`} style={{width: `${stats.ram}%`}}></div></div>
      </div>
    </motion.div>
  );
}