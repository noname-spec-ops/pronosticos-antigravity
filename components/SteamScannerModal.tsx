'use client';

import React, { useState, useMemo } from 'react';
import {
  X,
  Zap,
  TrendingDown,
  Flame,
  ShieldAlert,
  PlusCircle,
  CheckCircle2,
  Clock,
  ArrowDownRight,
  Sparkles,
  ExternalLink,
  Target,
  RefreshCw,
} from 'lucide-react';
import type { Fixture } from '@/types/football';
import { scanSteamAlerts, type SteamAlert } from '@/engine/steamTracker';

interface SteamScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  fixtures: Fixture[];
  onAddToTicket?: (fixture: Fixture, pick: string, odd: number) => void;
  onSelectFixture?: (fixture: Fixture) => void;
}

export default function SteamScannerModal({
  isOpen,
  onClose,
  fixtures,
  onAddToTicket,
  onSelectFixture,
}: SteamScannerModalProps) {
  const [filterType, setFilterType] = useState<'all' | 'critical' | 'rlm' | 'lag'>('all');
  const [addedAlerts, setAddedAlerts] = useState<number[]>([]);

  // Scan real alerts from fixtures
  const allAlerts = useMemo(() => {
    return scanSteamAlerts(fixtures);
  }, [fixtures]);

  const filteredAlerts = useMemo(() => {
    if (filterType === 'critical') return allAlerts.filter((a) => a.urgency === 'critical');
    if (filterType === 'rlm') return allAlerts.filter((a) => a.isReverseLineMovement);
    if (filterType === 'lag') return allAlerts.filter((a) => a.softBookLag && a.softBookLag.arbitrageEdgePercent >= 4.0);
    return allAlerts;
  }, [allAlerts, filterType]);

  if (!isOpen) return null;

  const handleAdd = (alert: SteamAlert) => {
    setAddedAlerts((prev) => [...prev, alert.fixtureId]);
    if (onAddToTicket) {
      onAddToTicket(alert.fixture, alert.selection, alert.currentOdd);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 backdrop-blur-md overflow-y-auto font-sans">
      <div className="relative w-full max-w-4xl rounded-3xl border border-cyberAmber/40 bg-[#070c14]/95 text-slate-100 shadow-[0_0_50px_rgba(255,183,3,0.15)] my-8 overflow-hidden backdrop-blur-2xl">
        {/* Ambient glow in background */}
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-cyberAmber/10 rounded-full blur-3xl pointer-events-none -z-0" />
        <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-cyberCyan/10 rounded-full blur-3xl pointer-events-none -z-0" />

        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-cyberAmber/20 bg-[#0a111e]/90 px-5 py-4 relative z-10">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyberAmber/20 border border-cyberAmber/50 text-cyberAmber shadow-[0_0_12px_rgba(255,183,3,0.3)]">
              <Zap className="h-5 w-5 animate-pulse" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-white font-mono tracking-wide">
                  STEAM & EARLY ODDS SCANNER
                </h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyberAmber/20 border border-cyberAmber text-cyberAmber font-mono">
                  {allAlerts.length} Semnale Active
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Detecție automată a căderilor bruște de cote, a banilor de sindicat (RLM) și a întârzierilor caselor locale.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-xl p-1.5 text-slate-400 hover:bg-cyberAmber/20 hover:text-white transition-all border border-transparent hover:border-cyberAmber/30"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Filter Bar */}
        <div className="flex items-center gap-2 border-b border-cyberAmber/15 bg-[#080e18] px-5 py-3 text-xs font-mono relative z-10 overflow-x-auto scrollbar-none">
          <span className="text-slate-500 mr-1">Filtrează:</span>
          <button
            onClick={() => setFilterType('all')}
            className={`px-3 py-1.5 rounded-xl transition-all ${
              filterType === 'all'
                ? 'bg-cyberAmber text-black font-black shadow-[0_0_10px_rgba(255,183,3,0.4)]'
                : 'bg-[#0d1624] border border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            Toate ({allAlerts.length})
          </button>

          <button
            onClick={() => setFilterType('critical')}
            className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 ${
              filterType === 'critical'
                ? 'bg-cyberRose text-white font-bold shadow-[0_0_10px_rgba(255,0,85,0.4)]'
                : 'bg-[#0d1624] border border-cyberRose/30 text-cyberRose hover:bg-cyberRose/20'
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-cyberRose animate-ping" />
            <span>Cădere Critică (&gt; 8%)</span>
          </button>

          <button
            onClick={() => setFilterType('rlm')}
            className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 ${
              filterType === 'rlm'
                ? 'bg-cyberCyan text-black font-black shadow-[0_0_10px_rgba(0,240,255,0.4)]'
                : 'bg-[#0d1624] border border-cyberCyan/30 text-cyberCyan hover:bg-cyberCyan/20'
            }`}
          >
            <ShieldAlert className="h-3.5 w-3.5" />
            <span>Reverse Line Movement</span>
          </button>

          <button
            onClick={() => setFilterType('lag')}
            className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 ${
              filterType === 'lag'
                ? 'bg-cyberEmerald text-black font-black shadow-[0_0_10px_rgba(0,255,157,0.4)]'
                : 'bg-[#0d1624] border border-cyberEmerald/30 text-cyberEmerald hover:bg-cyberEmerald/20'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Cote Mari Întârziate (Lag)</span>
          </button>
        </div>

        {/* Alerts List */}
        <div className="p-5 max-h-[65vh] overflow-y-auto space-y-3 relative z-10">
          {filteredAlerts.length > 0 ? (
            filteredAlerts.map((alert, idx) => {
              const isAdded = addedAlerts.includes(alert.fixtureId);

              return (
                <div
                  key={idx}
                  onClick={() => onSelectFixture?.(alert.fixture)}
                  className={`rounded-2xl p-4 border transition-all cursor-pointer relative overflow-hidden group ${
                    alert.urgency === 'critical'
                      ? 'border-cyberRose/40 bg-gradient-to-r from-[#180d14] via-[#0d1420] to-[#070c14] hover:border-cyberRose'
                      : alert.isReverseLineMovement
                      ? 'border-cyberCyan/40 bg-gradient-to-r from-[#0a1820] via-[#0d1420] to-[#070c14] hover:border-cyberCyan'
                      : 'border-cyberAmber/30 bg-gradient-to-r from-[#181308] via-[#0d1420] to-[#070c14] hover:border-cyberAmber'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    {/* Left Details */}
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-white text-sm tracking-tight">{alert.match}</span>
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-black/50 border border-slate-700 text-slate-300">
                          {alert.league}
                        </span>
                        {alert.isReverseLineMovement && (
                          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-cyberCyan/20 border border-cyberCyan text-cyberCyan flex items-center gap-1">
                            <ShieldAlert className="h-3 w-3" /> RLM Sindicate
                          </span>
                        )}
                        <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded uppercase ${
                          alert.steamVelocity === 'rapid'
                            ? 'bg-cyberRose/20 border border-cyberRose text-cyberRose animate-pulse'
                            : alert.steamVelocity === 'moderate'
                            ? 'bg-cyberAmber/20 border border-cyberAmber text-cyberAmber'
                            : 'bg-slate-800 text-slate-300'
                        }`}>
                          Viteză: {alert.steamVelocity}
                        </span>
                      </div>

                      <div className="text-xs text-slate-300">
                        {alert.recommendedAction}
                      </div>

                      {/* Soft bookmaker lagging list */}
                      {alert.softBookLag && (
                        <div className="flex items-center gap-2 pt-1 text-[11px] font-mono flex-wrap">
                          <span className="text-slate-400">Case cu cota încă mare:</span>
                          {alert.softBookLag.laggingBookmakers.map((bk, bIdx) => (
                            <span key={bIdx} className="bg-cyberEmerald/15 border border-cyberEmerald/40 text-cyberEmerald px-2 py-0.5 rounded font-bold text-[10px]">
                              {bk} @ {alert.softBookLag?.highestAvailableOdd.toFixed(2)}
                            </span>
                          ))}
                          <span className="text-cyberCyan font-bold text-[10px]">
                            (+{alert.softBookLag.arbitrageEdgePercent}% Edge vs Sharp)
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Right Odds Movement Capsule & Action */}
                    <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                      <div className="flex items-center gap-2 bg-[#030710]/90 border border-slate-800 px-3 py-2 rounded-xl font-mono text-center">
                        <div>
                          <div className="text-[9px] text-slate-500">DESCHIDERE</div>
                          <div className="text-xs text-slate-400 line-through">{alert.openingOdd.toFixed(2)}</div>
                        </div>
                        <ArrowDownRight className="h-4 w-4 text-cyberRose animate-bounce" />
                        <div>
                          <div className="text-[9px] text-cyberEmerald">CURENTĂ</div>
                          <div className="text-sm font-black text-white">{alert.currentOdd.toFixed(2)}</div>
                        </div>
                        <div className="border-l border-slate-800 pl-2">
                          <div className="text-[9px] text-cyberRose">DROP</div>
                          <div className="text-xs font-black text-cyberRose">-{alert.dropPercent}%</div>
                        </div>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAdd(alert);
                        }}
                        className={`py-2 px-3.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all font-mono ${
                          isAdded
                            ? 'bg-cyberEmerald text-black font-black shadow-[0_0_12px_rgba(0,255,157,0.5)]'
                            : 'bg-gradient-to-r from-amber-500 to-cyberAmber text-black font-black shadow-[0_0_12px_rgba(255,183,3,0.35)] hover:brightness-110'
                        }`}
                      >
                        {isAdded ? (
                          <>
                            <CheckCircle2 className="h-4 w-4" /> Adăugat
                          </>
                        ) : (
                          <>
                            <PlusCircle className="h-4 w-4" /> Prinde Cota
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="py-12 text-center text-slate-400 space-y-2">
              <div className="text-3xl">⚡</div>
              <div className="font-bold text-white font-mono">Niciun semnal activ pentru filtrul selectat</div>
              <div className="text-xs text-slate-500">
                Piața este stabilă în acest moment. Alertele apar imediat ce sindicatele plasează comenzi mari.
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-cyberAmber/20 bg-[#060b14] px-5 py-3 text-xs text-slate-400 flex items-center justify-between font-mono">
          <span className="text-[11px]">
            🛡️ <em>Prinderea cotelor înainte de scădere garantează un CLV pozitiv pe termen lung.</em>
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 text-slate-200 hover:bg-slate-700 transition"
          >
            Închide
          </button>
        </div>
      </div>
    </div>
  );
}
