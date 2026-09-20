'use client';

import React from 'react';
import type { GlobalModelHealth } from '@/types/football';

interface ModelHealthBadgeProps {
  metrics?: GlobalModelHealth | null;
  leagueId?: number;
}

export default function ModelHealthBadge({ metrics, leagueId }: ModelHealthBadgeProps) {
  if (!metrics) return null;

  const leagueMetric = leagueId ? metrics.leagueHealthMap[leagueId] : undefined;
  // beatsBookmakerBrier is null when the competition has no odds source, so the
  // comparison is undefined rather than failed. An unknown baseline must not be
  // presented as a validated model.
  const isLeagueValid = leagueMetric
    ? leagueMetric.beatsBookmakerBrier === true && leagueMetric.simulatedRoiPercent > 0
    : metrics.isOverallProfitable;

  const brierScore = leagueMetric ? leagueMetric.brierScore1X2 : metrics.overallBrierScore;
  const bmBrier = leagueMetric ? leagueMetric.bookmakerBrierScore1X2 : metrics.overallBookmakerBrierScore;
  const roi = leagueMetric ? leagueMetric.simulatedRoiPercent : metrics.overallRoiPercent;
  const matchesCount = leagueMetric ? leagueMetric.matchesCount : metrics.totalMatchesBacktested;
  const betsCount = leagueMetric ? leagueMetric.totalBetsPlaced : metrics.totalBetsPlaced;

  const clv = leagueMetric ? leagueMetric.clvMetrics : metrics.overallClvMetrics;
  const roiCi = leagueMetric ? leagueMetric.roiCi95 : metrics.overallRoiCi95;
  const maxDd = leagueMetric ? leagueMetric.maxDrawdownPercent : metrics.overallMaxDrawdownPercent;

  return (
    <div className="rounded-2xl border border-cyberCyan/20 bg-[#070c14]/90 backdrop-blur-xl p-3.5 sm:p-4 text-xs shadow-cyber-card space-y-2.5 relative overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 relative z-10">
        <div className="flex items-center gap-2.5">
          <span
            className={`inline-block h-2.5 w-2.5 rounded-full ${
              isLeagueValid ? 'bg-cyberEmerald shadow-[0_0_8px_#00ff9d]' : 'bg-cyberAmber shadow-[0_0_8px_#ffb703]'
            }`}
          />
          <span className="font-bold text-slate-100 tracking-wide font-sans">
            {isLeagueValid ? 'Model Calibrat & Profitabil Out-of-Sample' : 'Transparență & Sănătate Model (Zero-Leakage)'}
          </span>
          <span className="rounded-lg bg-[#0c1422] border border-slate-800 px-2 py-0.5 text-[10px] text-cyberCyan font-mono">
            {matchesCount} meciuri testate
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-slate-300 font-mono text-[11px]">
          <div className="bg-[#0c1422] px-2 py-1 rounded-lg border border-slate-800/80">
            <span className="text-slate-400">Brier 1X2: </span>
            <span className="font-bold text-white">{brierScore.toFixed(4)}</span>
            <span className="text-[10px] text-slate-500">
              {' '}(Piață: {bmBrier === null || bmBrier === undefined ? 'fără cote' : bmBrier.toFixed(4)})
            </span>
          </div>
          {clv && (
            <div className="bg-[#0c1422] px-2 py-1 rounded-lg border border-slate-800/80">
              <span className="text-slate-400">CLV Mediu: </span>
              <span className={`font-bold ${clv.avgClvPercent >= 0 ? 'text-cyberEmerald' : 'text-cyberAmber'}`}>
                {clv.avgClvPercent >= 0 ? `+${clv.avgClvPercent.toFixed(2)}%` : `${clv.avgClvPercent.toFixed(2)}%`}
              </span>
            </div>
          )}
          <div className="bg-[#0c1422] px-2 py-1 rounded-lg border border-slate-800/80">
            <span className="text-slate-400">ROI: </span>
            <span className={`font-bold ${roi >= 0 ? 'text-cyberEmerald' : 'text-cyberRose'}`}>
              {roi >= 0 ? `+${roi.toFixed(2)}%` : `${roi.toFixed(2)}%`}
            </span>
            {roiCi && (
              <span className="text-[10px] text-slate-500"> [CI: {roiCi[0]}%, {roiCi[1]}%]</span>
            )}
          </div>
          <div className="bg-[#0c1422] px-2 py-1 rounded-lg border border-slate-800/80">
            <span className="text-slate-400">Max DD: </span>
            <span className="text-slate-200 font-semibold">{maxDd.toFixed(1)}%</span>
            <span className="text-[10px] text-slate-500"> ({betsCount} pariuri)</span>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-cyberCyan/10 bg-[#09111c]/90 p-2.5 text-[11px] text-slate-400 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span>
            💡 <strong className="text-slate-200">Notă Metodologică:</strong> Backtestul măsoară modelul statistic pur fără bias out-of-sample.
          </span>
          {metrics.lastBacktestRun && (
            <span className="text-[10px] text-slate-500 font-mono">
              (Ultima calibrare: {new Date(metrics.lastBacktestRun).toLocaleDateString('ro-RO')})
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded bg-emerald-950/80 border border-emerald-500/50 px-2 py-0.5 text-[10px] font-mono text-emerald-400">
            Drift: STABIL
          </span>
          {matchesCount < 200 && (
            <span className="text-cyberAmber font-semibold font-mono">⚠️ Eșantion redus.</span>
          )}
        </div>
      </div>
    </div>
  );
}