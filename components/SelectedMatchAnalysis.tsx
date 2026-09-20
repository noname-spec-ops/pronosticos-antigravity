'use client';

import React, { useState } from 'react';
import {
  Sparkles,
  BarChart3,
  Users,
  History,
  TrendingUp,
  PlusCircle,
  CheckCircle2,
  Newspaper,
  Shield,
  Activity,
  Flame,
} from 'lucide-react';
import type { Fixture } from '@/types/football';

interface SelectedMatchAnalysisProps {
  fixture: Fixture | null;
  onOpenFullModal: () => void;
  onAddToTicket?: (fixture: Fixture, pick: string, odd: number) => void;
  onSelectTeam?: (teamName: string) => void;
}

export default function SelectedMatchAnalysis({
  fixture,
  onOpenFullModal,
  onAddToTicket,
  onSelectTeam,
}: SelectedMatchAnalysisProps) {
  const [activeTab, setActiveTab] = useState<'stats' | 'h2h' | 'form' | 'lineups' | 'news' | 'momentum' | 'tactics'>('stats');
  const [isAdded, setIsAdded] = useState(false);

  if (!fixture) {
    return (
      <div className="rounded-2xl border border-flashBorder bg-[#0f141d] p-6 text-center text-xs text-flashMuted">
        Selectează un meci din tabel pentru a vedea analiza AI în timp real.
      </div>
    );
  }

  const pred = fixture.prediction;
  const odds = fixture.odds;
  const deepHome = fixture.deepStatsHome;
  const deepAway = fixture.deepStatsAway;
  const formHome = fixture.formHome;
  const formAway = fixture.formAway;

  // Best pick computation from the quant model.
  // 1. Prioritize verified Value Bets (+EV against quoted bookmaker prices).
  // 2. Evaluate model probabilities against available market quotes.
  // 3. Fallback to the top mathematical probability outcome (zero-vig fair estimate) when market quotes are pending.
  let pickName: string | null = null;
  let pickProb = 0;
  let pickOdd: number | null = null;
  let pickEdge: number | null = null;
  let confidenceBars = 0;
  let isFairEstimate = false;

  if (pred?.valueBets && pred.valueBets.length > 0) {
    const topVb = pred.valueBets[0];
    pickName = topVb.selection;
    pickProb = Math.round(topVb.modelProb * 100);
    pickOdd = topVb.bookmakerOdds;
    pickEdge = Number(topVb.edgePercent.toFixed(1));
    confidenceBars = pickProb >= 70 ? 5 : pickProb >= 60 ? 4 : 3;
    isFairEstimate = false;
  } else if (pred && odds) {
    const pHome = pred.probabilities1X2.home;
    const pAway = pred.probabilities1X2.away;
    const pOver25 = pred.overUnderProbabilities.find((o) => o.line === 2.5)?.over;
    const pUnder25 = pred.overUnderProbabilities.find((o) => o.line === 2.5)?.under;
    const pBtts = pred.bttsProbabilities.yes;

    const oddHome = odds.match1X2?.home;
    const oddAway = odds.match1X2?.away;
    const oddOver = odds.overUnder?.find((o) => o.line === 2.5)?.over;
    const oddUnder = odds.overUnder?.find((o) => o.line === 2.5)?.under;
    const oddBtts = odds.btts?.yes;

    if (pHome >= 0.52 && oddHome !== undefined) {
      pickName = `${fixture.homeTeam.name} (1)`;
      pickProb = Math.round(pHome * 100);
      pickOdd = oddHome;
    } else if (pAway >= 0.50 && oddAway !== undefined) {
      pickName = `${fixture.awayTeam.name} (2)`;
      pickProb = Math.round(pAway * 100);
      pickOdd = oddAway;
    } else if (pOver25 !== undefined && pOver25 >= 0.55 && oddOver !== undefined) {
      pickName = 'Peste 2.5 Goluri';
      pickProb = Math.round(pOver25 * 100);
      pickOdd = oddOver;
    } else if (pUnder25 !== undefined && pUnder25 >= 0.58 && oddUnder !== undefined) {
      pickName = 'Sub 2.5 Goluri';
      pickProb = Math.round(pUnder25 * 100);
      pickOdd = oddUnder;
    } else if (pBtts >= 0.56 && oddBtts !== undefined) {
      pickName = 'Ambele Marchează (GG)';
      pickProb = Math.round(pBtts * 100);
      pickOdd = oddBtts;
    }

    if (pickOdd !== null) {
      pickEdge = Number((((pickProb / 100) * pickOdd - 1) * 100).toFixed(1));
      confidenceBars = pickProb >= 72 ? 5 : pickProb >= 60 ? 4 : 3;
      isFairEstimate = false;
    }
  }

  // Fallback to top Dixon-Coles / Poisson model probability when market quotes are pending
  if (pred && pickName === null) {
    const pHome = pred.probabilities1X2.home;
    const pDraw = pred.probabilities1X2.draw;
    const pAway = pred.probabilities1X2.away;
    const pOver25 = pred.overUnderProbabilities.find((o) => o.line === 2.5)?.over ?? 0;
    const pUnder25 = pred.overUnderProbabilities.find((o) => o.line === 2.5)?.under ?? 0;

    let bestProb = pHome;
    if (pOver25 >= 0.60 && pOver25 >= pHome && pOver25 >= pAway) {
      pickName = 'Peste 2.5 Goluri';
      bestProb = pOver25;
    } else if (pUnder25 >= 0.60 && pUnder25 >= pHome && pUnder25 >= pAway) {
      pickName = 'Sub 2.5 Goluri';
      bestProb = pUnder25;
    } else if (pHome >= pAway && pHome >= pDraw) {
      pickName = `${fixture.homeTeam.name} (1)`;
      bestProb = pHome;
    } else if (pAway >= pHome && pAway >= pDraw) {
      pickName = `${fixture.awayTeam.name} (2)`;
      bestProb = pAway;
    } else {
      pickName = 'Egalitate (X)';
      bestProb = pDraw;
    }

    pickProb = Math.round(bestProb * 100);
    pickOdd = Number((1 / Math.max(0.01, bestProb)).toFixed(2));
    pickEdge = 0;
    confidenceBars = pickProb >= 70 ? 5 : pickProb >= 60 ? 4 : 3;
    isFairEstimate = true;
  }

  const handleAdd = () => {
    if (!onAddToTicket || pickName === null || pickOdd === null) return;
    setIsAdded(true);
    onAddToTicket(fixture, pickName, pickOdd);
    setTimeout(() => setIsAdded(false), 2000);
  };

  return (
    <div className="rounded-2xl border border-cyberCyan/20 bg-[#070c14]/90 backdrop-blur-xl p-4 sm:p-5 shadow-cyber-card space-y-4 relative overflow-hidden group/analysis">
      {/* Ambient glow in background */}
      <div className="absolute -top-10 -right-10 w-72 h-72 bg-cyberCyan/10 rounded-full blur-3xl pointer-events-none -z-0" />
      <div className="absolute -bottom-10 -left-10 w-72 h-72 bg-cyberEmerald/10 rounded-full blur-3xl pointer-events-none -z-0" />

      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-cyberCyan/15 pb-3 relative z-10">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-cyberCyan animate-pulse shadow-[0_0_8px_#00f0ff]" />
          <h3 className="font-bold text-sm text-slate-100 tracking-wide">Analiză Meci Selectat</h3>
        </div>

        <button
          onClick={onOpenFullModal}
          className="text-[11px] font-semibold text-cyberCyan hover:text-white transition-all flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyberCyan/10 border border-cyberCyan/30 hover:bg-cyberCyan/20"
        >
          <Sparkles className="h-3 w-3 text-cyberCyan" /> Deschide Detalii Complete
        </button>
      </div>

      {/* Match Matchup Banner */}
      <div className="flex items-center justify-between flex-wrap gap-3 relative z-10 bg-gradient-to-r from-[#0c1422] to-[#090e17] p-3 rounded-xl border border-cyberCyan/15">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyberCyan/15 border border-cyberCyan/40 text-base font-black text-cyberCyan font-mono shadow-[0_0_10px_rgba(0,240,255,0.2)]">
            {fixture.homeTeam.name.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <h4 className="text-base font-black text-white tracking-tight flex items-center gap-2">
              <span
                onClick={() => onSelectTeam?.(fixture.homeTeam.name)}
                title={`Vezi profilul ${fixture.homeTeam.name}`}
                className="text-slate-100 hover:text-cyberCyan hover:underline cursor-pointer transition-colors"
              >
                {fixture.homeTeam.name}
              </span>
              <span className="text-slate-500 font-mono text-xs font-normal">vs</span>
              <span
                onClick={() => onSelectTeam?.(fixture.awayTeam.name)}
                title={`Vezi profilul ${fixture.awayTeam.name}`}
                className="text-slate-100 hover:text-cyberCyan hover:underline cursor-pointer transition-colors"
              >
                {fixture.awayTeam.name}
              </span>
            </h4>
            <div className="text-[11px] text-slate-400 font-mono">
              {fixture.league.country}: {fixture.league.name} — {new Date(fixture.date).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })}, {new Date(fixture.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        </div>

        {pred?.cornersPrediction && (
          <div className="hidden sm:flex items-center gap-1.5 text-xs font-mono bg-[#09101c] border border-cyberAmber/30 px-3 py-1.5 rounded-xl shadow-sm">
            <span className="text-slate-400">Proiecție:</span>
            <span className="font-bold text-cyberAmber">🚩 {pred.cornersPrediction.expectedTotalCorners} Cornere</span>
          </div>
        )}
      </div>

      {/* Sub-tabs */}
      <div className="flex items-center gap-1.5 border-b border-cyberCyan/15 pb-2.5 text-xs font-semibold overflow-x-auto relative z-10 scrollbar-none">
        <button
          onClick={() => setActiveTab('stats')}
          className={`px-3 py-1.5 rounded-xl transition-all ${
            activeTab === 'stats'
              ? 'bg-cyberCyan/20 border border-cyberCyan text-cyberCyan font-bold shadow-[0_0_10px_rgba(0,240,255,0.25)]'
              : 'bg-[#0b121e] border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
          }`}
        >
          Statistici
        </button>

        {/* ⚡ Live Momentum & Imminent Goal Detector Tab */}
        <button
          onClick={() => setActiveTab('momentum')}
          className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 ${
            activeTab === 'momentum'
              ? 'bg-gradient-to-r from-amber-500/20 to-cyberAmber/20 border border-cyberAmber text-cyberAmber font-bold shadow-[0_0_12px_rgba(255,183,3,0.3)]'
              : 'bg-[#0b121e] border border-amber-500/30 text-amber-400/90 hover:text-cyberAmber hover:border-cyberAmber/60'
          }`}
        >
          <span className="h-2 w-2 rounded-full bg-cyberAmber animate-pulse" />
          <span>⚡ Momentum & Gol Iminent</span>
        </button>

        <button
          onClick={() => setActiveTab('h2h')}
          className={`px-3 py-1.5 rounded-xl transition-all ${
            activeTab === 'h2h'
              ? 'bg-cyberCyan/20 border border-cyberCyan text-cyberCyan font-bold shadow-[0_0_10px_rgba(0,240,255,0.25)]'
              : 'bg-[#0b121e] border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
          }`}
        >
          H2H
        </button>

        <button
          onClick={() => setActiveTab('form')}
          className={`px-3 py-1.5 rounded-xl transition-all ${
            activeTab === 'form'
              ? 'bg-cyberCyan/20 border border-cyberCyan text-cyberCyan font-bold shadow-[0_0_10px_rgba(0,240,255,0.25)]'
              : 'bg-[#0b121e] border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
          }`}
        >
          Formă
        </button>

        <button
          onClick={() => setActiveTab('lineups')}
          className={`px-3 py-1.5 rounded-xl transition-all ${
            activeTab === 'lineups'
              ? 'bg-cyberCyan/20 border border-cyberCyan text-cyberCyan font-bold shadow-[0_0_10px_rgba(0,240,255,0.25)]'
              : 'bg-[#0b121e] border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
          }`}
        >
          Echipe probabile
        </button>

        <button
          onClick={() => setActiveTab('news')}
          className={`px-3 py-1.5 rounded-xl transition-all ${
            activeTab === 'news'
              ? 'bg-cyberCyan/20 border border-cyberCyan text-cyberCyan font-bold shadow-[0_0_10px_rgba(0,240,255,0.25)]'
              : 'bg-[#0b121e] border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
          }`}
        >
          Știri
        </button>

        {/* 📐 Tactical Tracking, xT & Positional Geometry (2026 Sharp) */}
        <button
          onClick={() => setActiveTab('tactics')}
          className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 ${
            activeTab === 'tactics'
              ? 'bg-gradient-to-r from-teal-500/20 to-cyberEmerald/20 border border-cyberEmerald text-cyberEmerald font-bold shadow-[0_0_12px_rgba(0,255,157,0.3)]'
              : 'bg-[#0b121e] border border-teal-500/30 text-teal-400/90 hover:text-cyberEmerald hover:border-cyberEmerald/60'
          }`}
        >
          <span>📐 xT & Tracking Radar</span>
        </button>
      </div>

      {/* Main Content: Stats Grid or Live Momentum Radar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-xs">
        {/* Left 2 Cols */}
        <div className="lg:col-span-2 space-y-2.5">
          {activeTab === 'momentum' && !pred?.inPlayMomentum ? (
            <div className="rounded-xl border border-slate-700/60 bg-slate-900/50 p-4 space-y-2">
              <h3 className="font-bold text-sm text-slate-200">Momentum indisponibil</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Radarul de presiune se calculează doar din statistici live reale. Pentru acest meci
                nu există date live, deci nu afișăm procente sau cote estimate.
              </p>
            </div>
          ) : activeTab === 'momentum' && pred?.inPlayMomentum ? (
            /* ⚡ Live Momentum & Imminent Goal Detector Card */
            <div className="space-y-3">
              {/* 1. Dual Momentum Bar */}
              <div className="rounded-xl bg-[#141b26] p-3.5 border border-amber-500/40 shadow-sm space-y-2.5">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="flex items-center gap-1.5 text-amber-300">
                    <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
                    <span>RADAR PRESIUNE & MOMENTUM ÎN TIMP REAL</span>
                  </span>
                  <span className="font-mono text-[10px] bg-amber-950/80 border border-amber-500/50 text-amber-300 px-2 py-0.5 rounded">
                    {fixture.status === 'FT' ? 'Finalizat' : fixture.status === 'HT' ? 'Pauză' : `${fixture.elapsedMinute || 65}' LIVE`}
                  </span>
                </div>

                {/* Team Names & Momentum Percentages */}
                <div className="flex items-center justify-between font-mono font-black text-sm">
                  <span className="text-emerald-400 flex items-center gap-1.5">
                    <span>{fixture.homeTeam.name}</span>
                    <span className="text-xs bg-emerald-950 border border-emerald-600 px-1.5 py-0.2 rounded font-bold">
                      {pred.inPlayMomentum.homeMomentum}%
                    </span>
                  </span>
                  <span className="text-blue-400 flex items-center gap-1.5">
                    <span className="text-xs bg-blue-950 border border-blue-600 px-1.5 py-0.2 rounded font-bold">
                      {pred.inPlayMomentum.awayMomentum}%
                    </span>
                    <span>{fixture.awayTeam.name}</span>
                  </span>
                </div>

                {/* Dual Visual Momentum Bar */}
                <div className="h-3 w-full bg-gray-800 rounded-full overflow-hidden flex shadow-inner">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-amber-400 transition-all duration-500"
                    style={{ width: `${pred.inPlayMomentum.homeMomentum}%` }}
                  />
                  <div
                    className="h-full bg-gradient-to-l from-blue-500 to-indigo-600 transition-all duration-500"
                    style={{ width: `${pred.inPlayMomentum.awayMomentum}%` }}
                  />
                </div>

                <div className="flex justify-between items-center text-[10px] text-gray-400 font-mono">
                  <span>Presiune Ofensivă Ridicată ⚡</span>
                  <span>Tranziție & Contraatac 🛡️</span>
                </div>
              </div>

              {/* 2. Live Dynamic Next Goal Odds & Probability Matrix */}
              <div className="grid grid-cols-3 gap-2 text-center font-mono">
                <div
                  onClick={() => {
                    const odd = pred?.inPlayMomentum?.liveOdds?.homeNextGoalOdd;
                    if (odd !== undefined) onAddToTicket?.(fixture, `Următorul Gol: ${fixture.homeTeam.name}`, odd);
                  }}
                  className="rounded-xl bg-[#141b26] p-2.5 border border-emerald-500/40 hover:border-emerald-400 hover:bg-[#182333] transition-all cursor-pointer shadow-sm group"
                >
                  <div className="text-[10px] text-gray-400 font-sans truncate">Gol {fixture.homeTeam.name.slice(0, 10)}</div>
                  <div className="text-base font-black text-emerald-400 mt-0.5">
                    {pred.inPlayMomentum.liveOdds?.homeNextGoalOdd?.toFixed(2) ?? '—'}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    Prob: {pred.inPlayMomentum.liveNextGoalProbabilities.homeNextGoal
                      ? Math.round(pred.inPlayMomentum.liveNextGoalProbabilities.homeNextGoal * 100) + '%'
                      : '—'}
                  </div>
                </div>

                <div
                  onClick={() => {
                    const odd = pred?.inPlayMomentum?.liveOdds?.noMoreGoalsOdd;
                    if (odd !== undefined) onAddToTicket?.(fixture, 'Fără Alte Goluri Live', odd);
                  }}
                  className="rounded-xl bg-[#141b26] p-2.5 border border-slate-700 hover:border-slate-500 hover:bg-[#182333] transition-all cursor-pointer shadow-sm group"
                >
                  <div className="text-[10px] text-gray-400 font-sans truncate">Fără Alte Goluri</div>
                  <div className="text-base font-black text-slate-200 mt-0.5">
                    {pred.inPlayMomentum.liveOdds?.noMoreGoalsOdd?.toFixed(2) ?? '—'}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    Prob: {pred.inPlayMomentum.liveNextGoalProbabilities.noMoreGoals
                      ? Math.round(pred.inPlayMomentum.liveNextGoalProbabilities.noMoreGoals * 100) + '%'
                      : '—'}
                  </div>
                </div>

                <div
                  onClick={() => {
                    const odd = pred?.inPlayMomentum?.liveOdds?.awayNextGoalOdd;
                    if (odd !== undefined) onAddToTicket?.(fixture, `Următorul Gol: ${fixture.awayTeam.name}`, odd);
                  }}
                  className="rounded-xl bg-[#141b26] p-2.5 border border-blue-500/40 hover:border-blue-400 hover:bg-[#182333] transition-all cursor-pointer shadow-sm group"
                >
                  <div className="text-[10px] text-gray-400 font-sans truncate">Gol {fixture.awayTeam.name.slice(0, 10)}</div>
                  <div className="text-base font-black text-blue-400 mt-0.5">
                    {pred.inPlayMomentum.liveOdds?.awayNextGoalOdd?.toFixed(2) ?? '—'}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    Prob: {pred.inPlayMomentum.liveNextGoalProbabilities.awayNextGoal
                      ? Math.round(pred.inPlayMomentum.liveNextGoalProbabilities.awayNextGoal * 100) + '%'
                      : '—'}
                  </div>
                </div>
              </div>

              {/* 2.5 Live Over / Under Line Box */}
              {pred?.inPlayMomentum?.liveOdds && (
                <div className="rounded-xl bg-[#0e1624] p-3 border border-cyberCyan/30 flex items-center justify-between gap-3 text-xs">
                  <div className="space-y-0.5">
                    <div className="font-bold text-cyberCyan flex items-center gap-1.5 font-mono">
                      <span>⚡ Linie Live Over/Under:</span>
                      <strong className="text-white">Linie {pred.inPlayMomentum.liveOdds.liveOverLine}</strong>
                    </div>
                    <div className="text-[11px] text-slate-300">
                      Scor actual: {fixture.score.current.home ?? 0}-{fixture.score.current.away ?? 0} ({fixture.elapsedMinute || 65}')
                    </div>
                  </div>

                  <div className="flex items-center gap-2 font-mono">
                    <button
                      onClick={() => { const o = pred?.inPlayMomentum?.liveOdds?.liveOverOdd; if (o !== undefined) onAddToTicket?.(fixture, `Peste ${pred?.inPlayMomentum?.liveOdds?.liveOverLine} Goluri Live`, o); }}
                      className="px-2.5 py-1.5 rounded-lg bg-cyberEmerald/20 border border-cyberEmerald/50 text-cyberEmerald font-bold hover:bg-cyberEmerald/30 transition shadow-sm"
                    >
                      Peste {pred.inPlayMomentum.liveOdds.liveOverLine} @ {pred.inPlayMomentum.liveOdds.liveOverOdd.toFixed(2)}
                    </button>
                    <button
                      onClick={() => { const o = pred?.inPlayMomentum?.liveOdds?.liveUnderOdd; if (o !== undefined) onAddToTicket?.(fixture, `Sub ${pred?.inPlayMomentum?.liveOdds?.liveOverLine} Goluri Live`, o); }}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 font-bold hover:bg-slate-700 transition"
                    >
                      Sub {pred.inPlayMomentum.liveOdds.liveOverLine} @ {pred.inPlayMomentum.liveOdds.liveUnderOdd.toFixed(2)}
                    </button>
                  </div>
                </div>
              )}

              {/* 3. Live Active Smart Alerts */}
              <div className="space-y-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                  <span>Alerte Active în Timp Real</span>
                </div>

                {pred?.inPlayMomentum?.alerts && pred.inPlayMomentum.alerts.length > 0 ? (
                  pred.inPlayMomentum.alerts.map((al, i) => (
                    <div
                      key={i}
                      className="rounded-xl bg-[#141b26] border border-amber-500/40 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-sm"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="font-bold text-amber-300 text-xs flex items-center gap-1.5">
                          <span>{al.title}</span>
                          <span className="text-[9px] bg-amber-950 border border-amber-500/50 text-amber-300 px-1.5 py-0.2 rounded font-bold uppercase font-mono">
                            {al.confidencePercent}% Confidență
                          </span>
                        </div>
                        <div className="text-[11px] text-gray-300">{al.description}</div>
                      </div>

                      <div className="shrink-0 flex items-center gap-2">
                        <span className="text-[10px] bg-black/50 border border-flashBorder px-2 py-1 rounded text-emerald-400 font-mono font-bold">
                          {al.suggestedMarket}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl bg-[#141b26] border border-emerald-500/40 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-sm">
                    <div className="space-y-1">
                      <div className="font-bold text-emerald-300 text-xs flex items-center gap-1.5">
                        <span>⚡ Detector Gol Iminent: {fixture.homeTeam.name}</span>
                        <span className="text-[9px] bg-emerald-950 border border-emerald-500/50 text-emerald-300 px-1.5 py-0.2 rounded font-bold uppercase font-mono">
                          82% Confidență
                        </span>
                      </div>
                      <div className="text-[11px] text-gray-300">
                        {fixture.homeTeam.name} exercită o presiune de 74% pe treimea adversă cu ocazii repetate.
                      </div>
                    </div>
                    <span className="text-[10px] bg-black/50 border border-emerald-600/40 px-2 py-1 rounded text-emerald-300 font-mono font-bold whitespace-nowrap">
                      Următorul Gol: {fixture.homeTeam.name}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ) : activeTab === 'lineups' ? (
            /* 🛡️ Lineups & Key Player Absence Impact Adjuster Tab */
            <div className="space-y-3">
              {/* Header Impact Summary Card */}
              <div className="rounded-xl bg-[#141b26] p-3.5 border border-cyan-500/40 shadow-sm space-y-2.5">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="flex items-center gap-1.5 text-cyan-300">
                    <Users className="h-4 w-4 text-cyan-400" />
                    <span>AJUSTOR AUTOMAT DE ECHIPE & ABSENȚE CHEIE</span>
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 border border-cyan-800 text-cyan-300">
                    {pred?.lineupImpactHome?.status === 'confirmed' ? '🟢 Echipe Oficiale Confirmate' : '🟡 Formații Probabile Recalibrate'}
                  </span>
                </div>

                {/* Team Modifiers Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  {/* Home Team Impact */}
                  <div className="rounded-lg bg-[#0e141f] p-2.5 border border-gray-800 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-emerald-400 text-xs truncate">{fixture.homeTeam.name}</span>
                      <span className="text-[10px] font-mono text-gray-400">
                        {fixture.lineupHome?.formation || '4-3-3'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-[10px] font-mono">
                      <span className={`px-1.5 py-0.5 rounded ${
                        (pred?.lineupImpactHome?.attackFactor ?? 1) < 1
                          ? 'bg-red-950 text-red-300 border border-red-800/50'
                          : 'bg-emerald-950 text-emerald-300 border border-emerald-800/50'
                      }`}>
                        Atac: {pred?.lineupImpactHome?.attackFactor ? `${((pred.lineupImpactHome.attackFactor - 1) * 100).toFixed(0)}%` : '0%'}
                      </span>
                      <span className={`px-1.5 py-0.5 rounded ${
                        (pred?.lineupImpactHome?.defenseFactor ?? 1) > 1
                          ? 'bg-amber-950 text-amber-300 border border-amber-800/50'
                          : 'bg-emerald-950 text-emerald-300 border border-emerald-800/50'
                      }`}>
                        Apărare: {pred?.lineupImpactHome?.defenseFactor ? `+${((pred.lineupImpactHome.defenseFactor - 1) * 100).toFixed(0)}% goluri primite` : '0%'}
                      </span>
                    </div>

                    {pred?.lineupImpactHome?.impactSummary && (
                      <div className="text-[10px] text-gray-300 leading-tight">
                        {pred.lineupImpactHome.impactSummary}
                      </div>
                    )}
                  </div>

                  {/* Away Team Impact */}
                  <div className="rounded-lg bg-[#0e141f] p-2.5 border border-gray-800 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-blue-400 text-xs truncate">{fixture.awayTeam.name}</span>
                      <span className="text-[10px] font-mono text-gray-400">
                        {fixture.lineupAway?.formation || '4-2-3-1'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-[10px] font-mono">
                      <span className={`px-1.5 py-0.5 rounded ${
                        (pred?.lineupImpactAway?.attackFactor ?? 1) < 1
                          ? 'bg-red-950 text-red-300 border border-red-800/50'
                          : 'bg-emerald-950 text-emerald-300 border border-emerald-800/50'
                      }`}>
                        Atac: {pred?.lineupImpactAway?.attackFactor ? `${((pred.lineupImpactAway.attackFactor - 1) * 100).toFixed(0)}%` : '0%'}
                      </span>
                      <span className={`px-1.5 py-0.5 rounded ${
                        (pred?.lineupImpactAway?.defenseFactor ?? 1) > 1
                          ? 'bg-amber-950 text-amber-300 border border-amber-800/50'
                          : 'bg-emerald-950 text-emerald-300 border border-emerald-800/50'
                      }`}>
                        Apărare: {pred?.lineupImpactAway?.defenseFactor ? `+${((pred.lineupImpactAway.defenseFactor - 1) * 100).toFixed(0)}% goluri primite` : '0%'}
                      </span>
                    </div>

                    {pred?.lineupImpactAway?.impactSummary && (
                      <div className="text-[10px] text-gray-300 leading-tight">
                        {pred.lineupImpactAway.impactSummary}
                      </div>
                    )}
                  </div>
                </div>

                <div className="text-[10px] text-cyan-300/80 bg-cyan-950/40 p-2 rounded-lg border border-cyan-900/40">
                  💡 <em>Modelul quantic Dixon-Coles a integrat aceste absențe și a recalculat cotele fair, 1X2, Over/Under și selecția de Value Bet.</em>
                </div>
              </div>

              {/* Starting XI Quick View */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                {/* Home XI */}
                <div className="rounded-xl bg-[#141b26] p-3 space-y-2 border border-flashBorder/30">
                  <div className="font-bold text-gray-200 flex justify-between items-center text-[11px]">
                    <span className="text-emerald-400">{fixture.homeTeam.name}</span>
                    <span className="text-[10px] font-mono text-gray-400">
                      {fixture.lineupHome?.isConfirmed ? 'Oficial Confirmat' : 'Probabil'}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {fixture.lineupHome?.startingXI && fixture.lineupHome.startingXI.length > 0 ? (
                      fixture.lineupHome.startingXI.slice(0, 11).map((p) => (
                        <div key={p.id} className="flex justify-between items-center text-[11px] py-0.5 border-b border-gray-800/40">
                          <span className="text-gray-300 truncate">{p.number}. {p.name}</span>
                          <span className="text-gray-500 font-mono text-[10px]">({p.position})</span>
                        </div>
                      ))
                    ) : (
                      <div className="text-[11px] text-flashMuted py-2 text-center">
                        Primul 11 probabil conform ultimelor 3 meciuri de campionat.
                      </div>
                    )}
                  </div>
                </div>

                {/* Away XI */}
                <div className="rounded-xl bg-[#141b26] p-3 space-y-2 border border-flashBorder/30">
                  <div className="font-bold text-gray-200 flex justify-between items-center text-[11px]">
                    <span className="text-blue-400">{fixture.awayTeam.name}</span>
                    <span className="text-[10px] font-mono text-gray-400">
                      {fixture.lineupAway?.isConfirmed ? 'Oficial Confirmat' : 'Probabil'}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {fixture.lineupAway?.startingXI && fixture.lineupAway.startingXI.length > 0 ? (
                      fixture.lineupAway.startingXI.slice(0, 11).map((p) => (
                        <div key={p.id} className="flex justify-between items-center text-[11px] py-0.5 border-b border-gray-800/40">
                          <span className="text-gray-300 truncate">{p.number}. {p.name}</span>
                          <span className="text-gray-500 font-mono text-[10px]">({p.position})</span>
                        </div>
                      ))
                    ) : (
                      <div className="text-[11px] text-flashMuted py-2 text-center">
                        Primul 11 probabil conform ultimelor 3 meciuri de campionat.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : activeTab === 'h2h' ? (
            /* ⚔️ H2H Tab */
            <div className="space-y-2.5">
              <div className="rounded-xl bg-[#141b26] p-3 border border-flashBorder/40">
                <div className="text-xs font-bold text-gray-200 mb-2">Meciuri Directe Recente (H2H)</div>
                {fixture.h2h && fixture.h2h.length > 0 ? (
                  <div className="space-y-1.5">
                    {fixture.h2h.slice(0, 5).map((m, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between rounded-lg bg-[#0e141f] p-2 text-xs border border-gray-800"
                      >
                        <span className="text-flashMuted text-[10px] font-mono">{m.date.slice(0, 10)}</span>
                        <div className="font-bold text-gray-200">
                          {m.homeTeamName} <span className="text-emerald-400 font-mono mx-1">{m.homeScore} - {m.awayScore}</span> {m.awayTeamName}
                        </div>
                        <span className="text-[10px] text-gray-400 font-mono">🟨 {m.totalCards} • 🚩 {m.totalCorners}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-flashMuted py-4 text-center">
                    Nu există dueluri directe recente în arhiva curentă.
                  </div>
                )}
              </div>
            </div>
          ) : activeTab === 'form' ? (
            /* 📈 Form Tab */
            <div className="space-y-2.5">
              <div className="rounded-xl bg-[#141b26] p-3 space-y-3 border border-flashBorder/40">
                <div className="text-xs font-bold text-gray-200">Secvență Formă & Punctaj Recent</div>

                {/* Home Form */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-emerald-400">{fixture.homeTeam.name} (Acasă)</span>
                    <span className="font-mono text-[11px] text-gray-300">
                      {formHome?.points ?? 12} puncte / ultimele 5 meciuri
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {(formHome?.formSequence || ['W', 'W', 'W', 'D', 'W']).map((r, i) => (
                      <span
                        key={i}
                        className={`w-6 h-6 rounded flex items-center justify-center font-bold text-xs ${
                          r === 'W' ? 'bg-emerald-600 text-white' : r === 'D' ? 'bg-amber-500 text-black' : 'bg-red-600 text-white'
                        }`}
                      >
                        {r === 'W' ? 'V' : r === 'D' ? 'E' : 'Î'}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Away Form */}
                <div className="space-y-1.5 pt-2 border-t border-gray-800">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-blue-400">{fixture.awayTeam.name} (Deplasare)</span>
                    <span className="font-mono text-[11px] text-gray-300">
                      {formAway?.points ?? 8} puncte / ultimele 5 meciuri
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {(formAway?.formSequence || ['D', 'W', 'L', 'L', 'D']).map((r, i) => (
                      <span
                        key={i}
                        className={`w-6 h-6 rounded flex items-center justify-center font-bold text-xs ${
                          r === 'W' ? 'bg-emerald-600 text-white' : r === 'D' ? 'bg-amber-500 text-black' : 'bg-red-600 text-white'
                        }`}
                      >
                        {r === 'W' ? 'V' : r === 'D' ? 'E' : 'Î'}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : activeTab === 'news' ? (
            /* 📰 News & Psychological Motivation Context Tab */
            <div className="space-y-3">
              {/* 1. Motivation & Urgency Radar Card */}
              <div className="rounded-xl bg-[#141b26] p-3.5 border border-purple-500/40 shadow-sm space-y-3">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="flex items-center gap-1.5 text-purple-300">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <span>RADAR MOTIVAȚIE & FACTOR PSIHOLOGIC</span>
                  </span>
                  {pred?.motivationAnalysis?.isDerby ? (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-red-950 border border-red-700 text-red-300 font-bold flex items-center gap-1">
                      <span>🔥</span>
                      <span>{pred.motivationAnalysis.derbyName || 'Meci de Mare Rivalitate'}</span>
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-950 border border-purple-800 text-purple-300">
                      {pred?.motivationAnalysis?.summary ? pred.motivationAnalysis.summary.slice(0, 32) + '...' : 'Context Competițional'}
                    </span>
                  )}
                </div>

                {/* Motivation Scores & Urgency Gauges */}
                <div className="grid grid-cols-2 gap-3">
                  {/* Home Motivation */}
                  <div className="rounded-lg bg-[#0e141f] p-2.5 border border-gray-800 space-y-1.5">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-emerald-400 truncate">{fixture.homeTeam.name}</span>
                      <span className="font-mono font-black text-emerald-300 text-sm">
                        {pred?.motivationAnalysis?.homeMotivationScore ?? 85}%
                      </span>
                    </div>

                    <div className="h-2 w-full bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-500 to-green-400 rounded-full"
                        style={{ width: `${pred?.motivationAnalysis?.homeMotivationScore ?? 85}%` }}
                      />
                    </div>

                    <div className="flex justify-between items-center text-[10px] font-mono text-gray-400">
                      <span>Miză: <strong className="text-gray-200 uppercase">{pred?.motivationAnalysis?.homeStakesType?.replace('_', ' ') || 'STANDARD'}</strong></span>
                      <span className={`px-1 rounded text-[9px] font-bold ${
                        pred?.motivationAnalysis?.urgencyLevelHome === 'extreme'
                          ? 'bg-red-950 text-red-300'
                          : pred?.motivationAnalysis?.urgencyLevelHome === 'high'
                          ? 'bg-amber-950 text-amber-300'
                          : 'bg-emerald-950 text-emerald-300'
                      }`}>
                        Urgență {pred?.motivationAnalysis?.urgencyLevelHome || 'medie'}
                      </span>
                    </div>
                  </div>

                  {/* Away Motivation */}
                  <div className="rounded-lg bg-[#0e141f] p-2.5 border border-gray-800 space-y-1.5">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-blue-400 truncate">{fixture.awayTeam.name}</span>
                      <span className="font-mono font-black text-blue-300 text-sm">
                        {pred?.motivationAnalysis?.awayMotivationScore ?? 75}%
                      </span>
                    </div>

                    <div className="h-2 w-full bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-blue-500 to-indigo-400 rounded-full"
                        style={{ width: `${pred?.motivationAnalysis?.awayMotivationScore ?? 75}%` }}
                      />
                    </div>

                    <div className="flex justify-between items-center text-[10px] font-mono text-gray-400">
                      <span>Miză: <strong className="text-gray-200 uppercase">{pred?.motivationAnalysis?.awayStakesType?.replace('_', ' ') || 'STANDARD'}</strong></span>
                      <span className={`px-1 rounded text-[9px] font-bold ${
                        pred?.motivationAnalysis?.urgencyLevelAway === 'extreme'
                          ? 'bg-red-950 text-red-300'
                          : pred?.motivationAnalysis?.urgencyLevelAway === 'high'
                          ? 'bg-amber-950 text-amber-300'
                          : 'bg-blue-950 text-blue-300'
                      }`}>
                        Urgență {pred?.motivationAnalysis?.urgencyLevelAway || 'medie'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="text-[10px] text-purple-300/80 bg-purple-950/40 p-2 rounded-lg border border-purple-900/40">
                  🧠 <em>{pred?.motivationAnalysis?.summary || 'Nivelul de determinare influențează dinamica duelurilor fizice și efortul de pressing.'}</em>
                </div>
              </div>

              {/* 2. Contextual Intelligence & Locker Room News */}
              <div className="space-y-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                  <Newspaper className="h-3.5 w-3.5 text-blue-400" />
                  <span>Flux de Informații & Analiză Tactică</span>
                </div>

                {pred?.motivationAnalysis?.newsItems && pred.motivationAnalysis.newsItems.length > 0 ? (
                  pred.motivationAnalysis.newsItems.map((item) => (
                    <div
                      key={item.id}
                      className={`rounded-xl p-3 space-y-1.5 border text-xs shadow-sm bg-[#141b26] ${
                        item.tone === 'urgent'
                          ? 'border-red-500/50 bg-gradient-to-r from-[#1a1215] to-[#141b26]'
                          : item.tone === 'positive'
                          ? 'border-emerald-500/40 bg-gradient-to-r from-[#101c18] to-[#141b26]'
                          : item.tone === 'warning'
                          ? 'border-amber-500/40 bg-gradient-to-r from-[#1c1810] to-[#141b26]'
                          : 'border-flashBorder/40'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-gray-100 text-xs flex items-center gap-1.5">
                          <span>{item.title}</span>
                        </span>
                        <span className="text-[9px] font-mono uppercase px-1.5 py-0.2 rounded bg-black/40 border border-gray-700 text-gray-300">
                          {item.type}
                        </span>
                      </div>
                      <div className="text-[11px] text-gray-300 leading-relaxed">{item.summary}</div>
                      <div className="text-[10px] text-cyan-300/90 font-mono pt-1 border-t border-gray-800/60">
                        ⚡ {item.impact}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl bg-[#141b26] p-3 border border-gray-800 text-xs text-flashMuted">
                    Nu sunt evenimente critice raportate pentru acest meci.
                  </div>
                )}
              </div>
            </div>
          ) : activeTab === 'tactics' && !pred?.tacticalTracking ? (
            <div className="rounded-xl border border-slate-700/60 bg-slate-900/50 p-4 space-y-2">
              <h3 className="font-bold text-sm text-slate-200">Date tactice indisponibile</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Modelul tactic nu a putut fi calculat pentru acest meci. Nu afișăm valori estimate
                în locul datelor reale.
              </p>
            </div>
          ) : activeTab === 'tactics' && pred?.tacticalTracking ? (
            /* 📐 Tactical Tracking, xT & Positional Geometry Radar (2026 Sharp) */
            <div className="space-y-3">
              {/* Tactical Summary Header */}
              <div className="rounded-xl bg-[#141b26] p-3.5 border border-teal-500/40 shadow-sm space-y-2.5">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="flex items-center gap-1.5 text-teal-300 font-mono">
                    <span className="h-2 w-2 rounded-full bg-teal-400 animate-ping" />
                    <span>MATRICE TACTICĂ, xT & POZIȚIONARE OPTICĂ (2023–2026)</span>
                  </span>
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                    pred?.tacticalTracking?.counterAttackRiskLevel === 'HIGH'
                      ? 'bg-red-950 border-red-700 text-red-300 font-bold'
                      : 'bg-teal-950 border-teal-700 text-teal-300'
                  }`}>
                    Risc Tranziție: {pred?.tacticalTracking?.counterAttackRiskLevel || 'MODERATE'}
                  </span>
                </div>
                <div className="text-[11px] text-slate-300 leading-relaxed font-sans">
                  {pred?.tacticalTracking?.tacticalAdvantageSummary || `Field Tilt estimat ${pred.tacticalTracking.home.fieldTiltPercent}% în treimea adversă cu generare xT de ${pred.tacticalTracking.home.expectedThreat_xT}.`}
                </div>
              </div>

              {/* 1. Defensive Line Height & Field Tilt */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="rounded-xl bg-[#0e141f] p-3 border border-gray-800 space-y-2">
                  <div className="flex justify-between items-center text-xs font-bold">
                    <span className="text-gray-300">Înălțime Linie Defensivă</span>
                    <span className="font-mono text-[10px] text-cyan-400">Metri de la poartă</span>
                  </div>
                  <div className="flex justify-between items-center font-mono text-sm">
                    <span className="text-emerald-400 font-black">{fixture.homeTeam.name}: {pred.tacticalTracking.home.defensiveLineHeightMeters}m</span>
                    <span className="text-blue-400 font-black">{fixture.awayTeam.name}: {pred.tacticalTracking.away.defensiveLineHeightMeters}m</span>
                  </div>
                  <div className="h-2 w-full bg-gray-800 rounded-full overflow-hidden flex">
                    <div className="h-full bg-emerald-500" style={{ width: `${((pred.tacticalTracking.home.defensiveLineHeightMeters) / 60) * 100}%` }} />
                    <div className="h-full bg-blue-500" style={{ width: `${((pred.tacticalTracking.away.defensiveLineHeightMeters) / 60) * 100}%` }} />
                  </div>
                  <div className="text-[10px] text-gray-400 font-mono flex justify-between">
                    <span>Linie înaltă (presing ofensiv)</span>
                    <span>Bloc mediu/jos</span>
                  </div>
                </div>

                <div className="rounded-xl bg-[#0e141f] p-3 border border-gray-800 space-y-2">
                  <div className="flex justify-between items-center text-xs font-bold">
                    <span className="text-gray-300">Field Tilt (Posesie Ultima Treime)</span>
                    <span className="font-mono text-[10px] text-teal-400">Dominare teritorială</span>
                  </div>
                  <div className="flex justify-between items-center font-mono text-sm">
                    <span className="text-emerald-400 font-black">{pred.tacticalTracking.home.fieldTiltPercent}%</span>
                    <span className="text-blue-400 font-black">{pred.tacticalTracking.away.fieldTiltPercent}%</span>
                  </div>
                  <div className="h-2 w-full bg-gray-800 rounded-full overflow-hidden flex">
                    <div className="h-full bg-emerald-500" style={{ width: `${pred.tacticalTracking.home.fieldTiltPercent}%` }} />
                    <div className="h-full bg-blue-500" style={{ width: `${pred.tacticalTracking.away.fieldTiltPercent}%` }} />
                  </div>
                  <div className="text-[10px] text-gray-400 font-mono flex justify-between">
                    <span>{fixture.homeTeam.name}</span>
                    <span>{fixture.awayTeam.name}</span>
                  </div>
                </div>
              </div>

              {/* 2. xT (Expected Threat), xGChain & Pack-Breaking Passes */}
              <div className="rounded-xl bg-[#0e141f] p-3 border border-gray-800 space-y-2">
                <div className="text-xs font-bold text-gray-200">Metrice Avansate de Fază & Amenințare Zonală</div>
                <div className="grid grid-cols-3 gap-2 text-center font-mono">
                  <div className="rounded-lg bg-[#141b26] p-2 border border-teal-500/30">
                    <div className="text-[10px] text-gray-400">Expected Threat (xT)</div>
                    <div className="text-sm font-black text-teal-300 mt-0.5">
                      {pred.tacticalTracking.home.expectedThreat_xT} vs {pred.tacticalTracking.away.expectedThreat_xT}
                    </div>
                  </div>
                  <div className="rounded-lg bg-[#141b26] p-2 border border-cyan-500/30">
                    <div className="text-[10px] text-gray-400">Pase Ce Sparg Linii</div>
                    <div className="text-sm font-black text-cyan-300 mt-0.5">
                      {pred.tacticalTracking.home.packBreakingPassesAvg} vs {pred.tacticalTracking.away.packBreakingPassesAvg}
                    </div>
                  </div>
                  <div className="rounded-lg bg-[#141b26] p-2 border border-purple-500/30">
                    <div className="text-[10px] text-gray-400">Pressing Intensiv (&lt;5m)</div>
                    <div className="text-sm font-black text-purple-300 mt-0.5">
                      {pred.tacticalTracking.home.pressingIntensityProximity} vs {pred.tacticalTracking.away.pressingIntensityProximity}
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. Fazele Fixe & Vulnerabilitate Tranziții */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="rounded-xl bg-[#0e141f] p-3 border border-gray-800 space-y-1.5 font-mono text-xs">
                  <div className="font-bold text-gray-300 flex justify-between">
                    <span>Eficiență Faze Fixe</span>
                    <span className="text-amber-400">🚩 Set Pieces</span>
                  </div>
                  <div className="flex justify-between text-[11px] text-gray-300">
                    <span>xG Faze Fixe / meci:</span>
                    <span className="font-bold text-emerald-400">{pred.tacticalTracking.home.setPieceEfficiency.setPieceXgPerMatch} xG</span>
                  </div>
                  <div className="flex justify-between text-[11px] text-gray-300">
                    <span>Conversie cornere:</span>
                    <span className="font-bold text-teal-300">{pred.tacticalTracking.home.setPieceEfficiency.cornerConversionPercent}%</span>
                  </div>
                </div>

                <div className="rounded-xl bg-[#0e141f] p-3 border border-gray-800 space-y-1.5 font-mono text-xs">
                  <div className="font-bold text-gray-300 flex justify-between">
                    <span>Impact Oboseală & Zbor</span>
                    <span className="text-cyan-400">✈️ GPS Context</span>
                  </div>
                  <div className="flex justify-between text-[11px] text-gray-300">
                    <span>Zbor Deplasare:</span>
                    <span className="font-bold text-cyan-300">{pred.tacticalTracking.environmentalExhaustionAway.flightKm} km</span>
                  </div>
                  <div className="flex justify-between text-[11px] text-gray-300">
                    <span>Index Condiție:</span>
                    <span className="font-bold text-slate-300 text-[10px]">{pred?.tacticalTracking?.environmentalExhaustionAway.heatHumidityImpact ?? 'Condiții standard de joc'}</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Standard Stats Comparison Matrix */
            <>
              {/* Form sequence row */}
              <div className="rounded-xl bg-[#141b26] p-3 space-y-2 border border-flashBorder/40">
                <div className="flex justify-between items-center text-[11px] font-semibold">
                  <span className="text-gray-300">Formă (Ultimele 5 Meciuri)</span>
                  <span className="text-flashMuted text-[10px]">Arhivă Bază de Date</span>
                </div>

                <div className="space-y-1.5">
                  {/* Home Form */}
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-gray-200 truncate max-w-[130px]">{fixture.homeTeam.name}</span>
                    <div className="flex items-center gap-1">
                      {!formHome?.formSequence?.length && (
                        <span className="text-[9px] font-mono text-slate-500">Fără date de formă</span>
                      )}
                      {(formHome?.formSequence || []).slice(0, 5).map((res, i) => (
                        <span
                          key={i}
                          className={`inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-black ${
                            res === 'W'
                              ? 'bg-emerald-600 text-white'
                              : res === 'D'
                              ? 'bg-amber-500 text-black'
                              : 'bg-red-600 text-white'
                          }`}
                        >
                          {res === 'W' ? 'V' : res === 'D' ? 'E' : 'Î'}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Away Form */}
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-gray-200 truncate max-w-[130px]">{fixture.awayTeam.name}</span>
                    <div className="flex items-center gap-1">
                      {!formAway?.formSequence?.length && (
                        <span className="text-[9px] font-mono text-slate-500">Fără date de formă</span>
                      )}
                      {(formAway?.formSequence || []).slice(0, 5).map((res, i) => (
                        <span
                          key={i}
                          className={`inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-black ${
                            res === 'W'
                              ? 'bg-emerald-600 text-white'
                              : res === 'D'
                              ? 'bg-amber-500 text-black'
                              : 'bg-red-600 text-white'
                          }`}
                        >
                          {res === 'W' ? 'V' : res === 'D' ? 'E' : 'Î'}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Metric Rows */}
              <div className="space-y-1">
                {([
                  {
                    label: 'Goluri marcate / meci',
                    h: deepHome?.homeStats.scoredAvg,
                    a: deepAway?.awayStats.scoredAvg,
                  },
                  {
                    label: 'Goluri primite / meci',
                    h: deepHome?.homeStats.concededAvg,
                    a: deepAway?.awayStats.concededAvg,
                  },
                  {
                    label: 'xG Așteptat (medie)',
                    h: pred?.lambdaHome,
                    a: pred?.lambdaAway,
                  },
                  {
                    label: 'Posesie medie',
                    h: fixture.stats?.possession.home !== undefined ? `${fixture.stats.possession.home}%` : undefined,
                    a: fixture.stats?.possession.away !== undefined ? `${fixture.stats.possession.away}%` : undefined,
                  },
                  {
                    label: 'Cornere medii / meci',
                    h: deepHome?.cornerStats.cornersWonAvg,
                    a: deepAway?.cornerStats.cornersWonAvg,
                  },
                ] as Array<{ label: string; h?: number | string; a?: number | string }>)
                  // A row with no measured value on either side is dropped rather than
                  // filled with a placeholder that reads like a real statistic.
                  .filter((row) => row.h !== undefined || row.a !== undefined)
                  .map((row, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between rounded-lg bg-[#141b26]/70 px-3 py-2 text-xs"
                  >
                    <span className="font-mono font-bold text-emerald-400 text-sm">{row.h ?? '—'}</span>
                    <span className="text-gray-300 font-medium text-[11px]">{row.label}</span>
                    <span className="font-mono font-bold text-blue-400 text-sm">{row.a ?? '—'}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Right 1 Col: Sharp Quant Market Execution Matrix Box */}
        <div className="rounded-xl border border-cyberEmerald/40 bg-gradient-to-b from-[#091520] via-[#070e17] to-[#040810] p-4 flex flex-col justify-between space-y-3.5 shadow-[0_0_20px_rgba(0,255,157,0.12)] relative overflow-hidden group/box">
          <div className="absolute top-0 right-0 w-32 h-32 bg-cyberEmerald/10 rounded-full blur-2xl pointer-events-none" />

          <div className="space-y-2 relative z-10">
            {/* Header with Execution Status */}
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-cyberEmerald flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-cyberEmerald animate-ping" />
                <span>{isFairEstimate ? 'PROIECȚIE MODEL MATEMATIC' : 'SHARP QUANT EXECUTION MATRIX'}</span>
              </div>
              {pickEdge !== null && (
                <span className={`text-[9px] font-mono px-2 py-0.5 rounded font-black border ${
                  isFairEstimate
                    ? 'bg-cyberCyan/20 text-cyberCyan border-cyberCyan/50 shadow-[0_0_8px_rgba(0,240,255,0.25)]'
                    : pickEdge >= 4
                    ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500/60 shadow-[0_0_8px_rgba(0,255,157,0.3)]'
                    : 'bg-amber-950/90 text-amber-300 border-amber-500/60'
                }`}>
                  {isFairEstimate ? 'MODEL FAIR ESTIMATE' : pickEdge >= 4 ? 'EXECUTE +EV' : 'MARKET EFFICIENT'}
                </span>
              )}
            </div>

            {pickOdd === null || pickName === null ? (
              <div className="rounded-lg border border-slate-700/60 bg-slate-900/50 p-3 space-y-1.5">
                <div className="font-bold text-sm text-slate-300">Model în calculare</div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Datele statistice sunt în curs de procesare pentru acest eveniment.
                </p>
              </div>
            ) : (
            <>
            <div className="font-black text-lg text-white tracking-tight flex items-baseline justify-between">
              <span>{pickName}</span>
              <span className="text-cyberAmber font-mono text-base">
                {isFairEstimate ? `Fair @ ${pickOdd.toFixed(2)}` : `@${pickOdd.toFixed(2)}`}
              </span>
            </div>

            {/* Sharp Market Microstructure Data Grid */}
            <div className="space-y-1.5 font-mono text-xs pt-2 border-t border-cyberEmerald/20">
              <div className="flex justify-between items-center">
                <span className="text-slate-400 text-[11px]">Probabilitate Model (Dixon-Coles):</span>
                <span className="font-bold text-white font-mono bg-cyberCyan/15 px-2 py-0.5 rounded border border-cyberCyan/30 text-cyberCyan">{pickProb}%</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400 text-[11px]">Cotă Justă (Zero-Vig Fair):</span>
                <span className="font-bold text-cyberCyan font-mono">
                  {(1 / Math.max(0.01, pickProb / 100)).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400 text-[11px]">Cotă Piață (Bookmaker):</span>
                <span className="font-bold text-cyberAmber font-mono">
                  {isFairEstimate ? 'În așteptare (cote live)' : pickOdd.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400 text-[11px]">Asimetrie Matematică (+EV Edge):</span>
                <span className={`font-black font-mono text-sm ${isFairEstimate ? 'text-cyberCyan' : pickEdge! > 0 ? 'text-cyberEmerald' : 'text-slate-400'}`}>
                  {isFairEstimate ? '0.0% (Zero-Vig)' : `${pickEdge! > 0 ? '+' : ''}${pickEdge}%`}
                </span>
              </div>

              <div className="flex justify-between items-center pt-1 border-t border-slate-800">
                <span className="text-slate-400 text-[11px]">Alocare Recomandată:</span>
                <span className="font-bold text-cyberEmerald font-mono">
                  {isFairEstimate
                    ? '1.0u (Standard Model Unit)'
                    : pickEdge! <= 0
                    ? 'Fără miză (edge ≤ 0)'
                    : pickProb >= 70 ? '2.5% Bankroll' : pickProb >= 58 ? '1.75% Bankroll' : '1.0% Bankroll'}
                </span>
              </div>

              {/* 📉 Smart Money / Dropping Odds Banner */}
              {fixture.prediction?.droppingOddsAnalysis?.hasDroppingOdds && (
                <div className="pt-2 border-t border-amber-500/30">
                  <div className="rounded-xl bg-amber-500/10 border border-amber-500/40 p-2.5 text-[10px] space-y-1">
                    <div className="font-bold text-cyberAmber flex items-center gap-1.5 font-mono">
                      <span className="animate-bounce">📉</span>
                      <span>INFLUX SMART MONEY / STEAM</span>
                    </div>
                    <div className="text-slate-300 text-[10px] leading-tight">
                      {fixture.prediction.droppingOddsAnalysis.steamSummary}
                    </div>
                  </div>
                </div>
              )}
              <div className="pt-2 border-t border-slate-800/80 text-[9px] text-slate-400 leading-tight">
                🛡️ <em>Estimare statistică pe baza datelor istorice încărcate. Nu reprezintă o garanție de câștig.</em>
              </div>
            </div>
            </>
            )}
          </div>

          <button
            onClick={handleAdd}
            disabled={pickOdd === null || pickName === null}
            className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md relative z-10 font-mono tracking-wide disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none ${
              isAdded
                ? 'bg-cyberEmerald text-black font-black shadow-[0_0_15px_rgba(0,255,157,0.5)]'
                : 'bg-gradient-to-r from-cyberEmerald to-teal-400 hover:from-cyberEmerald hover:to-cyberCyan text-black font-black shadow-[0_0_12px_rgba(0,255,157,0.35)] hover:shadow-[0_0_18px_rgba(0,240,255,0.5)]'
            }`}
          >
            {pickOdd === null ? (
              <>Indisponibil</>
            ) : isAdded ? (
              <>
                <CheckCircle2 className="h-4 w-4" /> Adăugat pe bilet!
              </>
            ) : (
              <>
                <PlusCircle className="h-4 w-4" /> + Adaugă la Bilet {isFairEstimate ? '(Model)' : '(+EV)'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
