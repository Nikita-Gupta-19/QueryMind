import React from 'react';

// 1. Sidebar History Skeletons
export function HistorySkeleton() {
  return (
    <div className="space-y-2.5 animate-pulse">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="p-3 rounded-xl border border-slate-900 bg-slate-900/10 space-y-2">
          <div className="h-3.5 bg-slate-800 rounded w-5/6"></div>
          <div className="flex justify-between items-center pt-1">
            <div className="h-3 bg-slate-800 rounded w-12"></div>
            <div className="h-2.5 bg-slate-850 rounded w-8"></div>
          </div>
        </div>
      ))}
    </div>
  );
}

// 2. Chart Skeletons
export function ChartSkeleton() {
  return (
    <div className="w-full h-full flex flex-col space-y-4 animate-pulse p-4 justify-between">
      {/* Bars/Lines Mock representation */}
      <div className="flex-1 flex items-end space-x-4 pb-2">
        <div className="w-full h-1/3 bg-slate-800/40 rounded-t-md"></div>
        <div className="w-full h-2/3 bg-slate-800/40 rounded-t-md animate-pulse"></div>
        <div className="w-full h-1/2 bg-slate-800/40 rounded-t-md"></div>
        <div className="w-full h-3/4 bg-slate-800/40 rounded-t-md animate-pulse"></div>
        <div className="w-full h-2/5 bg-slate-800/40 rounded-t-md"></div>
      </div>
      {/* Bottom Axis Mock */}
      <div className="h-1 bg-slate-900 w-full rounded"></div>
      <div className="flex justify-between text-[8px] text-slate-800 px-1">
        <div className="h-2 bg-slate-800/60 rounded w-8"></div>
        <div className="h-2 bg-slate-800/60 rounded w-8"></div>
        <div className="h-2 bg-slate-800/60 rounded w-8"></div>
        <div className="h-2 bg-slate-800/60 rounded w-8"></div>
        <div className="h-2 bg-slate-800/60 rounded w-8"></div>
      </div>
    </div>
  );
}

// 3. Grid Table Skeletons
export function TableSkeleton() {
  return (
    <div className="w-full space-y-3 animate-pulse">
      {/* Table headers Mock */}
      <div className="flex items-center space-x-4 bg-slate-900/40 p-3 rounded-lg border border-slate-900">
        <div className="h-3.5 bg-slate-800 rounded w-16"></div>
        <div className="h-3.5 bg-slate-800 rounded w-24"></div>
        <div className="h-3.5 bg-slate-800 rounded w-20"></div>
        <div className="h-3.5 bg-slate-800 rounded w-28"></div>
      </div>
      {/* Table rows Mock */}
      <div className="space-y-2">
        {[1, 2, 3, 5].map((i) => (
          <div key={i} className="flex items-center space-x-4 p-3 border-b border-slate-900/60">
            <div className="h-3 bg-slate-850 rounded w-12"></div>
            <div className="h-3 bg-slate-850 rounded w-28"></div>
            <div className="h-3 bg-slate-850 rounded w-16"></div>
            <div className="h-3 bg-slate-850 rounded w-24"></div>
          </div>
        ))}
      </div>
    </div>
  );
}
