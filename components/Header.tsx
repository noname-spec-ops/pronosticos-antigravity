'use client';

import React from 'react';
import {
  Crown,
  Search,
  Settings,
  User,
  Moon,
  ChevronDown,
  Sparkles,
  Flame,
  Radio,
  BarChart3,
  Lightbulb,
  Ticket,
  MessageSquare,
  TrendingUp,
} from 'lucide-react';

export type MainNavTab = 'predictions' | 'live' | 'stats' | 'strategies' | 'value' | 'papertrading' | 'tickets' | 'chat';

interface HeaderProps {
  selectedDate: string;
  onDateChange: (date: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  activeNavTab: MainNavTab;
  onNavTabChange: (tab: MainNavTab) => void;
  isDemoMode: boolean;
  onOpenSettings?: () => void;
  onOpenSteamScanner?: () => void;
}

export default function Header({
  selectedDate,
  onDateChange,
  searchQuery,
  onSearchChange,
  activeNavTab,
  onNavTabChange,
  isDemoMode,
  onOpenSettings,
  onOpenSteamScanner,
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-[#1e2c45]/90 bg-[#060a12]/90 backdrop-blur-xl shadow-lg shadow-black/40">
      <div className="mx-auto flex max-w-[1700px] items-center justify-between gap-3 px-4 py-2.5">
        {/* Left: Futuristic Quant Brand */}
        <div className="flex items-center gap-3">
          <div
            className="group flex items-center gap-2.5 cursor-pointer transition"
            onClick={() => onNavTabChange('predictions')}
          >
            <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-cyan-500 via-teal-400 to-emerald-400 text-black shadow-lg shadow-cyan-500/25 group-hover:scale-105 transition-transform duration-300">
              <Crown className="h-5 w-5 fill-black text-black" />
              <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-400" />
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black tracking-wider text-white text-base sm:text-lg bg-gradient-to-r from-white via-slate-100 to-cyan-200 bg-clip-text text-transparent">
                  OP QUANT RADAR
                </span>
                <span className="rounded bg-cyan-500/10 border border-cyan-500/40 px-1.5 py-0.5 text-[9px] font-mono font-bold text-cyan-300 tracking-wider">
                  ALPHA 2.0
                </span>
              </div>
              <div className="text-[9px] font-mono font-bold uppercase tracking-widest text-emerald-400 flex items-center gap-1 -mt-0.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>Zero-Leakage Quantum Engine</span>
              </div>
            </div>
          </div>
        </div>

        {/* Center: Futuristic Navigation Pills */}
        <nav className="hidden md:flex items-center gap-1.5 text-xs font-semibold p-1 rounded-xl bg-[#090e1a]/80 border border-[#1e293b]">
          {/* Pronosticuri */}
          <button
            onClick={() => onNavTabChange('predictions')}
            className={`px-3.5 py-1.5 rounded-lg transition duration-200 ${
              activeNavTab === 'predictions'
                ? 'bg-gradient-to-r from-cyan-950 to-slate-900 border border-cyan-500/60 text-cyan-300 font-bold shadow-md shadow-cyan-500/10'
                : 'text-slate-400 hover:text-white hover:bg-[#121a2c]'
            }`}
          >
            Pronosticuri
          </button>

          {/* Live */}
          <button
            onClick={() => onNavTabChange('live')}
            className={`px-3 py-1.5 rounded-lg transition duration-200 flex items-center gap-1.5 ${
              activeNavTab === 'live'
                ? 'bg-rose-950/80 border border-rose-500/60 text-rose-300 font-bold shadow-md shadow-rose-500/10'
                : 'text-slate-400 hover:text-white hover:bg-[#121a2c]'
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-rose-500 animate-ping" />
            <span>Radar Live</span>
          </button>

          {/* Statistici */}
          <button
            onClick={() => onNavTabChange('stats')}
            className={`px-3 py-1.5 rounded-lg transition duration-200 ${
              activeNavTab === 'stats'
                ? 'bg-gradient-to-r from-cyan-950 to-slate-900 border border-cyan-500/60 text-cyan-300 font-bold shadow-md shadow-cyan-500/10'
                : 'text-slate-400 hover:text-white hover:bg-[#121a2c]'
            }`}
          >
            Statistici
          </button>

          {/* Value Bets */}
          <button
            onClick={() => onNavTabChange('value')}
            className={`px-3 py-1.5 rounded-lg transition duration-200 flex items-center gap-1 ${
              activeNavTab === 'value'
                ? 'bg-gradient-to-r from-emerald-950 to-slate-900 border border-emerald-500/60 text-emerald-300 font-bold shadow-md shadow-emerald-500/10'
                : 'text-slate-400 hover:text-white hover:bg-[#121a2c]'
            }`}
          >
            <Flame className="h-3.5 w-3.5 text-emerald-400" />
            <span>Value Radar</span>
          </button>

          {/* Steam Scanner */}
          <button
            onClick={() => onOpenSteamScanner?.()}
            className="px-3.5 py-1.5 rounded-lg transition duration-200 flex items-center gap-1.5 bg-gradient-to-r from-amber-950/80 to-slate-900 border border-amber-500/60 text-amber-300 font-bold shadow-md shadow-amber-500/10 hover:border-amber-400"
          >
            <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
            <span>⚡ Steam Scanner</span>
          </button>

          {/* Paper Trading & CLV */}
          <button
            onClick={() => onNavTabChange('papertrading')}
            className={`px-3.5 py-1.5 rounded-lg transition duration-200 flex items-center gap-1.5 ${
              activeNavTab === 'papertrading'
                ? 'bg-gradient-to-r from-cyan-950 to-slate-900 border border-cyan-500/60 text-cyan-300 font-bold shadow-md shadow-cyan-500/10'
                : 'text-slate-400 hover:text-white hover:bg-[#121a2c]'
            }`}
          >
            <TrendingUp className="h-3.5 w-3.5 text-cyan-400" />
            <span>Paper Trading & CLV</span>
          </button>

          {/* Bilete */}
          <button
            onClick={() => onNavTabChange('tickets')}
            className={`px-3 py-1.5 rounded-lg transition duration-200 ${
              activeNavTab === 'tickets'
                ? 'bg-gradient-to-r from-purple-950 to-slate-900 border border-purple-500/60 text-purple-300 font-bold shadow-md shadow-purple-500/10'
                : 'text-slate-400 hover:text-white hover:bg-[#121a2c]'
            }`}
          >
            Smart Combos
          </button>
        </nav>

        {/* Right: Date selector, Search & Profile */}
        <div className="flex items-center gap-2">
          {/* Quick Search */}
          <div className="relative flex items-center w-36 sm:w-48 lg:w-56">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-cyan-400/70 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Caută meci / echipă..."
              className="w-full rounded-xl border border-[#1e293b] bg-[#0c1322] py-1.5 pl-8 pr-7 text-xs text-slate-200 placeholder-slate-500 focus:border-cyan-500 focus:shadow-glow-cyan focus:outline-none transition duration-200"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs font-bold transition"
                title="Șterge căutarea"
              >
                ✕
              </button>
            )}
          </div>

          {/* Date Picker Pill */}
          <div className="flex items-center rounded-xl border border-[#1e293b] bg-[#0c1322] px-3 py-1.5 text-xs font-mono font-medium text-slate-200 shadow-sm hover:border-cyan-500/40 transition">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => onDateChange(e.target.value)}
              className="bg-transparent text-xs text-slate-200 focus:outline-none cursor-pointer font-mono"
            />
          </div>

          {/* Settings button */}
          <button
            onClick={onOpenSettings}
            className="rounded-xl p-2 text-slate-400 hover:bg-[#121a2c] hover:text-cyan-400 border border-transparent hover:border-[#1e293b] transition"
            title="Setări Algoritm & Calibrare"
          >
            <Settings className="h-4 w-4" />
          </button>

          {/* VIP Pro Status Pill & Logout */}
          <div className="flex items-center gap-1.5 pl-1">
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-gradient-to-r from-emerald-500/20 to-teal-500/10 border border-emerald-500/40 text-emerald-400 text-xs font-semibold shadow-sm">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_#10b981]" />
              <span className="font-mono text-[11px] tracking-wider font-bold">VIP QUANT</span>
            </div>

            <button
              onClick={async () => {
                try {
                  await fetch('/api/auth/vip', { method: 'DELETE' });
                } catch {}
                localStorage.removeItem('flashstat_vip_auth');
                localStorage.removeItem('flashstat_vip_user');
                window.location.reload();
              }}
              className="flex h-8 items-center gap-1 px-2.5 rounded-xl bg-[#0c1322] border border-slate-800 text-slate-400 hover:text-red-400 hover:border-red-500/40 text-xs transition cursor-pointer"
              title="Deconectare / Blochează Sesiunea VIP"
            >
              <User className="h-3.5 w-3.5" />
              <span className="hidden md:inline text-[11px] font-mono">Ieșire</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
