'use client';
import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Activity, Upload, Server, List, ChevronDown, ChevronRight, FileText, Sliders, Trash2, MessageSquare, FileJson, Zap, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// --- UTILS ---
function cn(...inputs) { return twMerge(clsx(inputs)); }
const API_URL = "http://localhost:8000"; 

// --- ASSETS ---
// Idle: Tired Minion
const MINION_IDLE = "./idle.gif"; 
// Work: Intense Minion
const MINION_WORK = "./working.gif"; 
// Celebration: Jumping/Cheering Minion (Transparent-ish)
const MINION_JUMP = "./jump.webm";

export default function Dashboard() {
  const [workers, setWorkers] = useState({});
  const [dbData, setDbData] = useState({ injections: [], reports: [] });
  const [chunkSize, setChunkSize] = useState(2000); 
  const [userPrompt, setUserPrompt] = useState("Summarize the text below. Output ONLY the summary."); 
  const [fileSize, setFileSize] = useState(0); 
  const [expandedJob, setExpandedJob] = useState(null); 
  const [jobDetails, setJobDetails] = useState([]); 
  const [loadingDetails, setLoadingDetails] = useState(false);
  const fileInputRef = useRef(null);

  // --- NEW VISUAL STATES ---
  const [toast, setToast] = useState(null); // { message: '', type: 'success'|'error' }
  const [showCelebration, setShowCelebration] = useState(false);

  // --- DERIVED STATE ---
  const estimatedChunks = fileSize > 0 ? Math.ceil(fileSize / chunkSize) : 0;
  
  // Check if swarm is working (Based on Task Assignment)
  const isSwarmBusy = Object.values(workers).some(w => w.current_task !== null);

  // --- ACTIONS ---
  const showToast = (msg, type = 'info') => {
    setToast({ message: msg, type });
    // Auto-dismiss happens in the component animation
    setTimeout(() => setToast(null), 4000); 
  };

  const handleFileChange = (e) => setFileSize(e.target.files?.[0]?.size || 0);

  const uploadJob = async () => {
    if (!fileInputRef.current?.files?.[0]) {
        showToast("Please select a file first!", "error");
        return;
    }
    const formData = new FormData();
    formData.append('file', fileInputRef.current.files[0]);
    formData.append('chunk_size', chunkSize); 
    formData.append('user_prompt', userPrompt);

    try {
      await axios.post(`${API_URL}/api/upload_job`, formData);
      
      // TRIGGER CELEBRATION
      setShowCelebration(true);
      showToast("DEPLOYING SWARM AGENTS...", "success");
      
      // Reset inputs
      fileInputRef.current.value = "";
      setFileSize(0);
      
      // Hide celebration after 3s
      setTimeout(() => setShowCelebration(false), 3500);

    } catch (err) { 
        showToast("Upload Failed: " + (err.response?.data?.error || err.message), "error"); 
    }
  };

  const cancelJob = async (e, jobId) => {
    e.stopPropagation();
    if (!confirm(`Cancel Job ${jobId}?`)) return;
    try {
      await axios.post(`${API_URL}/api/cancel_job`, { injection_id: jobId });
      setDbData(prev => ({...prev, injections: prev.injections.filter(job => job.injection_id !== jobId)}));
      showToast("Job Cancelled & Scrubbed", "info");
    } catch (err) { showToast("Failed to cancel.", "error"); }
  };

  const toggleJob = async (jobId) => {
    if (expandedJob === jobId) { setExpandedJob(null); return; }
    setExpandedJob(jobId);
    setLoadingDetails(true);
    try {
      const res = await axios.get(`${API_URL}/api/results/${jobId}`);
      setJobDetails(res.data.chunks || []);
    } catch (e) { setJobDetails([]); }
    setLoadingDetails(false);
  };

  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      try {
        const [wRes, dbRes] = await Promise.all([
            axios.get(`${API_URL}/api/workers`),
            axios.get(`${API_URL}/api/database`)
        ]);
        if (isMounted) {
            setWorkers(wRes.data || {});
            setDbData(dbRes.data || { injections: [], reports: [] });
        }
      } catch (err) {}
    };
    fetchData();
    const interval = setInterval(fetchData, 2000);
    return () => { isMounted = false; clearInterval(interval); };
  }, []);

  return (
    <div className="min-h-screen bg-black text-slate-100 font-sans selection:bg-purple-500/30 overflow-x-hidden relative">
      <style>
  {`@import url('https://fonts.googleapis.com/css2?family=Josefin+Sans:wght@700&display=swap');`}
</style>
      {/* --- BACKGROUND BLOBS --- */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
         <motion.div animate={{ rotate: 360 }} transition={{ duration: 100, repeat: Infinity, ease: "linear" }} className="absolute top-[-20%] left-[-10%] w-[50vw] h-[50vw] bg-purple-600/20 rounded-full blur-[120px]" />
         <motion.div animate={{ rotate: -360 }} transition={{ duration: 150, repeat: Infinity, ease: "linear" }} className="absolute bottom-[-20%] right-[-10%] w-[60vw] h-[60vw] bg-blue-600/10 rounded-full blur-[120px]" />
      </div>

      {/* --- FULL SCREEN VIDEO OVERLAY (Celebration) --- */}
{/* --- FULL SCREEN VIDEO OVERLAY (Celebration) --- */}
<AnimatePresence>
  {showCelebration && (
      <motion.div 
          initial={{ opacity: 0 }} 
          animate={{ opacity: 1 }} 
          exit={{ opacity: 0 }}
          // z-50 is the background layer
          className="fixed inset-0 z-50 pointer-events-none bg-black/90 backdrop-blur-xl flex items-center justify-center"
      >
          <motion.video 
              src="/jump.webm"
              autoPlay 
              muted 
              playsInline
              // 1. REMOVED "loop"
              // 2. ADDED onEnded to close immediately after 1 play
              onEnded={() => setShowCelebration(false)} 
              
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.1, ease: "easeOut" }}
              className="w-full h-full object-cover opacity-80"
          />
          
          <div className="absolute inset-0 bg-purple-500/20 mix-blend-overlay" />
      </motion.div>
  )}
