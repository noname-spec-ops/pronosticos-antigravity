'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Star, Flame, Sparkles, Zap, Radio, Trophy, Flag } from 'lucide-react';
import { getLeagueSortOrder, isTopMatch } from '@/lib/leaguePriority';
import type { Fixture } from '@/types/football';

interface MatchListProps {
  fixtures: Fixture[];
  favorites: number[];
  onToggleFavorite: (id: number) => void;
  onSelectMatch: (fixture: Fixture) => void;
}

export default function MatchList({
  fixtures,
  favorites,
  onToggleFavorite,
  onSelectMatch,
}: MatchListProps) {
  const [collapsedLeagues, setCollapsedLeagues] = useState<Record<string, boolean>>({});

  const toggleLeagueCollapse = (leagueKey: string) => {
    setCollapsedLeagues((prev) => ({ ...prev, [leagueKey]: !prev[leagueKey] }));
  };

  // Group by "Country: League Name"
  const grouped = fixtures.reduce<Record<string, { league: Fixture['league']; matches: Fixture[] }>>(
    (acc, match) => {
      const key = `${match.league.country}: ${match.league.name}`;
      if (!acc[key]) {
        acc[key] = { league: match.league, matches: [] };
      }
      acc[key].matches.push(match);
      return acc;
    },
    {}
  );

  // Sort groups by league priority (Champions League, Premier League, La Liga, Serie A first)
  const sortedGroupEntries = Object.entries(grouped).sort(([, a], [, b]) => {
    const orderA = getLeagueSortOrder(a.league);
    const orderB = getLeagueSortOrder(b.league);
    if (orderA !== orderB) return orderA - orderB;
    return `${a.league.country}: ${a.league.name}`.localeCompare(`${b.league.country}: ${b.league.name}`);
  });

  if (fixtures.length === 0) {
    return (
      <div className="rounded-xl border border-flashBorder bg-flashCard/60 p-12 text-center text-flashMuted">
        <p className="text-base font-semibold text-gray-300">Niciun meci găsit pentru filtrele selectate.</p>
        <p className="mt-1 text-xs">Schimbă data sau alege filtrul „Toate” pentru a vedea toate meciurile disponibile.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {sortedGroupEntries.map(([key, group]) => {
        const isCollapsed = collapsedLeagues[key] || false;
        const isTopTierLeague = getLeagueSortOrder(group.league) <= 14;

        return (
          <div key={key} className="overflow-hidden rounded-xl border border-flashBorder bg-flashCard shadow-sm">
            {/* League Header */}
            <div
              onClick={() => toggleLeagueCollapse(key)}
              className="flex cursor-pointer items-center justify-between bg-[#141b26] px-4 py-2.5 hover:bg-[#1a2332] transition select-none"
            >
              <div className="flex items-center gap-2.5">
                {group.league.flag && group.league.flag.startsWith('http') ? (
                  <img
                    src={group.league.flag}
                    alt={group.league.country || ''}
                    className="h-3.5 w-5 object-cover rounded-[2px]"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <span className="text-base">{group.league.flag || '⚽'}</span>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-xs uppercase tracking-wider text-gray-200">
                    {group.league.country}: {group.league.name}
                  </span>
                  {isTopTierLeague && (
                    <span className="flex items-center gap-1 rounded bg-amber-500/15 border border-amber-500/40 px-1.5 py-0.2 text-[9px] font-bold text-amber-300">
                      <Trophy className="h-2.5 w-2.5 text-amber-400" />
                      TOP
                    </span>
                  )}
                  {group.league.round && (
                    <span className="text-[11px] text-flashMuted font-normal">
                      • {group.league.round}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 text-flashMuted">
                <span className="text-[11px] font-semibold">{group.matches.length} meciuri</span>
                {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </div>

            {/* Matches in League */}
            {!isCollapsed && (
              <div className="divide-y divide-flashBorder/40">
                {group.matches.map((m) => {
                  const isFav = favorites.includes(m.id);
                  const isLive = ['1H', 'HT', '2H', 'ET', 'P'].includes(m.status);
                  const isFinished = ['FT', 'AET', 'PEN'].includes(m.status);
                  const hasValueBet = m.prediction && m.prediction.valueBets && m.prediction.valueBets.length > 0;

                  return (
                    <div
                      key={m.id}
                      onClick={() => onSelectMatch(m)}
                      className="group flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-flashHover/60 cursor-pointer transition"
                    >
                      {/* Left: Fav Star + Status / Time */}
                      <div className="flex items-center gap-3 min-w-[90px]">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleFavorite(m.id);
                          }}
                          className="text-gray-500 hover:text-yellow-400 transition"
                        >
                          <Star
                            className={`h-4 w-4 ${
                              isFav ? 'fill-yellow-400 text-yellow-400' : 'hover:text-yellow-400'
                            }`}
                          />
                        </button>

                        <div className="text-center">
                          {isLive ? (
                            <span className="inline-block font-mono text-xs font-bold text-flashRed animate-pulse">
                              {m.status === 'HT' ? 'Pauza' : `${m.elapsedMinute}'`}
                            </span>
                          ) : isFinished ? (
                            <span className="text-[11px] font-semibold text-gray-500">Final</span>
                          ) : (
                            <span className="text-xs font-mono text-gray-400">
                              {new Date(m.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Middle: Teams & Scores */}
                      <div className="flex-1 min-w-[200px] max-w-md">
                        {/* Home Team */}
                        <div className="flex items-center justify-between py-0.5">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-gray-100 group-hover:text-flashGreen transition">
                              {m.homeTeam.name}
                            </span>
                            {m.stats?.redCards?.home ? (
                              <span className="rounded bg-red-600 px-1 text-[9px] font-bold text-white">
                                {m.stats.redCards.home}
                              </span>
                            ) : null}
                            {m.formHome && m.formHome.formSequence.length > 0 && (
                              <div className="hidden sm:flex items-center gap-0.5 ml-1">
                                {m.formHome.formSequence.slice(0, 5).map((res, i) => (
                                  <span
                                    key={i}
                                    className={`inline-flex items-center justify-center w-3.5 h-3.5 rounded text-[8px] font-black ${
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
                            )}
                          </div>
                          <span className="font-mono text-sm font-bold text-gray-100">
                            {m.score.current.home !== null ? m.score.current.home : '-'}
                          </span>
                        </div>

                        {/* Away Team */}
                        <div className="flex items-center justify-between py-0.5">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-gray-100 group-hover:text-flashGreen transition">
                              {m.awayTeam.name}
                            </span>
                            {m.stats?.redCards?.away ? (
                              <span className="rounded bg-red-600 px-1 text-[9px] font-bold text-white">
                                {m.stats.redCards.away}
                              </span>
                            ) : null}
                            {m.formAway && m.formAway.formSequence.length > 0 && (
                              <div className="hidden sm:flex items-center gap-0.5 ml-1">
                                {m.formAway.formSequence.slice(0, 5).map((res, i) => (
                                  <span
                                    key={i}
                                    className={`inline-flex items-center justify-center w-3.5 h-3.5 rounded text-[8px] font-black ${
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
                            )}
                          </div>
                          <span className="font-mono text-sm font-bold text-gray-100">
                            {m.score.current.away !== null ? m.score.current.away : '-'}
                          </span>
                        </div>

                        {/* Half-time note if applicable */}
                        {m.score.halftime.home !== null && (
                          <div className="text-[10px] text-flashMuted">
                            (Pauză: {m.score.halftime.home} - {m.score.halftime.away})
                          </div>
                        )}
                      </div>

                      {/* Right: Odds Badges & AI Value Bet Indicator */}
                      <div className="flex items-center gap-2">
                        {isLive && m.prediction?.inPlayMomentum && m.prediction.inPlayMomentum.isHighPressureState && (
                          <div className="flex items-center gap-1 rounded-md bg-red-950/60 border border-red-500/50 px-2 py-1 text-[11px] font-bold text-red-300 shadow-sm animate-pulse">
                            <Zap className="h-3.5 w-3.5 text-red-400" />
                            <span>
                              {m.prediction.inPlayMomentum.homeMomentum > 50 ? m.prediction.inPlayMomentum.homeMomentum : m.prediction.inPlayMomentum.awayMomentum}% Presiune
                            </span>
                            <span className="text-[10px] text-amber-300 font-normal hidden sm:inline">• Alertă Gol</span>
                          </div>
                        )}

                        {hasValueBet && (
                          <div className="flex items-center gap-1.5 rounded-md bg-amber-500/15 border border-amber-500/40 px-2 py-1 text-[11px] font-bold text-amber-300 shadow-sm">
                            <Flame className="h-3.5 w-3.5 text-amber-400" />
                            <span>
                              {m.prediction!.valueBets[0].grade === 'A+' ? 'Grad A+' : m.prediction!.valueBets[0].grade === 'A' ? 'Grad A' : 'Value Edge'}
                            </span>
                            <span className="text-[10px] text-emerald-400 font-mono font-black">
                              +{m.prediction!.valueBets[0].edgePercent}%
                            </span>
                          </div>
                        )}

                        {m.prediction?.cornersPrediction && (
                          <div
                            className="hidden xl:flex items-center gap-1 rounded-md bg-amber-950/40 border border-amber-800/40 px-2 py-1 text-[10px] font-mono text-amber-300"
                            title={`Proiecție Cornere: ${m.prediction.cornersPrediction.expectedTotalCorners} (${m.prediction.cornersPrediction.mostLikelyCornerRange})`}
                          >
                            <Flag className="h-3 w-3 text-amber-400" />
                            <span>{m.prediction.cornersPrediction.expectedTotalCorners} corn</span>
                          </div>
                        )}

                        {m.odds && (
                          <div className="flex items-center gap-1 text-xs font-mono">
                            <div className="flex flex-col items-center rounded border border-flashBorder bg-[#111722] px-2 py-1 min-w-[42px]">
                              <span className="text-[9px] text-flashMuted">1</span>
                              <span className="font-semibold text-gray-200">{m.odds.match1X2.home.toFixed(2)}</span>
                            </div>
                            <div className="flex flex-col items-center rounded border border-flashBorder bg-[#111722] px-2 py-1 min-w-[42px]">
                              <span className="text-[9px] text-flashMuted">X</span>
                              <span className="font-semibold text-gray-200">{m.odds.match1X2.draw.toFixed(2)}</span>
                            </div>
                            <div className="flex flex-col items-center rounded border border-flashBorder bg-[#111722] px-2 py-1 min-w-[42px]">
                              <span className="text-[9px] text-flashMuted">2</span>
                              <span className="font-semibold text-gray-200">{m.odds.match1X2.away.toFixed(2)}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}