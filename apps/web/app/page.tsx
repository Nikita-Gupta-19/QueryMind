'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Loader2, 
  Sparkles, 
  Database, 
  Layout, 
  BookOpen, 
  ArrowRight, 
  Mail, 
  Lock, 
  User,
  ArrowRightLeft
} from 'lucide-react';
import { API_URL } from './config';

export default function Home() {
  const router = useRouter();
  
  // Auth state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  
  // Checking active session
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    const isTokenExpired = (t: string) => {
      try {
        const payload = JSON.parse(atob(t.split('.')[1]));
        return payload.exp ? Date.now() >= payload.exp * 1000 : false;
      } catch (err) {
        return true;
      }
    };

    const token = localStorage.getItem('token');
    if (token && !isTokenExpired(token)) {
      setHasSession(true);
    } else {
      localStorage.removeItem('token');
    }
    setCheckingSession(false);
  }, []);

  const navigateToWorkspace = async (token: string) => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      
      // 1. Fetch workspaces
      const res = await fetch(`${API_URL}/api/workspaces`, { headers });
      if (res.ok) {
        const workspaces = await res.json();
        if (workspaces && workspaces.length > 0) {
          router.push(`/workspace/${workspaces[0].id}/query`);
          return;
        }
      }
      
      // 2. If no workspace, create one
      const createRes = await fetch(`${API_URL}/api/workspaces`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ name: 'Default Workspace' })
      });
      
      if (createRes.ok) {
        const newWorkspace = await createRes.json();
        router.push(`/workspace/${newWorkspace.id}/query`);
      } else {
        const errData = await createRes.json().catch(() => ({}));
        setAuthError(`Could not initialize workspace. (API URL: ${API_URL}). error: ${errData.error || 'Unknown Error'}`);
      }
    } catch (err) {
      setAuthError(`Failed to establish workspace connection. (API URL: ${API_URL})`);
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setAuthError(null);

    const endpoint = isRegister ? 'register' : 'login';
    const bodyPayload = isRegister 
      ? { email: email.trim(), password, name: name.trim() } 
      : { email: email.trim(), password };

    try {
      const res = await fetch(`${API_URL}/api/auth/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload)
      });
      const data = await res.json();

      if (res.ok) {
        localStorage.setItem('token', data.accessToken);
        await navigateToWorkspace(data.accessToken);
      } else {
        setAuthError(data.error || 'Authentication failed.');
        setLoading(false);
      }
    } catch (err) {
      setAuthError(`API Server at ${API_URL} is starting up or unreachable. Please try again in a few seconds.`);
      setLoading(false);
    }
  };

  const handleQuickDemo = async () => {
    setLoading(true);
    setAuthError(null);
    
    // We register a random guest email or login standard demo account
    const randomId = Math.floor(Math.random() * 10000);
    const guestEmail = `guest_${randomId}@querymind.ai`;
    const guestPass = `GuestPass123!`;

    try {
      // 1. Try to register guest account
      const res = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: guestEmail, password: guestPass, name: `Guest User ${randomId}` })
      });
      const data = await res.json();

      if (res.ok) {
        localStorage.setItem('token', data.accessToken);
        await navigateToWorkspace(data.accessToken);
      } else {
        setAuthError(`Failed to initialize demo workspace. (API URL: ${API_URL}). error: ${data.error || 'Unknown Error'}`);
        setLoading(false);
      }
    } catch (err) {
      setAuthError(`API Server at ${API_URL} is starting up or unreachable. Please try again in a few seconds.`);
      setLoading(false);
    }
  };

  const handleResumeSession = () => {
    const token = localStorage.getItem('token');
    if (token) {
      setLoading(true);
      navigateToWorkspace(token);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black text-white p-6 relative overflow-hidden font-sans">
      {/* Decorative Glow Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-30"></div>
      
      {/* Decorative gradient sphere */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-violet-600/5 blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full bg-cyan-500/5 blur-[120px] pointer-events-none"></div>

      <div className="z-10 max-w-5xl w-full grid grid-cols-1 lg:grid-cols-12 gap-12 items-center py-12">
        
        {/* Left Side: Branding & Info */}
        <div className="lg:col-span-7 space-y-8 text-center lg:text-left">
          {/* Logo Shield */}
          <div className="inline-flex items-center space-x-3 bg-slate-900/80 border border-slate-800 rounded-full px-5 py-2 backdrop-blur-md shadow-xl">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse"></span>
            <span className="text-xs font-semibold tracking-widest text-cyan-400 uppercase">QueryMind AI</span>
            <span className="text-xs text-slate-500">|</span>
            <span className="text-xs text-slate-400">Enterprise NL-to-SQL</span>
          </div>

          {/* Hero Title */}
          <div className="space-y-4">
            <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent leading-none">
              Relational Analytics
              <span className="block mt-2 bg-gradient-to-r from-cyan-400 via-indigo-400 to-purple-500 bg-clip-text text-transparent">
                Powered by LLMs
              </span>
            </h1>
            <p className="text-sm sm:text-base text-slate-400 max-w-xl mx-auto lg:mx-0 font-light leading-relaxed">
              Translate conversational English into production-safe, performant SQL. Set up workspaces, manage DB connections, build dashboard charts, and run multi-step analyst agents seamlessly.
            </p>
          </div>

          {/* Mini Features List */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg mx-auto lg:mx-0">
            <div className="flex items-start space-x-3 p-3 rounded-xl bg-slate-900/30 border border-slate-900/60">
              <Database className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
              <div className="text-left">
                <h4 className="text-xs font-bold text-slate-200">Safe SQL Executor</h4>
                <p className="text-[10px] text-slate-500">Keyword blocks & auto-injected query row limits.</p>
              </div>
            </div>
            <div className="flex items-start space-x-3 p-3 rounded-xl bg-slate-900/30 border border-slate-900/60">
              <ArrowRightLeft className="w-5 h-5 text-indigo-400 flex-shrink-0 mt-0.5" />
              <div className="text-left">
                <h4 className="text-xs font-bold text-slate-200">Glossary Mappings</h4>
                <p className="text-[10px] text-slate-500">Map custom vocabulary to database columns using RAG.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Auth Box / Gateway */}
        <div className="lg:col-span-5">
          <div className="glass-panel p-8 rounded-3xl glow-indigo border-slate-800 shadow-2xl relative overflow-hidden">
            
            {checkingSession ? (
              <div className="flex flex-col items-center justify-center py-12 space-y-3">
                <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
                <span className="text-xs text-slate-500">Checking session active...</span>
              </div>
            ) : hasSession ? (
              <div className="space-y-6 text-center py-4">
                <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-cyan-400 to-indigo-500 flex items-center justify-center mx-auto text-slate-950 font-bold text-lg">
                  QM
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Welcome Back to QueryMind</h3>
                  <p className="text-xs text-slate-500 mt-1">You have a logged-in active session on this browser.</p>
                </div>
                <div className="space-y-3">
                  <button
                    onClick={handleResumeSession}
                    disabled={loading}
                    className="w-full flex items-center justify-center space-x-2 py-3 rounded-xl bg-gradient-to-r from-cyan-400 to-indigo-500 hover:from-cyan-300 hover:to-indigo-400 text-slate-950 text-xs font-bold transition-all disabled:opacity-40"
                  >
                    {loading ? (
                      <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                    ) : (
                      <>
                        <span>Enter Dashboard Playground</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => {
                      localStorage.removeItem('token');
                      setHasSession(false);
                    }}
                    className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    Log in with a different account
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex border-b border-slate-900 pb-3">
                  <button
                    onClick={() => { setIsRegister(false); setAuthError(null); }}
                    className={`flex-1 text-center pb-2 text-xs font-bold transition-colors ${!isRegister ? 'text-cyan-400 border-b-2 border-cyan-400' : 'text-slate-500 hover:text-slate-300'}`}
                  >
                    Sign In
                  </button>
                  <button
                    onClick={() => { setIsRegister(true); setAuthError(null); }}
                    className={`flex-1 text-center pb-2 text-xs font-bold transition-colors ${isRegister ? 'text-cyan-400 border-b-2 border-cyan-400' : 'text-slate-500 hover:text-slate-300'}`}
                  >
                    Register
                  </button>
                </div>

                <form onSubmit={handleAuthSubmit} className="space-y-4">
                  {isRegister && (
                    <div className="relative">
                      <User className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" />
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Your full name"
                        className="w-full glass-input rounded-xl pl-10 pr-4 py-3 text-xs text-slate-200 focus:outline-none placeholder-slate-600"
                        required
                      />
                    </div>
                  )}
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="business@querymind.ai"
                      className="w-full glass-input rounded-xl pl-10 pr-4 py-3 text-xs text-slate-200 focus:outline-none placeholder-slate-600"
                      required
                    />
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full glass-input rounded-xl pl-10 pr-4 py-3 text-xs text-slate-200 focus:outline-none placeholder-slate-600"
                      required
                    />
                  </div>

                  {authError && (
                    <div className="p-3 text-[10px] rounded-xl border border-rose-500/20 bg-rose-500/5 text-rose-400 leading-relaxed">
                      {authError}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full flex items-center justify-center space-x-2 py-3 rounded-xl bg-gradient-to-r from-cyan-400 to-indigo-500 hover:from-cyan-300 hover:to-indigo-400 text-slate-950 text-xs font-bold transition-all disabled:opacity-40"
                  >
                    {loading ? (
                      <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                    ) : (
                      <>
                        <span>{isRegister ? 'Create Account' : 'Sign In to Workspace'}</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>

                <div className="relative flex py-2 items-center">
                  <div className="flex-grow border-t border-slate-900"></div>
                  <span className="flex-shrink mx-3 text-[9px] text-slate-600 font-bold uppercase tracking-wider">Or Quick Access</span>
                  <div className="flex-grow border-t border-slate-900"></div>
                </div>

                <button
                  onClick={handleQuickDemo}
                  disabled={loading}
                  className="w-full py-3 rounded-xl border border-slate-800 bg-slate-900/40 hover:bg-slate-900/80 text-slate-300 text-xs font-bold transition-all flex items-center justify-center space-x-2 disabled:opacity-40"
                >
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Launch Demo Workspace (No Login)</span>
                </button>
              </div>
            )}

          </div>
        </div>

      </div>

      {/* Footer Branding */}
      <footer className="w-full py-6 border-t border-slate-900 bg-slate-950/20 text-center text-[10px] text-slate-600 absolute bottom-0 left-0">
        Powered by QueryMind AI — Enterprise NL-to-SQL Analytics Platform
      </footer>
    </main>
  );
}
