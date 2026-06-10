'use client';

import React, { useState } from 'react';
import Editor from '@monaco-editor/react';
import { Check, Copy, Code } from 'lucide-react';

interface SQLViewerProps {
  sql: string;
  explanation?: string;
}

export default function SQLViewer({ sql, explanation }: SQLViewerProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(sql);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  return (
    <div className="glass-card rounded-2xl overflow-hidden glow-cyan border border-cyan-500/10 mb-6 animate-fade-in">
      <div className="flex items-center justify-between bg-slate-900/80 px-5 py-3 border-b border-slate-800">
        <div className="flex items-center space-x-2">
          <Code className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-semibold tracking-wider text-slate-200 uppercase">
            Generated SQL Query
          </span>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center space-x-1.5 text-xs text-slate-400 hover:text-cyan-400 bg-slate-800/60 hover:bg-slate-800 px-2.5 py-1.5 rounded-lg border border-slate-700/50 hover:border-cyan-500/30 transition-all"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copy Code</span>
            </>
          )}
        </button>
      </div>

      <div className="bg-[#1e1e1e] p-2">
        <Editor
          height="180px"
          language="sql"
          theme="vs-dark"
          value={sql}
          options={{
            readOnly: true,
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            automaticLayout: true,
            scrollbar: {
              vertical: 'hidden',
              horizontal: 'auto',
            },
            padding: { top: 8, bottom: 8 },
            wordWrap: 'on',
          }}
        />
      </div>

      {explanation && (
        <div className="bg-slate-900/40 border-t border-slate-800/80 px-5 py-3.5">
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
            Explanation
          </h4>
          <p className="text-sm text-slate-300 leading-relaxed">{explanation}</p>
        </div>
      )}
    </div>
  );
}