</AnimatePresence>

      {/* --- LIQUID SPEED TOAST --- */}
      {/* --- LIQUID SPEED TOAST --- */}
<AnimatePresence>
  {toast && (
      <motion.div 
          // CHANGED: Slide up from bottom instead of side
          initial={{ y: 100, opacity: 0 }} 
          animate={{ y: 0, opacity: 1 }} 
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: "spring", stiffness: 120, damping: 20 }}
          // CHANGED: Fixed to bottom-right, removed w-full, added max-width
          className="fixed bottom-6 right-6 z-[100] pointer-events-none"
      >
          <div className={cn(
              // CHANGED: Added rounded-2xl to the container, set max-width
              "max-w-md rounded-2xl p-6 backdrop-blur-2xl border border-white/20 shadow-[0_10px_40px_rgba(0,0,0,0.5)] flex items-center gap-6 overflow-hidden relative",
              toast.type === 'error' ? 'bg-red-900/80 text-red-100' : 'bg-emerald-900/80 text-emerald-100'
          )}>
              {/* ... Icon and Text code remains exactly the same ... */}
              <div className={cn(
                  "p-3 rounded-full backdrop-blur-md shadow-lg shrink-0", // Added shrink-0
                  toast.type === 'error' ? 'bg-red-500 text-white' : 'bg-emerald-500 text-white'
              )}>
                  {toast.type === 'error' ? <X size={32}/> : <Zap size={32}/>}
              </div>
              
              <div>
                  <h4 className="text-2xl font-black uppercase italic tracking-tighter drop-shadow-lg leading-none mb-1">
                      {toast.type === 'error' ? 'SYSTEM ALERT' : 'TASK INITIATED'}
                  </h4>
                  <p className="text-sm font-mono opacity-90 leading-tight">{toast.message}</p>
              </div>

              {/* Motion Lines (Decoration) */}
              <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-white/10 to-transparent skew-x-12 pointer-events-none" />
          </div>
      </motion.div>
  )}
