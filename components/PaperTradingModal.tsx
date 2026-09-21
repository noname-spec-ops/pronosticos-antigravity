'use client';

import React, { useState, useMemo } from 'react';
import {
  X,
  TrendingUp,
  Award,
  ShieldCheck,
  Flame,
  BarChart2,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  RefreshCw,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Calculator,
} from 'lucide-react';
import type { Fixture } from '@/types/football';
import {
  calculatePaperTradingSummary,
  getInitialPaperBets,
  syncFixturesToPaperBets,
  type PaperBet,
  type PaperTradingSummary,
} from '@/engine/paperTrading';

interface PaperTradingModalProps {
  isOpen: boolean;
  onClose: () => void;
  fixtures?: Fixture[];
}

export default function PaperTradingModal({ isOpen, onClose, fixtures = [] }: PaperTradingModalProps) {
  const [bets, setBets] = useState<PaperBet[]>(() => {
    try {
      const stored = localStorage.getItem('op_paper_bets');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return getInitialPaperBets();
  });

  // Automatically sync incoming fixtures & settle finished matches into the paper bets journal
  React.useEffect(() => {
    if (fixtures && fixtures.length > 0) {
      setBets((prev) => {
        const synced = syncFixturesToPaperBets(fixtures, prev);
        try {
          localStorage.setItem('op_paper_bets', JSON.stringify(synced));
        } catch {}
        return synced;
      });
    }
  }, [fixtures]);

  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>('ALL');

  const summary: PaperTradingSummary = useMemo(() => {
    return calculatePaperTradingSummary(bets);
  }, [bets]);

  const filteredBets = useMemo(() => {
    if (activeCategoryFilter === 'ALL') return bets;
    return bets.filter((b) => b.category === activeCategoryFilter);
  }, [bets, activeCategoryFilter]);

  const handleResetPaperBankroll = () => {
    const initial = getInitialPaperBets();
    const synced = fixtures.length > 0 ? syncFixturesToPaperBets(fixtures, initial) : initial;
    setBets(synced);
    try {
      localStorage.setItem('op_paper_bets', JSON.stringify(synced));
    } catch {}
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-3 sm:p-6 animate-in fade-in">
      <div className="relative flex flex-col w-full max-w-6xl max-h-[92vh] rounded-2xl border border-emerald-500/40 bg-[#0a0f17] shadow-2xl overflow-hidden">
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-flashBorder/60 bg-[#0e1622] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-tr from-amber-400 via-amber-300 to-yellow-500 text-black shadow-lg">
              <TrendingUp className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black text-white">OP QUANT RADAR — Paper Trading & CLV Tracker</h2>
                <span className="rounded bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-[10px] font-bold text-amber-400">
                  Transparență 100% Zero-Leakage
                </span>
              </div>
              <p className="text-xs text-gray-400">
                Urmărește performanța matematică pe bani virtuali (100u start) și verifică dacă modelul bate cotele de închidere (Closing Line Value).
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleResetPaperBankroll}
              className="rounded-lg border border-gray-700/60 bg-[#16202f] px-3 py-1.5 text-xs text-gray-300 hover:text-white hover:border-gray-500 transition flex items-center gap-1.5"
              title="Resetează la portofoliul inițial verificat"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Reset Bankroll</span>
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-gray-400 hover:bg-[#182333] hover:text-white transition"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* Kill-Switch Alert Banner (if triggered) */}
          {summary.killSwitch.isActive && (
            <div className="rounded-xl border border-red-500/80 bg-red-950/60 p-4 flex items-center gap-3 text-red-200">
              <AlertTriangle className="h-6 w-6 text-red-400 shrink-0" />
              <div>
                <div className="text-xs font-black uppercase text-red-300">Gestiune Risc Activă</div>
                <div className="text-xs font-semibold">{summary.killSwitch.message}</div>
              </div>
            </div>
          )}

          {/* 1. Top KPI Ribbon */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">

            {/* Bankroll */}
            <div className="rounded-xl border border-flashBorder/80 bg-[#121924] p-3.5 space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Bankroll Curent</div>
              <div className="flex items-baseline gap-1.5">
                <span className="font-mono text-xl font-black text-amber-300">{summary.currentBankrollUnits}u</span>
                <span className="text-[10px] font-mono text-gray-500">(100u start)</span>
              </div>
              <div className={`text-[11px] font-mono font-bold flex items-center gap-0.5 ${summary.netPnlUnits >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {summary.netPnlUnits >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                <span>{summary.netPnlUnits >= 0 ? '+' : ''}{summary.netPnlUnits}u ({summary.roiPercent}%)</span>
              </div>
            </div>

            {/* Average CLV */}
            <div className="rounded-xl border border-emerald-600/50 bg-[#121924] p-3.5 space-y-1 shadow-sm">
              <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 flex items-center justify-between">
                <span>CLV Mediu</span>
                <span>🎯</span>
              </div>
              <div className="font-mono text-xl font-black text-emerald-300">
                +{summary.averageCLVPercent}%
              </div>
              <div className="text-[10px] text-gray-400 font-mono">
                {summary.positiveClvRatePercent}% din pariuri au bătut casa
              </div>
            </div>

            {/* Win Rate */}
            <div className="rounded-xl border border-flashBorder/80 bg-[#121924] p-3.5 space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Win Rate</div>
              <div className="font-mono text-xl font-black text-gray-100">{summary.winRatePercent}%</div>
              <div className="text-[10px] text-gray-400 font-mono">
                {summary.wonBets} Câștigate / {summary.lostBets} Pierdute
              </div>
            </div>

            {/* Brier Score */}
            <div className="rounded-xl border border-flashBorder/80 bg-[#121924] p-3.5 space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Brier Score Model</div>
              <div className="font-mono text-xl font-black text-cyan-300">{summary.brierScore}</div>
              <div className="text-[10px] text-gray-400 font-mono">
                Acuratețe calibrare probabilități
              </div>
            </div>

            {/* Max Drawdown */}
            <div className="rounded-xl border border-flashBorder/80 bg-[#121924] p-3.5 space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Max Drawdown</div>
              <div className="font-mono text-xl font-black text-amber-400">{summary.maxDrawdownPercent}%</div>
              <div className="text-[10px] text-gray-400 font-mono">
                Risc controlat (Kelly 0.25)
              </div>
            </div>

            {/* Total Bets */}
            <div className="rounded-xl border border-flashBorder/80 bg-[#121924] p-3.5 space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Pariuri Înregistrate</div>
              <div className="font-mono text-xl font-black text-purple-300">{summary.totalBets}</div>
              <div className="text-[10px] text-gray-400 font-mono">
                {summary.pendingBets} În desfășurare
              </div>
            </div>
          </div>

          {/* 2. Educational & Quant Insight Banner */}
          <div className="rounded-xl border border-amber-500/40 bg-gradient-to-r from-amber-950/40 via-[#181308] to-[#0f141d] p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500 text-black font-black">
                💡
              </div>
              <div className="space-y-0.5">
                <div className="text-xs font-black text-amber-300">
                  DE CE ESTE CLV (CLOSING LINE VALUE) SECRETUL SINDICATELOR DE PARIURI?
                </div>
                <div className="text-[11px] leading-relaxed text-gray-300 max-w-3xl">
                  Dacă iei constant o cotă de <strong>1.88</strong> înainte de meci, iar la start cota de închidere (Pinnacle/Betfair) scade la <strong>1.76</strong>, ai un <strong>CLV pozitiv de +6.8%</strong>. Indiferent de rezultatul pe un meci izolat, matematic ești pe profit garantat pe eșantioane mari.
                </div>
              </div>
            </div>
          </div>

          {/* 3. Bets History Table */}
          <div className="rounded-xl border border-flashBorder/80 bg-[#121924] overflow-hidden">
            {/* Filter Pills */}
            <div className="flex items-center justify-between border-b border-flashBorder/60 bg-[#0f1520] px-4 py-2.5">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-300">
                Jurnalul Pariurilor Simulate ({filteredBets.length})
              </span>
              <div className="flex items-center gap-1.5 text-[11px] font-bold">
                {['ALL', 'SNIPER', 'VALUE', 'COMBO'].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setActiveCategoryFilter(cat)}
                    className={`px-2.5 py-1 rounded transition ${
                      activeCategoryFilter === cat
                        ? 'bg-emerald-950 border border-emerald-500 text-emerald-300'
                        : 'bg-[#16202f] text-gray-400 hover:text-white'
                    }`}
                  >
                    {cat === 'ALL' ? 'Toate' : cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-flashBorder/40 bg-[#0c121b] text-[10px] font-bold uppercase tracking-wider text-gray-400">
                    <th className="py-2.5 px-3">Data / Meci</th>
                    <th className="py-2.5 px-3">Liga</th>
                    <th className="py-2.5 px-3">Pronostic</th>
                    <th className="py-2.5 px-3 text-center">Cotă Luată</th>
                    <th className="py-2.5 px-3 text-center">Cotă Închidere</th>
                    <th className="py-2.5 px-3 text-center">CLV %</th>
                    <th className="py-2.5 px-3 text-center">Edge AI</th>
                    <th className="py-2.5 px-3 text-center">Miză</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                    <th className="py-2.5 px-3 text-center">P&L</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-flashBorder/30">
                  {filteredBets.map((bet) => (
                    <tr key={bet.id} className="hover:bg-[#16202f]/80 transition font-mono text-xs">
                      {/* Match */}
                      <td className="py-3 px-3 font-sans">
                        <div className="font-bold text-gray-200">{bet.matchName}</div>
                        <div className="text-[10px] text-gray-500 font-mono">{bet.placedAt}</div>
                      </td>

                      {/* League */}
                      <td className="py-3 px-3 font-sans whitespace-nowrap text-gray-300">
                        {bet.leagueName}
                      </td>

                      {/* Pick */}
                      <td className="py-3 px-3 whitespace-nowrap font-sans">
                        <span className="inline-block px-2 py-0.5 rounded bg-amber-950/80 border border-amber-500/60 text-amber-300 font-bold text-[11px]">
                          {bet.pick}
                        </span>
                      </td>

                      {/* Placed Odds */}
                      <td className="py-3 px-3 text-center font-bold text-gray-200">
                        {bet.placedOdds.toFixed(2)}
                      </td>

                      {/* Closing Odds */}
                      <td className="py-3 px-3 text-center font-bold text-gray-400">
                        {bet.closingOdds.toFixed(2)}
                      </td>

                      {/* CLV */}
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <span
                          className={`inline-block px-2 py-0.5 rounded font-bold text-[10px] ${
                            bet.clvPercent > 0
                              ? 'bg-emerald-950 border border-emerald-600/70 text-emerald-400'
                              : 'bg-red-950 border border-red-700/60 text-red-400'
                          }`}
                        >
                          {bet.clvPercent > 0 ? `+${bet.clvPercent}% 🎯` : `${bet.clvPercent}%`}
                        </span>
                      </td>

                      {/* Edge */}
                      <td className="py-3 px-3 text-center text-emerald-400 font-bold">
                        +{bet.edgePercent}%
                      </td>

                      {/* Stake */}
                      <td className="py-3 px-3 text-center text-gray-300">
                        {bet.stakeUnits}u
                      </td>

                      {/* Status */}
                      <td className="py-3 px-3 text-center whitespace-nowrap font-sans">
                        {bet.status === 'WON' ? (
                          <span className="inline-flex items-center gap-1 rounded bg-emerald-950 border border-emerald-600/70 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                            <CheckCircle2 className="h-3 w-3" /> CÂȘTIGAT
                          </span>
                        ) : bet.status === 'LOST' ? (
                          <span className="inline-flex items-center gap-1 rounded bg-red-950 border border-red-700/60 px-2 py-0.5 text-[10px] font-bold text-red-400">
                            PIERDUT
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded bg-amber-950 border border-amber-600/60 px-2 py-0.5 text-[10px] font-bold text-amber-300 animate-pulse">
                            <Clock className="h-3 w-3" /> ÎN AȘTEPTARE
                          </span>
                        )}
                      </td>

                      {/* PnL */}
                      <td className="py-3 px-3 text-center font-bold whitespace-nowrap">
                        {bet.pnlUnits !== undefined ? (
                          <span className={bet.pnlUnits >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                            {bet.pnlUnits >= 0 ? `+${bet.pnlUnits.toFixed(2)}u` : `${bet.pnlUnits.toFixed(2)}u`}
                          </span>
                        ) : (
                          <span className="text-gray-500">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
