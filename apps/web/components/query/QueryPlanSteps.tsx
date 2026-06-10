'use client';

import React from 'react';
import { CheckCircle2, Circle, Loader2 } from 'lucide-react';

interface QueryPlanStepsProps {
  plan: string;
  activeStage?: string; // e.g. 'schema_retrieval', 'planning', 'sql_generation', 'executing', 'completed'
}

export default function QueryPlanSteps({ plan, activeStage }: QueryPlanStepsProps) {
  if (!plan) return null;

  // Split plan into lines and clean up empty lines or leading numbers
  const steps = plan
    .split('\n')
    .map((line) => line.replace(/^\d+[\.\-\s]*/, '').trim())
    .filter((line) => line.length > 0);

  // Map backend stages to corresponding step indexes in the plan
  // Stage flow: schema_retrieval -> planning -> sql_generation -> executing -> completed
  const getStepState = (index: number) => {
    if (!activeStage || activeStage === 'completed') {
      return 'success';
    }

    const stages = ['schema_retrieval', 'planning', 'sql_generation', 'executing'];
    const currentStageIndex = stages.indexOf(activeStage);

    if (index < currentStageIndex) {
      return 'success';
    } else if (index === currentStageIndex) {
      return 'loading';
    } else {
      return 'pending';
    }
  };

  return (
    <div className="glass-card p-6 rounded-2xl glow-indigo mb-6 animate-fade-in">
      <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
        <h3 className="text-sm font-semibold tracking-wide text-indigo-400 uppercase">
          AI Query Plan Execution
        </h3>
        {activeStage && activeStage !== 'completed' && (
          <span className="flex items-center text-xs text-slate-400 bg-slate-900/80 px-3 py-1 rounded-full border border-slate-800">
            <Loader2 className="w-3.5 h-3.5 text-cyan-400 animate-spin mr-1.5" />
            Processing...
          </span>
        )}
      </div>

      <div className="space-y-4">
        {steps.map((step, idx) => {
          const state = getStepState(idx);

          return (
            <div
              key={idx}
              className={`flex items-start space-x-3 transition-opacity duration-300 ${
                state === 'pending' ? 'opacity-40' : 'opacity-100'
              }`}
            >
              <div className="mt-0.5 flex-shrink-0">
                {state === 'success' ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 fill-emerald-500/10" />
                ) : state === 'loading' ? (
                  <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
                ) : (
                  <Circle className="w-5 h-5 text-slate-600" />
                )}
              </div>
              <div className="flex-1">
                <p
                  className={`text-sm leading-relaxed ${
                    state === 'success'
                      ? 'text-slate-300 line-through decoration-slate-700/60'
                      : state === 'loading'
                      ? 'text-white font-medium'
                      : 'text-slate-500'
                  }`}
                >
                  {step}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
