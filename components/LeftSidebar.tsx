'use client';

import React from 'react';
import {
  Globe,
  Calendar,
  Radio,
  Star,
  Flame,
  ShieldCheck,
  Ticket,
  History,
  Calculator,
  BarChart3,
  Bell,
  Search,
  Newspaper,
  ChevronRight,
  Zap,
} from 'lucide-react';

export interface LeagueItem {
  id: string;
  name: string;
  flag: string;
  country?: string;
  count?: number;
}

export const POPULAR_LEAGUES: LeagueItem[] = [
  { id: 'top', name: 'Ligi Principale (Top)', flag: '⭐' },
  { id: 'ucl', name: 'Champions League', flag: '🏆' },
  { id: 'uel', name: 'Europa League', flag: '🥈' },
  { id: 'uecl', name: 'Conference League', flag: '🥉' },
  { id: 'e0', name: 'Premier League', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  { id: 'sp1', name: 'La Liga', flag: '🇪🇸' },
  { id: 'i1', name: 'Serie A', flag: '🇮🇹' },
  { id: 'd1', name: 'Bundesliga', flag: '🇩🇪' },
  { id: 'f1', name: 'Ligue 1', flag: '🇫🇷' },
  { id: 'ro1', name: 'SuperLiga', flag: '🇷🇴' },
  { id: 'n1', name: 'Eredivisie', flag: '🇳🇱' },
  { id: 't1', name: 'Süper Lig', flag: '🇹🇷' },
  { id: 'usa', name: 'MLS', flag: '🇺🇸' },
  { id: 'all', name: 'Toate Competițiile (1600+)', flag: '🌐' },
  { id: 'other', name: 'Alte ligi secundare', flag: '⚽' },
];

interface LeftSidebarProps {
  selectedLeague: string;
  onSelectLeague: (leagueId: string) => void;
  activeFilter: string;
  onSelectFilter: (filterId: string) => void;
  totalMatchesCount?: number;
  liveMatchesCount?: number;
  favoritesCount?: number;
  valueBetsCount?: number;
  finishedMatchesCount?: number;
  onOpenTool?: (toolName: string) => void;
}

export default function LeftSidebar({
  selectedLeague,
  onSelectLeague,
  activeFilter,
  onSelectFilter,
  totalMatchesCount = 18,
  liveMatchesCount = 3,
  favoritesCount = 0,
  valueBetsCount = 7,
  finishedMatchesCount = 0,
  onOpenTool,
}: LeftSidebarProps) {
  return (
    <aside className="w-full lg:w-56 xl:w-64 shrink-0 space-y-3.5 text-xs">
      {/* 1. Leagues Section */}
      <div className="rounded-2xl border border-[#1e293b] bg-[#0a101f]/85 backdrop-blur-xl p-3 shadow-lg space-y-1">
        <div className="px-2.5 py-1 text-[10px] font-mono font-bold uppercase tracking-wider text-cyan-400/80 flex items-center justify-between">
          <span>Competiții de Elită</span>
          <Globe className="h-3 w-3 text-cyan-400/70" />
        </div>

        <div className="space-y-0.5 max-h-[290px] overflow-y-auto pr-1">
          {POPULAR_LEAGUES.map((league) => {
            const isSelected = selectedLeague === league.id;
            return (
              <button
                key={league.id}
                onClick={() => onSelectLeague(league.id)}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl font-medium transition duration-150 text-left ${
                  isSelected
                    ? 'bg-gradient-to-r from-cyan-950 to-slate-900 border border-cyan-500/50 text-cyan-300 font-bold shadow-sm shadow-cyan-500/10'
                    : 'text-slate-300 hover:bg-[#121c2e] hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <span className="text-sm shrink-0">{league.flag}</span>
                  <span className="truncate">{league.name}</span>
                </div>
                {isSelected && <ChevronRight className="h-3.5 w-3.5 text-cyan-400 shrink-0 animate-pulse" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Quick Filters & Categories */}
      <div className="rounded-2xl border border-[#1e293b] bg-[#0a101f]/85 backdrop-blur-xl p-3 shadow-lg space-y-1">
        <div className="px-2.5 py-1 text-[10px] font-mono font-bold uppercase tracking-wider text-cyan-400/80">
          Categorii Radare
        </div>

        <div className="space-y-0.5">
          {/* Meciuri Azi */}
          <button
            onClick={() => onSelectFilter('all')}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl transition duration-150 ${
              activeFilter === 'all'
                ? 'bg-gradient-to-r from-cyan-950 to-slate-900 border border-cyan-500/50 text-cyan-300 font-bold'
                : 'text-slate-300 hover:bg-[#121c2e] hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5 text-slate-400" />
              <span>Meciuri azi</span>
            </div>
            <span className="font-mono text-[10px] bg-black/60 border border-[#1e293b] px-2 py-0.5 rounded-md text-slate-300 font-bold">
              {totalMatchesCount}
            </span>
          </button>

          {/* Live */}
          <button
            onClick={() => onSelectFilter('live')}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl transition duration-150 ${
              activeFilter === 'live'
                ? 'bg-rose-950/80 border border-rose-500/50 text-rose-300 font-bold'
                : 'text-slate-300 hover:bg-[#121c2e] hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2">
              <Radio className="h-3.5 w-3.5 text-rose-400 animate-pulse" />
              <span>Radar Live</span>
            </div>
            <span className="font-mono text-[10px] bg-rose-950 text-rose-300 border border-rose-800/60 px-2 py-0.5 rounded-md font-bold">
              {liveMatchesCount}
            </span>
          </button>

          {/* Favorite */}
          <button
            onClick={() => onSelectFilter('favorites')}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl transition duration-150 ${
              activeFilter === 'favorites'
                ? 'bg-yellow-950/80 border border-yellow-500/50 text-yellow-300 font-bold'
                : 'text-slate-300 hover:bg-[#121c2e] hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2">
              <Star className="h-3.5 w-3.5 text-yellow-400" />
              <span>Favorite</span>
            </div>
            {favoritesCount > 0 && (
              <span className="font-mono text-[10px] bg-yellow-950 text-yellow-300 border border-yellow-800/60 px-2 py-0.5 rounded-md font-bold">
                {favoritesCount}
              </span>
            )}
          </button>

          {/* Sniper Over 2.5 Picks */}
          <button
            onClick={() => onSelectFilter('sniper')}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl transition duration-150 ${
              activeFilter === 'sniper'
                ? 'bg-gradient-to-r from-amber-950 to-slate-900 border border-amber-500/70 text-amber-300 font-bold shadow-sm shadow-amber-500/15'
                : 'text-slate-300 hover:bg-[#121c2e] hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-amber-400 font-bold text-xs">🎯</span>
              <span className="font-semibold">Sniper (Over 2.5)</span>
            </div>
            <span className="font-mono text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded-md font-bold">
              HOT
            </span>
          </button>

          {/* Value Bets */}
          <button
            onClick={() => onSelectFilter('value')}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl transition duration-150 ${
              activeFilter === 'value'
                ? 'bg-gradient-to-r from-emerald-950 to-slate-900 border border-emerald-500/60 text-emerald-300 font-bold'
                : 'text-slate-300 hover:bg-[#121c2e] hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2">
              <Flame className="h-3.5 w-3.5 text-emerald-400" />
              <span>Value Bets</span>
            </div>
            <span className="font-mono text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded-md font-bold">
              {valueBetsCount}
            </span>
          </button>

          {/* Probabilitate ridicata (prag real: 65%) */}
          <button
            onClick={() => onSelectFilter('safe')}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl transition duration-150 ${
              activeFilter === 'safe'
                ? 'bg-emerald-950/80 border border-emerald-600/50 text-emerald-300 font-bold'
                : 'text-slate-300 hover:bg-[#121c2e] hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              <span>Probabilitate ≥65%</span>
            </div>
            <span className="font-mono text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-700/50 px-2 py-0.5 rounded-md font-bold">
              4
            </span>
          </button>

          {/* Bilete Gata */}
          <button
            onClick={() => onSelectFilter('tickets')}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl transition duration-150 ${
              activeFilter === 'tickets'
                ? 'bg-purple-950/80 border border-purple-600/50 text-purple-300 font-bold'
                : 'text-slate-300 hover:bg-[#121c2e] hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2">
              <Ticket className="h-3.5 w-3.5 text-purple-400" />
              <span>Smart Combos</span>
            </div>
            <span className="font-mono text-[10px] bg-purple-950 text-purple-300 border border-purple-700/50 px-2 py-0.5 rounded-md font-bold">
              3
            </span>
          </button>

          {/* Meciuri Încheiate / Rezultate */}
          <button
            onClick={() => onSelectFilter('archive')}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl transition duration-150 ${
              activeFilter === 'archive'
                ? 'bg-gradient-to-r from-slate-800 to-slate-900 border border-slate-600 text-slate-100 font-bold'
                : 'text-slate-300 hover:bg-[#121c2e] hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2">
              <History className="h-3.5 w-3.5 text-slate-400" />
              <span>Încheiate (Rezultate)</span>
            </div>
            {finishedMatchesCount > 0 && (
              <span className="font-mono text-[10px] bg-slate-900 text-slate-300 border border-slate-700 px-2 py-0.5 rounded-md font-bold">
                {finishedMatchesCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* 3. Instrumente & Calculatoare */}
      <div className="rounded-2xl border border-[#1e293b] bg-[#0a101f]/85 backdrop-blur-xl p-3 shadow-lg space-y-1">
        <div className="px-2.5 py-1 text-[10px] font-mono font-bold uppercase tracking-wider text-cyan-400/80">
          Instrumente Cantitative
        </div>

        <div className="space-y-0.5">
          <button
            onClick={() => onOpenTool?.('steam')}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-slate-300 hover:bg-[#121c2e] hover:text-amber-400 transition duration-150 text-left font-semibold"
          >
            <Zap className="h-3.5 w-3.5 text-amber-400 animate-pulse" />
            <span className="text-amber-300">⚡ Steam Scanner Live</span>
          </button>

          <button
            onClick={() => onOpenTool?.('kelly')}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-slate-300 hover:bg-[#121c2e] hover:text-emerald-400 transition duration-150 text-left"
          >
            <Calculator className="h-3.5 w-3.5 text-emerald-400" />
            <span>Calculator Miză Kelly</span>
          </button>

          <button
            onClick={() => onOpenTool?.('compare')}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-slate-300 hover:bg-[#121c2e] hover:text-cyan-400 transition duration-150 text-left"
          >
            <BarChart3 className="h-3.5 w-3.5 text-cyan-400" />
            <span>Compară Consens Sharp</span>
          </button>

          <button
            onClick={() => onOpenTool?.('alerts')}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-slate-300 hover:bg-[#121c2e] hover:text-amber-400 transition duration-150 text-left"
          >
            <Bell className="h-3.5 w-3.5 text-amber-400" />
            <span>Alertă Dropping Odds</span>
          </button>

          <button
            onClick={() => onOpenTool?.('news')}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-slate-300 hover:bg-[#121c2e] hover:text-purple-400 transition duration-150 text-left"
          >
            <Newspaper className="h-3.5 w-3.5 text-purple-400" />
            <span>Știri & Formații Live</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
