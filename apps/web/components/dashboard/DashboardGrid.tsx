import React from 'react';
import { Trash2, TrendingUp, AlertCircle } from 'lucide-react';
import ChartRenderer from '../query/ChartRenderer';
import ResultTable from '../query/ResultTable';

interface QueryHistory {
  id: string;
  question: string;
  generatedSql: string | null;
  resultPreview: any; // json rows and columns
  chartType: string | null;
}

interface DashboardItem {
  id: string;
  chartType: string | null;
  queryHistory: QueryHistory;
}

interface DashboardGridProps {
  items: DashboardItem[];
  editMode?: boolean;
  onRemoveItem?: (itemId: string) => void;
}

export default function DashboardGrid({ items, editMode = false, onRemoveItem }: DashboardGridProps) {
  if (items.length === 0) {
    return (
      <div className="py-24 text-center border border-dashed border-slate-800 rounded-2xl bg-slate-900/10">
        <AlertCircle className="w-10 h-10 text-slate-700 mx-auto mb-3" />
        <h4 className="text-xs font-bold text-slate-400">No dashboard widgets added</h4>
        <p className="text-[10px] text-slate-500 max-w-xs mx-auto mt-1 leading-relaxed">
          Pin query results directly from the Query Playground to populate this dashboard with real-time charts.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {items.map((item) => {
        const query = item.queryHistory;
        const preview = query.resultPreview || {};
        const rows = preview.rows || [];
        const fields = preview.fields || [];
        const chartType = item.chartType || query.chartType || 'table';

        return (
          <div key={item.id} className="glass-panel p-5 rounded-2xl border-slate-800 flex flex-col relative group">
            {/* Header / Question Title */}
            <div className="flex items-start justify-between mb-4">
              <div>
                <h4 className="text-xs font-bold text-slate-200 line-clamp-1 group-hover:text-white transition-colors" title={query.question}>
                  {query.question}
                </h4>
                <p className="text-[9px] text-slate-500 mt-0.5 flex items-center font-medium">
                  <TrendingUp className="w-3 h-3 text-cyan-400 mr-1" />
                  Type: <span className="uppercase ml-1 text-slate-400">{chartType}</span>
                </p>
              </div>

              {editMode && onRemoveItem && (
                <button
                  onClick={() => onRemoveItem(item.id)}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/5 transition-all"
                  title="Remove widget"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Widget Visualization Content */}
            <div className="flex-1 min-h-[280px] flex items-center justify-center bg-slate-950/20 rounded-xl border border-slate-900/60 p-2 overflow-hidden">
              {rows.length === 0 ? (
                <span className="text-[10px] text-slate-500 italic">No query output results found.</span>
              ) : chartType === 'table' ? (
                <div className="w-full max-h-[280px] overflow-y-auto">
                  <ResultTable fields={fields} rows={rows} truncated={preview.truncated || false} />
                </div>
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <ChartRenderer chartType={chartType} fields={fields} rows={rows} />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
