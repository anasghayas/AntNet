'use client';
import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Send, Bot, User, ArrowLeft, Sparkles, Copy, Check } from 'lucide-react';
import { motion } from 'framer-motion';
import { useParams, useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

const API_URL = "http://localhost:8000";

export default function ChatPage() {
    const { id } = useParams(); // Note: If using ?id= query param, switch to useSearchParams()
    const router = useRouter();
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const scrollRef = useRef(null);

    // 1. Fetch Job Data on Mount
    useEffect(() => {
        const initChat = async () => {
            try {
                const res = await axios.get(`${API_URL}/api/results/${id}`);
                const context = res.data.full_text || res.data.text; 

                // System Prompt (Hidden)
                const systemMsg = {
                    role: "system",
                    content: `You are an AI assistant analyzing a processed document. 
                    CONTEXT:
                    ${context}
                    
                    INSTRUCTIONS:
                    - Answer based on the context above.
                    - Use Markdown for formatting (bold, lists, code blocks).
                    - Be concise and professional.`
                };
                
                const welcomeMsg = {
                    role: "assistant",
                    content: `**Analysis Complete.**\n\nI have processed the data for Job \`${id}\`. I'm ready to answer your questions regarding the summaries.`
                };

                setMessages([systemMsg, welcomeMsg]);
                setLoading(false);
            } catch (e) {
                console.error(e);
                setLoading(false);
            }
        };
        initChat();
    }, [id]);

    // Auto-scroll
    useEffect(() => {
        scrollRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const sendMessage = async () => {
        if (!input.trim() || sending) return;
        
        const newMsg = { role: "user", content: input };
        const updatedHistory = [...messages, newMsg];
        
        setMessages(updatedHistory);
        setInput("");
        setSending(true);

        try {
            const res = await axios.post(`${API_URL}/api/chat`, {
                messages: updatedHistory
            });
            setMessages(prev => [...prev, res.data.result]);
        } catch (e) {
            console.error(e);
            setMessages(prev => [...prev, { role: "assistant", content: "**Error:** Could not reach AI service." }]);
        }
        setSending(false);
    };

    return (
        <div className="min-h-screen bg-black text-slate-100 font-sans relative overflow-hidden flex flex-col selection:bg-purple-500/30">
            
            {/* Background Blobs */}
            <div className="fixed inset-0 z-0 pointer-events-none">
                <div className="absolute top-[-20%] right-[-10%] w-[50vw] h-[50vw] bg-purple-600/10 rounded-full blur-[120px]" />
                <div className="absolute bottom-[-20%] left-[-10%] w-[50vw] h-[50vw] bg-blue-600/10 rounded-full blur-[120px]" />
            </div>

            {/* Header */}
            <header className="z-10 p-4 border-b border-white/10 bg-black/40 backdrop-blur-xl flex items-center gap-4 sticky top-0">
                <button onClick={() => window.close()} className="p-2 hover:bg-white/10 rounded-full transition text-slate-400 hover:text-white">
                    <ArrowLeft size={20} />
                </button>
                <div>
                    <h1 className="font-bold text-lg flex items-center gap-2 text-white">
                        <Sparkles size={18} className="text-purple-400"/> 
                        Swarm Chat
                    </h1>
                    <p className="text-[10px] text-slate-500 font-mono tracking-wider uppercase">Context ID: {id}</p>
                </div>
            </header>

            {/* Chat Area */}
            <div className="flex-1 overflow-y-auto p-4 z-10 space-y-6 scrollbar-thin scrollbar-thumb-white/10">
                {loading ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-3">
                        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                        <p className="text-sm font-mono animate-pulse">Loading Swarm Context...</p>
                    </div>
                ) : (
                    messages.filter(m => m.role !== 'system').map((m, i) => (
                        <motion.div 
                            key={i} 
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={`flex gap-4 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}
                        >
                            {/* Avatar */}
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border border-white/10 shadow-lg ${
                                m.role === 'user' ? 'bg-blue-600/20 text-blue-400' : 'bg-purple-600/20 text-purple-400'
                            }`}>
                                {m.role === 'user' ? <User size={16}/> : <Bot size={16}/>}
                            </div>

                            {/* Message Bubble */}
                            <div className={`max-w-[85%] lg:max-w-[70%] p-4 rounded-2xl text-sm leading-7 shadow-xl backdrop-blur-sm ${
                                m.role === 'user' 
                                ? 'bg-blue-600 text-white rounded-tr-none' 
                                : 'bg-white/5 border border-white/10 text-slate-200 rounded-tl-none'
                            }`}>
                                {/* MARKDOWN RENDERER */}
                                <ReactMarkdown 
                                    remarkPlugins={[remarkGfm]}
                                    components={{
                                        // Custom Code Block Renderer
                                        code({node, inline, className, children, ...props}) {
                                            const match = /language-(\w+)/.exec(className || '')
                                            return !inline && match ? (
                                                <div className="rounded-lg overflow-hidden my-3 border border-white/10 bg-black/50">
                                                    <div className="flex justify-between items-center px-3 py-1.5 bg-white/5 border-b border-white/5">
                                                        <span className="text-[10px] font-mono text-slate-400 uppercase">{match[1]}</span>
                                                        <CopyButton text={String(children).replace(/\n$/, '')} />
                                                    </div>
                                                    <SyntaxHighlighter
                                                        {...props}
                                                        style={atomDark}
                                                        language={match[1]}
                                                        PreTag="div"
                                                        customStyle={{ margin: 0, padding: '1rem', background: 'transparent' }}
                                                    >
                                                        {String(children).replace(/\n$/, '')}
                                                    </SyntaxHighlighter>
                                                </div>
                                            ) : (
                                                <code {...props} className="bg-white/10 text-purple-300 px-1.5 py-0.5 rounded font-mono text-xs">
                                                    {children}
                                                </code>
                                            )
                                        },
                                        // Style other elements
                                        p: ({children}) => <p className="mb-3 last:mb-0">{children}</p>,
                                        ul: ({children}) => <ul className="list-disc pl-4 mb-3 space-y-1">{children}</ul>,
                                        ol: ({children}) => <ol className="list-decimal pl-4 mb-3 space-y-1">{children}</ol>,
                                        li: ({children}) => <li className="pl-1">{children}</li>,
                                        strong: ({children}) => <span className="font-bold text-white">{children}</span>,
                                        h1: ({children}) => <h1 className="text-lg font-bold text-white mt-4 mb-2">{children}</h1>,
                                        h2: ({children}) => <h2 className="text-base font-bold text-white mt-3 mb-2">{children}</h2>,
                                        blockquote: ({children}) => <blockquote className="border-l-4 border-purple-500 pl-4 italic text-slate-400 my-3">{children}</blockquote>
                                    }}
                                >
                                    {m.content}
                                </ReactMarkdown>
                            </div>
                        </motion.div>
                    ))
                )}
                <div ref={scrollRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 z-20 bg-black/80 backdrop-blur-xl border-t border-white/10">
                <div className="max-w-4xl mx-auto relative flex gap-3">
                    <input 
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                        placeholder="Ask follow-up questions..."
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-5 py-3 text-sm focus:outline-none focus:border-purple-500/50 focus:bg-white/10 transition-colors text-white placeholder:text-slate-600"
                        disabled={loading || sending}
                        autoFocus
                    />
                    <button 
                        onClick={sendMessage}
                        disabled={loading || sending || !input.trim()}
                        className="bg-gradient-to-br from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white p-3 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-purple-500/20"
                    >
                        <Send size={18} />
                    </button>
                </div>
            </div>
        </div>
    );
}

// Helper: Copy Button Component
function CopyButton({ text }) {
    const [copied, setCopied] = useState(false);
    const handleCopy = () => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    return (
        <button onClick={handleCopy} className="text-slate-500 hover:text-white transition-colors">
            {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
        </button>
    );
}