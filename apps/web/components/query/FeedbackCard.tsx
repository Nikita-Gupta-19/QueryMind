'use client';

import React, { useState } from 'react';
import { ThumbsUp, ThumbsDown, Send, Check } from 'lucide-react';

interface FeedbackCardProps {
  workspaceId: string;
  queryId: string;
}

export default function FeedbackCard({ workspaceId, queryId }: FeedbackCardProps) {
  const [submitted, setSubmitted] = useState(false);
  const [showCorrection, setShowCorrection] = useState(false);
  const [correctedSql, setCorrectedSql] = useState('');
  const [loading, setLoading] = useState(false);
  const [feedbackType, setFeedbackType] = useState<'up' | 'down' | null>(null);

  const submitFeedback = async (type: 'up' | 'down', sqlCorrection?: string) => {
    setLoading(true);
    setFeedbackType(type);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/workspaces/${workspaceId}/query/${queryId}/feedback`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
          },
          body: JSON.stringify({
            type,
            correctedSql: sqlCorrection,
          }),
        }
      );

      if (response.ok) {
        setSubmitted(true);
      } else {
        console.error('Failed to submit feedback');
      }
    } catch (err) {
      console.error('Error submitting feedback:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleThumbsUp = () => {
    submitFeedback('up');
  };

  const handleThumbsDown = () => {
    setShowCorrection(true);
  };

  const handleCorrectionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitFeedback('down', correctedSql);
  };

  if (submitted) {
    return (
      <div className="glass-card p-4 rounded-2xl glow-cyan border border-cyan-500/10 flex items-center justify-center space-x-2 text-sm text-slate-300 mb-6 animate-fade-in">
        <Check className="w-4 h-4 text-emerald-400" />
        <span>Thank you! Your feedback helps train our schema models.</span>
      </div>
    );
  }

  return (
    <div className="glass-card p-5 rounded-2xl border border-slate-800/80 mb-6 animate-fade-in">
      {!showCorrection ? (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-slate-400">Was this AI query generation accurate?</p>
          <div className="flex items-center space-x-3">
            <button
              onClick={handleThumbsUp}
              disabled={loading}
              className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-emerald-500/30 hover:bg-slate-800/40 text-slate-300 hover:text-emerald-400 transition-all text-xs"
            >
              <ThumbsUp className="w-3.5 h-3.5" />
              <span>Accurate</span>
            </button>
            <button
              onClick={handleThumbsDown}
              disabled={loading}
              className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-rose-500/30 hover:bg-slate-800/40 text-slate-300 hover:text-rose-400 transition-all text-xs"
            >
              <ThumbsDown className="w-3.5 h-3.5" />
              <span>Needs Correction</span>
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleCorrectionSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Optional: Input Correct SQL Query (RLHF Fine-Tuning)
            </label>
            <textarea
              value={correctedSql}
              onChange={(e) => setCorrectedSql(e.target.value)}
              placeholder="SELECT * FROM table WHERE ..."
              className="w-full h-24 glass-input rounded-xl px-4 py-3 text-sm text-slate-200 font-mono focus:outline-none resize-none"
              required
            />
          </div>
          <div className="flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={() => setShowCorrection(false)}
              className="px-4 py-2 rounded-xl border border-slate-800 text-xs text-slate-400 hover:bg-slate-900 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-500 hover:from-cyan-400 hover:to-indigo-400 text-slate-950 font-bold transition-all text-xs"
            >
              {loading ? (
                <span>Submitting...</span>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Submit Correction</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
