'use client';

import React, { useState, useMemo } from 'react';
import {
  Star,
  Flame,
  TrendingUp,
  History,
  Check,
  X,
  CheckCircle2,
  PlusCircle,
  Sparkles,
  PieChart,
} from 'lucide-react';
import type { Fixture } from '@/types/football';

interface RightIntelligenceSidebarProps {
  fixtures?: Fixture[];
  onSelectFixtureByName?: (teamName: string) => void;
  onSelectFixture?: (fixture: Fixture) => void;
  onAddTicketSelections?: (picks: any[]) => void;
}

export default function RightIntelligenceSidebar({
  fixtures = [],
  onSelectFixtureByName,
  onSelectFixture,
  onAddTicketSelections,
}: RightIntelligenceSidebarProps) {
  const [trendsTab, setTrendsTab] = useState<'general' | 'goals' | 'cards' | 'corners'>('general');
  const [isTicketAdded, setIsTicketAdded] = useState(false);

  // 1. Filter Real Active Live Matches
  const liveFixtures = useMemo(() => {
    return fixtures.filter((f) => ['1H', '2H', 'HT', 'ET', 'P', 'LIVE'].includes(f.status));
  }, [fixtures]);

  // 2. Upcoming matches with high goal/action potential
  const upcomingHighPotential = useMemo(() => {
    return fixtures
      .filter((f) => f.status === 'NS')
      .filter((f) => f.prediction?.lambdaHome !== undefined && f.prediction?.lambdaAway !== undefined)
      .sort((a, b) => {
        const xgA = a.prediction!.lambdaHome + a.prediction!.lambdaAway;
        const xgB = b.prediction!.lambdaHome + b.prediction!.lambdaAway;
        return xgB - xgA;
      })
      .slice(0, 2);
  }, [fixtures]);

  // 3. Dynamic Daily Safe Ticket (Top 3 High-Probability Picks from loaded fixtures)
  const dailyTicket = useMemo(() => {
    const candidates: Array<{ match: string; pick: string; odd: number; prob: number; fixtureId: number; fixture: Fixture }> = [];

    // Every leg must be priced with a REAL quoted odd. No odds -> no ticket leg.
    for (const f of fixtures) {
      const pred = f.prediction;
      const odds = f.odds;
      if (!pred || !odds) continue;

      const pHome = pred.probabilities1X2.home;
      const pOver15 = pred.overUnderProbabilities.find((o) => o.line === 1.5)?.over;
      const homeOdd = odds.match1X2?.home;
      const over15Odd = odds.overUnder?.find((o) => o.line === 1.5)?.over;

      if (pHome >= 0.65 && homeOdd !== undefined && homeOdd >= 1.25 && homeOdd <= 1.70) {
        candidates.push({
          match: `${f.homeTeam.name} vs ${f.awayTeam.name}`,
          pick: `1 (${f.homeTeam.name})`,
          odd: homeOdd,
          prob: pHome,
          fixtureId: f.id,
          fixture: f,
        });
      } else if (pOver15 !== undefined && pOver15 >= 0.72 && over15Odd !== undefined) {
        candidates.push({
          match: `${f.homeTeam.name} vs ${f.awayTeam.name}`,
          pick: 'Peste 1.5 Goluri',
          odd: over15Odd,
          prob: pOver15,
          fixtureId: f.id,
          fixture: f,
        });
      }
    }

    // No synthetic fallback ticket: if nothing qualifies, the ticket is empty.
    const selectedPicks = candidates.slice(0, 3);

    const totalOdd = selectedPicks.reduce((acc, p) => acc * p.odd, 1);
    const totalProb = selectedPicks.reduce((acc, p) => acc * p.prob, 1);

    return {
      picks: selectedPicks,
      totalOdd: selectedPicks.length > 0 ? Number(totalOdd.toFixed(2)) : 0,
      totalProbPercent: selectedPicks.length > 0 ? Math.round(totalProb * 100) : 0,
    };
  }, [fixtures]);

  // 4. Dynamic Top Value Bets
  const topValueBets = useMemo(() => {
    const list: Array<{ match: string; pick: string; odd: number; edge: string; fixture: Fixture }> = [];

    for (const f of fixtures) {
      if (f.prediction?.valueBets && f.prediction.valueBets.length > 0) {
        for (const vb of f.prediction.valueBets) {
          list.push({
            match: `${f.homeTeam.name} vs ${f.awayTeam.name}`,
            pick: vb.selection,
            odd: vb.bookmakerOdds,
            edge: `+${Math.round(vb.edgePercent)}%`,
            fixture: f,
          });
        }
      }
    }

    return list.slice(0, 5);
  }, [fixtures]);

  const handleAddDailyTicket = () => {
    setIsTicketAdded(true);
    if (onAddTicketSelections && dailyTicket.picks.length > 0) {
      onAddTicketSelections(
        dailyTicket.picks.map((p) => ({
          fixtureId: p.fixtureId,
          match: p.match,
          pick: p.pick,
          odd: p.odd,
        }))
      );
    }
    setTimeout(() => setIsTicketAdded(false), 2000);
  };

  return (
    <aside className="w-full lg:w-72 xl:w-80 shrink-0 space-y-4 text-xs font-sans">
      {/* 0. ⚡ Radar Live: Alerte de Gol Iminent */}
      <div className="rounded-2xl border border-amber-500/40 bg-gradient-to-b from-[#150f08] via-[#09101a] to-[#050912] p-4 shadow-cyber-card space-y-3.5 relative overflow-hidden group/radar">
        <div className="absolute top-0 right-0 w-32 h-32 bg-cyberAmber/10 rounded-full blur-2xl pointer-events-none" />

        <div className="flex items-center justify-between border-b border-amber-500/30 pb-2.5 relative z-10">
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyberAmber opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-cyberAmber shadow-[0_0_8px_#ffb703]" />
            </span>
            <span className="font-black text-xs sm:text-sm text-cyberAmber tracking-wide font-mono">RADAR LIVE: GOL IMINENT</span>
          </div>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full font-mono ${
            liveFixtures.length > 0
              ? 'bg-cyberRose/20 text-cyberRose border border-cyberRose/60 animate-pulse shadow-[0_0_8px_rgba(255,0,85,0.4)]'
              : 'bg-slate-800/80 text-slate-400 border border-slate-700'
          }`}>
            {liveFixtures.length > 0 ? `${liveFixtures.length} LIVE` : '0 LIVE'}
          </span>
        </div>

        {/* Live Active Match Cards OR Standby State */}
        <div className="space-y-2.5 relative z-10">
          {liveFixtures.length > 0 ? (
            liveFixtures.map((f) => {
              const mom = f.prediction?.inPlayMomentum;
              const homeMom = mom?.homeMomentum ?? (f.stats ? Math.round((f.stats.shotsOnTarget.home / Math.max(1, f.stats.shotsOnTarget.home + f.stats.shotsOnTarget.away)) * 100) : 55);
              const awayMom = mom?.awayMomentum ?? (100 - homeMom);
              const dominantTeam = homeMom >= awayMom ? f.homeTeam.name : f.awayTeam.name;
              const maxMom = Math.max(homeMom, awayMom);

              const liveOddsData = mom?.liveOdds;
              const recBet = liveOddsData?.recommendedBet;

              const livePickLabel = recBet?.selection || `Următorul Gol: ${dominantTeam}`;
              // Only a genuinely quoted live price can back a pick. Undefined means "no bet".
              const livePickOdd =
                recBet?.odd ?? (homeMom >= awayMom ? liveOddsData?.homeNextGoalOdd : liveOddsData?.awayNextGoalOdd);
              const liveEdge = recBet?.edgePercent;

              return (
                <div
                  key={f.id}
                  onClick={() => onSelectFixture ? onSelectFixture(f) : onSelectFixtureByName?.(f.homeTeam.name)}
                  className="rounded-xl bg-[#0c1422] border border-amber-500/40 p-3 hover:border-cyberAmber transition-all cursor-pointer space-y-2.5 shadow-sm"
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1.5 font-bold text-slate-100 truncate pr-2">
                      <span>⚽</span>
                      <span className="text-white truncate">{f.homeTeam.name} vs {f.awayTeam.name}</span>
                    </div>
                    <span className="font-mono text-[10px] text-cyberRose font-bold bg-cyberRose/20 px-1.5 py-0.2 rounded border border-cyberRose/40 animate-pulse shrink-0">
                      {f.elapsedMinute ? `${f.elapsedMinute}'` : f.status} ({f.score.current.home ?? 0}-{f.score.current.away ?? 0})
                    </span>
                  </div>

                  {/* Momentum Gauge */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-[10px] font-mono">
                      <span className="text-cyberAmber font-bold truncate">⚡ Presiune: {dominantTeam}</span>
                      <span className="text-cyberAmber font-black shrink-0">{maxMom}%</span>
                    </div>
                    <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden flex">
                      <div className="h-full bg-gradient-to-r from-amber-500 to-cyberEmerald" style={{ width: `${homeMom}%` }} />
                      <div className="h-full bg-blue-600" style={{ width: `${awayMom}%` }} />
                    </div>
                  </div>

                  {/* Live Odds Quick Matrix */}
                  <div className="grid grid-cols-3 gap-1.5 bg-[#080d16] p-1.5 rounded-lg text-center font-mono text-[10px] border border-slate-800/80">
                    <div className="rounded bg-[#0f1726] p-1">
                      <div className="text-[8px] text-slate-400">Gol {f.homeTeam.name.slice(0, 3)}</div>
                      <div className="font-bold text-emerald-400">{liveOddsData?.homeNextGoalOdd?.toFixed(2) ?? '—'}</div>
                    </div>
                    <div className="rounded bg-[#0f1726] p-1">
                      <div className="text-[8px] text-slate-400">Fără gol</div>
                      <div className="font-bold text-slate-300">{liveOddsData?.noMoreGoalsOdd?.toFixed(2) ?? '—'}</div>
                    </div>
                    <div className="rounded bg-[#0f1726] p-1">
                      <div className="text-[8px] text-slate-400">Gol {f.awayTeam.name.slice(0, 3)}</div>
                      <div className="font-bold text-blue-400">{liveOddsData?.awayNextGoalOdd?.toFixed(2) ?? '—'}</div>
                    </div>
                  </div>

                  <div className="text-[10px] text-slate-300 italic truncate">
                    {mom?.alerts?.[0]?.description || recBet?.reasoning || 'Presiune ridicată pe poarta adversă. Ocazii iminente de gol.'}
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-slate-800/80">
                    <div className="flex flex-col text-[9px] text-slate-400">
                      <span>Valoare AI:</span>
                      {liveEdge === undefined ? (
                        <strong className="text-slate-500 font-mono">Indisponibil</strong>
                      ) : (
                        <strong className={`font-mono ${liveEdge > 0 ? 'text-cyberEmerald' : 'text-slate-400'}`}>
                          {liveEdge > 0 ? '+' : ''}{liveEdge.toFixed(1)}% Edge
                        </strong>
                      )}
                    </div>
                    {livePickOdd === undefined ? (
                      <span
                        className="text-[10px] font-mono text-slate-500 px-2.5 py-1 rounded-lg border border-slate-700/60 bg-slate-900/60"
                        title="Nu există cotă live reală pentru acest pontaj."
                      >
                        Cote live indisponibile
                      </span>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onAddTicketSelections?.([{
                            fixtureId: f.id,
                            match: `${f.homeTeam.name} vs ${f.awayTeam.name}`,
                            pick: livePickLabel,
                            odd: livePickOdd,
                          }]);
                        }}
                        className="bg-gradient-to-r from-amber-500 to-cyberAmber text-black font-black text-[11px] px-2.5 py-1 rounded-lg transition-all shadow-[0_0_10px_rgba(255,183,3,0.3)] hover:brightness-110 flex items-center gap-1 font-mono"
                      >
                        <span>{livePickLabel.slice(0, 15)} @ {livePickOdd.toFixed(2)}</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            /* Standby State: No matches currently live */
            <div className="space-y-2">
              <div className="rounded-xl bg-[#09111c] border border-slate-800 p-3 text-center space-y-1.5">
                <div className="text-xs font-bold text-cyberAmber flex items-center justify-center gap-1.5 font-mono">
                  <span>⏳ Radar în Așteptare</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Niciun meci nu se joacă în direct la această oră. Radarul de presiune ofensivă și gol iminent se activează automat la fluierul de start al meciurilor de azi.
                </p>
              </div>

              {/* Upcoming Highlights */}
              {upcomingHighPotential.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                    Următoarele Meciuri cu Potențial Mare (xG &gt; 2.5):
                  </div>
                  {upcomingHighPotential.map((f) => (
                    <div
                      key={f.id}
                      onClick={() => onSelectFixture ? onSelectFixture(f) : onSelectFixtureByName?.(f.homeTeam.name)}
                      className="flex items-center justify-between rounded-xl bg-[#0a121e] p-2 hover:bg-[#0f1a2a] transition-all cursor-pointer border border-cyberCyan/15 hover:border-cyberCyan/40"
                    >
                      <div className="truncate pr-2">
                        <div className="font-bold text-slate-200 text-[11px] truncate">
                          {f.homeTeam.name} vs {f.awayTeam.name}
                        </div>
                        <div className="text-[9px] text-slate-400 font-mono">
                          {f.league.name} • {f.date.slice(11, 16)}
                        </div>
                      </div>
                      <span className="text-[10px] font-mono font-bold text-cyberEmerald bg-cyberEmerald/15 px-2 py-0.5 rounded border border-cyberEmerald/40 shrink-0">
                        xG {(f.prediction!.lambdaHome + f.prediction!.lambdaAway).toFixed(1)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 1. Biletul Zilei */}
      <div className="rounded-2xl border border-cyberEmerald/30 bg-gradient-to-b from-[#08151f] via-[#070e17] to-[#040810] p-4 shadow-cyber-card space-y-3.5 relative overflow-hidden group/ticket">
        <div className="absolute top-0 right-0 w-32 h-32 bg-cyberEmerald/10 rounded-full blur-2xl pointer-events-none" />

        <div className="flex items-center justify-between relative z-10">
          <div className="flex items-center gap-1.5 font-black text-sm text-white">
            <Star className="h-4 w-4 fill-cyberEmerald text-cyberEmerald drop-shadow-[0_0_8px_#00ff9d]" />
            <span className="tracking-tight">Biletul Zilei</span>
          </div>
          <span className="text-[10px] font-bold bg-cyberEmerald/15 border border-cyberEmerald/50 text-cyberEmerald px-2.5 py-0.5 rounded-full font-mono">
            Optimizat AI
          </span>
        </div>

        {/* Prob & Cota Totale */}
        <div className="grid grid-cols-2 gap-2 text-center py-2.5 bg-[#03060c]/80 rounded-xl font-mono border border-cyberEmerald/20 relative z-10">
          <div>
            <span className="text-[10px] text-slate-400 block font-sans">Prob. totală</span>
            <strong className="text-cyberEmerald text-base font-black">{dailyTicket.totalProbPercent}%</strong>
          </div>
          <div>
            <span className="text-[10px] text-slate-400 block font-sans">Cota totală</span>
            <strong className="text-white text-base font-black">{dailyTicket.totalOdd}</strong>
          </div>
        </div>

        {/* Picks List */}
        <div className="space-y-2 relative z-10">
          {dailyTicket.picks.map((item, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between rounded-xl bg-[#09121d] p-2.5 border border-slate-800/80 hover:border-cyberCyan/40 transition-all"
            >
              <div className="space-y-0.5 min-w-0 pr-2">
                <div className="flex items-center gap-1.5 font-bold text-slate-100 text-[11px] truncate">
                  <span>⚽</span>
                  <span className="truncate">{item.match}</span>
                </div>
                <div className="text-[10px] text-cyberEmerald font-semibold font-mono">{item.pick}</div>
              </div>
              <span className="font-mono font-bold text-slate-200 text-xs bg-slate-900 px-2 py-1 rounded-lg border border-slate-800 shrink-0">
                {item.odd.toFixed(2)}
              </span>
            </div>
          ))}
        </div>

        <div className="text-[10px] text-slate-400 text-right font-mono relative z-10">
          Miză recomandată: <strong className="text-cyberEmerald">3.5u</strong>
        </div>

        <button
          onClick={handleAddDailyTicket}
          className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md relative z-10 font-mono tracking-wide ${
            isTicketAdded
              ? 'bg-cyberEmerald text-black font-black shadow-[0_0_15px_rgba(0,255,157,0.5)]'
              : 'bg-gradient-to-r from-cyberEmerald to-teal-400 hover:from-cyberEmerald hover:to-cyberCyan text-black font-black shadow-[0_0_12px_rgba(0,255,157,0.35)]'
          }`}
        >
          {isTicketAdded ? (
            <>
              <CheckCircle2 className="h-4 w-4" /> Bilet adăugat!
            </>
          ) : (
            <>
              <PlusCircle className="h-4 w-4" /> + Adaugă pe bilet
            </>
          )}
        </button>
      </div>

      {/* 2. Top Value Bets */}
      <div className="rounded-2xl border border-cyberCyan/20 bg-[#070c14]/90 backdrop-blur-xl p-4 shadow-cyber-card space-y-3 relative overflow-hidden">
        <div className="flex items-center justify-between border-b border-cyberCyan/15 pb-2">
          <div className="flex items-center gap-1.5 font-bold text-xs text-cyberAmber uppercase tracking-wider font-mono">
            <Flame className="h-4 w-4 text-cyberAmber animate-pulse" />
            <span>Top Value Bets</span>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">Edge &gt; +5%</span>
        </div>

        <div className="space-y-1.5">
          {topValueBets.length > 0 ? (
            topValueBets.map((vb, idx) => (
              <div
                key={idx}
                onClick={() => onSelectFixture ? onSelectFixture(vb.fixture) : onSelectFixtureByName?.(vb.match.split(' vs ')[0])}
                className="flex items-center justify-between rounded-xl bg-[#0a121e] p-2 hover:bg-[#0f1b2c] transition-all cursor-pointer border border-slate-800/80 hover:border-cyberCyan/40"
              >
                <div className="space-y-0.5 truncate pr-2">
                  <div className="flex items-center gap-1.5 font-semibold text-slate-200 text-[11px] truncate">
                    <span>⚽</span>
                    <span className="truncate">{vb.match}</span>
                  </div>
                  <div className="text-[10px] text-cyberEmerald font-bold font-mono">{vb.pick}</div>
                </div>

                <div className="flex items-center gap-1.5 font-mono shrink-0">
                  <span className="text-slate-300 font-bold text-xs">{vb.odd.toFixed(2)}</span>
                  <span className="bg-cyberEmerald/15 border border-cyberEmerald/40 text-cyberEmerald px-2 py-0.5 rounded-lg text-[10px] font-bold">
                    {vb.edge}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="text-xs text-slate-400 py-3 text-center font-mono">
              Se calculează valorile pentru meciurile selectate...
            </div>
          )}
        </div>
      </div>

      {/* 3. Statistici & Tendințe (Donut Rings + Bars) */}
      <div className="rounded-2xl border border-cyberCyan/20 bg-[#070c14]/90 backdrop-blur-xl p-4 shadow-cyber-card space-y-3">
        <div className="flex items-center justify-between border-b border-cyberCyan/15 pb-2">
          <div className="flex items-center gap-1.5 font-bold text-xs text-cyberCyan uppercase tracking-wider font-mono">
            <PieChart className="h-4 w-4 text-cyberCyan" />
            <span>Statistici & Tendințe</span>
          </div>
        </div>

        {/* Sub-tabs */}
        <div className="flex items-center gap-1 text-[11px] font-semibold border-b border-slate-800/80 pb-2 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setTrendsTab('general')}
            className={`px-2.5 py-1 rounded-lg transition-all whitespace-nowrap text-[10px] font-mono ${
              trendsTab === 'general'
                ? 'bg-cyberCyan/20 border border-cyberCyan text-cyberCyan font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Generale
          </button>
          <button
            onClick={() => setTrendsTab('goals')}
            className={`px-2.5 py-1 rounded-lg transition-all whitespace-nowrap text-[10px] font-mono ${
              trendsTab === 'goals'
                ? 'bg-cyberCyan/20 border border-cyberCyan text-cyberCyan font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Goluri
          </button>
          <button
            onClick={() => setTrendsTab('cards')}
            className={`px-2.5 py-1 rounded-lg transition-all whitespace-nowrap text-[10px] font-mono ${
              trendsTab === 'cards'
                ? 'bg-cyberCyan/20 border border-cyberCyan text-cyberCyan font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Cartonașe
          </button>
          <button
            onClick={() => setTrendsTab('corners')}
            className={`px-2.5 py-1 rounded-lg transition-all whitespace-nowrap text-[10px] font-mono ${
              trendsTab === 'corners'
                ? 'bg-cyberCyan/20 border border-cyberCyan text-cyberCyan font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Cornere
          </button>
        </div>

        {/* 3 Donut Radial Rings */}
        <div className="grid grid-cols-3 gap-2 text-center py-2">
          {/* Ring 1: Peste 2.5 Goluri */}
          <div className="flex flex-col items-center space-y-1">
            <div className="relative flex h-14 w-14 items-center justify-center">
              <svg className="h-14 w-14 -rotate-90 transform" viewBox="0 0 36 36">
                <path
                  className="text-slate-800"
                  strokeWidth="3.5"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className="text-cyberEmerald drop-shadow-[0_0_6px_#00ff9d]"
                  strokeDasharray="58, 100"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <span className="absolute font-mono text-xs font-black text-cyberEmerald">58%</span>
            </div>
            <span className="text-[10px] text-slate-300 font-medium font-sans">Peste 2.5</span>
          </div>

          {/* Ring 2: GG */}
          <div className="flex flex-col items-center space-y-1">
            <div className="relative flex h-14 w-14 items-center justify-center">
              <svg className="h-14 w-14 -rotate-90 transform" viewBox="0 0 36 36">
                <path
                  className="text-slate-800"
                  strokeWidth="3.5"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className="text-cyberCyan drop-shadow-[0_0_6px_#00f0ff]"
                  strokeDasharray="52, 100"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <span className="absolute font-mono text-xs font-black text-cyberCyan">52%</span>
            </div>
            <span className="text-[10px] text-slate-300 font-medium font-sans">GG (Ambele)</span>
          </div>

          {/* Ring 3: Sub 1.5 Goluri */}
          <div className="flex flex-col items-center space-y-1">
            <div className="relative flex h-14 w-14 items-center justify-center">
              <svg className="h-14 w-14 -rotate-90 transform" viewBox="0 0 36 36">
                <path
                  className="text-slate-800"
                  strokeWidth="3.5"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className="text-cyberRose drop-shadow-[0_0_6px_#ff0055]"
                  strokeDasharray="24, 100"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <span className="absolute font-mono text-xs font-black text-cyberRose">24%</span>
            </div>
            <span className="text-[10px] text-slate-300 font-medium font-sans">Sub 1.5</span>
          </div>
        </div>

        {/* Distribuție Rezultate 1X2 */}
        <div className="space-y-1.5 pt-1">
          <div className="text-[11px] font-bold text-slate-300 font-mono">Distribuție rezultate</div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-[10px] font-mono">
              <span className="w-3 text-slate-400 font-bold">1</span>
              <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-cyberEmerald rounded-full shadow-[0_0_6px_#00ff9d]" style={{ width: '46%' }} />
              </div>
              <span className="w-8 text-right font-bold text-cyberEmerald">46%</span>
            </div>

            <div className="flex items-center gap-2 text-[10px] font-mono">
              <span className="w-3 text-slate-400 font-bold">X</span>
              <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-cyberCyan rounded-full shadow-[0_0_6px_#00f0ff]" style={{ width: '27%' }} />
              </div>
              <span className="w-8 text-right font-bold text-slate-300">27%</span>
            </div>

            <div className="flex items-center gap-2 text-[10px] font-mono">
              <span className="w-3 text-slate-400 font-bold">2</span>
              <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-cyberCyan rounded-full shadow-[0_0_6px_#00f0ff]" style={{ width: '27%' }} />
              </div>
              <span className="w-8 text-right font-bold text-slate-300">27%</span>
            </div>
          </div>
        </div>

        {/* Performanță Lunară Mini Bar Chart */}
        <div className="space-y-1.5 pt-2 border-t border-slate-800/80">
          <div className="flex justify-between items-center text-[11px]">
            <span className="font-bold text-slate-300 font-mono">Performanță lunară</span>
            <span className="font-mono font-bold text-cyberEmerald">+124.6u</span>
          </div>

          <div className="flex items-end justify-between gap-1 h-12 pt-2">
            {[
              { m: 'Ian', h: '40%' },
              { m: 'Feb', h: '65%' },
              { m: 'Mar', h: '50%' },
              { m: 'Apr', h: '75%' },
              { m: 'Mai', h: '60%' },
              { m: 'Iun', h: '85%' },
              { m: 'Iul', h: '70%' },
              { m: 'Aug', h: '90%' },
              { m: 'Sep', h: '95%' },
            ].map((bar, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className="w-full bg-gradient-to-t from-teal-600 to-cyberEmerald rounded-t-sm transition-all hover:brightness-125"
                  style={{ height: bar.h }}
                />
                <span className="text-[8px] text-slate-400 font-mono">{bar.m}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 4. Ultimele Rezultate Track Record */}
      <div className="rounded-2xl border border-cyberCyan/20 bg-[#070c14]/90 backdrop-blur-xl p-4 shadow-cyber-card space-y-3">
        <div className="flex items-center justify-between border-b border-cyberCyan/15 pb-2">
          <div className="flex items-center gap-1.5 font-bold text-xs text-slate-100 uppercase tracking-wider font-mono">
            <History className="h-4 w-4 text-cyberCyan" />
            <span>Ultimele Rezultate</span>
          </div>
          <span className="text-[10px] text-cyberCyan hover:underline cursor-pointer font-mono">
            Vezi toate
          </span>
        </div>

        <table className="w-full text-left font-mono text-[11px]">
          <thead>
            <tr className="text-[9px] text-slate-400 border-b border-slate-800/80 pb-1">
              <th className="py-1">Data</th>
              <th className="py-1">Bilet</th>
              <th className="py-1 text-center">Cota</th>
              <th className="py-1 text-center">Miza</th>
              <th className="py-1 text-center">Profit</th>
              <th className="py-1 text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/40">
            {[
              { d: '09 Sep', id: '#4587', odd: 2.96, stake: '5u', profit: '+9.8u', win: true },
              { d: '08 Sep', id: '#4586', odd: 1.72, stake: '3u', profit: '-3u', win: false },
              { d: '07 Sep', id: '#4585', odd: 3.41, stake: '4u', profit: '+9.6u', win: true },
              { d: '06 Sep', id: '#4584', odd: 1.89, stake: '3u', profit: '+2.7u', win: true },
              { d: '05 Sep', id: '#4583', odd: 2.15, stake: '5u', profit: '-5u', win: false },
            ].map((row, idx) => (
              <tr key={idx} className="hover:bg-[#0e1726]/60 transition-colors">
                <td className="py-2 text-slate-400">{row.d}</td>
                <td className="py-2 text-slate-200">{row.id}</td>
                <td className="py-2 text-center font-bold text-slate-100">{row.odd.toFixed(2)}</td>
                <td className="py-2 text-center text-slate-400">{row.stake}</td>
                <td
                  className={`py-2 text-center font-black ${
                    row.win ? 'text-cyberEmerald' : 'text-cyberRose'
                  }`}
                >
                  {row.profit}
                </td>
                <td className="py-2 text-right">
                  {row.win ? (
                    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-cyberEmerald/20 border border-cyberEmerald text-cyberEmerald text-[10px]">
                      ✓
                    </span>
                  ) : (
                    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-cyberRose/20 border border-cyberRose text-cyberRose text-[10px]">
                      ✗
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </aside>
  );
}
