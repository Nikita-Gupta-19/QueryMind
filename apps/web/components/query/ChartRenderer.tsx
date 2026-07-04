'use client';

import React from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { AlertCircle, BarChart3, TrendingUp, PieChart as PieIcon } from 'lucide-react';

interface ChartRendererProps {
  chartType: string; // 'kpi' | 'bar' | 'line' | 'pie' | 'table'
  fields: string[];
  rows: Record<string, unknown>[];
}

const COLORS = [
  '#06b6d4', // cyan-500
  '#6366f1', // indigo-500
  '#a855f7', // purple-500
  '#ec4899', // pink-500
  '#f59e0b', // amber-500
  '#10b981', // emerald-500
];

export default function ChartRenderer({ chartType, fields, rows }: ChartRendererProps) {
  if (!chartType || chartType === 'table' || rows.length === 0) return null;

  const xAxisKey = fields[0];
  const yAxisKeys = fields.slice(1);

  // Clean data: convert numeric fields in string format to real numbers for charts
  const chartData = rows.map((row) => {
    const cleanedRow = { ...row };
    fields.forEach((field) => {
      const val = row[field];
      if (typeof val === 'string' && !isNaN(Number(val))) {
        cleanedRow[field] = Number(val);
      }
    });
    return cleanedRow;
  });

  // 1. Render KPI Card
  if (chartType === 'kpi') {
    const kpiVal = rows[0][xAxisKey];
    let displayKpi = '';
    if (typeof kpiVal === 'number') {
      displayKpi = kpiVal.toLocaleString();
    } else {
      displayKpi = String(kpiVal);
    }

    return (
      <div className="glass-card p-6 rounded-2xl glow-cyan text-center mb-6 animate-fade-in flex flex-col items-center justify-center min-h-[160px]">
        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">
          {xAxisKey.replace(/_|-/g, ' ')}
        </h4>
        <div className="text-4xl sm:text-5xl font-extrabold bg-gradient-to-r from-cyan-400 to-indigo-500 bg-clip-text text-transparent">
          {displayKpi}
        </div>
      </div>
    );
  }

  // 2. Render Bar Chart
  if (chartType === 'bar') {
    return (
      <div className="glass-card p-5 rounded-2xl glow-indigo mb-6 animate-fade-in">
        <div className="flex items-center space-x-2 mb-4">
          <BarChart3 className="w-4 h-4 text-indigo-400" />
          <span className="text-xs font-semibold tracking-wider text-slate-200 uppercase">
            Distribution Bar Chart
          </span>
        </div>
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.3} />
              <XAxis
                dataKey={xAxisKey}
                stroke="#64748b"
                fontSize={11}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="#64748b"
                fontSize={11}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  borderColor: '#1e293b',
                  borderRadius: '12px',
                  color: '#f8fafc',
                }}
              />
              <Legend />
              {yAxisKeys.map((key, idx) => (
                <Bar
                  key={key}
                  dataKey={key}
                  fill={COLORS[idx % COLORS.length]}
                  radius={[4, 4, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  // 3. Render Line Chart
  if (chartType === 'line') {
    return (
      <div className="glass-card p-5 rounded-2xl glow-cyan mb-6 animate-fade-in">
        <div className="flex items-center space-x-2 mb-4">
          <TrendingUp className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-semibold tracking-wider text-slate-200 uppercase">
            Trend Line Chart
          </span>
        </div>
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.3} />
              <XAxis
                dataKey={xAxisKey}
                stroke="#64748b"
                fontSize={11}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="#64748b"
                fontSize={11}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  borderColor: '#1e293b',
                  borderRadius: '12px',
                  color: '#f8fafc',
                }}
              />
              <Legend />
              {yAxisKeys.map((key, idx) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={COLORS[idx % COLORS.length]}
                  strokeWidth={3}
                  dot={{ r: 4, stroke: '#0f172a', strokeWidth: 2, fill: COLORS[idx % COLORS.length] }}
                  activeDot={{ r: 6 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  // 4. Render Pie Chart
  if (chartType === 'pie') {
    return (
      <div className="glass-card p-5 rounded-2xl glow-indigo mb-6 animate-fade-in">
        <div className="flex items-center space-x-2 mb-4">
          <PieIcon className="w-4 h-4 text-purple-400" />
          <span className="text-xs font-semibold tracking-wider text-slate-200 uppercase">
            Categorical Breakdown
          </span>
        </div>
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={4}
                dataKey={yAxisKeys[0]}
                nameKey={xAxisKey}
                label={({ name, percent }) => `${name} (${typeof percent === 'number' ? (percent * 100).toFixed(0) : '0'}%)`}
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  borderColor: '#1e293b',
                  borderRadius: '12px',
                  color: '#f8fafc',
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  return null;
}
