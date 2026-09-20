'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { X, Activity, History, Users, Sparkles, Flame, ShieldAlert, Award, TrendingUp, RefreshCw, BarChart2, Radio, Zap, Database, Target, Clock, PieChart, Flag, Shield } from 'lucide-react';
import { calculateInPlayMomentum } from '@/engine/inPlayMomentum';
import type { Fixture } from '@/types/football';

interface MatchModalProps {
  fixture: Fixture | null;
  onClose: () => void;
}

export default function MatchModal({ fixture, onClose }: MatchModalProps) {
  const [activeTab, setActiveTab] = useState<'stats' | 'h2h' | 'lineups' | 'radar' | 'tactics'>('stats');
  const [currentFixture, setCurrentFixture] = useState<Fixture | null>(fixture);
  const [isLoadingDetails, setIsLoadingDetails] = useState<boolean>(false);

  // Sync fixture prop and fetch on-demand enriched details
  useEffect(() => {
    if (!fixture) {
      setCurrentFixture(null);
      return;
    }

    setCurrentFixture(fixture);
    setIsLoadingDetails(true);

    let isMounted = true;
    fetch(`/api/predictions/${fixture.id}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (isMounted && data.fixture) {
          setCurrentFixture((prev) => {
            if (!prev) return data.fixture;
            return {
              ...prev,
              ...data.fixture,
              prediction: data.prediction ?? prev.prediction,
              odds: data.fixture.odds ?? prev.odds,
              h2h: (data.fixture.h2h && data.fixture.h2h.length > 0) ? data.fixture.h2h : prev.h2h,
              stats: data.fixture.stats ?? prev.stats,
              lineupHome: data.fixture.lineupHome ?? prev.lineupHome,
              lineupAway: data.fixture.lineupAway ?? prev.lineupAway,
              referee: data.fixture.referee ?? prev.referee,
              formHome: data.fixture.formHome ?? prev.formHome,
              formAway: data.fixture.formAway ?? prev.formAway,
              homeAwayStatsHome: data.fixture.homeAwayStatsHome ?? prev.homeAwayStatsHome,
              homeAwayStatsAway: data.fixture.homeAwayStatsAway ?? prev.homeAwayStatsAway,
              standingHome: data.fixture.standingHome ?? prev.standingHome,
              standingAway: data.fixture.standingAway ?? prev.standingAway,
              deepStatsHome: data.fixture.deepStatsHome ?? prev.deepStatsHome,
              deepStatsAway: data.fixture.deepStatsAway ?? prev.deepStatsAway,
              h2hTactical: data.fixture.h2hTactical ?? prev.h2hTactical,
            };
          });
        }
      })
      .catch((err) => {
        console.warn('[MatchModal] On-demand details fetch notice:', err.message);
      })
      .finally(() => {
        if (isMounted) setIsLoadingDetails(false);
      });

    return () => {
      isMounted = false;
    };
  }, [fixture?.id]);

  // H2H Aggregates Calculation
  const h2hSummary = useMemo(() => {
    const list = currentFixture?.h2h || [];
    if (list.length === 0) return null;

    const homeTeam = currentFixture?.homeTeam.name.toLowerCase() || '';
    let homeWins = 0;
    let awayWins = 0;
    let draws = 0;
    let totalGoals = 0;
    let totalCards = 0;
    let totalCorners = 0;

    for (const m of list) {
      totalGoals += m.homeScore + m.awayScore;
      totalCards += m.totalCards;
      totalCorners += m.totalCorners;

      const mHome = m.homeTeamName.toLowerCase();
      const isHomeFirst = homeTeam.includes(mHome) || mHome.includes(homeTeam);

      if (m.homeScore === m.awayScore) {
        draws++;
      } else if (m.homeScore > m.awayScore) {
        if (isHomeFirst) homeWins++;
        else awayWins++;
      } else {
        if (isHomeFirst) awayWins++;
        else homeWins++;
      }
    }

    return {
      totalMatches: list.length,
      homeWins,
      draws,
      awayWins,
      avgGoals: (totalGoals / list.length).toFixed(1),
      avgCards: (totalCards / list.length).toFixed(1),
      avgCorners: (totalCorners / list.length).toFixed(1),
    };
  }, [currentFixture]);

  // Live In-Play Momentum & Imminent Goal Detection
  const liveMomentum = useMemo(() => {
    if (currentFixture?.prediction?.inPlayMomentum) {
      return currentFixture.prediction.inPlayMomentum;
    }
    // Recomputing needs the pre-match lambdas. Without them the result would rest on
    // assumed league averages, so we return nothing instead of a plausible-looking guess.
    if (currentFixture?.stats && currentFixture.prediction) {
      return calculateInPlayMomentum({
        stats: currentFixture.stats,
        elapsedMinute: currentFixture.elapsedMinute || (currentFixture.status === 'HT' ? 45 : currentFixture.status === 'FT' ? 90 : 0),
        status: currentFixture.status,
        currentScore: {
          home: currentFixture.score?.current?.home ?? 0,
          away: currentFixture.score?.current?.away ?? 0,
        },
        homeTeamName: currentFixture.homeTeam.name,
        awayTeamName: currentFixture.awayTeam.name,
        prematchLambdaHome: currentFixture.prediction.lambdaHome,
        prematchLambdaAway: currentFixture.prediction.lambdaAway,
      });
    }
    return null;
  }, [currentFixture]);

  if (!fixture || !currentFixture) return null;

  const pred = currentFixture.prediction;
  const odds = currentFixture.odds;
  const isLive = ['1H', 'HT', '2H', 'ET', 'P'].includes(currentFixture.status);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-4xl rounded-3xl border border-cyberCyan/30 bg-[#070c14]/95 text-slate-100 shadow-[0_0_50px_rgba(0,240,255,0.15)] my-8 overflow-hidden backdrop-blur-2xl">
        {/* Ambient glow in modal */}
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-cyberCyan/10 rounded-full blur-3xl pointer-events-none -z-0" />
        <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-cyberEmerald/10 rounded-full blur-3xl pointer-events-none -z-0" />

        {/* Modal Top Header with League & Close */}
        <div className="flex items-center justify-between border-b border-cyberCyan/20 bg-[#0a111e]/90 px-5 py-3.5 relative z-10">
          <div className="flex items-center gap-2.5 text-xs font-semibold text-slate-300 font-mono">
            {currentFixture.league.flag && currentFixture.league.flag.startsWith('http') ? (
              <img
                src={currentFixture.league.flag}
                alt={currentFixture.league.country || ''}
                className="h-3.5 w-5 object-cover rounded-[2px]"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            ) : (
              <span>{currentFixture.league.flag || '⚽'}</span>
            )}
            <span className="text-white font-bold">{currentFixture.league.country}: {currentFixture.league.name}</span>
            {currentFixture.league.round && <span className="text-slate-400">• {currentFixture.league.round}</span>}
            {isLoadingDetails && (
              <span className="flex items-center gap-1.5 text-[11px] text-cyberEmerald animate-pulse font-normal ml-2">
                <RefreshCw className="h-3 w-3 animate-spin" /> Sincronizare matrici...
              </span>
            )}
          </div>

          <button
            onClick={onClose}
            className="rounded-xl p-1.5 text-slate-400 hover:bg-cyberCyan/20 hover:text-white transition-all border border-transparent hover:border-cyberCyan/30"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Match Scoreboard Banner */}
        <div className="border-b border-cyberCyan/20 bg-gradient-to-b from-[#0e1728] via-[#09111e] to-[#060b14] p-6 relative z-10">
          <div className="grid grid-cols-3 items-center text-center">
            {/* Home Team */}
            <div className="space-y-1.5 text-right sm:text-center">
              <h2 className="text-base sm:text-xl font-black text-white tracking-tight">{currentFixture.homeTeam.name}</h2>
              <div className="flex items-center justify-end sm:justify-center gap-1.5 flex-wrap">
                {currentFixture.standingHome && (
                  <span className={`inline-block rounded-lg px-2 py-0.5 text-[10px] font-bold font-mono ${
                    currentFixture.standingHome.zone === 'champions_league'
                      ? 'bg-cyberCyan/15 border border-cyberCyan/50 text-cyberCyan'
                      : currentFixture.standingHome.zone === 'relegation'
                      ? 'bg-cyberRose/15 border border-cyberRose/50 text-cyberRose'
                      : 'bg-slate-800 text-slate-300'
                  }`}>
                    Loc {currentFixture.standingHome.rank} • {currentFixture.standingHome.points}p
                  </span>
                )}
                {currentFixture.stats?.redCards?.home ? (
                  <span className="inline-block rounded-md bg-cyberRose/30 border border-cyberRose px-2 py-0.2 text-[10px] font-bold text-cyberRose font-mono">
                    🟥 {currentFixture.stats.redCards.home}
                  </span>
                ) : null}
              </div>
            </div>

            {/* Score / Status */}
            <div className="space-y-1.5">
              {currentFixture.score.current.home !== null && currentFixture.score.current.away !== null ? (
                <div className="font-mono text-3xl sm:text-5xl font-black text-white tracking-wider drop-shadow-[0_0_12px_rgba(255,255,255,0.3)]">
                  {currentFixture.score.current.home} : {currentFixture.score.current.away}
                </div>
              ) : (
                <div className="font-mono text-2xl sm:text-3xl font-black text-cyberCyan drop-shadow-[0_0_10px_#00f0ff]">
                  {new Date(currentFixture.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              )}

              <div>
                {isLive ? (
                  <span className="rounded-full bg-cyberRose/20 border border-cyberRose/60 px-3 py-1 text-xs font-bold text-cyberRose animate-pulse font-mono shadow-[0_0_10px_rgba(255,0,85,0.4)]">
                    {currentFixture.status === 'HT' ? 'Pauză' : `Minutul ${currentFixture.elapsedMinute}'`}
                  </span>
                ) : currentFixture.status === 'FT' ? (
                  <span className="text-xs font-semibold text-slate-400 font-mono">Final de Meci</span>
                ) : (
                  <span className="text-xs font-medium text-slate-400 font-mono">Urmează</span>
                )}
              </div>
            </div>

            {/* Away Team */}
            <div className="space-y-1.5 text-left sm:text-center">
              <h2 className="text-base sm:text-xl font-black text-white tracking-tight">{currentFixture.awayTeam.name}</h2>
              <div className="flex items-center justify-start sm:justify-center gap-1.5 flex-wrap">
                {currentFixture.standingAway && (
                  <span className={`inline-block rounded-lg px-2 py-0.5 text-[10px] font-bold font-mono ${
                    currentFixture.standingAway.zone === 'champions_league'
                      ? 'bg-cyberCyan/15 border border-cyberCyan/50 text-cyberCyan'
                      : currentFixture.standingAway.zone === 'relegation'
                      ? 'bg-cyberRose/15 border border-cyberRose/50 text-cyberRose'
                      : 'bg-slate-800 text-slate-300'
                  }`}>
                    Loc {currentFixture.standingAway.rank} • {currentFixture.standingAway.points}p
                  </span>
                )}
                {currentFixture.stats?.redCards?.away ? (
                  <span className="inline-block rounded-md bg-cyberRose/30 border border-cyberRose px-2 py-0.2 text-[10px] font-bold text-cyberRose font-mono">
                    🟥 {currentFixture.stats.redCards.away}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {/* 4 Tabs Navigation */}
        <div className="flex border-b border-cyberCyan/20 bg-[#09101c] text-xs font-semibold relative z-10 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setActiveTab('stats')}
            className={`flex-1 flex items-center justify-center gap-2 py-3.5 transition-all border-b-2 whitespace-nowrap px-3 ${
              activeTab === 'stats'
                ? 'border-cyberCyan text-cyberCyan bg-cyberCyan/10 shadow-[inset_0_-2px_8px_rgba(0,240,255,0.2)]'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Activity className="h-4 w-4" />
            <span>Sinteză & Live Stats</span>
          </button>

          <button
            onClick={() => setActiveTab('h2h')}
            className={`flex-1 flex items-center justify-center gap-2 py-3.5 transition-all border-b-2 whitespace-nowrap px-3 ${
              activeTab === 'h2h'
                ? 'border-cyberCyan text-cyberCyan bg-cyberCyan/10 shadow-[inset_0_-2px_8px_rgba(0,240,255,0.2)]'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <History className="h-4 w-4" />
            <span>Istoric H2H {currentFixture.h2h ? `(${currentFixture.h2h.length})` : ''}</span>
          </button>

          <button
            onClick={() => setActiveTab('lineups')}
            className={`flex-1 flex items-center justify-center gap-2 py-3.5 transition-all border-b-2 whitespace-nowrap px-3 ${
              activeTab === 'lineups'
                ? 'border-cyberCyan text-cyberCyan bg-cyberCyan/10 shadow-[inset_0_-2px_8px_rgba(0,240,255,0.2)]'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users className="h-4 w-4" />
            <span>Jucători & Cartonașe</span>
          </button>

          <button
            onClick={() => setActiveTab('radar')}
            className={`flex-1 flex items-center justify-center gap-2 py-3.5 transition-all border-b-2 whitespace-nowrap px-3 ${
              activeTab === 'radar'
                ? 'border-cyberAmber text-cyberAmber bg-cyberAmber/10 shadow-[inset_0_-2px_8px_rgba(255,183,3,0.25)]'
                : 'border-transparent text-slate-400 hover:text-cyberAmber'
            }`}
          >
            <Sparkles className="h-4 w-4 text-cyberAmber" />
            <span className="font-bold">AI Betting Radar</span>
          </button>

          <button
            onClick={() => setActiveTab('tactics')}
            className={`flex-1 flex items-center justify-center gap-2 py-3.5 transition-all border-b-2 whitespace-nowrap px-3 ${
              activeTab === 'tactics'
                ? 'border-cyberEmerald text-cyberEmerald bg-cyberEmerald/10 shadow-[inset_0_-2px_8px_rgba(0,255,157,0.25)]'
                : 'border-transparent text-slate-400 hover:text-cyberEmerald'
            }`}
          >
            <Zap className="h-4 w-4 text-cyberEmerald" />
            <span className="font-bold">xT & Tracking (2026 Sharp)</span>
          </button>
        </div>

        {/* Modal Tab Content */}
        <div className="p-6 max-h-[60vh] overflow-y-auto space-y-6">
          {/* TAB 1: Sinteza & Live / Pre-Match Stats */}
          {activeTab === 'stats' && (
            <div className="space-y-6">
              {/* In-Play Momentum Tracker & Imminent Goal Detector */}
              {liveMomentum && (
                <div className="rounded-xl border border-flashBorder bg-flashCard p-4 space-y-4 shadow-sm">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <Radio className="h-4 w-4 text-flashRed animate-pulse" />
                      <span className="font-bold text-xs text-gray-200">
                        In-Play Momentum & Presiune Ofensivă {isLive ? `(Min ${currentFixture.elapsedMinute ?? (currentFixture.status === 'HT' ? 'Pauză' : '-')})` : ''}
                      </span>
                    </div>
                    <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                      liveMomentum.dominantTeam === 'home'
                        ? 'bg-emerald-950/80 border border-emerald-700/60 text-emerald-300'
                        : liveMomentum.dominantTeam === 'away'
                        ? 'bg-blue-950/80 border border-blue-700/60 text-blue-300'
                        : 'bg-gray-800 text-gray-300'
                    }`}>
                      {liveMomentum.dominantTeam === 'home'
                        ? `⚡ Dominare ${currentFixture.homeTeam.name}`
                        : liveMomentum.dominantTeam === 'away'
                        ? `⚡ Dominare ${currentFixture.awayTeam.name}`
                        : '⚖️ Joc Echilibrat la Mijloc'}
                    </span>
                  </div>

                  {/* Visual Momentum Split Bar */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-xs font-mono font-bold">
                      <span className="text-emerald-400">{currentFixture.homeTeam.name} {liveMomentum.homeMomentum}%</span>
                      <span className="text-[10px] text-flashMuted font-sans">
                        Diferențial: {liveMomentum.pressureDifferential > 0 ? `+${liveMomentum.pressureDifferential}` : liveMomentum.pressureDifferential}%
                      </span>
                      <span className="text-blue-400">{liveMomentum.awayMomentum}% {currentFixture.awayTeam.name}</span>
                    </div>
                    <div className="flex h-3 overflow-hidden rounded-full bg-gray-900 border border-gray-800 p-0.5">
                      <div
                        className="bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-l-full transition-all duration-500"
                        style={{ width: `${liveMomentum.homeMomentum}%` }}
                      />
                      <div
                        className="bg-gradient-to-r from-blue-400 to-blue-600 rounded-r-full transition-all duration-500"
                        style={{ width: `${liveMomentum.awayMomentum}%` }}
                      />
                    </div>
                  </div>

                  {/* Smart Alerts */}
                  {liveMomentum.alerts && liveMomentum.alerts.length > 0 && (
                    <div className="space-y-2 pt-1">
                      {liveMomentum.alerts.map((alert) => (
                        <div
                          key={alert.id}
                          className={`rounded-lg p-3 text-xs border transition flex items-start gap-2.5 ${
                            alert.type === 'imminent_goal'
                              ? 'bg-red-950/30 border-red-500/50 text-red-200'
                              : alert.type === 'comeback_surge'
                              ? 'bg-amber-950/30 border-amber-500/50 text-amber-200'
                              : alert.type === 'card_tension'
                              ? 'bg-yellow-950/30 border-yellow-500/50 text-yellow-200'
                              : 'bg-slate-900 border-slate-700 text-slate-300'
                          }`}
                        >
                          {alert.type === 'imminent_goal' ? (
                            <Zap className="h-4 w-4 text-red-400 shrink-0 mt-0.5 animate-bounce" />
                          ) : alert.type === 'comeback_surge' ? (
                            <Flame className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                          ) : alert.type === 'card_tension' ? (
                            <ShieldAlert className="h-4 w-4 text-yellow-400 shrink-0 mt-0.5" />
                          ) : (
                            <Activity className="h-4 w-4 text-cyan-400 shrink-0 mt-0.5" />
                          )}
                          <div className="flex-1 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-gray-100">{alert.title}</span>
                              <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-black/40 text-gray-300">
                                Încredere {alert.confidencePercent}%
                              </span>
                            </div>
                            <p className="text-[11px] text-gray-300 leading-relaxed">{alert.description}</p>
                            <div className="pt-1 flex items-center gap-1.5 text-[10px] flex-wrap">
                              <span className="text-flashMuted">Piață Recomandată Live:</span>
                              <span className="font-mono font-bold text-amber-300 bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-800/60">
                                {alert.suggestedMarket}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* In-Play Poisson Projections Box */}
                  <div className="rounded-lg bg-[#111722] p-3 space-y-2 border border-flashBorder/40">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-gray-300">Proiecție Live: Golul Următor & Final de Meci</span>
                      <span className="text-[10px] text-flashMuted font-mono">
                        λ Rămas: {liveMomentum.expectedRemainingGoals} goluri
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                      <div className="rounded bg-[#161e2b] p-2">
                        <div className="text-[10px] text-flashMuted">Minim 1 Gol Până la Final</div>
                        <div className="font-mono text-sm font-black text-emerald-400">
                          {(liveMomentum.liveNextGoalProbabilities.atLeastOneMoreGoal * 100).toFixed(1)}%
                        </div>
                      </div>
                      <div className="rounded bg-[#161e2b] p-2">
                        <div className="text-[10px] text-flashMuted">Următorul Gol: {currentFixture.homeTeam.name.slice(0, 10)}</div>
                        <div className="font-mono text-sm font-black text-flashGreen">
                          {(liveMomentum.liveNextGoalProbabilities.homeNextGoal * 100).toFixed(1)}%
                        </div>
                      </div>
                      <div className="rounded bg-[#161e2b] p-2">
                        <div className="text-[10px] text-flashMuted">Următorul Gol: {currentFixture.awayTeam.name.slice(0, 10)}</div>
                        <div className="font-mono text-sm font-black text-flashBlue">
                          {(liveMomentum.liveNextGoalProbabilities.awayNextGoal * 100).toFixed(1)}%
                        </div>
                      </div>
                      <div className="rounded bg-[#161e2b] p-2">
                        <div className="text-[10px] text-flashMuted">Fără Alte Goluri (Scor Înghețat)</div>
                        <div className="font-mono text-sm font-black text-amber-400">
                          {(liveMomentum.liveNextGoalProbabilities.noMoreGoals * 100).toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {currentFixture.stats ? (
                <div className="space-y-4">
                  {/* Possession */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs font-semibold">
                      <span>{currentFixture.stats.possession.home}%</span>
                      <span className="text-flashMuted">Posesie</span>
                      <span>{currentFixture.stats.possession.away}%</span>
                    </div>
                    <div className="flex h-2 overflow-hidden rounded-full bg-gray-800">
                      <div
                        className="bg-flashGreen"
                        style={{ width: `${currentFixture.stats.possession.home}%` }}
                      />
                      <div
                        className="bg-flashBlue"
                        style={{ width: `${currentFixture.stats.possession.away}%` }}
                      />
                    </div>
                  </div>

                  {/* Stat Rows */}
                  {[
                    { label: 'Expected Goals (xG)', h: currentFixture.stats.expectedGoals?.home ?? '-', a: currentFixture.stats.expectedGoals?.away ?? '-' },
                    { label: 'Șuturi pe Poartă', h: currentFixture.stats.shotsOnTarget.home, a: currentFixture.stats.shotsOnTarget.away },
                    { label: 'Șuturi Totale', h: currentFixture.stats.shotsTotal.home, a: currentFixture.stats.shotsTotal.away },
                    { label: 'Cornere', h: currentFixture.stats.corners.home, a: currentFixture.stats.corners.away },
                    { label: 'Faulturi Comise', h: currentFixture.stats.fouls.home, a: currentFixture.stats.fouls.away },
                    { label: 'Cartonașe Galbene', h: currentFixture.stats.yellowCards.home, a: currentFixture.stats.yellowCards.away },
                    { label: 'Cartonașe Roșii', h: currentFixture.stats.redCards.home, a: currentFixture.stats.redCards.away },
                  ].map((row, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between rounded-lg bg-flashCard/70 p-2.5 text-xs font-semibold"
                    >
                      <span className="font-mono text-sm font-bold text-gray-200">{row.h}</span>
                      <span className="text-flashMuted font-medium">{row.label}</span>
                      <span className="font-mono text-sm font-bold text-gray-200">{row.a}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-xl border border-flashBorder bg-flashCard p-4 space-y-3">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-gray-200">Statistici & Metrici Pre-Meci</span>
                      <span className="text-flashGreen font-mono text-[11px] font-semibold">
                        {new Date(currentFixture.date).toLocaleDateString([], { day: '2-digit', month: 'short' })} • {new Date(currentFixture.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    {pred && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center text-xs">
                        <div className="rounded-lg bg-[#111722] p-2.5">
                          <div className="text-[10px] text-flashMuted">xG Așteptat Gazde</div>
                          <div className="font-mono text-base font-black text-flashGreen">{pred.lambdaHome}</div>
                        </div>
                        <div className="rounded-lg bg-[#111722] p-2.5">
                          <div className="text-[10px] text-flashMuted">xG Așteptat Oaspeți</div>
                          <div className="font-mono text-base font-black text-flashBlue">{pred.lambdaAway}</div>
                        </div>
                        <div className="rounded-lg bg-[#111722] p-2.5">
                          <div className="text-[10px] text-flashMuted">Over 2.5 Goluri</div>
                          <div className="font-mono text-base font-black text-amber-400">
                            {((pred.overUnderProbabilities.find((o) => o.line === 2.5)?.over || 0) * 100).toFixed(1)}%
                          </div>
                        </div>
                        <div className="rounded-lg bg-[#111722] p-2.5">
                          <div className="text-[10px] text-flashMuted">Ambele Marchează</div>
                          <div className="font-mono text-base font-black text-purple-400">
                            {((pred.bttsProbabilities.yes || 0) * 100).toFixed(1)}%
                          </div>
                        </div>
                      </div>
                    )}

                    <p className="text-[11px] text-flashMuted text-center">
                      Statisticile live (șuturi pe poartă, posesie, faulturi, xG) se vor actualiza automat în timp real la fluierul de start.
                    </p>
                  </div>
                </div>
              )}

              {/* Recent Form Guide (Last 5 matches) */}
              {(currentFixture.formHome || currentFixture.formAway) && (
                <div className="rounded-xl border border-flashBorder bg-flashCard p-4 space-y-3">
                  <div className="flex justify-between items-center text-xs border-b border-flashBorder/60 pb-2">
                    <span className="font-bold text-gray-200">Forma Recentă (Ultimele 5 Meciuri Oficiale)</span>
                    <span className="text-[11px] text-flashMuted">Arhiva celor 24.000+ meciuri</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    {/* Home Team Form */}
                    {currentFixture.formHome && (
                      <div className="rounded-lg bg-[#111722] p-3 space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-gray-200 truncate">{currentFixture.homeTeam.name}</span>
                          <div className="flex items-center gap-1">
                            {currentFixture.formHome.formSequence.map((res, i) => (
                              <span
                                key={i}
                                className={`inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-black ${
                                  res === 'W'
                                    ? 'bg-emerald-600 text-white'
                                    : res === 'D'
                                    ? 'bg-amber-500 text-black'
                                    : 'bg-red-600 text-white'
                                }`}
                                title={res === 'W' ? 'Victorie' : res === 'D' ? 'Egal' : 'Înfrângere'}
                              >
                                {res === 'W' ? 'V' : res === 'D' ? 'E' : 'Î'}
                              </span>
                            ))}
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-1.5 text-center text-[10px] font-mono py-1 border-y border-flashBorder/30">
                          <div>
                            <span className="text-flashMuted block">Puncte</span>
                            <strong className="text-emerald-400 text-xs">{currentFixture.formHome.points} / 15</strong>
                          </div>
                          <div>
                            <span className="text-flashMuted block">Golaveraj</span>
                            <strong className="text-gray-200 text-xs">{currentFixture.formHome.goalsScored} : {currentFixture.formHome.goalsConceded}</strong>
                          </div>
                          <div>
                            <span className="text-flashMuted block">Clean Sheets</span>
                            <strong className="text-blue-400 text-xs">{currentFixture.formHome.cleanSheets} / 5</strong>
                          </div>
                        </div>

                        {/* Last matches list */}
                        <div className="space-y-1 pt-1">
                          {currentFixture.formHome.lastMatches.slice(0, 4).map((m, idx) => (
                            <div key={idx} className="flex items-center justify-between text-[10px] py-0.5 text-gray-300">
                              <span className="text-flashMuted font-mono">{m.date}</span>
                              <span className="truncate max-w-[120px]">{m.isHome ? 'vs' : '@'} {m.opponent}</span>
                              <span className={`font-mono font-bold px-1 rounded ${
                                m.result === 'W' ? 'bg-emerald-950 text-emerald-300' : m.result === 'D' ? 'bg-amber-950 text-amber-300' : 'bg-red-950 text-red-300'
                              }`}>
                                {m.scored} : {m.conceded}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Away Team Form */}
                    {currentFixture.formAway && (
                      <div className="rounded-lg bg-[#111722] p-3 space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-gray-200 truncate">{currentFixture.awayTeam.name}</span>
                          <div className="flex items-center gap-1">
                            {currentFixture.formAway.formSequence.map((res, i) => (
                              <span
                                key={i}
                                className={`inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-black ${
                                  res === 'W'
                                    ? 'bg-emerald-600 text-white'
                                    : res === 'D'
                                    ? 'bg-amber-500 text-black'
                                    : 'bg-red-600 text-white'
                                }`}
                                title={res === 'W' ? 'Victorie' : res === 'D' ? 'Egal' : 'Înfrângere'}
                              >
                                {res === 'W' ? 'V' : res === 'D' ? 'E' : 'Î'}
                              </span>
                            ))}
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-1.5 text-center text-[10px] font-mono py-1 border-y border-flashBorder/30">
                          <div>
                            <span className="text-flashMuted block">Puncte</span>
                            <strong className="text-emerald-400 text-xs">{currentFixture.formAway.points} / 15</strong>
                          </div>
                          <div>
                            <span className="text-flashMuted block">Golaveraj</span>
                            <strong className="text-gray-200 text-xs">{currentFixture.formAway.goalsScored} : {currentFixture.formAway.goalsConceded}</strong>
                          </div>
                          <div>
                            <span className="text-flashMuted block">Clean Sheets</span>
                            <strong className="text-blue-400 text-xs">{currentFixture.formAway.cleanSheets} / 5</strong>
                          </div>
                        </div>

                        {/* Last matches list */}
                        <div className="space-y-1 pt-1">
                          {currentFixture.formAway.lastMatches.slice(0, 4).map((m, idx) => (
                            <div key={idx} className="flex items-center justify-between text-[10px] py-0.5 text-gray-300">
                              <span className="text-flashMuted font-mono">{m.date}</span>
                              <span className="truncate max-w-[120px]">{m.isHome ? 'vs' : '@'} {m.opponent}</span>
                              <span className={`font-mono font-bold px-1 rounded ${
                                m.result === 'W' ? 'bg-emerald-950 text-emerald-300' : m.result === 'D' ? 'bg-amber-950 text-amber-300' : 'bg-red-950 text-red-300'
                              }`}>
                                {m.scored} : {m.conceded}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Home vs Away Seasonal Averages (Pasul 2) */}
              {(currentFixture.homeAwayStatsHome || currentFixture.homeAwayStatsAway) && (
                <div className="rounded-xl border border-flashBorder bg-flashCard p-4 space-y-3">
                  <div className="flex justify-between items-center text-xs border-b border-flashBorder/60 pb-2">
                    <span className="font-bold text-gray-200">Statistici Medii: Acasă vs Deplasare</span>
                    <span className="text-[11px] text-flashMuted">Performanță specifică pe teren (Ultimele ~20 meciuri)</span>
                  </div>

                  <div className="space-y-3 pt-1">
                    {/* Header Columns */}
                    <div className="grid grid-cols-3 text-center text-[11px] font-semibold text-gray-400">
                      <div className="text-left font-bold text-flashGreen truncate">{currentFixture.homeTeam.name} (Acasă)</div>
                      <div className="text-flashMuted">Metrică</div>
                      <div className="text-right font-bold text-flashBlue truncate">{currentFixture.awayTeam.name} (Deplasare)</div>
                    </div>

                    {/* Stat Comparisons */}
                    {[
                      {
                        label: 'Medie Goluri Marcate / Meci',
                        h: currentFixture.homeAwayStatsHome?.scoredAvg !== undefined ? `${currentFixture.homeAwayStatsHome.scoredAvg}` : '-',
                        a: currentFixture.homeAwayStatsAway?.scoredAvg !== undefined ? `${currentFixture.homeAwayStatsAway.scoredAvg}` : '-',
                        hVal: currentFixture.homeAwayStatsHome?.scoredAvg || 0,
                        aVal: currentFixture.homeAwayStatsAway?.scoredAvg || 0,
                      },
                      {
                        label: 'Medie Goluri Primite / Meci',
                        h: currentFixture.homeAwayStatsHome?.concededAvg !== undefined ? `${currentFixture.homeAwayStatsHome.concededAvg}` : '-',
                        a: currentFixture.homeAwayStatsAway?.concededAvg !== undefined ? `${currentFixture.homeAwayStatsAway.concededAvg}` : '-',
                        hVal: currentFixture.homeAwayStatsHome?.concededAvg || 0,
                        aVal: currentFixture.homeAwayStatsAway?.concededAvg || 0,
                      },
                      {
                        label: 'Total Mediu Goluri în Meci',
                        h: currentFixture.homeAwayStatsHome?.totalGoalsAvg !== undefined ? `${currentFixture.homeAwayStatsHome.totalGoalsAvg}` : '-',
                        a: currentFixture.homeAwayStatsAway?.totalGoalsAvg !== undefined ? `${currentFixture.homeAwayStatsAway.totalGoalsAvg}` : '-',
                        hVal: currentFixture.homeAwayStatsHome?.totalGoalsAvg || 0,
                        aVal: currentFixture.homeAwayStatsAway?.totalGoalsAvg || 0,
                      },
                      {
                        label: '% Fără Gol Primit (Clean Sheet)',
                        h: currentFixture.homeAwayStatsHome?.cleanSheetPct !== undefined ? `${currentFixture.homeAwayStatsHome.cleanSheetPct}%` : '-',
                        a: currentFixture.homeAwayStatsAway?.cleanSheetPct !== undefined ? `${currentFixture.homeAwayStatsAway.cleanSheetPct}%` : '-',
                        hVal: currentFixture.homeAwayStatsHome?.cleanSheetPct || 0,
                        aVal: currentFixture.homeAwayStatsAway?.cleanSheetPct || 0,
                      },
                      {
                        label: '% Meciuri cu Peste 2.5 Goluri',
                        h: currentFixture.homeAwayStatsHome?.over25Pct !== undefined ? `${currentFixture.homeAwayStatsHome.over25Pct}%` : '-',
                        a: currentFixture.homeAwayStatsAway?.over25Pct !== undefined ? `${currentFixture.homeAwayStatsAway.over25Pct}%` : '-',
                        hVal: currentFixture.homeAwayStatsHome?.over25Pct || 0,
                        aVal: currentFixture.homeAwayStatsAway?.over25Pct || 0,
                      },
                      {
                        label: '% Ambele Echipe Marchează (GG)',
                        h: currentFixture.homeAwayStatsHome?.bttsPct !== undefined ? `${currentFixture.homeAwayStatsHome.bttsPct}%` : '-',
                        a: currentFixture.homeAwayStatsAway?.bttsPct !== undefined ? `${currentFixture.homeAwayStatsAway.bttsPct}%` : '-',
                        hVal: currentFixture.homeAwayStatsHome?.bttsPct || 0,
                        aVal: currentFixture.homeAwayStatsAway?.bttsPct || 0,
                      },
                      {
                        label: '% Victorii (Acasă vs Deplasare)',
                        h: currentFixture.homeAwayStatsHome?.winPct !== undefined ? `${currentFixture.homeAwayStatsHome.winPct}%` : '-',
                        a: currentFixture.homeAwayStatsAway?.winPct !== undefined ? `${currentFixture.homeAwayStatsAway.winPct}%` : '-',
                        hVal: currentFixture.homeAwayStatsHome?.winPct || 0,
                        aVal: currentFixture.homeAwayStatsAway?.winPct || 0,
                      },
                    ].map((row, idx) => (
                      <div key={idx} className="rounded-lg bg-[#111722] p-2.5 space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-mono font-bold text-flashGreen text-sm">{row.h}</span>
                          <span className="text-gray-300 font-medium text-[11px] text-center">{row.label}</span>
                          <span className="font-mono font-bold text-flashBlue text-sm">{row.a}</span>
                        </div>
                        {/* Comparison Progress Bar */}
                        <div className="flex h-1.5 overflow-hidden rounded-full bg-gray-800">
                          <div
                            className="bg-flashGreen"
                            style={{
                              width: `${
                                row.hVal + row.aVal > 0
                                  ? Math.max(10, Math.min(90, (row.hVal / (row.hVal + row.aVal)) * 100))
                                  : 50
                              }%`,
                            }}
                          />
                          <div
                            className="bg-flashBlue"
                            style={{
                              width: `${
                                row.hVal + row.aVal > 0
                                  ? Math.max(10, Math.min(90, (row.aVal / (row.hVal + row.aVal)) * 100))
                                  : 50
                              }%`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Standings & League Table Context (Pasul 4) */}
              {(currentFixture.standingHome || currentFixture.standingAway) && (
                <div className="rounded-xl border border-flashBorder bg-flashCard p-4 space-y-3">
                  <div className="flex justify-between items-center text-xs border-b border-flashBorder/60 pb-2">
                    <span className="font-bold text-gray-200">Context de Clasament & Miza Meciului</span>
                    <span className="text-[11px] text-flashMuted">Sezonul Oficial {currentFixture.league.name}</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    {/* Home Team Standings Card */}
                    {currentFixture.standingHome && (
                      <div className="rounded-lg bg-[#111722] p-3 space-y-2">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-black text-flashGreen">
                              #{currentFixture.standingHome.rank}
                            </span>
                            <span className="font-bold text-gray-200 truncate">{currentFixture.homeTeam.name}</span>
                          </div>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            currentFixture.standingHome.zone === 'champions_league'
                              ? 'bg-blue-950 text-blue-300 border border-blue-800/50'
                              : currentFixture.standingHome.zone === 'europa_league'
                              ? 'bg-amber-950 text-amber-300 border border-amber-800/50'
                              : currentFixture.standingHome.zone === 'relegation'
                              ? 'bg-red-950 text-red-300 border border-red-800/50'
                              : 'bg-gray-800 text-gray-300'
                          }`}>
                            {currentFixture.standingHome.zone === 'champions_league'
                              ? 'Loc Champions League'
                              : currentFixture.standingHome.zone === 'europa_league'
                              ? 'Loc Cupe Europene'
                              : currentFixture.standingHome.zone === 'relegation'
                              ? 'Zonă Retrogradare'
                              : 'Zonă Sigură'}
                          </span>
                        </div>

                        <div className="grid grid-cols-4 gap-1 text-center font-mono text-[10px] py-1 bg-black/30 rounded">
                          <div>
                            <span className="text-flashMuted block">Pct</span>
                            <strong className="text-emerald-400 text-xs">{currentFixture.standingHome.points}</strong>
                          </div>
                          <div>
                            <span className="text-flashMuted block">Meciuri</span>
                            <span className="text-gray-300">{currentFixture.standingHome.played}</span>
                          </div>
                          <div>
                            <span className="text-flashMuted block">V - E - Î</span>
                            <span className="text-gray-300">{currentFixture.standingHome.won}-{currentFixture.standingHome.drawn}-{currentFixture.standingHome.lost}</span>
                          </div>
                          <div>
                            <span className="text-flashMuted block">Golaveraj</span>
                            <span className={`font-bold ${currentFixture.standingHome.goalDifference >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {currentFixture.standingHome.goalDifference > 0 ? `+${currentFixture.standingHome.goalDifference}` : currentFixture.standingHome.goalDifference}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Away Team Standings Card */}
                    {currentFixture.standingAway && (
                      <div className="rounded-lg bg-[#111722] p-3 space-y-2">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-black text-flashBlue">
                              #{currentFixture.standingAway.rank}
                            </span>
                            <span className="font-bold text-gray-200 truncate">{currentFixture.awayTeam.name}</span>
                          </div>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            currentFixture.standingAway.zone === 'champions_league'
                              ? 'bg-blue-950 text-blue-300 border border-blue-800/50'
                              : currentFixture.standingAway.zone === 'europa_league'
                              ? 'bg-amber-950 text-amber-300 border border-amber-800/50'
                              : currentFixture.standingAway.zone === 'relegation'
                              ? 'bg-red-950 text-red-300 border border-red-800/50'
                              : 'bg-gray-800 text-gray-300'
                          }`}>
                            {currentFixture.standingAway.zone === 'champions_league'
                              ? 'Loc Champions League'
                              : currentFixture.standingAway.zone === 'europa_league'
                              ? 'Loc Cupe Europene'
                              : currentFixture.standingAway.zone === 'relegation'
                              ? 'Zonă Retrogradare'
                              : 'Zonă Sigură'}
                          </span>
                        </div>

                        <div className="grid grid-cols-4 gap-1 text-center font-mono text-[10px] py-1 bg-black/30 rounded">
                          <div>
                            <span className="text-flashMuted block">Pct</span>
                            <strong className="text-emerald-400 text-xs">{currentFixture.standingAway.points}</strong>
                          </div>
                          <div>
                            <span className="text-flashMuted block">Meciuri</span>
                            <span className="text-gray-300">{currentFixture.standingAway.played}</span>
                          </div>
                          <div>
                            <span className="text-flashMuted block">V - E - Î</span>
                            <span className="text-gray-300">{currentFixture.standingAway.won}-{currentFixture.standingAway.drawn}-{currentFixture.standingAway.lost}</span>
                          </div>
                          <div>
                            <span className="text-flashMuted block">Golaveraj</span>
                            <span className={`font-bold ${currentFixture.standingAway.goalDifference >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {currentFixture.standingAway.goalDifference > 0 ? `+${currentFixture.standingAway.goalDifference}` : currentFixture.standingAway.goalDifference}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Deep Statistics & Database Intelligence Matrix (45.000+ Meciuri) */}
              {(currentFixture.deepStatsHome || currentFixture.deepStatsAway) && (
                <div className="rounded-xl border border-flashBorder bg-flashCard p-4 space-y-4 shadow-sm">
                  <div className="flex justify-between items-center text-xs border-b border-flashBorder/60 pb-2 flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <Database className="h-4 w-4 text-flashGreen" />
                      <span className="font-bold text-gray-200">
                        Bază de Date Statistică Profundă (Arhivă 45.000+ Meciuri)
                      </span>
                    </div>
                    <span className="text-[11px] text-flashMuted font-mono">
                      Analiză multi-sezon 1H vs 2H, Cornere & Șuturi
                    </span>
                  </div>

                  {/* 1. Distribuție Goluri pe Reprize (1H vs 2H) */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 text-gray-300 font-bold">
                        <Clock className="h-3.5 w-3.5 text-amber-400" />
                        <span>Distribuția Golurilor pe Reprize (1H vs 2H)</span>
                      </div>
                      <span className="text-[10px] text-flashMuted">Ritm marcaj & timing</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      {/* Home Team 1H/2H */}
                      {currentFixture.deepStatsHome && (
                        <div className="rounded-lg bg-[#111722] p-3 space-y-2 border border-flashBorder/30">
                          <div className="flex justify-between items-center text-xs">
                            <span className="font-bold text-emerald-400 truncate">{currentFixture.homeTeam.name}</span>
                            <span className="text-[10px] text-flashMuted font-mono">
                              {currentFixture.deepStatsHome.totalMatches} meciuri evaluate
                            </span>
                          </div>

                          <div className="space-y-1.5">
                            <div className="flex justify-between text-[11px]">
                              <span className="text-gray-300">Goluri Marcate în R1 (1H)</span>
                              <strong className="text-emerald-400 font-mono">
                                {currentFixture.deepStatsHome.halfTimeBreakdown.pctGoalsScored1H}% ({currentFixture.deepStatsHome.halfTimeBreakdown.goalsScored1H} goluri)
                              </strong>
                            </div>
                            <div className="flex h-1.5 overflow-hidden rounded-full bg-gray-800">
                              <div
                                className="bg-emerald-500 rounded-full"
                                style={{ width: `${currentFixture.deepStatsHome.halfTimeBreakdown.pctGoalsScored1H}%` }}
                              />
                            </div>

                            <div className="flex justify-between text-[11px] pt-1">
                              <span className="text-gray-300">Goluri Marcate în R2 (2H)</span>
                              <strong className="text-cyan-400 font-mono">
                                {currentFixture.deepStatsHome.halfTimeBreakdown.pctGoalsScored2H}% ({currentFixture.deepStatsHome.halfTimeBreakdown.goalsScored2H} goluri)
                              </strong>
                            </div>
                            <div className="flex h-1.5 overflow-hidden rounded-full bg-gray-800">
                              <div
                                className="bg-cyan-500 rounded-full"
                                style={{ width: `${currentFixture.deepStatsHome.halfTimeBreakdown.pctGoalsScored2H}%` }}
                              />
                            </div>

                            <div className="flex justify-between text-[10px] text-flashMuted pt-1 border-t border-flashBorder/20">
                              <span>Fără gol primit în prima repriză (1H):</span>
                              <strong className="text-gray-200 font-mono">
                                {currentFixture.deepStatsHome.halfTimeBreakdown.cleanSheet1HPct}%
                              </strong>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Away Team 1H/2H */}
                      {currentFixture.deepStatsAway && (
                        <div className="rounded-lg bg-[#111722] p-3 space-y-2 border border-flashBorder/30">
                          <div className="flex justify-between items-center text-xs">
                            <span className="font-bold text-blue-400 truncate">{currentFixture.awayTeam.name}</span>
                            <span className="text-[10px] text-flashMuted font-mono">
                              {currentFixture.deepStatsAway.totalMatches} meciuri evaluate
                            </span>
                          </div>

                          <div className="space-y-1.5">
                            <div className="flex justify-between text-[11px]">
                              <span className="text-gray-300">Goluri Marcate în R1 (1H)</span>
                              <strong className="text-blue-400 font-mono">
                                {currentFixture.deepStatsAway.halfTimeBreakdown.pctGoalsScored1H}% ({currentFixture.deepStatsAway.halfTimeBreakdown.goalsScored1H} goluri)
                              </strong>
                            </div>
                            <div className="flex h-1.5 overflow-hidden rounded-full bg-gray-800">
                              <div
                                className="bg-blue-500 rounded-full"
                                style={{ width: `${currentFixture.deepStatsAway.halfTimeBreakdown.pctGoalsScored1H}%` }}
                              />
                            </div>

                            <div className="flex justify-between text-[11px] pt-1">
                              <span className="text-gray-300">Goluri Marcate în R2 (2H)</span>
                              <strong className="text-purple-400 font-mono">
                                {currentFixture.deepStatsAway.halfTimeBreakdown.pctGoalsScored2H}% ({currentFixture.deepStatsAway.halfTimeBreakdown.goalsScored2H} goluri)
                              </strong>
                            </div>
                            <div className="flex h-1.5 overflow-hidden rounded-full bg-gray-800">
                              <div
                                className="bg-purple-500 rounded-full"
                                style={{ width: `${currentFixture.deepStatsAway.halfTimeBreakdown.pctGoalsScored2H}%` }}
                              />
                            </div>

                            <div className="flex justify-between text-[10px] text-flashMuted pt-1 border-t border-flashBorder/20">
                              <span>Fără gol primit în prima repriză (1H):</span>
                              <strong className="text-gray-200 font-mono">
                                {currentFixture.deepStatsAway.halfTimeBreakdown.cleanSheet1HPct}%
                              </strong>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 2. Centru Complet de Analiză Cornere (Model Matematic & Medii Reale) */}
                  <div className="rounded-xl border border-flashBorder bg-[#0f1520] p-4 space-y-3.5">
                    <div className="flex items-center justify-between flex-wrap gap-2 border-b border-flashBorder/40 pb-2">
                      <div className="flex items-center gap-2">
                        <Flag className="h-4 w-4 text-amber-400" />
                        <span className="font-bold text-xs text-gray-100">
                          Analiză Avansată Cornere (Bivariate Poisson & Medii Echipe)
                        </span>
                      </div>
                      {pred?.cornersPrediction && (
                        <div className="flex items-center gap-1.5 font-mono text-[11px]">
                          <span className="text-flashMuted">Proiecție Meci:</span>
                          <span className="font-bold text-amber-300 bg-amber-950/70 border border-amber-800/60 px-2 py-0.5 rounded">
                            🚩 {pred.cornersPrediction.expectedTotalCorners} Cornere ({pred.cornersPrediction.mostLikelyCornerRange})
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Team Corner Averages Breakdown */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      {/* Home Team Corners */}
                      <div className="rounded-lg bg-[#141c28] p-3 space-y-2 border border-flashBorder/30">
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-emerald-400 truncate">{currentFixture.homeTeam.name} (Acasă)</span>
                          <span className="font-mono text-[10px] text-gray-400">
                            Evaluat pe {currentFixture.deepStatsHome?.totalMatches || 20} meciuri
                          </span>
                        </div>

                        <div className="grid grid-cols-3 gap-1.5 text-center font-mono py-1.5 bg-black/40 rounded-lg text-[10px]">
                          <div>
                            <span className="text-flashMuted block text-[9px]">Obținute / Meci</span>
                            <strong className="text-emerald-400 text-xs">
                              {currentFixture.deepStatsHome?.cornerStats.homeCornersWonAvg ?? currentFixture.deepStatsHome?.cornerStats.cornersWonAvg ?? '-'}
                            </strong>
                          </div>
                          <div>
                            <span className="text-flashMuted block text-[9px]">Cedate / Meci</span>
                            <strong className="text-red-400 text-xs">
                              {currentFixture.deepStatsHome?.cornerStats.homeCornersConcededAvg ?? currentFixture.deepStatsHome?.cornerStats.cornersConcededAvg ?? '-'}
                            </strong>
                          </div>
                          <div>
                            <span className="text-flashMuted block text-[9px]">Total Meci</span>
                            <strong className="text-amber-400 text-xs">
                              {currentFixture.deepStatsHome?.cornerStats.matchTotalCornersAvg ?? '-'}
                            </strong>
                          </div>
                        </div>

                        <div className="flex justify-between items-center text-[10px] text-flashMuted pt-1">
                          <span>Meciuri cu Peste 9.5 cornere:</span>
                          <strong className="font-mono text-gray-200">
                            {currentFixture.deepStatsHome?.cornerStats.over95CornersPct ?? 0}%
                          </strong>
                        </div>
                      </div>

                      {/* Away Team Corners */}
                      <div className="rounded-lg bg-[#141c28] p-3 space-y-2 border border-flashBorder/30">
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-blue-400 truncate">{currentFixture.awayTeam.name} (Deplasare)</span>
                          <span className="font-mono text-[10px] text-gray-400">
                            Evaluat pe {currentFixture.deepStatsAway?.totalMatches || 20} meciuri
                          </span>
                        </div>

                        <div className="grid grid-cols-3 gap-1.5 text-center font-mono py-1.5 bg-black/40 rounded-lg text-[10px]">
                          <div>
                            <span className="text-flashMuted block text-[9px]">Obținute / Meci</span>
                            <strong className="text-blue-400 text-xs">
                              {currentFixture.deepStatsAway?.cornerStats.awayCornersWonAvg ?? currentFixture.deepStatsAway?.cornerStats.cornersWonAvg ?? '-'}
                            </strong>
                          </div>
                          <div>
                            <span className="text-flashMuted block text-[9px]">Cedate / Meci</span>
                            <strong className="text-red-400 text-xs">
                              {currentFixture.deepStatsAway?.cornerStats.awayCornersConcededAvg ?? currentFixture.deepStatsAway?.cornerStats.cornersConcededAvg ?? '-'}
                            </strong>
                          </div>
                          <div>
                            <span className="text-flashMuted block text-[9px]">Total Meci</span>
                            <strong className="text-amber-400 text-xs">
                              {currentFixture.deepStatsAway?.cornerStats.matchTotalCornersAvg ?? '-'}
                            </strong>
                          </div>
                        </div>

                        <div className="flex justify-between items-center text-[10px] text-flashMuted pt-1">
                          <span>Meciuri cu Peste 9.5 cornere:</span>
                          <strong className="font-mono text-gray-200">
                            {currentFixture.deepStatsAway?.cornerStats.over95CornersPct ?? 0}%
                          </strong>
                        </div>
                      </div>
                    </div>

                    {/* Corner Over/Under Probability Line Matrix */}
                    {pred?.cornersPrediction?.overUnderCorners && (
                      <div className="space-y-1.5 pt-1">
                        <div className="text-[11px] font-semibold text-gray-300 flex justify-between items-center">
                          <span>Probabilități & Cote Linii Cornere (Model Poisson):</span>
                          <span className="text-[10px] text-flashMuted font-mono">
                            Așteptate: {pred.cornersPrediction.expectedHomeCorners} (Gazde) + {pred.cornersPrediction.expectedAwayCorners} (Oaspeți)
                          </span>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                          {pred.cornersPrediction.overUnderCorners.slice(1, 5).map((ou) => (
                            <div key={ou.line} className="rounded-lg bg-[#141c28] p-2 border border-flashBorder/20">
                              <div className="font-bold text-gray-200 text-[11px]">Peste {ou.line} Cornere</div>
                              <div className="font-mono text-sm font-black text-amber-400">
                                {(ou.overProb * 100).toFixed(1)}%
                              </div>
                              <div className="text-[10px] text-flashMuted font-mono">
                                Cotă Fair: <strong className="text-gray-300">{ou.fairOverOdds}</strong>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 3. Metrice de Disciplină, Conversie & Serii */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs text-center">
                    {/* Shot Conversion Efficiency */}
                    <div className="rounded-lg bg-[#111722] p-2.5 border border-flashBorder/30">
                      <div className="text-[10px] text-flashMuted">Conversie Șuturi Cadrate</div>
                      <div className="font-mono text-base font-black text-emerald-400">
                        {currentFixture.deepStatsHome?.shotEfficiency.conversionRatePct || '-'}% vs {currentFixture.deepStatsAway?.shotEfficiency.conversionRatePct || '-'}%
                      </div>
                      <div className="text-[9px] text-flashMuted mt-0.5">
                        Șuturi/meci: {currentFixture.deepStatsHome?.shotEfficiency.shotsAvg || '-'} vs {currentFixture.deepStatsAway?.shotEfficiency.shotsAvg || '-'}
                      </div>
                    </div>

                    {/* Yellow Cards Rate */}
                    <div className="rounded-lg bg-[#111722] p-2.5 border border-flashBorder/30">
                      <div className="text-[10px] text-flashMuted">Cartonașe Galbene / Meci</div>
                      <div className="font-mono text-base font-black text-yellow-400">
                        {currentFixture.deepStatsHome?.cardStats.yellowCardsAvg || '-'} vs {currentFixture.deepStatsAway?.cardStats.yellowCardsAvg || '-'}
                      </div>
                      <div className="text-[9px] text-flashMuted mt-0.5">
                        Peste 3.5: {currentFixture.deepStatsHome?.cardStats.over35CardsPct || 0}%
                      </div>
                    </div>

                    {/* Streaks / Momentum */}
                    <div className="rounded-lg bg-[#111722] p-2.5 border border-flashBorder/30 col-span-2 sm:col-span-1">
                      <div className="text-[10px] text-flashMuted">Serii Fără Înfrângere</div>
                      <div className="font-mono text-base font-black text-purple-400">
                        {currentFixture.deepStatsHome?.streaks.unbeatenStreak || 0} vs {currentFixture.deepStatsAway?.streaks.unbeatenStreak || 0} meciuri
                      </div>
                      <div className="text-[9px] text-flashMuted mt-0.5">
                        Scoring: {currentFixture.deepStatsHome?.streaks.scoringStreak || 0} meciuri cu gol
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Referee Section */}
              {currentFixture.referee && (
                <div className="rounded-xl border border-flashBorder bg-flashCard p-4">
                  <h4 className="text-xs font-bold text-gray-200 mb-2">Arbitru Desemnat</h4>
                  <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div>
                      <div className="font-bold text-sm text-gray-100">{currentFixture.referee.name}</div>
                      <div className="text-[11px] text-flashMuted">{currentFixture.referee.country || 'International'} • {currentFixture.referee.matchesCount} meciuri evaluate</div>
                    </div>
                    <div className="flex items-center gap-4 font-mono">
                      <div>
                        <span className="text-flashMuted text-[10px]">Media Galbene: </span>
                        <span className="font-bold text-yellow-400">{currentFixture.referee.avgYellowCardsPerMatch}</span>
                      </div>
                      <div>
                        <span className="text-flashMuted text-[10px]">Indice Severitate: </span>
                        <span className={`font-bold ${currentFixture.referee.severityIndex > 1.1 ? 'text-flashRed' : 'text-flashGreen'}`}>
                          {currentFixture.referee.severityIndex}x
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Istoric H2H */}
          {activeTab === 'h2h' && (
            <div className="space-y-4">
              {/* Summary Balance Bar */}
              {h2hSummary && (
                <div className="rounded-xl border border-flashBorder bg-flashCard p-4 space-y-3">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-gray-200">Bilanț Direct ({h2hSummary.totalMatches} Meciuri Oficiale)</span>
                    <span className="font-mono text-flashMuted text-[11px]">
                      Goluri medii: <strong className="text-gray-200">{h2hSummary.avgGoals}</strong> | Cartonașe: <strong className="text-yellow-400">{h2hSummary.avgCards}</strong>
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded-lg bg-[#111722] p-2">
                      <div className="text-flashMuted text-[10px] truncate">{currentFixture.homeTeam.name}</div>
                      <div className="font-mono text-base font-black text-emerald-400">{h2hSummary.homeWins} Victorii</div>
                    </div>
                    <div className="rounded-lg bg-[#111722] p-2">
                      <div className="text-flashMuted text-[10px]">Egaluri</div>
                      <div className="font-mono text-base font-black text-amber-400">{h2hSummary.draws} Egaluri</div>
                    </div>
                    <div className="rounded-lg bg-[#111722] p-2">
                      <div className="text-flashMuted text-[10px] truncate">{currentFixture.awayTeam.name}</div>
                      <div className="font-mono text-base font-black text-blue-400">{h2hSummary.awayWins} Victorii</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Tactical AI Insights from H2H Database */}
              {currentFixture.h2hTactical && currentFixture.h2hTactical.tacticalInsights.length > 0 && (
                <div className="rounded-xl border border-flashBorder bg-flashCard p-4 space-y-2.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-gray-200">
                    <Sparkles className="h-4 w-4 text-amber-400" />
                    <span>Concluzii Tactice Directe (Arhiva H2H)</span>
                  </div>
                  <div className="space-y-1.5">
                    {currentFixture.h2hTactical.tacticalInsights.map((insight, idx) => (
                      <div
                        key={idx}
                        className="rounded-lg bg-[#111722] p-2.5 text-xs text-gray-200 border border-flashBorder/40 flex items-center gap-2"
                      >
                        <span className="text-sm">📌</span>
                        <span className="leading-relaxed">{insight}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* H2H Matches List */}
              {currentFixture.h2h && currentFixture.h2h.length > 0 ? (
                <div className="space-y-2.5">
                  {currentFixture.h2h.map((m, idx) => (
                    <div
                      key={idx}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-flashBorder bg-flashCard p-3 text-xs"
                    >
                      <div className="text-flashMuted text-[11px] font-mono">{m.date} ({m.season})</div>
                      <div className="font-bold text-sm text-gray-100">
                        {m.homeTeamName} <span className="font-mono text-flashGreen px-1.5 py-0.5 rounded bg-black/40">{m.homeScore} : {m.awayScore}</span> {m.awayTeamName}
                      </div>
                      <div className="flex items-center gap-3 text-flashMuted text-[11px] font-mono">
                        <span>🟨 {m.totalCards} cartonașe</span>
                        <span>🚩 {m.totalCorners} cornere</span>
                        {m.refereeName && <span className="text-gray-400 hidden sm:inline">👤 {m.refereeName}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-flashBorder bg-flashCard p-6 text-center text-xs text-flashMuted">
                  Nu există meciuri directe recente înregistrate în baza de date pentru această selecție.
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Jucatori & Cartonase */}
          {activeTab === 'lineups' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Home Lineup */}
                <div className="rounded-xl border border-flashBorder bg-flashCard p-4 space-y-3">
                  <div className="flex justify-between items-center border-b border-flashBorder/60 pb-2">
                    <div>
                      <h3 className="font-bold text-sm text-gray-200">{currentFixture.homeTeam.name}</h3>
                      <div className="text-[10px] mt-0.5">
                        {currentFixture.lineupHome?.isConfirmed ? (
                          <span className="text-emerald-400 font-semibold bg-emerald-950/60 border border-emerald-800/40 px-1.5 py-0.5 rounded">
                            ✓ Primul 11 Oficial
                          </span>
                        ) : (
                          <span className="text-amber-400 font-semibold bg-amber-950/60 border border-amber-800/40 px-1.5 py-0.5 rounded">
                            ⏳ Formație Probabilă
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="font-mono text-xs text-flashGreen font-bold px-2 py-0.5 bg-black/40 rounded border border-flashBorder">
                      {currentFixture.lineupHome?.formation || '4-3-3'}
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    {currentFixture.lineupHome?.startingXI && currentFixture.lineupHome.startingXI.length > 0 ? (
                      currentFixture.lineupHome.startingXI.map((p) => (
                        <div key={p.id} className="flex items-center justify-between text-xs py-1 border-b border-flashBorder/20">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-flashMuted w-4">{p.number}</span>
                            <span className="font-semibold text-gray-200">{p.name}</span>
                            <span className="text-[10px] text-gray-500">({p.position})</span>
                          </div>
                          <div className="flex items-center gap-2 font-mono text-[11px] text-flashMuted">
                            <span title="Cartonase galbene">🟨 {p.yellowCards}</span>
                            <span title="Faulturi">{p.foulsCommitted} flt</span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-xs text-flashMuted py-3 text-center">
                        Echipa de start oficială va fi confirmată cu 60 min înainte de fluierul de start.
                      </div>
                    )}
                  </div>
                </div>

                {/* Away Lineup */}
                <div className="rounded-xl border border-flashBorder bg-flashCard p-4 space-y-3">
                  <div className="flex justify-between items-center border-b border-flashBorder/60 pb-2">
                    <div>
                      <h3 className="font-bold text-sm text-gray-200">{currentFixture.awayTeam.name}</h3>
                      <div className="text-[10px] mt-0.5">
                        {currentFixture.lineupAway?.isConfirmed ? (
                          <span className="text-emerald-400 font-semibold bg-emerald-950/60 border border-emerald-800/40 px-1.5 py-0.5 rounded">
                            ✓ Primul 11 Oficial
                          </span>
                        ) : (
                          <span className="text-amber-400 font-semibold bg-amber-950/60 border border-amber-800/40 px-1.5 py-0.5 rounded">
                            ⏳ Formație Probabilă
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="font-mono text-xs text-flashGreen font-bold px-2 py-0.5 bg-black/40 rounded border border-flashBorder">
                      {currentFixture.lineupAway?.formation || '4-3-3'}
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    {currentFixture.lineupAway?.startingXI && currentFixture.lineupAway.startingXI.length > 0 ? (
                      currentFixture.lineupAway.startingXI.map((p) => (
                        <div key={p.id} className="flex items-center justify-between text-xs py-1 border-b border-flashBorder/20">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-flashMuted w-4">{p.number}</span>
                            <span className="font-semibold text-gray-200">{p.name}</span>
                            <span className="text-[10px] text-gray-500">({p.position})</span>
                          </div>
                          <div className="flex items-center gap-2 font-mono text-[11px] text-flashMuted">
                            <span title="Cartonase galbene">🟨 {p.yellowCards}</span>
                            <span title="Faulturi">{p.foulsCommitted} flt</span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-xs text-flashMuted py-3 text-center">
                        Echipa de start oficială va fi confirmată cu 60 min înainte de fluierul de start.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Cards Expectation Box */}
              {pred && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-flashBorder bg-gradient-to-r from-flashCard to-[#1a2333] p-4 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h4 className="font-bold text-sm text-amber-300">Estimare Cartonașe (Poisson Negativ Binomial)</h4>
                        <p className="text-flashMuted text-[11px]">Agresivitate combinată x Severitate arbitru ({pred.cardsPrediction.refereeImpactFactor}x) x Factor tensiune H2H ({pred.cardsPrediction.h2hRivalryFactor}x)</p>
                      </div>
                      <div className="flex items-center gap-4 font-mono">
                        <div>
                          <span className="text-flashMuted">Total Așteptat: </span>
                          <span className="font-bold text-base text-yellow-400">{pred.cardsPrediction.expectedTotalCards}</span>
                        </div>
                        <div>
                          <span className="text-flashMuted">Over 4.5: </span>
                          <span className="font-bold text-emerald-400">
                            {((pred.cardsPrediction.overUnderCards.find((o) => o.line === 4.5)?.overProb || 0) * 100).toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 🟨 Jugador con Tarjeta / High-Risk Player Cards Radar */}
                  {pred.cardsPrediction.highRiskPlayers && pred.cardsPrediction.highRiskPlayers.length > 0 && (
                    <div className="rounded-xl border border-amber-500/30 bg-[#0e1522] p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Shield className="h-4 w-4 text-yellow-400" />
                          <h4 className="font-bold text-xs text-white uppercase tracking-wider font-mono">
                            Jucători cu Risc Maxim de Cartonaș (Pariuri Specifice +EV)
                          </h4>
                        </div>
                        <span className="text-[10px] font-mono text-yellow-400 bg-yellow-950/60 border border-yellow-700/50 px-2 py-0.5 rounded font-bold">
                          Filtru Poziție &amp; Rata Faulturi
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                        {pred.cardsPrediction.highRiskPlayers.map((player) => (
                          <div
                            key={player.id}
                            className="rounded-lg bg-[#141c2b] p-2.5 border border-slate-800 flex flex-col justify-between space-y-1.5"
                          >
                            <div className="flex items-start justify-between gap-1">
                              <div>
                                <div className="font-bold text-slate-100 text-xs truncate max-w-[130px]">{player.name}</div>
                                <div className="text-[10px] text-slate-400 font-mono">{player.teamName} • ({player.position})</div>
                              </div>
                              <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-bold uppercase ${
                                player.riskLevel === 'HIGH'
                                  ? 'bg-red-950 border border-red-700 text-red-300'
                                  : 'bg-amber-950 border border-amber-700 text-amber-300'
                              }`}>
                                {player.riskLevel}
                              </span>
                            </div>

                            <div className="flex items-center justify-between font-mono text-[11px] pt-1.5 border-t border-slate-800">
                              <span className="text-slate-400">Probabilitate: <strong className="text-yellow-400">{Math.round(player.cardProbability * 100)}%</strong></span>
                              <span className="text-emerald-400 font-bold bg-emerald-950/60 border border-emerald-800/40 px-1.5 py-0.2 rounded">
                                Cotă @{player.fairOdds.toFixed(2)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: AI Betting Radar */}
          {activeTab === 'radar' && (
            <div className="space-y-6">
              {pred ? (
                <>
                  {/* Expected Goals & Poisson Grid Parameters */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                    <div className="rounded-xl border border-flashBorder bg-flashCard p-3">
                      <div className="text-[10px] text-flashMuted">Lambda Gazde (xG)</div>
                      <div className="font-mono text-lg font-black text-flashGreen">{pred.lambdaHome}</div>
                    </div>
                    <div className="rounded-xl border border-flashBorder bg-flashCard p-3">
                      <div className="text-[10px] text-flashMuted">Lambda Oaspeți (xG)</div>
                      <div className="font-mono text-lg font-black text-flashBlue">{pred.lambdaAway}</div>
                    </div>
                    <div className="rounded-xl border border-flashBorder bg-flashCard p-3">
                      <div className="text-[10px] text-flashMuted">Dixon-Coles Rho</div>
                      <div className="font-mono text-lg font-bold text-gray-200">{pred.dixonColesRhoUsed}</div>
                    </div>
                    <div className="rounded-xl border border-flashBorder bg-flashCard p-3">
                      <div className="text-[10px] text-flashMuted">Blend Model</div>
                      <div className="font-mono text-xs font-bold text-gray-300 mt-1">60% Poiss / 40% ELO</div>
                    </div>
                  </div>

                  {/* Data Completeness Badges */}
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-flashBorder bg-[#111722] p-3 text-[11px]">
                    <span className="font-bold text-gray-300">Integritate Date Meci:</span>
                    <div className="flex flex-wrap items-center gap-2 font-mono">
                      <span className={`px-2 py-0.5 rounded border ${currentFixture.lineupHome && currentFixture.lineupHome.startingXI.length > 0 ? 'bg-emerald-950/60 border-emerald-800 text-emerald-400' : 'bg-gray-800/80 border-gray-700 text-gray-400'}`}>
                        {currentFixture.lineupHome && currentFixture.lineupHome.startingXI.length > 0 ? '✓ Primul 11 Anunțat' : '✗ Formație Provizorie'}
                      </span>
                      <span className={`px-2 py-0.5 rounded border ${currentFixture.odds ? 'bg-emerald-950/60 border-emerald-800 text-emerald-400' : 'bg-gray-800/80 border-gray-700 text-gray-400'}`}>
                        {currentFixture.odds ? '✓ Cote Reale Conectate' : '✗ Cote Indisponibile'}
                      </span>
                      <span className={`px-2 py-0.5 rounded border ${pred.isLeagueCalibrated ? 'bg-emerald-950/60 border-emerald-800 text-emerald-400' : 'bg-amber-950/60 border-amber-800 text-amber-400'}`}>
                        {pred.isLeagueCalibrated ? '✓ Istoric >15 Meciuri' : '⚠️ Date Reduse (Shrinkage)'}
                      </span>
                    </div>
                  </div>

                  {/* Explainable Decomposition Box */}
                  <div className="rounded-xl border border-flashBorder bg-flashCard p-4 space-y-2.5 text-xs">
                    <h4 className="font-bold text-gray-200 flex items-center gap-1.5">
                      <Sparkles className="h-4 w-4 text-flashGreen" />
                      Descompunerea Explicabilă a Predicției (De ce aceste probabilități?)
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-gray-300">
                      <div className="rounded-lg bg-[#0e141f] p-2.5 space-y-1">
                        <div className="text-flashMuted font-semibold">1. Forță Atac / Apărare (xG & Șuturi):</div>
                        <div className="font-mono text-gray-200">
                          {currentFixture.homeTeam.name}: λ_poiss={pred.poissonLambdaHome.toFixed(2)} | {currentFixture.awayTeam.name}: λ_poiss={pred.poissonLambdaAway.toFixed(2)}
                        </div>
                      </div>
                      <div className="rounded-lg bg-[#0e141f] p-2.5 space-y-1">
                        <div className="text-flashMuted font-semibold">2. Dinamică ELO:</div>
                        <div className="font-mono text-gray-200">
                          Așteptare Victorie: {(pred.eloExpectedHomeWin * 100).toFixed(1)}% vs {(pred.eloExpectedAwayWin * 100).toFixed(1)}%
                        </div>
                      </div>
                      <div className="rounded-lg bg-[#0e141f] p-2.5 space-y-1">
                        <div className="text-flashMuted font-semibold">3. Ajustări Odihnă & Jucători Cheie:</div>
                        <div className="font-mono text-gray-200">
                          {currentFixture.homeTeam.name}: {pred.scheduleFatigueHome ? `${pred.scheduleFatigueHome.restDays}z pauză (${pred.scheduleFatigueHome.matchesLast14Days}m/14z)` : 'program necunoscut'} • Atac: {(pred.lineupImpactHome?.attackFactor ?? 1.0)}x
                        </div>
                        <div className="font-mono text-gray-200">
                          {currentFixture.awayTeam.name}: {pred.scheduleFatigueAway ? `${pred.scheduleFatigueAway.restDays}z pauză (${pred.scheduleFatigueAway.matchesLast14Days}m/14z)` : 'program necunoscut'} • Atac: {(pred.lineupImpactAway?.attackFactor ?? 1.0)}x
                        </div>
                      </div>
                      <div className="rounded-lg bg-[#0e141f] p-2.5 space-y-1">
                        <div className="text-flashMuted font-semibold">4. Consensul Pieței (Market Prior):</div>
                        <div className="font-mono text-gray-200">
                          {currentFixture.odds ? '65% Cota Pieței Devigged / 35% Model Fundamental' : '100% Model Fundamental (Fără cote)'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 1X2 Probabilities vs Market */}
                  <div className="rounded-xl border border-flashBorder bg-flashCard p-4 space-y-3">
                    <h4 className="font-bold text-xs text-gray-200">Probabilități 1X2 Modelate vs Cotele Pieței</h4>
                    <div className="grid grid-cols-3 gap-3 text-center text-xs">
                      {/* Home */}
                      <div className="rounded-lg bg-[#111722] p-3">
                        <div className="text-flashMuted text-[10px] truncate">1 ({currentFixture.homeTeam.name})</div>
                        <div className="font-mono text-base font-black text-emerald-400">
                          {(pred.probabilities1X2.home * 100).toFixed(1)}%
                        </div>
                        <div className="text-[11px] text-gray-400 mt-1">
                          Cotă Corectă: {(1 / pred.probabilities1X2.home).toFixed(2)}
                        </div>
                        <div className="text-[10px] text-amber-400/90 font-mono mt-0.5">
                          {currentFixture.odds ? `Piață (${currentFixture.odds.bookmaker}): ${currentFixture.odds.match1X2.home.toFixed(2)}` : 'Cotă Piață: indisponibilă'}
                        </div>
                      </div>

                      {/* Draw */}
                      <div className="rounded-lg bg-[#111722] p-3">
                        <div className="text-flashMuted text-[10px]">X (Egal)</div>
                        <div className="font-mono text-base font-black text-emerald-400">
                          {(pred.probabilities1X2.draw * 100).toFixed(1)}%
                        </div>
                        <div className="text-[11px] text-gray-400 mt-1">
                          Cotă Corectă: {(1 / pred.probabilities1X2.draw).toFixed(2)}
                        </div>
                        <div className="text-[10px] text-amber-400/90 font-mono mt-0.5">
                          {currentFixture.odds ? `Piață (${currentFixture.odds.bookmaker}): ${currentFixture.odds.match1X2.draw.toFixed(2)}` : 'Cotă Piață: indisponibilă'}
                        </div>
                      </div>

                      {/* Away */}
                      <div className="rounded-lg bg-[#111722] p-3">
                        <div className="text-flashMuted text-[10px] truncate">2 ({currentFixture.awayTeam.name})</div>
                        <div className="font-mono text-base font-black text-emerald-400">
                          {(pred.probabilities1X2.away * 100).toFixed(1)}%
                        </div>
                        <div className="text-[11px] text-gray-400 mt-1">
                          Cotă Corectă: {(1 / pred.probabilities1X2.away).toFixed(2)}
                        </div>
                        <div className="text-[10px] text-amber-400/90 font-mono mt-0.5">
                          {currentFixture.odds ? `Piață (${currentFixture.odds.bookmaker}): ${currentFixture.odds.match1X2.away.toFixed(2)}` : 'Cotă Piață: indisponibilă'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Top 5 Exact Scores */}
                  <div className="rounded-xl border border-flashBorder bg-flashCard p-4 space-y-2">
                    <h4 className="font-bold text-xs text-gray-200">Top Scoruri Exacte (Dixon-Coles Adjusted)</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-xs">
                      {pred.topExactScores.slice(0, 5).map((s, idx) => (
                        <div key={idx} className="rounded-lg bg-[#111722] p-2">
                          <div className="font-mono font-bold text-gray-100">{s.homeGoals} - {s.awayGoals}</div>
                          <div className="font-mono text-flashGreen text-xs">{(s.probability * 100).toFixed(1)}%</div>
                          <div className="text-[10px] text-flashMuted">Cotă: {s.fairOdds}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Value Bets Found */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-xs text-amber-300 flex items-center gap-1.5">
                        <Flame className="h-4 w-4 text-amber-400" />
                        Value Bets Identificate (Optimizare Criteriu Kelly)
                      </h4>
                      <span className="text-[10px] text-flashMuted font-mono">
                        Fractional Kelly 0.25 • Max 2% Bancă
                      </span>
                    </div>

                    {pred.valueBets && pred.valueBets.length > 0 ? (
                      <div className="space-y-2.5">
                        {pred.valueBets.map((vb) => (
                          <div
                            key={vb.id}
                            className="rounded-xl border border-amber-500/30 bg-gradient-to-r from-amber-950/30 to-[#141b26] p-3.5 text-xs space-y-2.5"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-black border ${
                                  vb.grade === 'A+'
                                    ? 'bg-purple-950 border-purple-600 text-purple-300'
                                    : vb.grade === 'A'
                                    ? 'bg-emerald-950 border-emerald-600 text-emerald-300'
                                    : vb.grade === 'SUSPECT'
                                    ? 'bg-red-950 border-red-600 text-red-300'
                                    : 'bg-amber-950 border-amber-600 text-amber-300'
                                }`}>
                                  Grad {vb.grade}
                                </span>
                                <span className="font-bold text-sm text-gray-100">{vb.selection}</span>
                                <span className="text-[11px] text-flashMuted font-mono">({vb.marketType})</span>
                              </div>

                              <div className="flex items-center gap-3">
                                <div className="text-right font-mono">
                                  <span className="text-[10px] text-flashMuted block">Margine (Edge)</span>
                                  <span className="font-bold text-emerald-400 text-sm">+{vb.edgePercent}%</span>
                                </div>
                                <div className="text-right font-mono">
                                  <span className="text-[10px] text-flashMuted block">Miză Recomandată</span>
                                  <span className="font-bold text-amber-400 text-sm">{vb.suggestedStakePercent}%</span>
                                </div>
                              </div>
                            </div>

                            {/* Comparison Row: Bookmaker Odds vs Fair Model Odds */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-[11px] py-1.5 bg-black/40 rounded-lg font-mono">
                              <div>
                                <span className="text-flashMuted block text-[9px]">Cotă Casă</span>
                                <strong className="text-gray-100">{vb.bookmakerOdds.toFixed(2)}</strong>
                              </div>
                              <div>
                                <span className="text-flashMuted block text-[9px]">Cotă Corectă (Fair)</span>
                                <strong className="text-emerald-400">{vb.fairOdds.toFixed(2)}</strong>
                              </div>
                              <div>
                                <span className="text-flashMuted block text-[9px]">Probabilitate Model</span>
                                <strong className="text-flashGreen">{(vb.modelProb * 100).toFixed(1)}%</strong>
                              </div>
                              <div>
                                <span className="text-flashMuted block text-[9px]">Probabilitate Devigged</span>
                                <strong className="text-gray-300">{(vb.marketDeviggedProb * 100).toFixed(1)}%</strong>
                              </div>
                            </div>

                            {vb.warningNote && (
                              <p className="text-[10px] text-amber-400/90 italic">
                                ℹ️ {vb.warningNote}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-flashBorder bg-flashCard p-4 text-center text-xs text-flashMuted">
                        Nicio cotă oferită de casele de pariuri nu atinge pragul minim de valoare statistică (+5% Edge).
                      </div>
                    )}
                  </div>

                  {/* Corner & Card Market Radar Box */}
                  {pred && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {/* Corner Radar */}
                        {pred.cornersPrediction && (
                          <div className="rounded-xl border border-flashBorder bg-[#111722] p-3.5 space-y-2.5">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-xs text-amber-400 flex items-center gap-1.5">
                                <Flag className="h-4 w-4 text-amber-400" />
                                Radar Cornere (Bivariate Poisson)
                              </span>
                              <span className="text-[10px] font-mono text-gray-300 bg-black/40 px-2 py-0.5 rounded border border-gray-800">
                                Total: {pred.cornersPrediction.expectedTotalCorners}
                              </span>
                            </div>

                            <div className="text-[11px] text-gray-300">
                              Interval estimat: <strong className="text-amber-300">{pred.cornersPrediction.mostLikelyCornerRange}</strong>
                            </div>

                            <div className="grid grid-cols-3 gap-1.5 text-center text-xs font-mono">
                              {pred.cornersPrediction.overUnderCorners.slice(1, 4).map((ou) => (
                                <div key={ou.line} className="rounded bg-[#161e2b] p-1.5">
                                  <div className="text-[10px] text-flashMuted">Peste {ou.line}</div>
                                  <div className="font-black text-amber-400">{(ou.overProb * 100).toFixed(0)}%</div>
                                  <div className="text-[9px] text-gray-400">@{ou.fairOverOdds}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Card Radar */}
                        {pred.cardsPrediction && (
                          <div className="rounded-xl border border-flashBorder bg-[#111722] p-3.5 space-y-2.5">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-xs text-yellow-400 flex items-center gap-1.5">
                                <Shield className="h-4 w-4 text-yellow-400" />
                                Radar Cartonașe & Disciplină
                              </span>
                              <span className="text-[10px] font-mono text-gray-300 bg-black/40 px-2 py-0.5 rounded border border-gray-800">
                                Total: {pred.cardsPrediction.expectedTotalCards}
                              </span>
                            </div>

                            <div className="text-[11px] text-gray-300">
                              Arbitru: <strong className="text-yellow-300">{currentFixture.referee ? currentFixture.referee.name : 'Standard'}</strong> ({pred.cardsPrediction.refereeImpactFactor}x severitate)
                            </div>

                            <div className="grid grid-cols-3 gap-1.5 text-center text-xs font-mono">
                              {pred.cardsPrediction.overUnderCards.slice(1, 4).map((ou) => (
                                <div key={ou.line} className="rounded bg-[#161e2b] p-1.5">
                                  <div className="text-[10px] text-flashMuted">Peste {ou.line}</div>
                                  <div className="font-black text-yellow-400">{(ou.overProb * 100).toFixed(0)}%</div>
                                  <div className="text-[9px] text-gray-400">@{(1 / Math.max(0.01, ou.overProb)).toFixed(2)}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                </>
              ) : (
                <div className="rounded-xl border border-flashBorder bg-flashCard p-8 text-center text-xs text-flashMuted">
                  Predicțiile statistice se calculează în timp real pe baza istoricului de forțe.
                </div>
              )}
            </div>
          )}

          {/* TAB 5: xT, Tracking Optic & Positional Matrix (2026 Sharp) */}
          {activeTab === 'tactics' && !pred?.tacticalTracking && (
            <div className="rounded-xl border border-slate-700/60 bg-slate-900/50 p-5 space-y-2">
              <h3 className="font-bold text-sm text-slate-200">Date tactice indisponibile</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Modelul tactic nu a putut fi calculat pentru acest meci — lipsesc datele de intrare
                (echipe nerecunoscute în baza istorică sau predicție indisponibilă). Nu afișăm
                valori estimate în locul lor.
              </p>
            </div>
          )}

          {activeTab === 'tactics' && pred?.tacticalTracking && (
            <div className="space-y-6">
              {/* Header Box */}
              <div className="rounded-xl border border-teal-500/40 bg-gradient-to-r from-[#091520] via-[#0b1b2a] to-[#071018] p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Zap className="h-5 w-5 text-cyberEmerald animate-pulse" />
                    <h3 className="font-bold text-base text-white">Matrice Tactică, Tracking Optic & xT (2023–2026)</h3>
                  </div>
                  <span className={`px-2.5 py-1 rounded-md text-xs font-mono font-bold border ${
                    pred?.tacticalTracking?.counterAttackRiskLevel === 'HIGH'
                      ? 'bg-red-950 border-red-700 text-red-300'
                      : 'bg-teal-950 border-teal-700 text-teal-300'
                  }`}>
                    Risc Tranziție: {pred.tacticalTracking.counterAttackRiskLevel}
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {pred?.tacticalTracking?.tacticalAdvantageSummary || `Generare xT proiectată: ${pred.tacticalTracking.home.expectedThreat_xT} gazde vs ${pred.tacticalTracking.away.expectedThreat_xT} oaspeți.`}
                </p>
              </div>

              {/* 1. Defensive Line Height & Field Tilt */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl border border-slate-800 bg-[#0d1420] p-4 space-y-3">
                  <div className="flex justify-between items-center text-xs font-bold">
                    <span className="text-slate-200">Înălțime Medie Linie Defensivă</span>
                    <span className="font-mono text-cyan-400 text-[11px]">Metri de la poartă</span>
                  </div>
                  <div className="flex justify-between items-center font-mono text-sm">
                    <span className="text-emerald-400 font-bold">{currentFixture.homeTeam.name}: {pred.tacticalTracking.home.defensiveLineHeightMeters}m</span>
                    <span className="text-blue-400 font-bold">{currentFixture.awayTeam.name}: {pred.tacticalTracking.away.defensiveLineHeightMeters}m</span>
                  </div>
                  <div className="h-2.5 w-full bg-slate-800 rounded-full overflow-hidden flex">
                    <div className="h-full bg-emerald-500" style={{ width: `${((pred.tacticalTracking.home.defensiveLineHeightMeters) / 60) * 100}%` }} />
                    <div className="h-full bg-blue-500" style={{ width: `${((pred.tacticalTracking.away.defensiveLineHeightMeters) / 60) * 100}%` }} />
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono flex justify-between">
                    <span>Bloc Înalt / Counter-vulnerabil</span>
                    <span>Bloc Mediu / Compact</span>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-[#0d1420] p-4 space-y-3">
                  <div className="flex justify-between items-center text-xs font-bold">
                    <span className="text-slate-200">Field Tilt (Posesie Ultima Treime)</span>
                    <span className="font-mono text-teal-400 text-[11px]">Dominare Teritorială</span>
                  </div>
                  <div className="flex justify-between items-center font-mono text-sm">
                    <span className="text-emerald-400 font-bold">{pred.tacticalTracking.home.fieldTiltPercent}%</span>
                    <span className="text-blue-400 font-bold">{pred.tacticalTracking.away.fieldTiltPercent}%</span>
                  </div>
                  <div className="h-2.5 w-full bg-slate-800 rounded-full overflow-hidden flex">
                    <div className="h-full bg-emerald-500" style={{ width: `${pred.tacticalTracking.home.fieldTiltPercent}%` }} />
                    <div className="h-full bg-blue-500" style={{ width: `${pred.tacticalTracking.away.fieldTiltPercent}%` }} />
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono flex justify-between">
                    <span>{currentFixture.homeTeam.name}</span>
                    <span>{currentFixture.awayTeam.name}</span>
                  </div>
                </div>
              </div>

              {/* 2. xT, Pack-Breaking Passes, Space Creation */}
              <div className="rounded-xl border border-slate-800 bg-[#0d1420] p-4 space-y-3">
                <h4 className="font-bold text-xs text-slate-200 uppercase tracking-wider font-mono">
                  Indicatori Avansați de Fază (xT, Pase ce Sparg Linii, Pressing &lt;5m)
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center font-mono">
                  <div className="rounded-lg bg-[#141d2b] p-3 border border-teal-500/30">
                    <div className="text-[10px] text-slate-400">Expected Threat (xT)</div>
                    <div className="text-base font-black text-teal-300 mt-1">
                      {pred.tacticalTracking.home.expectedThreat_xT} vs {pred.tacticalTracking.away.expectedThreat_xT}
                    </div>
                  </div>
                  <div className="rounded-lg bg-[#141d2b] p-3 border border-cyan-500/30">
                    <div className="text-[10px] text-slate-400">Pase Linii Spuse</div>
                    <div className="text-base font-black text-cyan-300 mt-1">
                      {pred.tacticalTracking.home.packBreakingPassesAvg} vs {pred.tacticalTracking.away.packBreakingPassesAvg}
                    </div>
                  </div>
                  <div className="rounded-lg bg-[#141d2b] p-3 border border-purple-500/30">
                    <div className="text-[10px] text-slate-400">Presing Sub 5m</div>
                    <div className="text-base font-black text-purple-300 mt-1">
                      {pred.tacticalTracking.home.pressingIntensityProximity} vs {pred.tacticalTracking.away.pressingIntensityProximity}
                    </div>
                  </div>
                  <div className="rounded-lg bg-[#141d2b] p-3 border border-amber-500/30">
                    <div className="text-[10px] text-slate-400">Index Spațiu Creat</div>
                    <div className="text-base font-black text-amber-300 mt-1">
                      {pred.tacticalTracking.home.spaceCreationIndex} vs {pred.tacticalTracking.away.spaceCreationIndex}
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. Faze Fixe & Consecințe Oboseală / Zbor */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl border border-slate-800 bg-[#0d1420] p-4 space-y-2 font-mono text-xs">
                  <div className="font-bold text-slate-200 flex justify-between border-b border-slate-800 pb-2">
                    <span>Eficiență Faze Fixe (Corners &amp; Free-Kicks)</span>
                    <span className="text-amber-400">🚩 Set Pieces</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/40">
                    <span className="text-slate-400">xG Faze Fixe / Meci (Gazde):</span>
                    <span className="font-bold text-emerald-400">{pred.tacticalTracking.home.setPieceEfficiency.setPieceXgPerMatch} xG</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/40">
                    <span className="text-slate-400">Rată Conversie Cornere:</span>
                    <span className="font-bold text-teal-300">{pred.tacticalTracking.home.setPieceEfficiency.cornerConversionPercent}%</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-400">Vulnerabilitate Concedare:</span>
                    <span className="font-bold text-slate-300">{pred.tacticalTracking.home.setPieceEfficiency.concededSetPieceXg} xG / meci</span>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-[#0d1420] p-4 space-y-2 font-mono text-xs">
                  <div className="font-bold text-slate-200 flex justify-between border-b border-slate-800 pb-2">
                    <span>Context Ambiental &amp; Zbor (GPS Exhaustion)</span>
                    <span className="text-cyan-400">✈️ Travel Fatigue</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/40">
                    <span className="text-slate-400">Distanță Zbor Deplasare:</span>
                    <span className="font-bold text-cyan-300">{pred.tacticalTracking.environmentalExhaustionAway.flightKm} km</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/40">
                    <span className="text-slate-400">Zile Odihnă (Gazde / Oaspeți):</span>
                    <span className="font-bold text-slate-200">{pred.tacticalTracking.environmentalExhaustionHome.restDays}z / {pred.tacticalTracking.environmentalExhaustionAway.restDays}z</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-400">Stare Ambientală:</span>
                    <span className="font-bold text-slate-300 text-[10px]">{pred.tacticalTracking.environmentalExhaustionAway.heatHumidityImpact ?? 'Date meteo indisponibile'}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}