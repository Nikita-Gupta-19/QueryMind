'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Settings,
  ArrowLeft,
  Loader2,
  Sparkles,
  Key,
  Database,
  UserCheck,
  Menu,
  X,
  CheckCircle,
  AlertTriangle
} from 'lucide-react';
import { API_URL } from '../../../config';

export default function WorkspaceSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const workspaceId = params.id as string;

  // Session states
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Workspace details
  const [workspaceName, setWorkspaceName] = useState('');
  const [hasGeminiKey, setHasGeminiKey] = useState(false);
  const [hasOpenAiKey, setHasOpenAiKey] = useState(false);

  // Form states
  const [nameInput, setNameInput] = useState('');
  const [geminiKeyInput, setGeminiKeyInput] = useState('');
  const [openAiKeyInput, setOpenAiKeyInput] = useState('');
  
  const [savingName, setSavingName] = useState(false);
  const [savingKeys, setSavingKeys] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Dev bypass login check
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
      setAuthToken(token);
    } else {
      localStorage.removeItem('token');
      handleDevBypassLogin();
    }
  }, []);

  const handleDevBypassLogin = async () => {
    try {
      const res = await fetch(`${API_URL}/api/auth/dev-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'nikita@querymind.ai' }),
      });
      if (res.ok) {
        const data = await res.json();
        localStorage.setItem('token', data.accessToken);
        setAuthToken(data.accessToken);
      }
    } catch (err) {
      console.warn('Dev login bypass not reachable.', err);
    }
  };

  // Fetch workspace details
  const fetchWorkspaceDetails = async (token: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/workspaces/${workspaceId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setWorkspaceName(data.name || '');
        setNameInput(data.name || '');
        setHasGeminiKey(!!data.hasGeminiKey);
        setHasOpenAiKey(!!data.hasOpenAiKey);
      } else {
        setErrorMsg('Failed to fetch workspace details.');
      }
    } catch (err) {
      console.error('Error fetching workspace details:', err);
      setErrorMsg('Failed to fetch workspace details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authToken) {
      fetchWorkspaceDetails(authToken);
    }
  }, [authToken, workspaceId]);

  // Handle Workspace Name Update
  const handleUpdateName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameInput.trim()) return;

    setSavingName(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`${API_URL}/api/workspaces/${workspaceId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken || localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ name: nameInput.trim() }),
      });

      if (res.ok) {
        const data = await res.json();
        setWorkspaceName(data.name);
        setSuccessMsg('Workspace name updated successfully!');
      } else {
        const data = await res.json();
        setErrorMsg(data.error || 'Failed to update workspace name.');
      }
    } catch (err) {
      setErrorMsg('API Connection failed. Ensure the server is running.');
    } finally {
      setSavingName(false);
    }
  };

  // Handle API Keys Update (BYOK)
  const handleSaveKeys = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingKeys(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const payload: any = {};
      if (geminiKeyInput.trim()) payload.geminiApiKey = geminiKeyInput.trim();
      if (openAiKeyInput.trim()) payload.openAiApiKey = openAiKeyInput.trim();

      const res = await fetch(`${API_URL}/api/workspaces/${workspaceId}/keys`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken || localStorage.getItem('token')}`,
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setSuccessMsg('API Keys updated successfully!');
        setGeminiKeyInput('');
        setOpenAiKeyInput('');
        fetchWorkspaceDetails(authToken || localStorage.getItem('token') || '');
      } else {
        const data = await res.json();
        setErrorMsg(data.error || 'Failed to update API Keys.');
      }
    } catch (err) {
      setErrorMsg('API Connection failed. Ensure the server is running.');
    } finally {
      setSavingKeys(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100 font-sans relative overflow-hidden">
      {/* Decorative Glow */}
      <div className="absolute top-[-10%] left-[-10%] w-[400px] h-[400px] rounded-full bg-indigo-600/5 blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[400px] h-[400px] rounded-full bg-cyan-500/5 blur-[120px] pointer-events-none"></div>

      {/* 1. Sidebar */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden animate-fade-in"
          onClick={() => setSidebarOpen(false)}
        ></div>
      )}

      <aside className={`w-80 border-r border-slate-900 bg-slate-950/80 backdrop-blur-xl z-50 flex flex-col fixed md:static top-0 left-0 h-full transition-transform duration-300 ease-in-out ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      }`}>
        <div className="p-5 border-b border-slate-900 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-400 to-indigo-500 flex items-center justify-center font-bold text-slate-950">
              QM
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight text-white">QueryMind AI</h1>
              <p className="text-[10px] text-slate-500">Workspace Hub</p>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-900 md:hidden transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 border-b border-slate-900">
          <button
            onClick={() => router.push(`/workspace/${workspaceId}/query`)}
            className="w-full flex items-center space-x-3 px-4 py-2.5 rounded-xl hover:bg-slate-900/60 transition-all text-xs text-slate-400 hover:text-white"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Playground</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest flex items-center">
            <Settings className="w-3.5 h-3.5 text-cyan-400 mr-2" />
            Workspace Settings
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Manage your workspace settings, including your own LLM API keys (BYOK) to prevent API throttling and run queries on your own limits.
          </p>
        </div>

        {authToken && (
          <div className="p-4 bg-slate-950 border-t border-slate-900 flex items-center justify-between text-xs text-slate-500">
            <span className="flex items-center">
              <UserCheck className="w-3.5 h-3.5 text-emerald-400 mr-1.5" />
              Dev Bypass Session
            </span>
          </div>
        )}
      </aside>

      {/* 2. Main Console */}
      <main className="flex-1 flex flex-col z-10 overflow-y-auto">
        <header className="px-8 py-4 border-b border-slate-900/60 bg-slate-950/40 backdrop-blur-md flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 -ml-2 text-slate-400 hover:text-white hover:bg-slate-900 rounded-lg md:hidden mr-2 transition-all"
            >
              <Menu className="w-5 h-5" />
            </button>
            <Settings className="w-5 h-5 text-indigo-400" />
            <span className="text-sm font-bold text-slate-200">Workspace Management</span>
          </div>
        </header>

        <div className="max-w-3xl w-full mx-auto px-8 py-8 space-y-8">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-32 space-y-3">
              <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
              <span className="text-xs text-slate-500">Loading workspace configurations...</span>
            </div>
          ) : (
            <>
              {/* Messages */}
              {errorMsg && (
                <div className="p-4 rounded-xl border border-rose-500/20 bg-rose-500/5 text-rose-400 text-xs flex items-center space-x-2.5 animate-fade-in">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {successMsg && (
                <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-emerald-400 text-xs flex items-center space-x-2.5 animate-fade-in">
                  <CheckCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{successMsg}</span>
                </div>
              )}

              {/* General Settings */}
              <div className="glass-panel p-6 rounded-2xl border-slate-800 space-y-4">
                <h3 className="text-sm font-bold text-white flex items-center">
                  <Database className="w-4.5 h-4.5 text-cyan-400 mr-2" />
                  Workspace Details
                </h3>
                
                <form onSubmit={handleUpdateName} className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                      Workspace Name
                    </label>
                    <input
                      type="text"
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      placeholder="e.g. Analytics Team"
                      className="w-full glass-input rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={savingName || nameInput.trim() === workspaceName}
                    className="flex items-center justify-center space-x-1.5 px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-200 text-xs font-bold transition-all disabled:opacity-40"
                  >
                    {savingName && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>Save Changes</span>
                  </button>
                </form>
              </div>

              {/* BYOK Settings */}
              <div className="glass-panel p-6 rounded-2xl border-slate-800 space-y-5">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center">
                    <Key className="w-4.5 h-4.5 text-indigo-400 mr-2" />
                    Bring Your Own Key (BYOK)
                  </h3>
                  <p className="text-[10px] text-slate-500 mt-1">
                    Provide your own Google Gemini or OpenAI API keys to override default system limits. Keys are encrypted at rest using AES-256-GCM.
                  </p>
                </div>

                <form onSubmit={handleSaveKeys} className="space-y-4">
                  {/* Gemini Key */}
                  <div className="space-y-1.5">
                    <label className="flex items-center justify-between text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                      <span>Gemini API Key</span>
                      {hasGeminiKey ? (
                        <span className="text-[9px] text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-2 py-0.5 rounded-full lowercase font-mono">
                          configured
                        </span>
                      ) : (
                        <span className="text-[9px] text-slate-500 bg-slate-900 border border-slate-850 px-2 py-0.5 rounded-full lowercase font-mono">
                          not set (using system fallback)
                        </span>
                      )}
                    </label>
                    <input
                      type="password"
                      value={geminiKeyInput}
                      onChange={(e) => setGeminiKeyInput(e.target.value)}
                      placeholder="Paste your Gemini API key here..."
                      className="w-full glass-input rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none"
                    />
                  </div>

                  {/* OpenAI Key */}
                  <div className="space-y-1.5">
                    <label className="flex items-center justify-between text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                      <span>OpenAI API Key</span>
                      {hasOpenAiKey ? (
                        <span className="text-[9px] text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-2 py-0.5 rounded-full lowercase font-mono">
                          configured
                        </span>
                      ) : (
                        <span className="text-[9px] text-slate-500 bg-slate-900 border border-slate-850 px-2 py-0.5 rounded-full lowercase font-mono">
                          not set (using system fallback)
                        </span>
                      )}
                    </label>
                    <input
                      type="password"
                      value={openAiKeyInput}
                      onChange={(e) => setOpenAiKeyInput(e.target.value)}
                      placeholder="Paste your OpenAI API key here..."
                      className="w-full glass-input rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={savingKeys || (!geminiKeyInput.trim() && !openAiKeyInput.trim())}
                    className="flex items-center justify-center space-x-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-450 to-indigo-500 hover:from-cyan-350 hover:to-indigo-400 text-slate-950 text-xs font-bold transition-all disabled:opacity-40"
                  >
                    {savingKeys && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-950" />}
                    <span>Update API Keys</span>
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
