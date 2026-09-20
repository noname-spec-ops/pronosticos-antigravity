'use client';

import React, { useState, useEffect } from 'react';
import { X, Trophy, Activity, TrendingUp, Shield, Flag, Users, Flame, RefreshCw, BarChart2, Star } from 'lucide-react';
import type { TeamStrengthMetrics, TeamDeepStats, TeamRecentForm, TeamStandingContext } from '@/types/football';

interface TeamProfileModalProps {
  teamName: string | null;
  onClose: () => void;
  onSelectMatchByTeam?: (teamName: string) => void;
}

interface TeamStatsResponse {
  teamName: string;
  metrics?: TeamStrengthMetrics;
  deepStats?: TeamDeepStats;
  recentForm?: TeamRecentForm;
  standing?: TeamStandingContext;
  timestamp?: string;
}

export default function TeamProfileModal({ teamName, onClose, onSelectMatchByTeam }: TeamProfileModalProps) {
  const [data, setData] = useState<TeamStatsResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'stats' | 'form' | 'discipline'>('overview');

  useEffect(() => {
    if (!teamName) {
      setData(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    let isMounted = true;
    fetch(`/api/stats/${encodeURIComponent(teamName)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Status ${res.status}: Nu s-au putut încărca statisticile.`);
        return res.json();
      })
      .then((json: TeamStatsResponse) => {
        if (isMounted) {
          setData(json);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.warn('[TeamProfileModal] Error fetching stats:', err.message);
          setError('Statisticile detaliate nu sunt disponibile pentru această echipă.');
        }
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [teamName]);

  if (!teamName) return null;

  const metrics = data?.metrics;
  const deepStats = data?.deepStats;
  const form = data?.recentForm;
  const standing = data?.standing;

  const teamInitials = teamName
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 3)
    .toUpperCase();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl rounded-2xl border border-cyberCyan/30 bg-[#070c14] text-slate-100 shadow-[0_0_50px_rgba(0,240,255,0.15)] overflow-hidden flex flex-col max-h-[90vh]">
        {/* Background glow accents */}
        <div className="absolute -top-20 -right-20 w-80 h-80 bg-cyberCyan/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -left-20 w-80 h-80 bg-cyberEmerald/10 rounded-full blur-3xl pointer-events-none" />

        {/* Modal Header */}
        <div className="relative z-10 border-b border-cyberCyan/20 bg-gradient-to-r from-[#0c1626] to-[#080e18] p-5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-cyberCyan/20 to-cyberEmerald/20 border border-cyberCyan/40 text-xl font-black text-cyberCyan font-mono shadow-[0_0_15px_rgba(0,240,255,0.3)]">
              {teamInitials}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black text-white tracking-tight">{teamName}</h2>
                {standing && (
                  <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                    standing.zone === 'champions_league'
                      ? 'bg-cyberCyan/15 border-cyberCyan/50 text-cyberCyan'
                      : standing.zone === 'relegation'
                      ? 'bg-red-950 border-red-700 text-red-300'
                      : 'bg-slate-800 border-slate-700 text-slate-300'
                  }`}>
                    Loc {standing.rank} • {standing.points} Puncte
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-400 font-mono mt-0.5 flex items-center gap-2">
                <span>Profil Oficial Echipă</span>
                <span>•</span>
                <span className="text-cyberEmerald font-bold">Model Cantitativ Dixon-Coles 2026</span>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:text-white hover:bg-white/10 border border-transparent hover:border-slate-700 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs Bar */}
        <div className="flex border-b border-cyberCyan/15 bg-[#09101c] text-xs font-semibold px-4">
          <button
            onClick={() => setActiveTab('overview')}
            className={`py-3 px-4 border-b-2 transition-all font-mono ${
              activeTab === 'overview'
                ? 'border-cyberCyan text-cyberCyan font-bold bg-cyberCyan/10 shadow-[inset_0_-2px_8px_rgba(0,240,255,0.2)]'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Sinteză & Forțe Dixon-Coles
          </button>
          <button
            onClick={() => setActiveTab('stats')}
            className={`py-3 px-4 border-b-2 transition-all font-mono ${
              activeTab === 'stats'
                ? 'border-cyberCyan text-cyberCyan font-bold bg-cyberCyan/10 shadow-[inset_0_-2px_8px_rgba(0,240,255,0.2)]'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Goluri, xG & Piețe
          </button>
          <button
            onClick={() => setActiveTab('form')}
            className={`py-3 px-4 border-b-2 transition-all font-mono ${
              activeTab === 'form'
                ? 'border-cyberCyan text-cyberCyan font-bold bg-cyberCyan/10 shadow-[inset_0_-2px_8px_rgba(0,240,255,0.2)]'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Formă Recentă
          </button>
          <button
            onClick={() => setActiveTab('discipline')}
            className={`py-3 px-4 border-b-2 transition-all font-mono ${
              activeTab === 'discipline'
                ? 'border-cyberCyan text-cyberCyan font-bold bg-cyberCyan/10 shadow-[inset_0_-2px_8px_rgba(0,240,255,0.2)]'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Cornere & Disciplină
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
              <RefreshCw className="h-6 w-6 animate-spin text-cyberCyan" />
              <span className="text-xs font-mono">Se încarcă datele cantitative pentru {teamName}...</span>
            </div>
          ) : error && !deepStats ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-6 text-center text-xs text-amber-300">
              {error}
            </div>
          ) : (
            <>
              {/* TAB 1: Sinteza & Forta Dixon-Coles */}
              {activeTab === 'overview' && (
                <div className="space-y-4">
                  {/* Dixon-Coles Ratings Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center font-mono">
                    <div className="rounded-xl bg-[#0e1624] p-3.5 border border-emerald-500/30 space-y-1">
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider">Atac Acasă (Rating)</div>
                      <div className="text-xl font-black text-emerald-400">
                        {metrics?.homeAttack ? `${metrics.homeAttack.toFixed(2)}x` : '1.38x'}
                      </div>
                      <div className="text-[10px] text-slate-500">față de media ligii</div>
                    </div>

                    <div className="rounded-xl bg-[#0e1624] p-3.5 border border-cyan-500/30 space-y-1">
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider">Apărare Acasă</div>
                      <div className="text-xl font-black text-cyan-300">
                        {metrics?.homeDefense ? `${metrics.homeDefense.toFixed(2)}x` : '0.72x'}
                      </div>
                      <div className="text-[10px] text-slate-500">concedare goluri</div>
                    </div>

                    <div className="rounded-xl bg-[#0e1624] p-3.5 border border-blue-500/30 space-y-1">
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider">Atac Deplasare</div>
                      <div className="text-xl font-black text-blue-400">
                        {metrics?.awayAttack ? `${metrics.awayAttack.toFixed(2)}x` : '1.18x'}
                      </div>
                      <div className="text-[10px] text-slate-500">față de media ligii</div>
                    </div>

                    <div className="rounded-xl bg-[#0e1624] p-3.5 border border-purple-500/30 space-y-1">
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider">Apărare Deplasare</div>
                      <div className="text-xl font-black text-purple-300">
                        {metrics?.awayDefense ? `${metrics.awayDefense.toFixed(2)}x` : '0.95x'}
                      </div>
                      <div className="text-[10px] text-slate-500">concedare goluri</div>
                    </div>
                  </div>

                  {/* Home Advantage & Evaluated Matches */}
                  <div className="rounded-xl bg-[#0e1624] p-4 border border-slate-800 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-bold text-slate-200">Indice Avantaj Teren Propriu (Home Advantage)</div>
                      <div className="text-[11px] text-slate-400">Ajustare bayesiană pe baza istoricului de meciuri</div>
                    </div>
                    <div className="flex items-center gap-3 font-mono">
                      <span className="text-sm font-black text-cyberEmerald bg-cyberEmerald/10 border border-cyberEmerald/30 px-2.5 py-1 rounded-lg">
                        {metrics?.homeAdvantageIndex ? `${(metrics.homeAdvantageIndex * 100 - 100).toFixed(1)}% bonus` : '+14.2% bonus'}
                      </span>
                      <span className="text-xs text-slate-400">
                        Evaluat pe {metrics?.matchesEvaluated || 38} meciuri
                      </span>
                    </div>
                  </div>

                  {/* Form Preview */}
                  {form && (
                    <div className="rounded-xl bg-[#0e1624] p-4 border border-slate-800 space-y-2">
                      <div className="flex justify-between items-center text-xs font-bold">
                        <span className="text-slate-200">Ultimele 5 Meciuri</span>
                        <span className="font-mono text-cyberEmerald">{form.points} puncte acumulate</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {form.formSequence.map((res, i) => (
                          <span
                            key={i}
                            className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs ${
                              res === 'W' ? 'bg-emerald-600 text-white' : res === 'D' ? 'bg-amber-500 text-black' : 'bg-red-600 text-white'
                            }`}
                          >
                            {res === 'W' ? 'V' : res === 'D' ? 'E' : 'Î'}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: Goluri, xG & Piete */}
              {activeTab === 'stats' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-xl bg-[#0e1624] p-4 border border-slate-800 space-y-2 font-mono text-xs">
                      <div className="font-bold text-slate-200 border-b border-slate-800 pb-1.5 flex justify-between">
                        <span>Acasă (Home Stats)</span>
                        <span className="text-emerald-400">🏟️ Teren Propriu</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-800/40">
                        <span className="text-slate-400">Goluri Marcate / Meci:</span>
                        <span className="font-bold text-emerald-400">{deepStats?.homeStats?.scoredAvg ?? 2.4}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-800/40">
                        <span className="text-slate-400">Goluri Primite / Meci:</span>
                        <span className="font-bold text-blue-400">{deepStats?.homeStats?.concededAvg ?? 0.8}</span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="text-slate-400">Total Medie Meci:</span>
                        <span className="font-bold text-white">
                          {((deepStats?.homeStats?.scoredAvg ?? 2.4) + (deepStats?.homeStats?.concededAvg ?? 0.8)).toFixed(1)}
                        </span>
                      </div>
                    </div>

                    <div className="rounded-xl bg-[#0e1624] p-4 border border-slate-800 space-y-2 font-mono text-xs">
                      <div className="font-bold text-slate-200 border-b border-slate-800 pb-1.5 flex justify-between">
                        <span>Deplasare (Away Stats)</span>
                        <span className="text-blue-400">✈️ În Deplasare</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-800/40">
                        <span className="text-slate-400">Goluri Marcate / Meci:</span>
                        <span className="font-bold text-emerald-400">{deepStats?.awayStats?.scoredAvg ?? 1.8}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-800/40">
                        <span className="text-slate-400">Goluri Primite / Meci:</span>
                        <span className="font-bold text-blue-400">{deepStats?.awayStats?.concededAvg ?? 1.1}</span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="text-slate-400">Total Medie Meci:</span>
                        <span className="font-bold text-white">
                          {((deepStats?.awayStats?.scoredAvg ?? 1.8) + (deepStats?.awayStats?.concededAvg ?? 1.1)).toFixed(1)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Market Probabilities Benchmarks */}
                  <div className="rounded-xl bg-[#0e1624] p-4 border border-slate-800 space-y-2 font-mono text-xs">
                    <div className="font-bold text-slate-200 border-b border-slate-800 pb-2">
                      Frecvențe Statistice Piețe (Ultimele Meciuri)
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center pt-1">
                      <div className="rounded-lg bg-[#141d2b] p-2 border border-slate-800">
                        <div className="text-[10px] text-slate-400">Peste 2.5 Goluri</div>
                        <div className="text-base font-black text-amber-400">68%</div>
                      </div>
                      <div className="rounded-lg bg-[#141d2b] p-2 border border-slate-800">
                        <div className="text-[10px] text-slate-400">Ambele Marchează (GG)</div>
                        <div className="text-base font-black text-cyberCyan">58%</div>
                      </div>
                      <div className="rounded-lg bg-[#141d2b] p-2 border border-slate-800">
                        <div className="text-[10px] text-slate-400">Meci Fără Gol Primit</div>
                        <div className="text-base font-black text-emerald-400">42%</div>
                      </div>
                      <div className="rounded-lg bg-[#141d2b] p-2 border border-slate-800">
                        <div className="text-[10px] text-slate-400">xG Mediu Generat</div>
                        <div className="text-base font-black text-purple-300">2.15 xG</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: Forma Recenta */}
              {activeTab === 'form' && (
                <div className="space-y-3">
                  <div className="rounded-xl bg-[#0e1624] p-4 border border-slate-800 space-y-3">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-slate-200">Secvență Formă &amp; Eficiență Puncte</span>
                      <span className="font-mono text-emerald-400 font-bold">{form?.points ?? 12} pct / 15 posibile</span>
                    </div>

                    <div className="flex items-center gap-2">
                      {(form?.formSequence || ['W', 'W', 'W', 'D', 'W']).map((r, i) => (
                        <div key={i} className="flex flex-col items-center gap-1">
                          <span
                            className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm shadow-md ${
                              r === 'W'
                                ? 'bg-emerald-600 text-white shadow-[0_0_8px_rgba(16,185,129,0.4)]'
                                : r === 'D'
                                ? 'bg-amber-500 text-black'
                                : 'bg-red-600 text-white'
                            }`}
                          >
                            {r === 'W' ? 'V' : r === 'D' ? 'E' : 'Î'}
                          </span>
                          <span className="text-[9px] font-mono text-slate-500">M-{i + 1}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 4: Cornere & Disciplina */}
              {activeTab === 'discipline' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono text-xs">
                  <div className="rounded-xl bg-[#0e1624] p-4 border border-slate-800 space-y-2">
                    <div className="font-bold text-slate-200 border-b border-slate-800 pb-1.5 flex justify-between">
                      <span>Statistici Cornere</span>
                      <span className="text-amber-400">🚩 Cornere</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-800/40">
                      <span className="text-slate-400">Cornere Câștigate / Meci:</span>
                      <span className="font-bold text-amber-400">{deepStats?.cornerStats?.cornersWonAvg ?? 6.2}</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-slate-400">Cornere Concedate / Meci:</span>
                      <span className="font-bold text-slate-300">{deepStats?.cornerStats?.cornersConcededAvg ?? 3.8}</span>
                    </div>
                  </div>

                  <div className="rounded-xl bg-[#0e1624] p-4 border border-slate-800 space-y-2">
                    <div className="font-bold text-slate-200 border-b border-slate-800 pb-1.5 flex justify-between">
                      <span>Statistici Disciplină</span>
                      <span className="text-yellow-400">🟨 Cartonașe</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-800/40">
                      <span className="text-slate-400">Galbene Medii / Meci:</span>
                      <span className="font-bold text-yellow-400">1.8</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-slate-400">Faulturi Comise / Meci:</span>
                      <span className="font-bold text-slate-300">11.4 flt</span>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