</AnimatePresence>

      <div className="relative z-10 max-w-7xl mx-auto p-6 space-y-12">
        
        {/* HEADER */}
        <header className="flex justify-between items-center py-6">
          <div>
            <h1 style={{ fontFamily: '"Josefin Sans", sans-serif' }} className="text-5xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-200 to-slate-400 drop-shadow-sm">
              ANTNET
            </h1>
            <p className="text-lg text-slate-400 font-medium tracking-wide mt-1">Distributed Intelligence Swarm</p>
          </div>
          
          {/* --- GIANT MINION WIDGET --- */}
          <GlassCard className="flex items-center gap-6 px-8 py-3 !rounded-full transition-all hover:scale-105 duration-300 border border-white/20 hover:border-white/40 group cursor-default">
            <div className="text-right">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400 font-bold mb-1">Status</p>
                <p className={cn("text-2xl font-black italic tracking-tighter", isSwarmBusy ? "text-emerald-400 animate-pulse" : "text-slate-300")}>
                    {isSwarmBusy ? "CRUNCHING" : "IDLE MODE"}
                </p>
            </div>
            {/* Larger Image Container */}
            <div className="relative w-24 h-24 rounded-full overflow-hidden border-4 border-white/10 bg-black/50 shadow-[0_0_30px_rgba(0,0,0,0.5)] group-hover:shadow-[0_0_30px_rgba(168,85,247,0.3)] transition-all">
                <img 
                    src={isSwarmBusy ? MINION_WORK : MINION_IDLE} 
                    alt="Minion Status" 
                    className="w-full h-full object-cover scale-125"
                />
            </div>
          </GlassCard>
        </header>

        {/* MAIN LAYOUT */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          
          {/* LEFT: WORKERS (8 Columns) */}
          <div className="lg:col-span-8 space-y-8">
            <SectionTitle icon={<Server size={24}/>} title="Active Nodes" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <AnimatePresence>
                {Object.keys(workers).length === 0 ? (
                   <div className="col-span-full py-16 flex flex-col items-center justify-center text-slate-500 border border-white/5 rounded-3xl bg-white/5 backdrop-blur-sm">
                        <Zap size={64} className="mb-6 opacity-20"/>
                        <p className="text-xl font-light">Waiting for connection...</p>
                   </div>
                ) : (
                  Object.entries(workers).map(([id, data]) => <WorkerChartCard key={id} id={id} data={data} />)
                )}
              </AnimatePresence>
            </div>

            <SectionTitle icon={<List size={24}/>} title="Job History" className="mt-12"/>
            <div className="space-y-4">
                 {(!dbData.injections || dbData.injections.length === 0) ? (
                    <div className="text-center py-12 text-slate-500 text-lg font-light italic">No jobs in history.</div>
                 ) : (
                    dbData.injections.map((job) => (
                        <JobRow 
                            key={job.injection_id} 
                            job={job} 
                            isExpanded={expandedJob === job.injection_id} 
                            onToggle={() => toggleJob(job.injection_id)}
                            onCancel={(e) => cancelJob(e, job.injection_id)}
                            details={jobDetails}
                            loading={loadingDetails}
                        />
                    ))
                 )}
            </div>
          </div>

          {/* RIGHT: CONTROL PANEL (4 Columns) */}
          <div className="lg:col-span-4 space-y-8">
             <SectionTitle icon={<Upload size={24}/>} title="Control Center" />
             
             <GlassCard className="p-8 space-y-8 !bg-white/5 !border-white/10 !rounded-3xl shadow-2xl">
                {/* PROMPT */}
                <div className="space-y-3">
                    <Label icon={<MessageSquare size={16}/>}>Swarm Directive</Label>
                    <textarea 
                        value={userPrompt}
                        onChange={(e) => setUserPrompt(e.target.value)}
                        className="w-full bg-black/40 border border-white/10 rounded-2xl p-4 text-base text-slate-200 focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 focus:outline-none h-32 resize-none transition-all placeholder:text-slate-600 shadow-inner"
                        placeholder="What should the swarm do?"
                    />
                </div>

                {/* FILE */}
                <div className="space-y-3">
                    <Label icon={<FileJson size={16}/>}>Target Payload</Label>
                    <div className="relative group">
                        <input 
                            type="file" 
                            ref={fileInputRef} 
                            onChange={handleFileChange}
                            className="block w-full text-sm text-slate-400 
                                file:mr-4 file:py-3 file:px-6 file:rounded-xl file:border-0 
                                file:text-sm file:font-bold file:uppercase file:bg-purple-600 file:text-white
                                hover:file:bg-purple-500 file:transition-all
                                border border-white/10 rounded-2xl p-2 bg-black/20 cursor-pointer transition-colors hover:bg-black/40"
                        />
                    </div>
                </div>

                {/* SLIDER */}
                <div className="space-y-4 pt-4">
                    <div className="flex justify-between items-center">
                        <Label icon={<Sliders size={16}/>}>Fragmentation Size</Label>
                        <span className="text-xs font-mono font-bold text-purple-300 bg-purple-500/20 px-3 py-1 rounded-lg border border-purple-500/30">
                            {chunkSize} chars
                        </span>
                    </div>
                    <input 
                        type="range" min="500" max="5000" step="100" 
                        value={chunkSize} onChange={(e) => setChunkSize(e.target.value)} 
                        className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500 hover:accent-purple-400 transition-all"
                    />
                    <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono font-bold uppercase tracking-wider">
                        <span>Speed Priority</span>
                        <span>Context Priority</span>
                    </div>
                </div>

                {/* STATS BADGE */}
                <div className="bg-black/30 rounded-xl p-4 flex justify-between items-center border border-white/5 shadow-inner">
                     <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">Est. Shards</span>
                     <span className={cn("text-xl font-mono font-black", estimatedChunks > 50 ? "text-amber-400" : "text-blue-400")}>
                        {estimatedChunks || "-"}
                     </span>
                </div>

                {/* LAUNCH BTN */}
                <button 
                    onClick={uploadJob} 
                    className="w-full py-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 rounded-2xl font-bold text-lg text-white shadow-[0_10px_30px_rgba(147,51,234,0.3)] transition-all active:scale-[0.98] border border-white/10"
                >
                    INITIALIZE SWARM
                </button>
             </GlassCard>
          </div>

        </div>
      </div>
    </div>
  );
}

