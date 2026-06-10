'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Layout, Globe, Loader2, AlertTriangle, Sparkles } from 'lucide-react';
import { API_URL } from '../../config';
import DashboardGrid from '../../../components/dashboard/DashboardGrid';

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

export default function PublicShareDashboardPage() {
  const params = useParams();
  const token = params.token as string;

  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;

    const fetchPublicDashboard = async () => {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`${API_URL}/api/dashboards/share/${token}`);
        const data = await res.json();

        if (res.ok) {
          setDashboard(data.dashboard);
        } else {
          setError(data.error || 'Failed to retrieve public dashboard.');
        }
      } catch (err) {
        setError('Connection failed. Ensure the server is reachable.');
      } finally {
        setLoading(false);
      }
    };

    fetchPublicDashboard();
  }, [token]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans relative overflow-hidden flex flex-col">
      {/* Decorative Glow Spheres */}
      <div className="absolute top-[-10%] left-[-10%] w-[400px] h-[400px] rounded-full bg-indigo-600/5 blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[400px] h-[400px] rounded-full bg-cyan-500/5 blur-[120px] pointer-events-none"></div>

      {/* Top Banner Branding */}
      <header className="px-8 py-5 border-b border-slate-900 bg-slate-950/80 backdrop-blur-xl z-10 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-400 to-indigo-500 flex items-center justify-center font-bold text-slate-950">
            QM
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-white">QueryMind AI</h1>
            <p className="text-[10px] text-slate-500">Shared Analytics Report</p>
          </div>
        </div>

        <div className="flex items-center space-x-2 text-[10px] px-3 py-1 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20 font-bold">
          <Globe className="w-3 h-3 animate-pulse" />
          <span>LIVE REPORT</span>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-8 py-10 z-10 space-y-8">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-40 space-y-3">
            <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
            <span className="text-xs text-slate-500 font-semibold">Fetching shared report layout...</span>
          </div>
        ) : error ? (
          <div className="max-w-md mx-auto py-24 text-center space-y-4">
            <AlertTriangle className="w-12 h-12 text-rose-500 mx-auto" />
            <div>
              <h3 className="text-sm font-bold text-slate-300">Access Denied</h3>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                {error}
              </p>
            </div>
          </div>
        ) : dashboard ? (
          <div className="space-y-8 animate-fade-in">
            {/* Report Title Banner */}
            <div>
              <h2 className="text-lg font-bold text-white flex items-center">
                <Sparkles className="w-5 h-5 text-cyan-400 mr-2" />
                {dashboard.name}
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Generated from live database query history. All widgets are updated in real-time.
              </p>
            </div>

            {/* Dashboard widgets grid display */}
            <DashboardGrid items={dashboard.items} editMode={false} />
          </div>
        ) : null}
      </main>

      {/* Footer Branding */}
      <footer className="py-6 border-t border-slate-900 bg-slate-950/40 text-center text-[10px] text-slate-600 z-10">
        Powered by QueryMind AI — Enterprise NL-to-SQL Analytics Platform
      </footer>
    </div>
  );
}
