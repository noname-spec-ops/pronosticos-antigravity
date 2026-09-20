'use client';

import React, { useState } from 'react';
import { Flame, ShieldAlert, Sparkles, Filter } from 'lucide-react';
import type { ValueBet, ValueGrade } from '@/types/football';

interface ValueBetsRadarProps {
  valueBets: ValueBet[];
  onSelectMatchById?: (fixtureId: number) => void;
}

export default function ValueBetsRadar({ valueBets, onSelectMatchById }: ValueBetsRadarProps) {
  const [gradeFilter, setGradeFilter] = useState<string>('all');
  const [marketFilter, setMarketFilter] = useState<string>('all');

  // Filter and sort by Edge descending
  const filtered = valueBets
    .filter((vb) => {
      if (gradeFilter !== 'all' && vb.grade !== gradeFilter) return false;
      if (marketFilter !== 'all' && vb.marketType !== marketFilter) return false;
      return true;
    })
    .sort((a, b) => b.edgePercent - a.edgePercent);

  const getGradeBadge = (grade: ValueGrade) => {
    switch (grade) {
      case 'A+':
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40';
      case 'A':
        return 'bg-green-500/20 text-green-400 border-green-500/40';
      case 'B':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/40';
      case 'SUSPECT':
        return 'bg-red-500/20 text-red-400 border-red-500/40 animate-pulse';
    }
  };

  if (valueBets.length === 0) {
    return (
      <div className="rounded-xl border border-flashBorder bg-flashCard p-8 text-center text-flashMuted">
        <Sparkles className="mx-auto h-8 w-8 text-amber-400/60 mb-2" />
        <p className="font-semibold text-gray-300">Niciun Value Bet identificat pentru selecția curentă.</p>
        <p className="mt-1 text-xs">
          Criterii stricte de valoare: Edge ≥ 5%, model Dixon-Coles/ELO calibrat pe ligă.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Control / Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-flashBorder bg-flashCard p-3">
        <div className="flex items-center gap-2 text-xs font-bold text-gray-200">
          <Flame className="h-4 w-4 text-amber-400" />
          <span>AI Value Betting Radar ({filtered.length} selecții active)</span>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Grade filter */}
          <select
            value={gradeFilter}
            onChange={(e) => setGradeFilter(e.target.value)}
            className="rounded-lg border border-flashBorder bg-[#111722] px-2.5 py-1 text-gray-200 focus:outline-none focus:border-flashGreen text-xs"
          >
            <option value="all">Toate Gradele</option>
            <option value="A+">Grad A+ (12-15%)</option>
            <option value="A">Grad A (8-12%)</option>
            <option value="B">Grad B (5-8%)</option>
            <option value="SUSPECT">SUSPECT (&gt;15%)</option>
          </select>

          {/* Market filter */}
          <select
            value={marketFilter}
            onChange={(e) => setMarketFilter(e.target.value)}
            className="rounded-lg border border-flashBorder bg-[#111722] px-2.5 py-1 text-gray-200 focus:outline-none focus:border-flashGreen text-xs"
          >
            <option value="all">Toate Piețele</option>
            <option value="1X2">Piață 1X2</option>
            <option value="OU">Over / Under</option>
            <option value="BTTS">Ambele Înscriu (BTTS)</option>
          </select>
        </div>
      </div>

      {/* Cards Table Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {filtered.map((vb) => (
          <div
            key={vb.id}
            onClick={() => onSelectMatchById?.(vb.fixtureId)}
            className="group rounded-xl border border-flashBorder bg-flashCard p-4 hover:border-flashGreen/60 hover:bg-flashHover/60 cursor-pointer transition shadow-sm"
          >
            {/* Top row: League & Grade Badge */}
            <div className="flex items-center justify-between gap-2 border-b border-flashBorder/40 pb-2 mb-2.5">
              <span className="text-[11px] font-semibold text-flashMuted">{vb.leagueName}</span>
              <span
                className={`rounded border px-2 py-0.5 text-[10px] font-extrabold ${getGradeBadge(
                  vb.grade
                )}`}
              >
                {vb.grade === 'SUSPECT' ? '⚠️ SUSPECT (>15%)' : `Grad ${vb.grade}`}
              </span>
            </div>

            {/* Match Name & Selection */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-bold text-sm text-gray-100 group-hover:text-flashGreen transition">
                  {vb.matchName}
                </h3>
                <div className="mt-1 inline-flex items-center gap-1.5 rounded bg-emerald-950/60 border border-emerald-800/40 px-2 py-0.5 text-xs font-semibold text-emerald-300">
                  <span>Pariu: {vb.selection}</span>
                </div>
              </div>

              {/* Edge Badge */}
              <div className="text-right">
                <div className="text-[10px] text-flashMuted">Edge AI</div>
                <div className="font-mono text-base font-black text-amber-400">
                  +{vb.edgePercent}%
                </div>
              </div>
            </div>

            {/* Metric Details Grid */}
            <div className="mt-3 grid grid-cols-4 gap-2 rounded-lg bg-[#111722] p-2 text-center text-xs">
              <div>
                <div className="text-[9px] text-flashMuted">Cotă Casă</div>
                <div className="font-mono font-bold text-gray-100">{vb.bookmakerOdds.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-[9px] text-flashMuted">Cotă Corectă</div>
                <div className="font-mono font-bold text-emerald-400">{vb.fairOdds.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-[9px] text-flashMuted">Prob Model</div>
                <div className="font-mono font-semibold text-gray-200">
                  {(vb.modelProb * 100).toFixed(1)}%
                </div>
              </div>
              <div>
                <div className="text-[9px] text-flashMuted">Miză Kelly (0.25)</div>
                <div className="font-mono font-bold text-flashYellow">
                  {vb.suggestedStakePercent}%
                </div>
              </div>
            </div>

            {/* Warning note if suspect or uncalibrated */}
            {vb.warningNote && (
              <div className="mt-2.5 flex items-center gap-1.5 rounded border border-red-900/40 bg-red-950/30 p-1.5 text-[10px] text-red-300">
                <ShieldAlert className="h-3.5 w-3.5 flex-shrink-0 text-red-400" />
                <span>{vb.warningNote}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}