// --- COMPONENTS ---

const GlassCard = ({ children, className }) => (
    <div className={cn("bg-white/5 backdrop-blur-3xl border border-white/10 rounded-3xl shadow-2xl", className)}>
        {children}
    </div>
);

const SectionTitle = ({ icon, title, className }) => (
    <div className={cn("flex items-center gap-3 text-slate-400 mb-6 px-2", className)}>
        {icon} <h2 className="text-lg font-black uppercase tracking-widest">{title}</h2>
    </div>
);

const Label = ({ icon, children }) => (
    <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
        {icon} {children}
    </label>
);

// --- WORKER CHART ---
const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-black/80 backdrop-blur-xl border border-white/10 p-3 rounded-xl shadow-2xl text-xs font-mono">
        <p className="text-slate-500 mb-2 border-b border-white/5 pb-1">{label}</p>
        {payload.map((entry, index) => (
          <div key={index} className="flex items-center justify-between gap-4 mb-1 last:mb-0">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full shadow-[0_0_8px_currentColor]" style={{ backgroundColor: entry.color }} />
              <span className="text-slate-300">{entry.name}</span>
            </div>
            <span className="font-bold" style={{ color: entry.color }}>{entry.value}%</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

function WorkerChartCard({ id, data }) {
    const isAlive = data.status === 'ALIVE';
    const latest = data.history?.at(-1) || { cpu: 0, ram: 0, gpu: 0 };
    const isBusy = data.current_task !== null;

    return (
        <motion.div 
            layout 
            initial={{ opacity: 0, scale: 0.95 }} 
            animate={{ opacity: 1, scale: 1 }} 
            className="group relative"
        >
            <GlassCard className="p-0 overflow-hidden border-white/5 hover:border-white/20 transition-all duration-500 !rounded-2xl">
                
                <div className="absolute top-0 left-0 right-0 p-5 z-20 flex justify-between items-start bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
                    <div>
                        <h3 className="font-bold text-base text-white flex items-center gap-2 drop-shadow-md">
                            {id} 
                            {latest.gpu > 0 && (
                                <span className="text-[9px] bg-pink-500/20 text-pink-300 px-1.5 py-0.5 rounded border border-pink-500/30 shadow-[0_0_10px_rgba(236,72,153,0.3)]">
                                    GPU
                                </span>
                            )}
                            {isBusy && (
                                <span className="flex items-center gap-1 text-[9px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/30 shadow-[0_0_10px_rgba(245,158,11,0.2)] animate-pulse">
                                    <Zap size={10} fill="currentColor"/> BUSY
                                </span>
                            )}
                        </h3>
                        <div className="flex gap-3 text-[10px] font-mono mt-1 opacity-90 font-bold">
                            <span className="text-cyan-400 drop-shadow-sm">CPU {latest.cpu}%</span>
                            <span className="text-purple-400 drop-shadow-sm">RAM {latest.ram}%</span>
                        </div>
                    </div>
                    
                    <div className="relative flex h-3 w-3">
                        {isAlive && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>}
                        <span className={cn("relative inline-flex rounded-full h-3 w-3 shadow-[0_0_10px_currentColor]", isAlive ? "bg-emerald-500 text-emerald-500" : "bg-red-500 text-red-500")}></span>
                    </div>
                </div>

                <div className="h-40 w-full relative z-10 mt-0">
                     <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data.history} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id="gradCpu" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.4}/>
                                    <stop offset="100%" stopColor="#06b6d4" stopOpacity={0}/>
                                </linearGradient>
                                <linearGradient id="gradRam" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#a855f7" stopOpacity={0.4}/>
                                    <stop offset="100%" stopColor="#a855f7" stopOpacity={0}/>
                                </linearGradient>
                                <filter id="glow" height="300%" width="300%" x="-75%" y="-75%">
                                    <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                                    <feMerge>
                                        <feMergeNode in="coloredBlur" />
                                        <feMergeNode in="SourceGraphic" />
                                    </feMerge>
                                </filter>
                            </defs>
                            <XAxis dataKey="time" hide />
                            <YAxis domain={[0, 100]} hide />
                            <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.2)', strokeWidth: 1, strokeDasharray: '4 4' }} />
                            {latest.gpu > 0 && <Area type="monotone" dataKey="gpu" stroke="#ec4899" strokeWidth={2} fill="url(#gradRam)" filter="url(#glow)" animationDuration={1000} />}
                            <Area type="monotone" dataKey="ram" stroke="#a855f7" strokeWidth={2} fillOpacity={1} fill="url(#gradRam)" filter="url(#glow)" animationDuration={1000} />
                            <Area type="monotone" dataKey="cpu" stroke="#06b6d4" strokeWidth={2} fillOpacity={1} fill="url(#gradCpu)" filter="url(#glow)" animationDuration={1000} />
                        </AreaChart>
                     </ResponsiveContainer>
                </div>
            </GlassCard>
        </motion.div>
    );
}

