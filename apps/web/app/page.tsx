import React from 'react';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black text-white p-6 relative overflow-hidden">
      {/* Decorative Glow Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-30"></div>
      
      {/* Decorative gradient sphere */}
      <div className="absolute top-[-10%] left-[20%] w-[500px] h-[500px] rounded-full bg-violet-600/10 blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[20%] w-[500px] h-[500px] rounded-full bg-cyan-500/10 blur-[120px] pointer-events-none"></div>

      <div className="z-10 max-w-3xl w-full text-center space-y-8">
        {/* Logo Shield */}
        <div className="inline-flex items-center space-x-3 bg-slate-900/80 border border-slate-800 rounded-full px-5 py-2 backdrop-blur-md shadow-xl shadow-black/40">
          <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse"></span>
          <span className="text-xs font-semibold tracking-widest text-cyan-400 uppercase">QueryMind AI</span>
          <span className="text-xs text-slate-500">|</span>
          <span className="text-xs text-slate-400">Phase 1 Foundation Active</span>
        </div>

        {/* Hero Title */}
        <div className="space-y-4">
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
            Relational Analytics
            <span className="block mt-2 bg-gradient-to-r from-cyan-400 via-indigo-400 to-purple-500 bg-clip-text text-transparent">
              Powered by LLMs
            </span>
          </h1>
          <p className="text-md sm:text-lg text-slate-400 max-w-xl mx-auto font-light leading-relaxed">
            Translate conversational English into production-safe, performant SQL. Set up workspaces, manage DB connections, and run queries seamlessly.
          </p>
        </div>

        {/* Feature Grid Mock */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-6">
          <div className="bg-slate-900/40 border border-slate-800/80 hover:border-slate-700/60 p-6 rounded-2xl backdrop-blur-md text-left transition-all duration-300 group hover:-translate-y-1">
            <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center mb-4 group-hover:bg-cyan-500/20 group-hover:border-cyan-500/40 transition-all">
              <svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-slate-200 mb-1">JWT + Google Auth</h3>
            <p className="text-xs text-slate-400 leading-normal">
              Secure authentication layer with refresh tokens, Redis session blacklist, and local dev bypass.
            </p>
          </div>

          <div className="bg-slate-900/40 border border-slate-800/80 hover:border-slate-700/60 p-6 rounded-2xl backdrop-blur-md text-left transition-all duration-300 group hover:-translate-y-1">
            <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-4 group-hover:bg-indigo-500/20 group-hover:border-indigo-500/40 transition-all">
              <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-slate-200 mb-1">Workspaces & Roles</h3>
            <p className="text-xs text-slate-400 leading-normal">
              Multi-tenant team boundaries with granular member roles (Owner, Admin, Analyst, Viewer).
            </p>
          </div>

          <div className="bg-slate-900/40 border border-slate-800/80 hover:border-slate-700/60 p-6 rounded-2xl backdrop-blur-md text-left transition-all duration-300 group hover:-translate-y-1">
            <div className="w-10 h-10 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mb-4 group-hover:bg-purple-500/20 group-hover:border-purple-500/40 transition-all">
              <svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-slate-200 mb-1">DB Connection Manager</h3>
            <p className="text-xs text-slate-400 leading-normal">
              AES-256-GCM encryption at rest with active, instant Postgres and MySQL SELECT 1 connection verification.
            </p>
          </div>
        </div>

        {/* Footer info */}
        <div className="text-xs text-slate-600 border-t border-slate-900 pt-8">
          Next.js 15 App Router active. Use npm run dev to start the environment.
        </div>
      </div>
    </main>
  );
}
