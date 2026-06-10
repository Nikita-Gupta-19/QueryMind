import React from 'react';
import { Sparkles, Play, Search, AlertCircle, CheckCircle2, ChevronRight, Loader2 } from 'lucide-react';

export interface AgentStepTrace {
  type: 'step' | 'result';
  thought?: string;
  action?: string;
  params?: any;
  output?: any;
}

interface AgentStepsProps {
  steps: AgentStepTrace[];
  finalAnswer: string | null;
  executing: boolean;
}

export default function AgentSteps({ steps, finalAnswer, executing }: AgentStepsProps) {
  if (steps.length === 0 && !executing && !finalAnswer) return null;

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Title */}
      <div className="flex items-center space-x-2 border-b border-slate-900 pb-3">
        <Sparkles className="w-4 h-4 text-cyan-400 animate-pulse" />
        <h3 className="text-xs font-bold text-slate-200">Multi-Step Analyst Agent Logs</h3>
      </div>

      {/* Log Feed */}
      <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
        {steps.map((trace, idx) => {
          if (trace.type === 'step') {
            const isFinish = trace.action === 'finish';
            return (
              <div key={idx} className="p-3.5 rounded-xl border border-indigo-500/10 bg-indigo-500/5 text-xs text-slate-300 space-y-2">
                <div className="flex items-center justify-between text-indigo-400 font-bold">
                  <span className="flex items-center">
                    <Search className="w-3.5 h-3.5 mr-1.5" />
                    Thinking Trace
                  </span>
                  <span className="uppercase text-[9px] px-1.5 py-0.5 bg-indigo-500/10 rounded">
                    Action: {trace.action}
                  </span>
                </div>
                <p className="leading-relaxed text-slate-300 font-medium">
                  {trace.thought}
                </p>
                {trace.params && Object.keys(trace.params).length > 0 && (
                  <div className="bg-slate-950/40 p-2 rounded-lg border border-slate-900/60 font-mono text-[10px] text-slate-400 whitespace-pre-wrap overflow-x-auto">
                    {JSON.stringify(trace.params, null, 2)}
                  </div>
                )}
              </div>
            );
          } else {
            // result trace
            const hasError = trace.output && trace.output.error;
            return (
              <div key={idx} className={`p-3.5 rounded-xl border text-xs space-y-2 ${
                hasError ? 'border-rose-500/10 bg-rose-500/5 text-rose-300' : 'border-emerald-500/10 bg-emerald-500/5 text-emerald-300'
              }`}>
                <div className="flex items-center justify-between font-bold">
                  <span className="flex items-center">
                    {hasError ? <AlertCircle className="w-3.5 h-3.5 mr-1.5" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />}
                    Tool Execution Output ({trace.action})
                  </span>
                  <span className="text-[9px] uppercase px-1.5 py-0.5 bg-slate-900/40 rounded text-slate-400">
                    {hasError ? 'Failed' : 'Success'}
                  </span>
                </div>
                {hasError ? (
                  <p className="font-mono text-[10px]">{trace.output.error}</p>
                ) : (
                  <div className="bg-slate-950/40 p-2 rounded-lg border border-slate-900/60 font-mono text-[10px] text-slate-400 whitespace-pre-wrap overflow-x-auto max-h-[120px]">
                    {JSON.stringify(trace.output, null, 2)}
                  </div>
                )}
              </div>
            );
          }
        })}

        {/* Loading Spinner */}
        {executing && (
          <div className="flex items-center space-x-2 text-xs text-slate-500 pl-3">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
            <span className="font-medium animate-pulse">Agent is investigating...</span>
          </div>
        )}
      </div>

      {/* Final Synthesized Response */}
      {finalAnswer && (
        <div className="glass-panel p-5 rounded-2xl border-slate-800 bg-slate-900/20 glow-indigo space-y-3">
          <div className="flex items-center space-x-2 text-cyan-400 font-bold text-xs">
            <Sparkles className="w-4 h-4 fill-cyan-400 animate-pulse" />
            <span>Agent Synthesis Report</span>
          </div>
          <p className="text-xs text-slate-200 leading-relaxed font-medium whitespace-pre-wrap">
            {finalAnswer}
          </p>
        </div>
      )}
    </div>
  );
}