// --- JOB ROW ---
function JobRow({ job, isExpanded, onToggle, onCancel, details, loading }) {
    const isComplete = details && details.length > 0 && details.length === details[0].total_chunks;
    const openChat = (e) => { e.stopPropagation(); window.open(`/chat/${job.injection_id}`, '_blank'); };

    return (
        <GlassCard className="overflow-hidden transition-all hover:bg-white/10 !rounded-2xl group border border-white/5 hover:border-white/20">
            <div onClick={onToggle} className="flex items-center justify-between p-5 cursor-pointer">
                <div className="flex items-center gap-5">
                    <div className={cn("p-2 rounded-xl bg-black/40 border border-white/5 transition-transform group-hover:scale-110", isExpanded && "rotate-90 bg-purple-500/20 border-purple-500/30")}>
                        <ChevronRight size={16} className={cn("text-slate-400", isExpanded && "text-purple-300")}/>
                    </div>
                    <div>
                        <p className="font-mono text-base text-purple-300 font-bold group-hover:text-purple-200 transition-colors">{job.injection_id}</p>
                        <p className="text-xs text-slate-400 truncate max-w-[200px] md:max-w-[350px] mt-1 opacity-70">{job.original_prompt}</p>
                    </div>
                </div>
                
                <div className="flex items-center gap-4">
                    <span className="text-[10px] font-mono font-bold text-slate-500 bg-black/30 px-2 py-1 rounded-md border border-white/5">{new Date(job.created_at).toLocaleTimeString()}</span>
                    {isComplete && (
                        <button onClick={openChat} className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-[0_0_15px_rgba(16,185,129,0.1)] hover:shadow-[0_0_20px_rgba(16,185,129,0.3)]">
                            <MessageSquare size={14} /> Chat
                        </button>
                    )}
                    <button onClick={onCancel} className="p-2.5 rounded-full hover:bg-red-500/20 text-slate-500 hover:text-red-400 transition-colors">
                        <Trash2 size={16} />
                    </button>
                </div>
            </div>

            <AnimatePresence>
                {isExpanded && (
                    <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden bg-black/20 border-t border-white/5">
                        <div className="p-8 relative space-y-6">
                            <div className="absolute left-[34px] top-8 bottom-8 w-0.5 bg-gradient-to-b from-purple-500/50 to-transparent"></div>
                            {loading ? (
                                <p className="text-sm text-slate-500 pl-12 animate-pulse font-mono">Retrieving fragments...</p>
                            ) : details.length === 0 ? (
                                <p className="text-sm text-slate-500 pl-12 font-mono">Processing pending...</p>
                            ) : (
                                details.map((chunk, i) => (
                                    <div key={i} className="relative pl-12">
                                        <div className="absolute left-[29px] top-1.5 w-3 h-3 rounded-full bg-purple-500 shadow-[0_0_12px_#a855f7] ring-4 ring-black"></div>
                                        <div className="bg-white/5 border border-white/5 rounded-2xl p-4 hover:bg-white/10 transition-colors">
                                            <div className="flex justify-between items-start mb-3">
                                                <span className="text-xs font-black uppercase tracking-wider text-slate-300">Chunk {chunk.chunk_index}</span>
                                                <span className="text-[10px] font-mono font-bold text-slate-500 bg-black/30 px-2 py-1 rounded-md border border-white/5">{chunk.worker_id}</span>
                                            </div>
                                            <p className="text-xs text-slate-400 font-mono leading-relaxed opacity-80">{chunk.content}</p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </GlassCard>
    );
}