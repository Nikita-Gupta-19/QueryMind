'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Layout,
  Plus,
  Trash2,
  Globe,
  Lock,
  Copy,
  Check,
  Loader2,
  Sparkles,
  ArrowLeft,
  Settings,
  UserCheck,
  Menu,
  X
} from 'lucide-react';
import DashboardGrid from '../../../../components/dashboard/DashboardGrid';

interface QueryHistory {
  id: string;
  question: string;
  generatedSql: string | null;
  resultPreview: any;
  chartType: string | null;
}

interface DashboardItem {
  id: string;
  chartType: string | null;
  queryHistory: QueryHistory;
}

interface Dashboard {
  id: string;
  name: string;
  isPublic: boolean;
  publicToken: string | null;
  items: DashboardItem[];
  createdAt: string;
}

export default function WorkspaceDashboardsPage() {
  const params = useParams();
  const router = useRouter();
  const workspaceId = params.id as string;

  // Session state
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [selectedDashId, setSelectedDashId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Form states
  const [newDashName, setNewDashName] = useState('');
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [copied, setCopied] = useState(false);

  // Dev bypass session check
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      setAuthToken(token);
    } else {
      handleDevBypassLogin();
    }
  }, []);

  const handleDevBypassLogin = async () => {
    try {
      const res = await fetch('http://localhost:4000/api/auth/dev-login', {
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

  // Fetch dashboards
  const fetchDashboards = async (token: string) => {
    setLoading(true);
    try {
      const res = await fetch(`http://localhost:4000/api/workspaces/${workspaceId}/dashboards`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setDashboards(data.dashboards || []);
        if (data.dashboards && data.dashboards.length > 0 && !selectedDashId) {
          setSelectedDashId(data.dashboards[0].id);
        }
      }
    } catch (err) {
      console.error('Error fetching dashboards:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authToken) {
      fetchDashboards(authToken);
    }
  }, [authToken, workspaceId]);

  const currentDashboard = dashboards.find((d) => d.id === selectedDashId);

  // Create Dashboard
  const handleCreateDashboard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDashName.trim()) return;

    setCreating(true);
    try {
      const res = await fetch(`http://localhost:4000/api/workspaces/${workspaceId}/dashboards`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken || localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ name: newDashName.trim() }),
      });

      if (res.ok) {
        const data = await res.json();
        setNewDashName('');
        setSelectedDashId(data.id);
        fetchDashboards(authToken || localStorage.getItem('token') || '');
      }
    } catch (err) {
      console.error('Error creating dashboard:', err);
    } finally {
      setCreating(false);
    }
  };

  // Delete Dashboard
  const handleDeleteDashboard = async () => {
    if (!currentDashboard || !confirm(`Delete dashboard "${currentDashboard.name}"?`)) return;

    try {
      const res = await fetch(`http://localhost:4000/api/workspaces/${workspaceId}/dashboards/${selectedDashId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${authToken || localStorage.getItem('token')}`,
        },
      });

      if (res.ok) {
        const remaining = dashboards.filter((d) => d.id !== selectedDashId);
        setDashboards(remaining);
        setSelectedDashId(remaining.length > 0 ? remaining[0].id : '');
      }
    } catch (err) {
      console.error('Error deleting dashboard:', err);
    }
  };

  // Toggle Visibility
  const handleToggleVisibility = async () => {
    if (!currentDashboard) return;

    setUpdating(true);
    try {
      const res = await fetch(`http://localhost:4000/api/workspaces/${workspaceId}/dashboards/${selectedDashId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken || localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ isPublic: !currentDashboard.isPublic }),
      });

      if (res.ok) {
        fetchDashboards(authToken || localStorage.getItem('token') || '');
      }
    } catch (err) {
      console.error('Error updating dashboard settings:', err);
    } finally {
      setUpdating(false);
    }
  };

  // Remove Widget
  const handleRemoveWidget = async (itemId: string) => {
    if (!confirm('Remove this widget from the dashboard?')) return;

    try {
      const res = await fetch(`http://localhost:4000/api/workspaces/${workspaceId}/dashboards/${selectedDashId}/items/${itemId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${authToken || localStorage.getItem('token')}`,
        },
      });

      if (res.ok) {
        fetchDashboards(authToken || localStorage.getItem('token') || '');
      }
    } catch (err) {
      console.error('Error removing widget:', err);
    }
  };

  // Copy Public Share URL Link
  const copyShareLink = () => {
    if (!currentDashboard?.publicToken) return;
    const shareUrl = `${window.location.origin}/share/${currentDashboard.publicToken}`;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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

        {/* Back navigation */}
        <div className="p-4 border-b border-slate-900">
          <button
            onClick={() => router.push(`/workspace/${workspaceId}/query`)}
            className="w-full flex items-center space-x-3 px-4 py-2.5 rounded-xl hover:bg-slate-900/60 transition-all text-xs text-slate-400 hover:text-white"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Playground</span>
          </button>
        </div>

        {/* Dashboards list */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest flex items-center">
            <Layout className="w-3.5 h-3.5 text-cyan-400 mr-2" />
            Dashboards
          </h3>

          {dashboards.length === 0 ? (
            <p className="text-xs text-slate-600 italic">No dashboards found.</p>
          ) : (
            <div className="space-y-1.5">
              {dashboards.map((dash) => (
                <button
                  key={dash.id}
                  onClick={() => setSelectedDashId(dash.id)}
                  className={`w-full text-left px-4 py-3 rounded-xl border transition-all text-xs font-semibold flex items-center justify-between ${
                    dash.id === selectedDashId
                      ? 'bg-gradient-to-r from-cyan-500/10 to-indigo-500/10 border-indigo-500/30 text-white shadow-indigo-500/5 shadow-md'
                      : 'bg-slate-900/20 border-slate-900/60 hover:bg-slate-900/40 hover:border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span className="truncate">{dash.name}</span>
                  {dash.isPublic ? (
                    <Globe className="w-3 h-3 text-emerald-400 flex-shrink-0 ml-2" />
                  ) : (
                    <Lock className="w-3 h-3 text-slate-600 flex-shrink-0 ml-2" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Create Dashboard form */}
        <div className="p-5 border-t border-slate-900 bg-slate-950/40">
          <form onSubmit={handleCreateDashboard} className="space-y-2">
            <input
              type="text"
              value={newDashName}
              onChange={(e) => setNewDashName(e.target.value)}
              placeholder="New dashboard name..."
              className="w-full glass-input rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none placeholder-slate-700"
              required
            />
            <button
              type="submit"
              disabled={creating || !newDashName.trim()}
              className="w-full flex items-center justify-center space-x-2 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-850 text-xs font-bold text-slate-200 transition-all disabled:opacity-40"
            >
              {creating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-200" />
              ) : (
                <Plus className="w-3.5 h-3.5 text-slate-200" />
              )}
              <span>Create Grid</span>
            </button>
          </form>
        </div>

        {/* Dev Bypass Indicators */}
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
            <Layout className="w-5 h-5 text-indigo-400" />
            <span className="text-sm font-bold text-slate-200">Workspace Dashboard Builder</span>
          </div>
        </header>

        {/* Dashboard workspace content */}
        <div className="max-w-5xl w-full mx-auto px-8 py-8 space-y-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-32 space-y-3">
              <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
              <span className="text-xs text-slate-500">Loading metrics...</span>
            </div>
          ) : !currentDashboard ? (
            <div className="py-32 text-center">
              <Layout className="w-12 h-12 text-slate-800 mx-auto mb-3" />
              <h4 className="text-sm font-bold text-slate-400">No Dashboard Selected</h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 leading-relaxed">
                Choose an existing dashboard grid layout from the sidebar or click Create Grid to create a new layout.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Dashboard config bar */}
              <div className="glass-panel p-5 rounded-2xl border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-bold text-white flex items-center">
                    <Sparkles className="w-4 h-4 text-cyan-400 mr-2 animate-pulse" />
                    {currentDashboard.name}
                  </h2>
                  <p className="text-[10px] text-slate-500 mt-1">Configure layout, share metrics, or delete the grid.</p>
                </div>

                <div className="flex items-center space-x-3 self-end md:self-center">
                  {/* Share Toggle */}
                  <button
                    onClick={handleToggleVisibility}
                    disabled={updating}
                    className={`flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
                      currentDashboard.isPublic
                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {updating ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : currentDashboard.isPublic ? (
                      <Globe className="w-3.5 h-3.5" />
                    ) : (
                      <Lock className="w-3.5 h-3.5" />
                    )}
                    <span>{currentDashboard.isPublic ? 'Publicly Shared' : 'Private'}</span>
                  </button>

                  {/* Delete Button */}
                  <button
                    onClick={handleDeleteDashboard}
                    className="p-2.5 rounded-xl border border-slate-900/60 bg-slate-900/20 hover:bg-rose-500/5 hover:border-rose-500/20 text-slate-400 hover:text-rose-400 transition-all"
                    title="Delete Dashboard"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Public Sharing Link Info Panel */}
              {currentDashboard.isPublic && currentDashboard.publicToken && (
                <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-slate-300 text-xs flex items-center justify-between animate-fade-in">
                  <div className="flex items-center space-x-2 truncate">
                    <Globe className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <span className="text-slate-400">Share Link:</span>
                    <span className="font-mono text-emerald-400 truncate select-all">
                      {window.location.origin}/share/{currentDashboard.publicToken}
                    </span>
                  </div>

                  <button
                    onClick={copyShareLink}
                    className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-emerald-400 text-slate-950 font-bold hover:bg-emerald-300 transition-all flex-shrink-0"
                  >
                    {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              )}

              {/* Grid Widgets Container */}
              <div className="pt-2">
                <DashboardGrid
                  items={currentDashboard.items}
                  editMode={true}
                  onRemoveItem={handleRemoveWidget}
                />
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
