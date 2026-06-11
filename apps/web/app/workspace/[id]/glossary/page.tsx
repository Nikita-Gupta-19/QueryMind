'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  BookOpen,
  ArrowLeft,
  Plus,
  Trash2,
  Loader2,
  Sparkles,
  HelpCircle,
  Database,
  ArrowRightLeft,
  UserCheck,
  Menu,
  X
} from 'lucide-react';
import { TableSkeleton } from '../../../../components/query/Skeletons';
import { API_URL } from '../../../config';

interface GlossaryTerm {
  id: string;
  businessTerm: string;
  schemaTerm: string;
  description: string | null;
  createdAt: string;
}

export default function WorkspaceGlossaryPage() {
  const params = useParams();
  const router = useRouter();
  const workspaceId = params.id as string;

  // Session states
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [terms, setTerms] = useState<GlossaryTerm[]>([]);
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Form states
  const [businessTerm, setBusinessTerm] = useState('');
  const [schemaTerm, setSchemaTerm] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

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

  // Fetch glossary terms
  const fetchGlossaryTerms = async (token: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/workspaces/${workspaceId}/glossary`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setTerms(data.terms || []);
      }
    } catch (err) {
      console.error('Error fetching glossary terms:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authToken) {
      fetchGlossaryTerms(authToken);
    }
  }, [authToken, workspaceId]);

  // Handle term creation
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessTerm.trim() || !schemaTerm.trim()) return;

    setSaving(true);
    setFormError(null);

    try {
      const res = await fetch(`${API_URL}/api/workspaces/${workspaceId}/glossary`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken || localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          businessTerm: businessTerm.trim(),
          schemaTerm: schemaTerm.trim(),
          description: description.trim() || undefined,
        }),
      });

      if (res.ok) {
        // Reset form
        setBusinessTerm('');
        setSchemaTerm('');
        setDescription('');
        // Re-fetch terms
        fetchGlossaryTerms(authToken || localStorage.getItem('token') || '');
      } else {
        const data = await res.json();
        setFormError(data.error || 'Failed to save glossary term.');
      }
    } catch (err) {
      setFormError('API Connection failed. Ensure the server is running.');
    } finally {
      setSaving(false);
    }
  };

  // Handle term deletion
  const handleDelete = async (termId: string) => {
    if (!confirm('Are you sure you want to delete this mapping?')) return;

    try {
      const res = await fetch(`${API_URL}/api/workspaces/${workspaceId}/glossary/${termId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${authToken || localStorage.getItem('token')}`,
        },
      });

      if (res.ok) {
        setTerms((prev) => prev.filter((t) => t.id !== termId));
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to delete term.');
      }
    } catch (err) {
      console.error('Error deleting term:', err);
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100 font-sans relative overflow-hidden">
      {/* Decorative Glow Spheres */}
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
        {/* Header Branding */}
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

        {/* Navigation Section */}
        <div className="p-5 border-b border-slate-900 space-y-2">
          <button
            onClick={() => router.push(`/workspace/${workspaceId}/query`)}
            className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl hover:bg-slate-900/60 transition-all text-xs text-slate-400 hover:text-white"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Playground</span>
          </button>
        </div>

        {/* Feature Context Info */}
        <div className="p-6 flex-1 text-xs text-slate-500 space-y-4">
          <h3 className="font-semibold text-slate-400 uppercase tracking-widest text-[9px] flex items-center">
            <HelpCircle className="w-3.5 h-3.5 mr-1.5 text-cyan-400" />
            Why use a Glossary?
          </h3>
          <p className="leading-relaxed">
            Real databases often name columns using shorthand or technical jargon like <code className="text-cyan-400 bg-slate-900 px-1 py-0.5 rounded">gmv</code>, <code className="text-cyan-400 bg-slate-900 px-1 py-0.5 rounded">cust_seg</code>, or <code className="text-cyan-400 bg-slate-900 px-1 py-0.5 rounded">tbl_rev_mnth</code>.
          </p>
          <p className="leading-relaxed">
            A **Business Glossary** maps standard user terms (like <span className="text-white font-medium">"revenue"</span> or <span className="text-white font-medium">"customer segment"</span>) to exact database equivalents.
          </p>
          <p className="leading-relaxed">
            The AI automatically retrieves these mappings via vector search to resolve ambiguous queries, preventing database hallucinations.
          </p>
        </div>

        {/* Active Dev Bypass Session */}
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
        {/* Header Top Bar */}
        <header className="px-8 py-4 border-b border-slate-900/60 bg-slate-950/40 backdrop-blur-md flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 -ml-2 text-slate-400 hover:text-white hover:bg-slate-900 rounded-lg md:hidden mr-2 transition-all"
            >
              <Menu className="w-5 h-5" />
            </button>
            <BookOpen className="w-5 h-5 text-indigo-400" />
            <span className="text-sm font-bold text-slate-200">Business Glossary Manager</span>
          </div>
          <div className="flex items-center space-x-2 text-xs text-slate-400">
            <ArrowRightLeft className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden sm:inline">Semantic Translation Enabled</span>
          </div>
        </header>

        {/* Main Content Area */}
        <div className="max-w-5xl w-full mx-auto px-8 py-8 space-y-8">
          
          {/* Create Term Form Panel */}
          <div className="glass-panel p-6 rounded-2xl glow-indigo border-slate-800">
            <h2 className="text-base font-bold text-white mb-2 flex items-center">
              <Sparkles className="w-4 h-4 text-cyan-400 mr-2 animate-pulse" />
              Add Business Translation Mapping
            </h2>
            <p className="text-xs text-slate-400 mb-6">
              Create a semantic mapping to instruct the SQL AI how to translate specific vocabulary words.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    Business Term / Keyword (e.g. revenue)
                  </label>
                  <input
                    type="text"
                    value={businessTerm}
                    onChange={(e) => setBusinessTerm(e.target.value)}
                    placeholder="e.g. monthly revenue"
                    className="w-full glass-input rounded-xl px-4 py-3 text-xs text-slate-200 focus:outline-none placeholder-slate-600"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    Schema Equivalent (Column / Table)
                  </label>
                  <input
                    type="text"
                    value={schemaTerm}
                    onChange={(e) => setSchemaTerm(e.target.value)}
                    placeholder="e.g. gmv or monthly_earnings"
                    className="w-full glass-input rounded-xl px-4 py-3 text-xs text-slate-200 focus:outline-none placeholder-slate-600"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Context / Description (optional)
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. represents the sum of product sales excluding discount codes"
                  className="w-full glass-input rounded-xl px-4 py-3 text-xs text-slate-200 focus:outline-none placeholder-slate-600"
                />
              </div>

              {formError && (
                <div className="p-3 text-xs rounded-xl border border-rose-500/20 bg-rose-500/5 text-rose-400">
                  {formError}
                </div>
              )}

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={saving || !businessTerm.trim() || !schemaTerm.trim()}
                  className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-400 to-indigo-500 hover:from-cyan-300 hover:to-indigo-400 text-slate-950 text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {saving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-950" />
                  ) : (
                    <Plus className="w-3.5 h-3.5 text-slate-950" />
                  )}
                  <span>Save Mapping</span>
                </button>
              </div>
            </form>
          </div>

          {/* Mappings Table Panel */}
          <div className="glass-panel rounded-2xl border-slate-800 overflow-hidden">
            <div className="p-5 border-b border-slate-900 bg-slate-900/10 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white">Active Vocabulary Mappings</h3>
                <p className="text-[10px] text-slate-500 mt-0.5">List of semantic mapping rules deployed to RAG context.</p>
              </div>
              <span className="text-[10px] px-2 py-0.5 bg-indigo-500/10 text-indigo-400 rounded-md font-semibold border border-indigo-500/20">
                {terms.length} Rules Active
              </span>
            </div>

            {loading ? (
              <div className="p-6">
                <TableSkeleton />
              </div>
            ) : terms.length === 0 ? (
              <div className="py-24 text-center">
                <Database className="w-10 h-10 text-slate-800 mx-auto mb-3" />
                <h4 className="text-xs font-bold text-slate-400">No glossary terms created</h4>
                <p className="text-[10px] text-slate-500 max-w-sm mx-auto mt-1 leading-relaxed">
                  Map abbreviations or slang vocabulary words to database columns to improve QueryMind analytics results.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-900 bg-slate-900/10">
                      <th className="p-4 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Business Term</th>
                      <th className="p-4 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Schema Term</th>
                      <th className="p-4 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Description</th>
                      <th className="p-4 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Created At</th>
                      <th className="p-4 text-center text-[10px] font-semibold text-slate-500 uppercase tracking-wider w-20">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {terms.map((term) => (
                      <tr key={term.id} className="border-b border-slate-900 hover:bg-slate-900/10 transition-colors">
                        <td className="p-4 text-xs font-bold text-slate-200">{term.businessTerm}</td>
                        <td className="p-4 text-xs font-mono text-cyan-400">{term.schemaTerm}</td>
                        <td className="p-4 text-xs text-slate-400 max-w-xs truncate">{term.description || '—'}</td>
                        <td className="p-4 text-[11px] text-slate-500">
                          {new Date(term.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                        </td>
                        <td className="p-4 text-center">
                          <button
                            onClick={() => handleDelete(term.id)}
                            className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/5 rounded-lg transition-all"
                            title="Delete glossary mapping"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
