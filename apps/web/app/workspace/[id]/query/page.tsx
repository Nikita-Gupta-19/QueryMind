'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import {
  Send,
  Database,
  History,
  AlertTriangle,
  Play,
  Loader2,
  Sparkles,
  ArrowLeft,
  UserCheck,
  Menu,
  X,
  Plus,
  TrendingUp,
  Layout,
  BookOpen,
  Settings,
} from 'lucide-react';

import QueryPlanSteps from '../../../../components/query/QueryPlanSteps';
import SQLViewer from '../../../../components/query/SQLViewer';
import ChartRenderer from '../../../../components/query/ChartRenderer';
import ResultTable from '../../../../components/query/ResultTable';
import FeedbackCard from '../../../../components/query/FeedbackCard';
import AgentSteps, { AgentStepTrace } from '../../../../components/query/AgentSteps';
import { HistorySkeleton } from '../../../../components/query/Skeletons';
import { API_URL } from '../../../config';

interface Connection {
  id: string;
  name: string;
  dbType: string;
}

interface HistoryItem {
  id: string;
  question: string;
  status: string;
  createdAt: string;
  chartType?: string;
}

export default function WorkspaceQueryPage() {
  const params = useParams();
  const router = useRouter();
  const workspaceId = params.id as string;

  // Connection and Session States
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>('');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Active Query Execution State
  const [question, setQuestion] = useState('');
  const [executing, setExecuting] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [queryId, setQueryId] = useState<string | null>(null);

  // Agent Mode States
  const [queryMode, setQueryMode] = useState<'standard' | 'eda' | 'agent'>('standard');
  const [agentSteps, setAgentSteps] = useState<AgentStepTrace[]>([]);
  const [agentAnswer, setAgentAnswer] = useState<string | null>(null);
  
  // Pipeline Socket Streams
  const [activeStage, setActiveStage] = useState<string>('');
  const [stageMessage, setStageMessage] = useState<string>('');
  const [queryPlan, setQueryPlan] = useState<string>('');
  const [generatedSql, setGeneratedSql] = useState<string>('');
  const [explanation, setExplanation] = useState<string>('');
  const [confidence, setConfidence] = useState<string>('');
  const [fields, setFields] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [chartType, setChartType] = useState<string>('');
  const [truncated, setTruncated] = useState(false);

  const socketRef = useRef<Socket | null>(null);

  // Connect Database Modal States
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [newConnName, setNewConnName] = useState('');
  const [newConnType, setNewConnType] = useState('POSTGRES');
  const [newConnString, setNewConnString] = useState('');
  const [testingConnection, setTestingConnection] = useState(false);
  const [savingConnection, setSavingConnection] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalSuccess, setModalSuccess] = useState<string | null>(null);

  // Save to Dashboard Modal States
  const [showSaveDashboardModal, setShowSaveDashboardModal] = useState(false);
  const [dashboardsList, setDashboardsList] = useState<any[]>([]);
  const [loadingDashboards, setLoadingDashboards] = useState(false);
  const [selectedDashboardId, setSelectedDashboardId] = useState('');
  const [savingToDashboard, setSavingToDashboard] = useState(false);
  const [saveDashboardError, setSaveDashboardError] = useState<string | null>(null);
  const [saveDashboardSuccess, setSaveDashboardSuccess] = useState<string | null>(null);
  const [newDashboardName, setNewDashboardName] = useState('');

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setModalError(null);
    setModalSuccess(null);

    try {
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`
      };
      const res = await fetch(`${API_URL}/api/workspaces/${workspaceId}/connections/test-raw`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ dbType: newConnType, connectionString: newConnString })
      });
      const data = await res.json();

      if (res.ok) {
        setModalSuccess(data.message || 'Connection test succeeded!');
      } else {
        setModalError(data.error || data.details || 'Connection test failed.');
      }
    } catch (err) {
      setModalError('Failed to contact API server for testing.');
    } finally {
      setTestingConnection(false);
    }
  };

  const handleSaveConnection = async () => {
    setSavingConnection(true);
    setModalError(null);
    setModalSuccess(null);

    try {
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`
      };
      const res = await fetch(`${API_URL}/api/workspaces/${workspaceId}/connections`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: newConnName, dbType: newConnType, connectionString: newConnString })
      });
      const data = await res.json();

      if (res.ok) {
        setModalSuccess('Connection saved successfully!');
        const updatedConnections = [...connections, data];
        setConnections(updatedConnections);
        setSelectedConnectionId(data.id);
        
        setTimeout(() => {
          setShowConnectModal(false);
          setNewConnName('');
          setNewConnString('');
          setModalSuccess(null);
        }, 1000);
      } else {
        setModalError(data.error || 'Failed to save connection.');
      }
    } catch (err) {
      setModalError('Failed to contact API server for saving.');
    } finally {
      setSavingConnection(false);
    }
  };

  const fetchDashboardsForModal = async () => {
    setLoadingDashboards(true);
    setSaveDashboardError(null);
    try {
      const res = await fetch(`${API_URL}/api/workspaces/${workspaceId}/dashboards`, {
        headers: { Authorization: `Bearer ${authToken || localStorage.getItem('token')}` },
      });
      if (res.ok) {
        const data = await res.json();
        setDashboardsList(data.dashboards || []);
        if (data.dashboards && data.dashboards.length > 0) {
          setSelectedDashboardId(data.dashboards[0].id);
        }
      }
    } catch (err) {
      console.error('Error fetching dashboards:', err);
    } finally {
      setLoadingDashboards(false);
    }
  };

  const handleSaveToDashboard = async () => {
    if (!queryId) return;
    setSavingToDashboard(true);
    setSaveDashboardError(null);
    setSaveDashboardSuccess(null);

    let targetDashboardId = selectedDashboardId;

    try {
      const token = authToken || localStorage.getItem('token');
      // Create new dashboard if name is specified
      if (newDashboardName.trim()) {
        const createRes = await fetch(`${API_URL}/api/workspaces/${workspaceId}/dashboards`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ name: newDashboardName.trim() }),
        });
        if (!createRes.ok) {
          const errData = await createRes.json();
          throw new Error(errData.error || 'Failed to create new dashboard.');
        }
        const newDash = await createRes.json();
        targetDashboardId = newDash.id;
      }

      if (!targetDashboardId) {
        throw new Error('Please select or create a dashboard.');
      }

      const res = await fetch(`${API_URL}/api/workspaces/${workspaceId}/dashboards/${targetDashboardId}/items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          queryHistoryId: queryId,
          chartType: chartType || 'table',
        }),
      });

      if (res.ok) {
        setSaveDashboardSuccess('Saved to dashboard successfully!');
        setNewDashboardName('');
        setTimeout(() => {
          setShowSaveDashboardModal(false);
          setSaveDashboardSuccess(null);
        }, 1500);
      } else {
        const errData = await res.json();
        setSaveDashboardError(errData.error || 'Failed to save to dashboard.');
      }
    } catch (err: any) {
      setSaveDashboardError(err.message || 'Error occurred.');
    } finally {
      setSavingToDashboard(false);
    }
  };  // Auto-authenticate via Dev Bypass if no token is found in development
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
      console.warn('Dev login bypass not reachable. Manual login required.', err);
    }
  };

  // Fetch Connections and Query History
  useEffect(() => {
    if (!authToken) return;

    const fetchWorkspaceDetails = async () => {
      try {
        const headers = { Authorization: `Bearer ${authToken}` };
        
        // 1. Fetch DB connections in this workspace
        const connRes = await fetch(`${API_URL}/api/workspaces/${workspaceId}/connections`, { headers });
        if (connRes.ok) {
          const connData = await connRes.json();
          setConnections(connData || []);
          if (connData && connData.length > 0) {
            setSelectedConnectionId(connData[0].id);
          }
        }

        // 2. Fetch Query History
        setLoadingHistory(true);
        const histRes = await fetch(`${API_URL}/api/workspaces/${workspaceId}/query/history?limit=10`, { headers });
        if (histRes.ok) {
          const histData = await histRes.json();
          setHistory(histData.history || []);
        }
      } catch (err) {
        console.error('Error fetching workspace details:', err);
      } finally {
        setLoadingHistory(false);
      }
    };

    fetchWorkspaceDetails();
  }, [authToken, workspaceId]);

  // Setup WebSockets Connection via Socket.IO Client
  useEffect(() => {
    if (!workspaceId) return;

    const socketUrl = API_URL;
    const socket = io(socketUrl);
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Connected to WebSockets server:', socket.id);
      // Join workspace room channel
      socket.emit('workspace:join', { workspaceId });
    });

    // Pipeline Listeners
    socket.on('query:started', (data: { queryId: string; question: string }) => {
      setQueryId(data.queryId);
      setActiveStage('schema_retrieval');
      setStageMessage('Searching relevant tables...');
      setQueryPlan('');
      setGeneratedSql('');
      setExplanation('');
      setFields([]);
      setRows([]);
      setChartType('');
    });

    socket.on('query:progress', (data: { stage: string; message: string }) => {
      setActiveStage(data.stage);
      setStageMessage(data.message);
    });

    socket.on('query:plan', (data: { plan: string }) => {
      setQueryPlan(data.plan);
    });

    socket.on('query:sql_ready', (data: { sql: string; explanation: string; confidence: string }) => {
      setGeneratedSql(data.sql);
      setExplanation(data.explanation);
      setConfidence(data.confidence);
    });

    socket.on('query:completed', (data: { chartType: string }) => {
      setActiveStage('completed');
      setStageMessage('Query completed successfully.');
      setChartType(data.chartType);
      
      // Refresh History List
      fetch(`${API_URL}/api/workspaces/${workspaceId}/query/history?limit=10`, {
        headers: { Authorization: `Bearer ${authToken || localStorage.getItem('token')}` },
      })
        .then((res) => res.json())
        .then((data) => setHistory(data.history || []))
        .catch(console.error);
    });

    socket.on('query:failed', (data: { error: string }) => {
      setActiveStage('failed');
      setStageMessage(`Execution failed: ${data.error}`);
    });

    // Agent Loop Listeners
    socket.on('agent:started', (data: { question: string }) => {
      setAgentSteps([]);
      setAgentAnswer(null);
      setQueryId(null);
      setActiveStage('agent_analysis');
      setStageMessage('Agent loop started...');
      setQueryPlan('');
      setGeneratedSql('');
      setExplanation('');
      setFields([]);
      setRows([]);
      setChartType('');
    });

    socket.on('agent:step', (data: { step: { thought: string; action: string; params: any } }) => {
      setAgentSteps((prev) => [...prev, { type: 'step', ...data.step }]);
      setStageMessage(data.step.thought);
    });

    socket.on('agent:result', (data: { result: { action: string; output: any } }) => {
      setAgentSteps((prev) => [...prev, { type: 'result', ...data.result }]);
    });

    socket.on('agent:completed', (data: { answer: string }) => {
      setAgentAnswer(data.answer);
      setActiveStage('completed');
      setStageMessage('Agent completed analysis.');
    });

    socket.on('agent:failed', (data: { error: string }) => {
      setActiveStage('failed');
      setStageMessage(`Agent failed: ${data.error}`);
    });

    return () => {
      socket.disconnect();
    };
  }, [workspaceId, authToken]);

  // Handle Query Submission
  const handleQuerySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || !selectedConnectionId) return;

    setExecuting(true);
    setQueryError(null);

    // Clear previous state
    setQueryId(null);
    setFields([]);
    setRows([]);
    setChartType('');
    setQueryPlan('');
    setGeneratedSql('');
    setExplanation('');
    setAgentSteps([]);
    setAgentAnswer(null);

    const endpoint = queryMode === 'agent' ? 'agent' : (queryMode === 'eda' ? 'eda' : 'query');

    try {
      const res = await fetch(`${API_URL}/api/workspaces/${workspaceId}/${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken || localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          question: question.trim(),
          connectionId: selectedConnectionId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        let errMsg = data.error || 'Failed to execute query.';
        if (data.rejectionReason) errMsg += `\nReason: ${data.rejectionReason}`;
        setQueryError(errMsg);
      } else {
        if (queryMode === 'agent') {
          setAgentAnswer(data.answer || '');
        } else {
          // Load data returned synchronously for regular queries
          setFields(data.result?.fields || []);
          setRows(data.result?.rows || []);
          setTruncated(data.result?.truncated || false);
          setChartType(data.chartType || 'table');
          setQueryPlan(data.queryPlan || '');
          setGeneratedSql(data.sql || '');
          setExplanation(data.explanation || '');
        }
      }
    } catch (err) {
      setQueryError('API Connection failed. Ensure the server is running.');
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100 font-sans relative overflow-hidden">
      {/* Decorative Glow Elements */}
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
 
        {/* Navigation list */}
        <div className="p-4 border-b border-slate-900 space-y-1">
          <button
            onClick={() => router.push(`/workspace/${workspaceId}/dashboards`)}
            className="w-full flex items-center space-x-3 px-4 py-2 rounded-xl hover:bg-slate-900/60 transition-all text-xs text-slate-400 hover:text-white font-medium"
          >
            <Layout className="w-4 h-4 text-cyan-400" />
            <span>Dashboards</span>
          </button>
          <button
            onClick={() => router.push(`/workspace/${workspaceId}/glossary`)}
            className="w-full flex items-center space-x-3 px-4 py-2 rounded-xl hover:bg-slate-900/60 transition-all text-xs text-slate-400 hover:text-white font-medium"
          >
            <BookOpen className="w-4 h-4 text-indigo-400" />
            <span>Business Glossary</span>
          </button>
          <button
            onClick={() => router.push(`/workspace/${workspaceId}/settings`)}
            className="w-full flex items-center space-x-3 px-4 py-2 rounded-xl hover:bg-slate-900/60 transition-all text-xs text-slate-400 hover:text-white font-medium"
          >
            <Settings className="w-4 h-4 text-slate-400" />
            <span>Settings</span>
          </button>
        </div>

        {/* Configurations list */}
        <div className="p-5 border-b border-slate-900 space-y-4">
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1.5 flex items-center">
              <Database className="w-3 h-3 text-cyan-400 mr-1.5" />
              Database Connection
            </label>
            {connections.length === 0 ? (
              <div className="text-xs text-slate-500 italic py-2 border border-dashed border-slate-800 rounded-lg text-center">
                No active connections.
              </div>
            ) : (
              <select
                value={selectedConnectionId}
                onChange={(e) => setSelectedConnectionId(e.target.value)}
                className="w-full bg-slate-900/60 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500/50 transition-all font-medium"
              >
                {connections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.dbType})
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={() => {
                setShowConnectModal(true);
                setModalError(null);
                setModalSuccess(null);
              }}
              className="mt-2.5 w-full flex items-center justify-center space-x-1.5 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-900/80 hover:border-slate-700/50 text-cyan-400 text-xs font-bold transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Connect Database</span>
            </button>
          </div>
        </div>

        {/* History Log */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest flex items-center mb-1">
            <History className="w-3.5 h-3.5 text-indigo-400 mr-1.5" />
            Query Log
          </h3>
          {loadingHistory ? (
            <HistorySkeleton />
          ) : history.length === 0 ? (
            <p className="text-xs text-slate-600 italic">No queries run yet.</p>
          ) : (
            <div className="space-y-2">
              {history.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setQuestion(item.question);
                  }}
                  className="w-full text-left p-3 rounded-xl border border-slate-900/60 hover:border-slate-800/80 bg-slate-900/20 hover:bg-slate-900/40 transition-all group"
                >
                  <p className="text-xs font-medium text-slate-300 truncate group-hover:text-white">
                    {item.question}
                  </p>
                  <div className="flex items-center justify-between mt-2">
                    <span className={`text-[9px] uppercase px-1.5 py-0.5 rounded-md font-semibold ${
                      item.status === 'SUCCESS' ? 'text-emerald-400 bg-emerald-400/5 border border-emerald-500/10' : 'text-rose-400 bg-rose-400/5 border border-rose-500/10'
                    }`}>
                      {item.status}
                    </span>
                    <span className="text-[9px] text-slate-600">
                      {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* User Session Bypass Indicator */}
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
      <main className="flex-1 flex flex-col z-10">
        {/* Header Top Bar */}
        <header className="px-8 py-4 border-b border-slate-900/60 bg-slate-950/40 backdrop-blur-md flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 -ml-2 text-slate-400 hover:text-white hover:bg-slate-900 rounded-lg md:hidden mr-2 transition-all"
            >
              <Menu className="w-5 h-5" />
            </button>
            <button
              onClick={() => router.push('/')}
              className="p-1 text-slate-400 hover:text-white hover:bg-slate-900 rounded-lg transition-all"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-bold text-slate-200">Query Playground</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="text-xs text-slate-400 font-medium">Pipeline connected</span>
          </div>
        </header>

        {/* Query Playground */}
        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6 max-w-4xl mx-auto w-full">
          {/* Main prompt box */}
          <div className="glass-panel p-6 rounded-2xl glow-indigo border-slate-800">
            <h2 className="text-lg font-bold text-white mb-2 flex items-center">
              <Sparkles className="w-5 h-5 text-cyan-400 mr-2" />
              Ask QueryMind Anything
            </h2>
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs text-slate-400">
                Write plain English questions to crawl matching database schemas, validate, and execute.
              </p>
              
              <div className="flex bg-slate-900/50 p-1 rounded-xl border border-slate-800/60 w-fit">
                <button
                  type="button"
                  onClick={() => setQueryMode('standard')}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                    queryMode === 'standard'
                      ? 'bg-slate-800 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Database className="w-3 h-3" />
                  <span>Standard</span>
                </button>
                <button
                  type="button"
                  onClick={() => setQueryMode('eda')}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                    queryMode === 'eda'
                      ? 'bg-indigo-500/20 text-indigo-300 shadow-sm border border-indigo-500/30'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <TrendingUp className="w-3 h-3" />
                  <span>EDA & Predict</span>
                </button>
                <button
                  type="button"
                  onClick={() => setQueryMode('agent')}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                    queryMode === 'agent'
                      ? 'bg-cyan-500/20 text-cyan-300 shadow-sm border border-cyan-500/30'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Sparkles className="w-3 h-3" />
                  <span>AI Agent</span>
                </button>
              </div>

            </div>
            <form onSubmit={handleQuerySubmit} className="space-y-4">
              <div className="relative">
                <input
                  type="text"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder={queryMode === 'agent' ? "e.g. why did electronics revenue drop in March?" : (queryMode === 'eda' ? "e.g. show me a 3-month moving average of new users" : "e.g. show me top 10 users by created date")}
                  className="w-full glass-input rounded-xl pl-4 pr-12 py-3.5 text-sm text-slate-200 focus:outline-none placeholder-slate-600"
                  disabled={executing}
                  required
                />
                <button
                  type="submit"
                  disabled={executing || !selectedConnectionId}
                  className="absolute right-2.5 top-2.5 p-2 rounded-lg bg-gradient-to-r from-cyan-400 to-indigo-500 hover:from-cyan-300 hover:to-indigo-400 text-slate-950 font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {executing ? (
                    <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                  ) : (
                    <Play className="w-4 h-4 fill-slate-950" />
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Agent Mode Logs */}
          {queryMode === 'agent' && (agentSteps.length > 0 || executing || agentAnswer) && (
            <AgentSteps steps={agentSteps} finalAnswer={agentAnswer} executing={executing} />
          )}

          {/* Query Error log panel */}
          {queryError && (
            <div className="p-4 rounded-xl border border-rose-500/20 bg-rose-500/5 text-rose-400 text-sm flex items-start space-x-3 animate-fade-in">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Query Execution Failed</p>
                <p className="text-xs text-rose-400/80 mt-1">{queryError}</p>
              </div>
            </div>
          )}

          {/* WS Realtime Processing State */}
          {activeStage && activeStage !== 'completed' && activeStage !== 'failed' && (
            <div className="p-4 rounded-xl border border-indigo-500/20 bg-indigo-500/5 text-slate-300 text-sm flex items-center space-x-3 animate-fade-in">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-400 flex-shrink-0" />
              <div>
                <span className="font-medium text-indigo-400 capitalize">
                  [{activeStage.replace('_', ' ')}]
                </span>{' '}
                <span className="text-slate-400">{stageMessage}</span>
              </div>
            </div>
          )}

          {/* AI query plan streaming logs */}
          {queryMode !== 'agent' && queryPlan && <QueryPlanSteps plan={queryPlan} activeStage={activeStage} />}

          {/* SQL Monaco code viewer panel */}
          {queryMode !== 'agent' && generatedSql && <SQLViewer sql={generatedSql} explanation={explanation} />}

          {/* Dynamic Recharts recommendations panel */}
          {queryMode === 'eda' && chartType && chartType !== 'table' && rows.length > 0 && (
            <ChartRenderer chartType={chartType} fields={fields} rows={rows} />
          )}

          {/* Query result data grid */}
          {queryMode !== 'agent' && (fields.length > 0 || rows.length > 0) && (
            <div className="space-y-3">
              {queryId && (
                <div className="flex justify-end">
                  <button
                    onClick={() => {
                      setShowSaveDashboardModal(true);
                      fetchDashboardsForModal();
                    }}
                    className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-indigo-400 text-xs font-bold transition-all"
                  >
                    <Layout className="w-3.5 h-3.5" />
                    <span>Save to Dashboard</span>
                  </button>
                </div>
              )}
              <ResultTable
                fields={fields}
                rows={rows}
                truncated={truncated}
              />
            </div>
          )}

          {/* RLHF Feedbacks panel */}
          {queryMode !== 'agent' && queryId && activeStage === 'completed' && (
            <FeedbackCard workspaceId={workspaceId} queryId={queryId} />
          )}
        </div>
      </main>

      {/* 4. Connect Database Modal */}
      {showConnectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="glass-panel w-full max-w-md p-6 rounded-3xl glow-indigo border-slate-800 shadow-2xl relative overflow-hidden">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-sm font-bold text-white flex items-center">
                <Database className="w-4 h-4 text-cyan-400 mr-2" />
                Connect Relational Database
              </h3>
              <button
                onClick={() => setShowConnectModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-900 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  Connection Display Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Production Analytics DB"
                  value={newConnName}
                  onChange={(e) => setNewConnName(e.target.value)}
                  className="w-full glass-input rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  Database Engine
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setNewConnType('POSTGRES')}
                    className={`py-2 rounded-xl text-xs font-bold transition-all border ${
                      newConnType === 'POSTGRES'
                        ? 'bg-cyan-500/10 border-cyan-500/50 text-cyan-400'
                        : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    PostgreSQL
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewConnType('MYSQL')}
                    className={`py-2 rounded-xl text-xs font-bold transition-all border ${
                      newConnType === 'MYSQL'
                        ? 'bg-cyan-500/10 border-cyan-500/50 text-cyan-400'
                        : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    MySQL
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  URI Connection String
                </label>
                <textarea
                  rows={3}
                  placeholder={
                    newConnType === 'POSTGRES'
                      ? 'postgresql://user:password@host:port/dbname?sslmode=require'
                      : 'mysql://user:password@host:port/dbname'
                  }
                  value={newConnString}
                  onChange={(e) => setNewConnString(e.target.value)}
                  className="w-full glass-input rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none font-mono"
                />
                <p className="text-[9px] text-slate-500 mt-1">
                  Credentials are encrypted at rest using AES-256-GCM.
                </p>
              </div>

              {modalError && (
                <div className="p-3 text-[10px] rounded-xl border border-rose-500/20 bg-rose-500/5 text-rose-400 leading-relaxed max-h-24 overflow-y-auto font-mono">
                  {modalError}
                </div>
              )}

              {modalSuccess && (
                <div className="p-3 text-[10px] rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-emerald-400 leading-relaxed">
                  {modalSuccess}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  disabled={testingConnection || savingConnection || !newConnName || !newConnString}
                  onClick={handleTestConnection}
                  className="w-full flex items-center justify-center space-x-1.5 py-3 rounded-xl border border-slate-800 bg-slate-900/40 hover:bg-slate-900/80 text-slate-300 text-xs font-bold transition-all disabled:opacity-40"
                >
                  {testingConnection ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <span>Test Connection</span>
                  )}
                </button>

                <button
                  type="button"
                  disabled={testingConnection || savingConnection || !newConnName || !newConnString}
                  onClick={handleSaveConnection}
                  className="w-full flex items-center justify-center space-x-1.5 py-3 rounded-xl bg-gradient-to-r from-cyan-400 to-indigo-500 hover:from-cyan-300 hover:to-indigo-400 text-slate-950 text-xs font-bold transition-all disabled:opacity-40"
                >
                  {savingConnection ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-950" />
                  ) : (
                    <span>Save Connection</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* 5. Save to Dashboard Modal */}
      {showSaveDashboardModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="glass-panel w-full max-w-md p-6 rounded-3xl glow-indigo border-slate-800 shadow-2xl relative overflow-hidden">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-sm font-bold text-white flex items-center">
                <Layout className="w-4 h-4 text-cyan-400 mr-2" />
                Save Result to Dashboard
              </h3>
              <button
                onClick={() => setShowSaveDashboardModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-900 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              {saveDashboardError && (
                <div className="p-3 text-[10px] rounded-xl border border-rose-500/20 bg-rose-500/5 text-rose-400">
                  {saveDashboardError}
                </div>
              )}

              {saveDashboardSuccess && (
                <div className="p-3 text-[10px] rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-emerald-400">
                  {saveDashboardSuccess}
                </div>
              )}

              {loadingDashboards ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
                </div>
              ) : dashboardsList.length === 0 ? (
                <div className="text-xs text-slate-500 italic py-2 text-center">
                  No dashboards found. Create one below!
                </div>
              ) : (
                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Select Dashboard
                  </label>
                  <select
                    value={selectedDashboardId}
                    onChange={(e) => {
                      setSelectedDashboardId(e.target.value);
                      setNewDashboardName(''); // Clear new name if selecting existing
                    }}
                    className="w-full bg-slate-900/60 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500/50"
                  >
                    {dashboardsList.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="border-t border-slate-900 my-4 pt-4">
                <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  Or Create a New Dashboard Grid
                </label>
                <input
                  type="text"
                  placeholder="New dashboard name..."
                  value={newDashboardName}
                  onChange={(e) => {
                    setNewDashboardName(e.target.value);
                    setSelectedDashboardId(''); // Deselect existing if creating new
                  }}
                  className="w-full glass-input rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none"
                />
              </div>

              <button
                type="button"
                disabled={savingToDashboard || (!selectedDashboardId && !newDashboardName.trim())}
                onClick={handleSaveToDashboard}
                className="w-full flex items-center justify-center space-x-1.5 py-3 rounded-xl bg-gradient-to-r from-cyan-400 to-indigo-500 hover:from-cyan-300 hover:to-indigo-400 text-slate-950 text-xs font-bold transition-all disabled:opacity-40"
              >
                {savingToDashboard ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-950" />
                ) : (
                  <span>Add Widget to Grid</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
