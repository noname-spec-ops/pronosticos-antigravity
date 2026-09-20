'use client';

import React, { useState, useMemo } from 'react';
import { X, Ticket, Sparkles, Trash2, Plus, ArrowRight, ShieldCheck, Flame, Percent, RefreshCw } from 'lucide-react';
import { buildAndEvaluateTicket, type ComboSelectionItem, type ComboTicketResult } from '@/engine/comboBuilder';
import type { Fixture } from '@/types/football';

interface ComboBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  fixtures: Fixture[];
  initialSelections?: ComboSelectionItem[];
  onAddToTicket?: (item: ComboSelectionItem) => void;
}

export default function ComboBuilderModal({
  isOpen,
  onClose,
  fixtures,
  initialSelections = [],
}: ComboBuilderModalProps) {
  const [ticketItems, setTicketItems] = useState<ComboSelectionItem[]>(initialSelections);
  const [selectedFixtureId, setSelectedFixtureId] = useState<number>(fixtures[0]?.id || 0);

  // Sync initial items if changed
  React.useEffect(() => {
    if (initialSelections.length > 0) {
      setTicketItems(initialSelections);
    }
  }, [initialSelections]);

  // Build matrix lookup map for SGP calculations
  const matrixMap = useMemo(() => {
    const map = new Map<number, number[][]>();
    for (const f of fixtures) {
      if (f.prediction?.scoreMatrix) {
        map.set(f.id, f.prediction.scoreMatrix);
      }
    }
    return map;
  }, [fixtures]);

  // Calculate joint combo metrics
  const evaluatedTicket: ComboTicketResult = useMemo(() => {
    return buildAndEvaluateTicket(ticketItems, matrixMap);
  }, [ticketItems, matrixMap]);

  const activeFixture = fixtures.find((f) => f.id === selectedFixtureId) || fixtures[0];

  const handleAddSelection = (
    marketType: ComboSelectionItem['marketType'],
    label: string,
    bookmakerOdd: number,
    modelProb: number
  ) => {
    if (!activeFixture) return;

    // Avoid duplicate market for same match
    const existing = ticketItems.find(
      (it) => it.fixtureId === activeFixture.id && it.marketType === marketType
    );
    if (existing) return;

    const fairOdd = modelProb > 0 ? Number((1 / modelProb).toFixed(2)) : 999;
    const edgePercent = Number((((modelProb * bookmakerOdd) - 1) * 100).toFixed(1));

    const newItem: ComboSelectionItem = {
      id: `${activeFixture.id}-${marketType}-${Date.now()}`,
      fixtureId: activeFixture.id,
      matchName: `${activeFixture.homeTeam.name} vs ${activeFixture.awayTeam.name}`,
      leagueName: activeFixture.league.name,
      marketType,
      marketLabel: label,
      bookmakerOdd,
      modelProb,
      fairOdd,
      edgePercent,
      isSniper: label.includes('Sniper') || (marketType === 'over_2_5' && edgePercent >= 4),
    };

    setTicketItems((prev) => [...prev, newItem]);
  };

  const handleRemoveItem = (id: string) => {
    setTicketItems((prev) => prev.filter((it) => it.id !== id));
  };

  const handleClearAll = () => {
    setTicketItems([]);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-6 animate-in fade-in">
      <div className="relative flex flex-col w-full max-w-5xl max-h-[92vh] rounded-2xl border border-emerald-600/40 bg-[#0a0f17] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-flashBorder/60 bg-[#0e1622] px-5 py-3.5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-amber-400 via-amber-300 to-yellow-500 text-black shadow-lg">
              <Ticket className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-white">OP GODMODE — Combo & Acca Builder</h2>
                <span className="rounded bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                  Joint Poisson & SGP Engine
                </span>
              </div>
              <p className="text-xs text-gray-400">
                Calculează probabilitatea compusă reală și avantajul matematic (Edge) fără distorsiuni de corelație.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 hover:bg-[#182333] hover:text-white transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left / Selection Column (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-400">
                1. Selectează meciul & opțiunile
              </span>
              <select
                value={selectedFixtureId}
                onChange={(e) => setSelectedFixtureId(Number(e.target.value))}
                className="rounded-lg border border-flashBorder bg-[#141b26] px-3 py-1.5 text-xs font-semibold text-gray-200 focus:border-emerald-500 focus:outline-none"
              >
                {fixtures.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.league.name} — {f.homeTeam.name} vs {f.awayTeam.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Match Quick Card */}
            {activeFixture && (
              <div className="rounded-xl border border-flashBorder/60 bg-[#121924] p-4 space-y-3">
                <div className="flex items-center justify-between text-xs text-gray-400">
                  <span>{activeFixture.league.name}</span>
                  <span>{new Date(activeFixture.date).toLocaleDateString()}</span>
                </div>
                <div className="flex items-center justify-between font-bold text-sm text-gray-100">
                  <span className="text-emerald-400">{activeFixture.homeTeam.name}</span>
                  <span className="text-gray-500 text-xs">VS</span>
                  <span className="text-emerald-400">{activeFixture.awayTeam.name}</span>
                </div>

                {/* Available Quick Markets — only markets with a REAL quoted price are offered. */}
                {(() => {
                  const o = activeFixture.odds;
                  const p = activeFixture.prediction;
                  const markets: Array<{
                    key: string;
                    label: string;
                    ticketLabel: string;
                    odd: number;
                    prob: number | undefined;
                    accent?: boolean;
                  }> = [];

                  if (o?.match1X2?.home) {
                    markets.push({ key: 'home', label: 'Victorie Gazde (1)', ticketLabel: `1 (${activeFixture.homeTeam.name})`, odd: o.match1X2.home, prob: p?.probabilities1X2.home });
                  }
                  if (o?.match1X2?.draw) {
                    markets.push({ key: 'draw', label: 'Egal (X)', ticketLabel: 'X (Egal)', odd: o.match1X2.draw, prob: p?.probabilities1X2.draw });
                  }
                  if (o?.match1X2?.away) {
                    markets.push({ key: 'away', label: 'Victorie Oaspeți (2)', ticketLabel: `2 (${activeFixture.awayTeam.name})`, odd: o.match1X2.away, prob: p?.probabilities1X2.away });
                  }
                  const ou25 = o?.overUnder?.find((x) => x.line === 2.5)?.over;
                  if (ou25) {
                    markets.push({ key: 'over_2_5', label: '🎯 Peste 2.5 Goluri', ticketLabel: '🎯 Peste 2.5 Goluri', odd: ou25, prob: p?.overUnderProbabilities.find((x) => x.line === 2.5)?.over, accent: true });
                  }
                  if (o?.btts?.yes) {
                    markets.push({ key: 'btts_yes', label: 'Ambele marchează', ticketLabel: 'Ambele Marchează (GG)', odd: o.btts.yes, prob: p?.bttsProbabilities.yes });
                  }

                  if (markets.length === 0) {
                    return (
                      <div className="mt-2 rounded-lg border border-slate-700/60 bg-slate-900/50 p-3 text-[11px] text-slate-400">
                        Nu există cote reale de la casa de pariuri pentru acest meci. Nu poate fi adăugat pe bilet.
                      </div>
                    );
                  }

                  return (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2">
                      {markets.map((m) => (
                        <button
                          key={m.key}
                          disabled={m.prob === undefined}
                          title={m.prob === undefined ? 'Modelul nu a produs o probabilitate pentru această piață.' : undefined}
                          onClick={() => handleAddSelection(m.key as any, m.ticketLabel, m.odd, m.prob as number)}
                          className={`flex flex-col items-center justify-center p-2 rounded-lg border transition disabled:opacity-40 disabled:cursor-not-allowed ${
                            m.accent
                              ? 'bg-amber-950/40 hover:bg-amber-950/80 border-amber-500/60 hover:border-amber-400'
                              : 'bg-[#16202f] hover:bg-emerald-950/60 border-gray-700/60 hover:border-emerald-500/80'
                          }`}
                        >
                          <span className={`text-[11px] ${m.accent ? 'text-amber-300 font-bold' : 'text-gray-300'}`}>{m.label}</span>
                          <span className={`font-mono font-bold text-xs ${m.accent ? 'text-amber-300' : 'text-amber-400'}`}>
                            {m.odd.toFixed(2)}
                          </span>
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Smart Suggested Value Combos */}
            <div className="rounded-xl border border-emerald-600/30 bg-gradient-to-r from-emerald-950/20 to-transparent p-3.5 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                <Sparkles className="h-4 w-4" />
                <span>Recomandare Inteligentă OP: Multi-Match Sniper Treble</span>
              </div>
              {(() => {
                // Only fixtures with BOTH a real quoted Over 2.5 price and a model probability
                // can be recommended, and only when that price actually beats the model.
                const candidates = fixtures
                  .filter((f) => [78, 88, 144, 39, 40].includes(f.league.id))
                  .map((f) => {
                    const odd = f.odds?.overUnder?.find((o) => o.line === 2.5)?.over;
                    const prob = f.prediction?.overUnderProbabilities.find((o) => o.line === 2.5)?.over;
                    if (odd === undefined || prob === undefined || odd <= 1) return null;
                    return { f, odd, prob, edge: ((prob * odd) - 1) * 100 };
                  })
                  .filter((c): c is NonNullable<typeof c> => c !== null && c.edge > 0)
                  .sort((a, b) => b.edge - a.edge)
                  .slice(0, 3);

                if (candidates.length < 2) {
                  return (
                    <p className="text-[11px] text-slate-400">
                      Niciun combo recomandat: nu există suficiente meciuri cu cotă reală Peste 2.5 care să bată modelul.
                    </p>
                  );
                }

                const combinedOdd = candidates.reduce((acc, c) => acc * c.odd, 1);
                const combinedProb = candidates.reduce((acc, c) => acc * c.prob, 1);
                const combinedEdge = ((combinedProb * combinedOdd) - 1) * 100;

                return (
                  <>
                    <p className="text-[11px] text-gray-300">
                      {candidates.length} meciuri cu cotă reală Peste 2.5 și edge pozitiv. Cotă cumulată{' '}
                      <span className="font-mono font-bold text-amber-400">{combinedOdd.toFixed(2)}</span>.
                    </p>
                    <button
                      onClick={() => {
                        const items: ComboSelectionItem[] = candidates.map((c) => ({
                          id: `sniper-rec-${c.f.id}`,
                          fixtureId: c.f.id,
                          matchName: `${c.f.homeTeam.name} vs ${c.f.awayTeam.name}`,
                          leagueName: c.f.league.name,
                          marketType: 'over_2_5',
                          marketLabel: '🎯 Peste 2.5 Goluri',
                          bookmakerOdd: c.odd,
                          modelProb: c.prob,
                          fairOdd: Number((1 / c.prob).toFixed(2)),
                          edgePercent: Number(c.edge.toFixed(1)),
                          isSniper: true,
                        }));
                        setTicketItems(items);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-black font-bold text-xs shadow transition"
                    >
                      <span>Încarcă combo ({combinedEdge > 0 ? '+' : ''}{combinedEdge.toFixed(1)}% edge)</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </>
                );
              })()}
            </div>
          </div>

          {/* Right / Evaluated Ticket Column (5 cols) */}
          <div className="lg:col-span-5 flex flex-col justify-between rounded-xl border border-flashBorder/80 bg-[#121924] p-4 space-y-4">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-gray-700/60">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-gray-200">
                    Biletul tău ({ticketItems.length} selecții)
                  </span>
                  {evaluatedTicket.isSameGameParlay && (
                    <span className="rounded bg-cyan-500/10 border border-cyan-500/30 px-1.5 py-0.2 text-[9px] font-bold text-cyan-300">
                      SGP Correlat
                    </span>
                  )}
                </div>
                {ticketItems.length > 0 && (
                  <button
                    onClick={handleClearAll}
                    className="text-[11px] text-red-400 hover:text-red-300 transition flex items-center gap-1"
                  >
                    <Trash2 className="h-3 w-3" />
                    <span>Golește</span>
                  </button>
                )}
              </div>

              {/* Items List */}
              <div className="space-y-2 mt-3 max-h-[220px] overflow-y-auto pr-1">
                {ticketItems.length === 0 ? (
                  <div className="py-8 text-center text-xs text-gray-500">
                    Adaugă selecții din stânga pentru a calcula valoarea biletului.
                  </div>
                ) : (
                  ticketItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between rounded-lg bg-[#16202f] p-2.5 border border-gray-700/40 text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-gray-200 truncate">{item.matchName}</div>
                        <div className="flex items-center gap-2 text-[10px] text-gray-400">
                          <span className="text-emerald-400 font-bold">{item.marketLabel}</span>
                          <span>•</span>
                          <span>P: {(item.modelProb * 100).toFixed(0)}%</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 pl-2">
                        <span className="font-mono font-bold text-amber-400 text-xs">
                          {item.bookmakerOdd.toFixed(2)}
                        </span>
                        <button
                          onClick={() => handleRemoveItem(item.id)}
                          className="text-gray-500 hover:text-red-400 transition"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Calculated Analytics Card */}
            {ticketItems.length > 0 && (
              <div className="rounded-xl bg-[#0a0f17] border border-gray-700/60 p-3.5 space-y-3">
                {/* Stats Row */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded bg-[#141c28] p-2">
                    <div className="text-[10px] text-gray-400">Cotă Totală</div>
                    <div className="font-mono font-black text-amber-400 text-base">
                      {evaluatedTicket.totalBookmakerOdds.toFixed(2)}
                    </div>
                  </div>
                  <div className="rounded bg-[#141c28] p-2">
                    <div className="text-[10px] text-gray-400">Prob. Compusă</div>
                    <div className="font-mono font-black text-cyan-400 text-base">
                      {(evaluatedTicket.jointModelProb * 100).toFixed(1)}%
                    </div>
                  </div>
                  <div className="rounded bg-[#141c28] p-2">
                    <div className="text-[10px] text-gray-400">Valoare Edge</div>
                    <div
                      className={`font-mono font-black text-base ${
                        evaluatedTicket.overallEdgePercent > 0 ? 'text-emerald-400' : 'text-red-400'
                      }`}
                    >
                      {evaluatedTicket.overallEdgePercent > 0 ? '+' : ''}
                      {evaluatedTicket.overallEdgePercent}%
                    </div>
                  </div>
                </div>

                {/* Mathematical Explanation */}
                <div className="text-[11px] leading-relaxed text-gray-300 bg-[#131a26] p-2.5 rounded-lg border border-gray-700/40">
                  {evaluatedTicket.explanation}
                </div>

                {/* Staking & Recommendation */}
                <div className="flex items-center justify-between pt-1 text-xs">
                  <span className="text-gray-400">Miză Sugerată (Kelly ¼):</span>
                  <span className="font-mono font-bold text-emerald-400">
                    {evaluatedTicket.suggestedStakeKellyUnits > 0
                      ? `${evaluatedTicket.suggestedStakeKellyUnits} Unități (u)`
                      : 'Fără miză (0u)'}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
