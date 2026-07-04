'use client';

import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Table, Download } from 'lucide-react';

interface ResultTableProps {
  fields: string[];
  rows: Record<string, unknown>[];
  rowCount?: number;
  truncated?: boolean;
}

const ROWS_PER_PAGE = 10;

export default function ResultTable({ fields, rows, rowCount, truncated }: ResultTableProps) {
  const [currentPage, setCurrentPage] = useState(1);

  if (!fields || fields.length === 0 || !rows || rows.length === 0) {
    return (
      <div className="glass-panel p-8 text-center rounded-2xl border border-slate-800/80">
        <Table className="w-8 h-8 text-slate-600 mx-auto mb-2" />
        <p className="text-sm text-slate-400">No data returned or query has empty rows.</p>
      </div>
    );
  }

  // Format header strings cleanly (e.g. "user_email" -> "User Email")
  const formatHeader = (header: string) => {
    return header
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const totalPages = Math.ceil(rows.length / ROWS_PER_PAGE);
  const startIndex = (currentPage - 1) * ROWS_PER_PAGE;
  const paginatedRows = rows.slice(startIndex, startIndex + ROWS_PER_PAGE);

  const handleDownloadCsv = () => {
    if (!fields || !rows || rows.length === 0) return;
    
    // Construct CSV header
    const csvHeader = fields.map(f => `"${f.replace(/"/g, '""')}"`).join(',');
    
    // Construct CSV rows
    const csvRows = rows.map(row => 
      fields.map(field => {
        let val = row[field];
        if (val === null || val === undefined) return '""';
        if (typeof val === 'object') val = JSON.stringify(val);
        // Escape quotes
        return `"${String(val).replace(/"/g, '""')}"`;
      }).join(',')
    );
    
    const csvString = [csvHeader, ...csvRows].join('\n');
    
    // Create and trigger download
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `query_results_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="glass-card rounded-2xl border border-slate-800/60 overflow-hidden mb-6 animate-fade-in">
      <div className="flex items-center justify-between px-5 py-4 bg-slate-900/50 border-b border-slate-800/80">
        <div className="flex items-center space-x-2">
          <Table className="w-4 h-4 text-indigo-400" />
          <span className="text-xs font-semibold tracking-wider text-slate-200 uppercase">
            Data Results ({rows.length} rows {truncated ? 'previewed' : ''})
          </span>
        </div>
        <div className="flex items-center space-x-3">
          {truncated && (
            <span className="text-[10px] text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2.5 py-0.5 rounded-full">
              Truncated to first 1000 rows
            </span>
          )}
          <button
            onClick={handleDownloadCsv}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800/50 hover:bg-slate-700 hover:text-white text-slate-300 text-xs font-medium transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>CSV Export</span>
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-900/20 border-b border-slate-800/80">
              {fields.map((field) => (
                <th
                  key={field}
                  className="px-5 py-3.5 text-xs font-semibold tracking-wider text-slate-400 whitespace-nowrap"
                >
                  {formatHeader(field)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/40">
            {paginatedRows.map((row, idx) => (
              <tr
                key={idx}
                className="hover:bg-slate-900/35 transition-colors duration-150"
              >
                {fields.map((field) => {
                  const val = row[field];
                  let displayVal = '';

                  if (val === null || val === undefined) {
                    displayVal = 'NULL';
                  } else if (typeof val === 'object') {
                    displayVal = JSON.stringify(val);
                  } else {
                    displayVal = String(val);
                  }

                  return (
                    <td
                      key={field}
                      className="px-5 py-3 text-sm text-slate-300 whitespace-nowrap font-mono max-w-[280px] truncate"
                      title={displayVal}
                    >
                      {val === null || val === undefined ? (
                        <span className="text-slate-600 italic text-xs">{displayVal}</span>
                      ) : (
                        displayVal
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-800/80 bg-slate-900/20">
          <span className="text-xs text-slate-500">
            Showing {startIndex + 1} to {Math.min(startIndex + ROWS_PER_PAGE, rows.length)} of{' '}
            {rows.length} rows
          </span>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded-lg border border-slate-800 bg-slate-900/60 text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs text-slate-300 font-medium">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-lg border border-slate-800 bg-slate-900/60 text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
