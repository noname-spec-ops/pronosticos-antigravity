'use client';

import React from 'react';
import { TrendingUp, Award, Calendar, FileText, Diamond, Layers, Sparkles, Activity } from 'lucide-react';

interface TopKpiBarProps {
  picksCount?: number;
  valueBetsCount?: number;
  avgOdd?: number;
  /** Out-of-sample backtest results. Null when no backtest has been run. */
  backtest?: {
    roiPercent: number;
    totalBetsPlaced: number;
    winRatePercent: number | null;
  } | null;
}

export default function TopKpiBar({
  picksCount = 0,
  valueBetsCount = 0,
  avgOdd = 0,
  backtest = null,
}: TopKpiBarProps) {
  const fmtPct = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(2)}%`;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3 py-1">
      {/* 1. Win Rate */}
      <div className="relative group overflow-hidden rounded-2xl border border-[#1e293b] bg-[#0c1322]/85 backdrop-blur-md p-3.5 shadow-lg hover:border-emerald-500/50 hover:shadow-glow-emerald transition-all duration-300">
        <div className="absolute top-0 right-0 h-16 w-16 bg-emerald-500/5 rounded-full blur-xl group-hover:bg-emerald-500/15 transition-all" />
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-950 to-slate-900 border border-emerald-500/40 text-emerald-300 shadow-sm">
            <Award className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <span>Win Rate</span>
              <span className="h-1 w-1 rounded-full bg-emerald-400" />
            </div>
            <div className={`font-mono text-base sm:text-lg font-black tracking-tight ${backtest?.winRatePercent != null ? 'text-emerald-400' : 'text-slate-500'}`}>
              {backtest?.winRatePercent != null ? `${backtest.winRatePercent.toFixed(1)}%` : '—'}
            </div>
            <div className="text-[9px] font-mono text-slate-500 truncate">
              {backtest ? `Backtest, ${backtest.totalBetsPlaced} pariuri` : 'Fără backtest'}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Profit */}
      <div className="relative group overflow-hidden rounded-2xl border border-[#1e293b] bg-[#0c1322]/85 backdrop-blur-md p-3.5 shadow-lg hover:border-cyan-500/50 hover:shadow-glow-cyan transition-all duration-300">
        <div className="absolute top-0 right-0 h-16 w-16 bg-cyan-500/5 rounded-full blur-xl group-hover:bg-cyan-500/15 transition-all" />
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-cyan-950 to-slate-900 border border-cyan-500/40 text-cyan-300 shadow-sm">
            <TrendingUp className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <span>Net Profit</span>
              <span className="h-1 w-1 rounded-full bg-cyan-400" />
            </div>
            <div className={`font-mono text-base sm:text-lg font-black tracking-tight ${
              backtest ? (backtest.roiPercent > 0 ? 'text-cyan-300' : 'text-rose-400') : 'text-slate-500'
            }`}>
              {backtest ? fmtPct(backtest.roiPercent) : '—'}
            </div>
            <div className="text-[9px] font-mono text-slate-500 font-bold truncate">
              {backtest ? 'ROI backtest out-of-sample' : 'Fără backtest'}
            </div>
          </div>
        </div>
      </div>

      {/* 3. Picks Azi */}
      <div className="relative group overflow-hidden rounded-2xl border border-[#1e293b] bg-[#0c1322]/85 backdrop-blur-md p-3.5 shadow-lg hover:border-blue-500/50 transition-all duration-300">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-950 to-slate-900 border border-blue-500/40 text-blue-300 shadow-sm">
            <Calendar className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">Picks Azi</div>
            <div className="font-mono text-base sm:text-lg font-black text-white tracking-tight">{picksCount}</div>
            <div className="text-[9px] font-mono text-slate-500 truncate">Scanate Quantic</div>
          </div>
        </div>
      </div>

      {/* 4. Odd Mediu */}
      <div className="relative group overflow-hidden rounded-2xl border border-[#1e293b] bg-[#0c1322]/85 backdrop-blur-md p-3.5 shadow-lg hover:border-purple-500/50 hover:shadow-glow-violet transition-all duration-300">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-purple-950 to-slate-900 border border-purple-500/40 text-purple-300 shadow-sm">
            <FileText className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">Cotă Medie</div>
            <div className="font-mono text-base sm:text-lg font-black text-purple-300 tracking-tight">{avgOdd.toFixed(2)}</div>
            <div className="text-[9px] font-mono text-slate-500 truncate">Valoare optimă</div>
          </div>
        </div>
      </div>

      {/* 5. Value Bets */}
      <div className="relative group overflow-hidden rounded-2xl border border-[#1e293b] bg-[#0c1322]/85 backdrop-blur-md p-3.5 shadow-lg hover:border-amber-500/50 hover:shadow-glow-amber transition-all duration-300">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-amber-950 to-slate-900 border border-amber-500/40 text-amber-300 shadow-sm">
            <Diamond className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">Value Edge</div>
            <div className="font-mono text-base sm:text-lg font-black text-amber-300 tracking-tight">{valueBetsCount}</div>
            <div className="text-[9px] font-mono text-amber-400 font-bold truncate">Piață Ineficientă</div>
          </div>
        </div>
      </div>

      {/* 6. Stake Sugerat */}
      <div className="relative group overflow-hidden rounded-2xl border border-[#1e293b] bg-[#0c1322]/85 backdrop-blur-md p-3.5 shadow-lg hover:border-emerald-500/50 transition-all duration-300">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-slate-900 to-[#102033] border border-slate-700 text-emerald-300 shadow-sm">
            <Layers className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">Kelly Staking</div>
            <div className="font-mono text-base sm:text-lg font-black text-slate-100 tracking-tight">Cap 2.0%</div>
            <div className="text-[9px] font-mono text-slate-500 truncate">Risc Disciplinat</div>
          </div>
        </div>
      </div>
    </div>
  );
}
