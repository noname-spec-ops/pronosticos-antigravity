'use client';

import React, { useState } from 'react';
import { BarChart2, CheckCircle2, Flame, Radio, Search, Star, Zap, ShieldCheck } from 'lucide-react';
import type { Fixture } from '@/types/football';
import {
  getAllMarketCandidates,
  getHighestProbabilityPick,
  getBestBalancedPick,
  isSniperPick,
  type MarketCategory,
} from '@/engine/marketEvaluator';

export type MarketTab = 'all' | 'safest' | 'sniper' | '1x2' | 'dc' | 'ou15' | 'ou' | 'btts' | 'exact_score';

interface MatchesTableProps {
  fixtures: Fixture[];
  selectedDate?: string;
  selectedFixtureId?: number;
  onSelectMatch: (fixture: Fixture) => void;
  favorites: number[];
  onToggleFavorite: (id: number) => void;
  onAddToTicket?: (fixture: Fixture, pick: string, odd: number) => void;
  onSelectTeam?: (teamName: string) => void;
  filterMode?: string;
  isLoading?: boolean;
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
}

export default function MatchesTable({
  fixtures,
  selectedDate,
  selectedFixtureId,
  onSelectMatch,
  favorites,
  onToggleFavorite,
  onAddToTicket,
  onSelectTeam,
  filterMode,
  isLoading = false,
  searchQuery = '',
  onSearchChange,
}: MatchesTableProps) {
  const [activeMarketTab, setActiveMarketTab] = useState<MarketTab>(
    filterMode === 'sniper' ? 'sniper' : 'all'
  );

  // Format selectedDate for header display in Romanian, e.g. "11 Septembrie 2026"
  const formattedDate = React.useMemo(() => {
    if (!selectedDate) return 'Azi';
    try {
      const parts = selectedDate.split('-');
      if (parts.length === 3) {
        const monthsRo = [
          'Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie',
          'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie'
        ];
        const day = parseInt(parts[2], 10);
        const monthIndex = parseInt(parts[1], 10) - 1;
        const year = parts[0];
        const monthName = monthsRo[monthIndex] || parts[1];
        return `${day} ${monthName} ${year}`;
      }
      const d = new Date(selectedDate);
      return d.toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch {
      return selectedDate;
    }
  }, [selectedDate]);

  // Filter fixtures according to market tab
  const filteredFixtures = fixtures.filter((f) => {
    if (activeMarketTab === 'sniper') return isSniperPick(f);
    return true;
  });

  // Calculate market pick label, odd, probability, and edge for a fixture across all markets
  const getMatchPickDetails = (f: Fixture) => {
    const candidates = getAllMarketCandidates(f);
    if (candidates.length === 0) return null;

    let selectedCand: typeof candidates[0] | null = null;

    if (activeMarketTab === 'exact_score') {
      const exacts = candidates.filter((c) => c.category === 'exact_score');
      exacts.sort((a, b) => b.probability - a.probability);
      selectedCand = exacts[0] || null;
    } else if (activeMarketTab === 'ou15') {
      const ou15s = candidates.filter((c) => c.category === 'ou_15');
      ou15s.sort((a, b) => b.probability - a.probability);
      selectedCand = ou15s[0] || null;
    } else if (activeMarketTab === 'ou') {
      const ou25s = candidates.filter((c) => c.category === 'ou_25');
      ou25s.sort((a, b) => b.probability - a.probability);
      selectedCand = ou25s[0] || null;
    } else if (activeMarketTab === '1x2') {
      const ones = candidates.filter((c) => c.category === '1x2');
      ones.sort((a, b) => b.probability - a.probability);
      selectedCand = ones[0] || null;
    } else if (activeMarketTab === 'dc') {
      const dcs = candidates.filter((c) => c.category === 'dc');
      dcs.sort((a, b) => b.probability - a.probability);
      selectedCand = dcs[0] || null;
    } else if (activeMarketTab === 'btts') {
      const bttss = candidates.filter((c) => c.category === 'btts');
      bttss.sort((a, b) => b.probability - a.probability);
      selectedCand = bttss[0] || null;
    } else if (activeMarketTab === 'safest') {
      // Pick the candidate with the highest win probability from the candidate pool
      selectedCand = getHighestProbabilityPick(f, 1.15);
    } else {
      // 'all' or 'sniper'
      selectedCand = getBestBalancedPick(f);
    }

    if (!selectedCand) return null;

    let pType: '1' | '2' | 'X' | 'over' | 'under' | 'combo' | 'btts' | 'exact' = '1';
    if (selectedCand.category === 'exact_score') pType = 'exact';
    else if (selectedCand.category === 'ou_15' || selectedCand.category === 'ou_25' || selectedCand.category === 'ou_35') {
      pType = selectedCand.marketKey.startsWith('over') ? 'over' : 'under';
    } else if (selectedCand.category === 'btts') pType = 'btts';
    else if (selectedCand.category === 'dc' || selectedCand.category === 'combo') pType = 'combo';
    else if (selectedCand.marketKey === 'home') pType = '1';
    else if (selectedCand.marketKey === 'away') pType = '2';
    else if (selectedCand.marketKey === 'draw') pType = 'X';

    return {
      pickText: selectedCand.label,
      pickType: pType,
      odd: selectedCand.odd,
      probPercent: selectedCand.probPercent,
      edge: selectedCand.edgePercent,
      stakeUnits: selectedCand.stakeUnits,
      isSniper: selectedCand.isSniper,
      isFairEstimate: !selectedCand.isRealOdd,
    };
  };

  const sniperCount = fixtures.filter(isSniperPick).length;

  return (
    <div className="rounded-2xl border border-cyberCyan/20 bg-[#070c14]/90 backdrop-blur-xl p-4 sm:p-5 shadow-cyber-card space-y-4 relative overflow-hidden group/table">
      {/* Ambient background glow element */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-cyberCyan/5 rounded-full blur-3xl pointer-events-none -z-0" />
      <div className="absolute bottom-0 left-0 w-60 h-60 bg-cyberEmerald/5 rounded-full blur-3xl pointer-events-none -z-0" />

      {/* Header Bar with Date, Search & Market Tabs */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-cyberCyan/15 pb-3.5 relative z-10">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-2.5">
            <span className="h-2.5 w-2.5 rounded-full bg-cyberCyan animate-pulse shadow-[0_0_8px_#00f0ff]" />
            <span className="tracking-tight">Meciuri — {formattedDate}</span>
            <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-cyberCyan/10 border border-cyberCyan/30 text-cyberCyan">
              {filteredFixtures.length} Meciuri
            </span>
          </h2>

          {/* Dedicated Table Search Input */}
          {onSearchChange && (
            <div className="relative flex items-center w-full sm:w-56">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-cyan-400/70 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Caută echipă, ligă..."
                className="w-full rounded-xl border border-cyberCyan/30 bg-[#09101b] py-1.5 pl-8 pr-7 text-xs text-slate-200 placeholder-slate-500 focus:border-cyan-400 focus:shadow-[0_0_10px_rgba(0,240,255,0.2)] focus:outline-none transition duration-200"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => onSearchChange('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs font-bold transition"
                  title="Șterge căutarea"
                >
                  ✕
                </button>
              )}
            </div>
          )}
        </div>

        {/* Market Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-semibold scrollbar-none">
          {/* 🎯 Sniper Picks Filter Pill */}
          <button
            onClick={() => setActiveMarketTab('sniper')}
            className={`px-3 py-1.5 rounded-xl transition-all whitespace-nowrap flex items-center gap-1.5 font-mono text-[11px] ${
              activeMarketTab === 'sniper'
                ? 'bg-gradient-to-r from-amber-500/20 to-cyberAmber/20 border border-cyberAmber text-cyberAmber font-bold shadow-[0_0_12px_rgba(255,183,3,0.3)]'
                : 'bg-[#0d1522] border border-amber-500/25 text-amber-400/90 hover:text-cyberAmber hover:border-cyberAmber/50'
            }`}
          >
            <span className="text-xs">🎯</span>
            <span className="font-sans font-bold">Sniper Over 2.5</span>
            <span className="px-1.5 py-0.2 rounded-full bg-cyberAmber/20 text-cyberAmber text-[10px] font-mono">
              {sniperCount}
            </span>
          </button>

          {/* 🌟 Safest Highest-Probability Pick */}
          <button
            onClick={() => setActiveMarketTab('safest')}
            className={`px-3 py-1.5 rounded-xl transition-all whitespace-nowrap flex items-center gap-1.5 text-[11px] ${
              activeMarketTab === 'safest'
                ? 'bg-gradient-to-r from-emerald-500/20 to-cyberEmerald/20 border border-cyberEmerald text-cyberEmerald font-bold shadow-[0_0_12px_rgba(0,255,157,0.3)]'
                : 'bg-[#0d1522] border border-emerald-500/30 text-emerald-400/90 hover:text-cyberEmerald hover:border-cyberEmerald/60'
            }`}
          >
            <span>🌟</span>
            <span className="font-bold">Șanse Maxime (Safe)</span>
          </button>

          <button
            onClick={() => setActiveMarketTab('all')}
            className={`px-3 py-1.5 rounded-xl transition-all whitespace-nowrap text-[11px] ${
              activeMarketTab === 'all'
                ? 'bg-cyberCyan/20 border border-cyberCyan text-cyberCyan font-bold shadow-[0_0_12px_rgba(0,240,255,0.25)]'
                : 'bg-[#0d1522] border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700'
            }`}
          >
            Toate ({fixtures.length})
          </button>

          <button
            onClick={() => setActiveMarketTab('ou15')}
            className={`px-3 py-1.5 rounded-xl transition-all whitespace-nowrap text-[11px] ${
              activeMarketTab === 'ou15'
                ? 'bg-cyberCyan/20 border border-cyberCyan text-cyberCyan font-bold shadow-[0_0_12px_rgba(0,240,255,0.25)]'
                : 'bg-[#0d1522] border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700'
            }`}
          >
            Peste/Sub 1.5
          </button>

          <button
            onClick={() => setActiveMarketTab('ou')}
            className={`px-3 py-1.5 rounded-xl transition-all whitespace-nowrap text-[11px] ${
              activeMarketTab === 'ou'
                ? 'bg-cyberCyan/20 border border-cyberCyan text-cyberCyan font-bold shadow-[0_0_12px_rgba(0,240,255,0.25)]'
                : 'bg-[#0d1522] border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700'
            }`}
          >
            Peste/Sub 2.5
          </button>

          <button
            onClick={() => setActiveMarketTab('dc')}
            className={`px-3 py-1.5 rounded-xl transition-all whitespace-nowrap text-[11px] ${
              activeMarketTab === 'dc'
                ? 'bg-cyberCyan/20 border border-cyberCyan text-cyberCyan font-bold shadow-[0_0_12px_rgba(0,240,255,0.25)]'
                : 'bg-[#0d1522] border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700'
            }`}
          >
            Șansă Dublă (1X/X2)
          </button>

          <button
            onClick={() => setActiveMarketTab('btts')}
            className={`px-3 py-1.5 rounded-xl transition-all whitespace-nowrap text-[11px] ${
              activeMarketTab === 'btts'
                ? 'bg-cyberCyan/20 border border-cyberCyan text-cyberCyan font-bold shadow-[0_0_12px_rgba(0,240,255,0.25)]'
                : 'bg-[#0d1522] border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700'
            }`}
          >
            GG/NG
          </button>

          <button
            onClick={() => setActiveMarketTab('exact_score')}
            className={`px-3 py-1.5 rounded-xl transition-all whitespace-nowrap text-[11px] ${
              activeMarketTab === 'exact_score'
                ? 'bg-cyberCyan/20 border border-cyberCyan text-cyberCyan font-bold shadow-[0_0_12px_rgba(0,240,255,0.25)]'
                : 'bg-[#0d1522] border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700'
            }`}
          >
            Scor Exact
          </button>

          <button
            onClick={() => setActiveMarketTab('1x2')}
            className={`px-3 py-1.5 rounded-xl transition-all whitespace-nowrap text-[11px] ${
              activeMarketTab === '1x2'
                ? 'bg-cyberCyan/20 border border-cyberCyan text-cyberCyan font-bold shadow-[0_0_12px_rgba(0,240,255,0.25)]'
                : 'bg-[#0d1522] border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700'
            }`}
          >
            1X2
          </button>
        </div>
      </div>

      {/* Matches Grid / Table */}
      <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-cyberCyan/30 scrollbar-track-[#05080f] relative z-10 rounded-xl">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-cyberCyan/20 text-[10px] sm:text-[11px] font-mono uppercase tracking-wider text-slate-400 bg-[#09101a]/80">
              <th className="py-3 px-3">Ora</th>
              <th className="py-3 px-2">Liga</th>
              <th className="py-3 px-3">Meci</th>
              <th className="py-3 px-2 text-center">Pronostic</th>
              <th className="py-3 px-2 text-center">Cota</th>
              <th className="py-3 px-2 text-center" title="Probabilitate și grad de încredere calculate matematic">Încredere</th>
              <th className="py-3 px-2 text-center">Valoare</th>
              <th className="py-3 px-2 text-center">Miză</th>
              <th className="py-3 px-2 text-center">Status</th>
              <th className="py-3 px-2 text-center">Grafic</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/40 font-sans">
            {filteredFixtures.map((f) => {
              const isSelected = selectedFixtureId === f.id;
              const isFav = favorites.includes(f.id);
              const isLive = ['1H', 'HT', '2H', 'ET', 'P'].includes(f.status);
              const isFinished = ['FT', 'AET', 'PEN'].includes(f.status);
              const homeScore = f.score?.fulltime?.home ?? f.score?.current?.home;
              const awayScore = f.score?.fulltime?.away ?? f.score?.current?.away;
              const hasScore = homeScore !== null && homeScore !== undefined && awayScore !== null && awayScore !== undefined;
              const pick = getMatchPickDetails(f);

              const leagueShort =
                f.league.id === 39 ? 'PL' :
                f.league.id === 140 ? 'LAL' :
                f.league.id === 135 ? 'SA' :
                f.league.id === 78 ? 'BUN' :
                f.league.id === 61 ? 'LIG1' :
                f.league.id === 2 ? 'UCL' :
                f.league.id === 3 ? 'UEL' :
                f.league.id === 848 ? 'ECL' :
                f.league.id === 203 ? 'TUR' :
                f.league.name.slice(0, 4).toUpperCase();

              return (
                <tr
                  key={f.id}
                  onClick={() => onSelectMatch(f)}
                  className={`group cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-gradient-to-r from-cyberEmerald/15 via-cyberCyan/10 to-transparent border-l-2 border-cyberEmerald'
                      : 'hover:bg-[#0e1726]/80 hover:border-l-2 hover:border-cyberCyan/50'
                  }`}
                >
                  {/* 1. Ora & Fav */}
                  <td className="py-3 px-3 font-mono font-medium text-slate-300 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleFavorite(f.id);
                        }}
                        className="text-slate-500 hover:text-cyberAmber transition"
                      >
                        <Star className={`h-3.5 w-3.5 ${isFav ? 'fill-cyberAmber text-cyberAmber drop-shadow-[0_0_6px_#ffb703]' : ''}`} />
                      </button>
                      <span className="text-[11px] text-slate-300 group-hover:text-cyberCyan transition-colors">
                        {new Date(f.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </td>

                  {/* 2. Liga */}
                  <td className="py-3 px-2 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1 rounded-md bg-[#0c1420] border border-slate-700/60 px-2 py-0.5 text-[10px] font-bold text-slate-300 font-mono shadow-sm" title={`${f.league.country || ''} - ${f.league.name}`}>
                      {f.league.flag && f.league.flag.startsWith('http') ? (
                        <img
                          src={f.league.flag}
                          alt={f.league.country || f.league.name}
                          className="h-2.5 w-4 object-cover rounded-[2px]"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <span className="text-xs">{f.league.flag || '⚽'}</span>
                      )}
                      <span>{leagueShort}</span>
                    </span>
                  </td>

                  {/* 3. Meci */}
                  <td className="py-3 px-3 font-semibold text-slate-100 whitespace-nowrap max-w-[170px] xl:max-w-[240px]">
                    <div className="flex items-center gap-2 truncate">
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onSelectTeam) onSelectTeam(f.homeTeam.name);
                          else onSelectMatch(f);
                        }}
                        title={`Vezi profilul și statisticile complete pentru ${f.homeTeam.name}`}
                        className={`truncate text-xs cursor-pointer hover:underline ${
                          isSelected ? 'text-cyberEmerald font-bold' : 'hover:text-cyberCyan text-slate-100'
                        } transition-colors`}
                      >
                        {f.homeTeam.name}
                      </span>
                      {hasScore ? (
                        <span
                          className={`px-2 py-0.5 rounded-md font-mono font-black text-xs shrink-0 shadow-sm ${
                            isFinished
                              ? 'bg-[#0b1422] border border-cyberEmerald/50 text-cyberEmerald shadow-[0_0_8px_rgba(0,255,157,0.25)]'
                              : 'bg-cyberRose/20 border border-cyberRose/60 text-cyberRose animate-pulse'
                          }`}
                          title={isFinished ? `Scor final: ${homeScore} - ${awayScore}` : `Scor în direct: ${homeScore} - ${awayScore}`}
                        >
                          {homeScore} - {awayScore}
                        </span>
                      ) : (
                        <span className="text-slate-500 font-mono text-[10px] shrink-0">vs</span>
                      )}
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onSelectTeam) onSelectTeam(f.awayTeam.name);
                          else onSelectMatch(f);
                        }}
                        title={`Vezi profilul și statisticile complete pentru ${f.awayTeam.name}`}
                        className={`truncate text-xs cursor-pointer hover:underline ${
                          isSelected ? 'text-cyberEmerald font-bold' : 'hover:text-cyberCyan text-slate-100'
                        } transition-colors`}
                      >
                        {f.awayTeam.name}
                      </span>
                      {/* Lineup / Absence status badge */}
                      {f.prediction?.lineupImpactHome?.status === 'confirmed' ? (
                        <span className="text-[10px] text-cyberEmerald shrink-0 font-mono" title="Echipe de start confirmate oficial">
                          🟢
                        </span>
                      ) : ((f.prediction?.lineupImpactHome?.missingCount || 0) + (f.prediction?.lineupImpactAway?.missingCount || 0)) > 0 ? (
                        <span className="text-[10px] text-cyberAmber shrink-0 font-mono" title={`Absențe cheie detectate (${(f.prediction?.lineupImpactHome?.missingCount || 0) + (f.prediction?.lineupImpactAway?.missingCount || 0)})`}>
                          ⚠️
                        </span>
                      ) : null}
                    </div>
                  </td>

                  {/* 4. Pronostic Badge */}
                  <td className="py-3 px-2 text-center whitespace-nowrap">
                    {!pick ? (
                      <span
                        className="inline-block px-2.5 py-0.5 rounded-lg font-mono text-[10px] bg-slate-800/60 border border-slate-700/60 text-slate-500"
                        title="Nu există cotă reală de la casa de pariuri pentru acest meci — niciun pontaj nu poate fi evaluat."
                      >
                        Cote indisponibile
                      </span>
                    ) : pick.isSniper ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-black text-[11px] bg-gradient-to-r from-amber-400 via-cyberAmber to-cyberEmerald text-black shadow-[0_0_10px_rgba(255,183,3,0.4)] border border-amber-300">
                        <span>🎯</span>
                        <span>{pick.pickText.replace('🎯 ', '')}</span>
                      </span>
                    ) : (
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-lg font-bold text-[11px] shadow-sm font-mono ${
                          pick.pickType === 'exact'
                            ? 'bg-purple-500/20 border border-purple-400 text-purple-200 shadow-[0_0_8px_rgba(168,85,247,0.3)]'
                            : pick.pickType === 'over'
                            ? 'bg-cyberEmerald/20 border border-cyberEmerald text-cyberEmerald'
                            : pick.pickType === 'under'
                            ? 'bg-blue-500/20 border border-blue-400 text-blue-200'
                            : pick.pickType === 'btts'
                            ? 'bg-cyberCyan/20 border border-cyberCyan text-cyberCyan'
                            : pick.pickType === 'combo'
                            ? 'bg-cyberAmber/20 border border-cyberAmber text-cyberAmber'
                            : 'bg-gradient-to-r from-cyberCyan/20 to-cyberEmerald/20 border border-cyberCyan/60 text-white font-black'
                        }`}
                      >
                        {pick.pickText}
                      </span>
                    )}
                  </td>

                  {/* 5. Cota */}
                  <td className="py-3 px-2 text-center font-mono font-bold whitespace-nowrap text-xs">
                    <div className="flex items-center justify-center gap-1">
                      <span className={!pick ? 'text-slate-600' : pick.isSniper ? 'text-cyberAmber font-black' : 'text-slate-100 font-semibold'}>
                        {pick ? pick.odd.toFixed(2) : '—'}
                      </span>
                      {pick && f.prediction?.droppingOddsAnalysis?.hasDroppingOdds && (
                        <span
                          className="text-[10px] text-cyberAmber animate-bounce"
                          title={f.prediction.droppingOddsAnalysis.steamSummary}
                        >
                          📉
                        </span>
                      )}
                    </div>
                  </td>

                  {/* 6. Probabilitate % & Încredere Reală */}
                  <td className="py-3 px-2 text-center whitespace-nowrap">
                    {!pick ? (
                      <span className="font-mono text-[10px] text-slate-600">—</span>
                    ) : (
                    <div className="flex flex-col items-center gap-1">
                      <span
                        className={`inline-flex items-center px-2 py-0.2 rounded-md font-mono font-bold text-[10px] ${
                          pick.probPercent >= 70
                            ? 'bg-cyberEmerald/15 text-cyberEmerald border border-cyberEmerald/40'
                            : pick.probPercent >= 55
                            ? 'bg-cyberAmber/15 text-cyberAmber border border-cyberAmber/40'
                            : 'bg-cyberCyan/15 text-cyberCyan border border-cyberCyan/40'
                        }`}
                        title={`Probabilitate statistică reală: ${pick.probPercent}% (Dixon-Coles & Poisson)`}
                      >
                        {pick.probPercent}%
                      </span>
                      <div className="w-10 bg-slate-800/80 rounded-full h-1 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            pick.probPercent >= 70
                              ? 'bg-cyberEmerald shadow-[0_0_6px_#00ff9d]'
                              : pick.probPercent >= 55
                              ? 'bg-cyberAmber shadow-[0_0_6px_#ffb703]'
                              : 'bg-cyberCyan shadow-[0_0_6px_#00f0ff]'
                          }`}
                          style={{ width: `${Math.min(100, Math.max(0, pick.probPercent))}%` }}
                        />
                      </div>
                    </div>
                    )}
                  </td>

                  {/* 7. Valoare (Edge) — real expected value, negative included */}
                  <td className="py-3 px-2 text-center whitespace-nowrap">
                    {!pick ? (
                      <span className="font-mono text-[10px] text-slate-600">—</span>
                    ) : (
                      <span
                        className={`inline-block rounded-md px-2 py-0.5 font-mono font-bold text-[10px] ${
                          pick.edge <= 0
                            ? 'bg-slate-800/60 border border-slate-700/60 text-slate-400'
                            : pick.isSniper
                            ? 'bg-cyberAmber/20 border border-cyberAmber text-cyberAmber shadow-[0_0_8px_rgba(255,183,3,0.3)]'
                            : 'bg-cyberEmerald/20 border border-cyberEmerald/60 text-cyberEmerald shadow-[0_0_8px_rgba(0,255,157,0.2)]'
                        }`}
                        title={
                          pick.edge <= 0
                            ? 'Fără valoare: cota nu acoperă probabilitatea estimată de model.'
                            : 'Edge real = (probabilitate model × cotă) − 1'
                        }
                      >
                        {pick.edge > 0 ? '+' : ''}{pick.edge}%
                      </span>
                    )}
                  </td>

                  {/* 8. Miză Sugerată */}
                  <td className="py-3 px-2 text-center font-mono font-bold text-slate-300 whitespace-nowrap text-xs">
                    {pick ? pick.stakeUnits : '—'}
                  </td>

                  {/* 9. Status */}
                  <td className="py-3 px-2 text-center whitespace-nowrap">
                    {isLive ? (
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="inline-flex items-center gap-1 rounded-md bg-cyberRose/20 border border-cyberRose/60 px-2 py-0.5 font-mono text-[9px] font-bold text-cyberRose animate-pulse shadow-[0_0_8px_rgba(255,0,85,0.4)]">
                          <Radio className="h-2.5 w-2.5" />
                          {f.status === 'HT' ? 'Pauză' : `${f.elapsedMinute}'`}
                        </span>
                        {hasScore && (
                          <span className="font-mono text-[10px] font-black text-white">
                            {homeScore}:{awayScore}
                          </span>
                        )}
                      </div>
                    ) : isFinished ? (
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="inline-block rounded-md bg-slate-800/90 border border-slate-700/80 px-2 py-0.5 font-mono text-[9px] font-bold text-slate-300">
                          Final
                        </span>
                        {hasScore && (
                          <span className="font-mono text-[10px] font-black text-cyberEmerald tracking-wider drop-shadow-[0_0_4px_rgba(0,255,157,0.4)]">
                            {homeScore}:{awayScore}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="inline-block rounded-md bg-[#0c1320] border border-slate-800 px-2 py-0.5 font-mono text-[9px] text-slate-400">
                        Pre
                      </span>
                    )}
                  </td>

                  {/* 10. Grafic / Acțiuni */}
                  <td className="py-3 px-2 text-center whitespace-nowrap">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectMatch(f);
                      }}
                      className="p-1.5 rounded-lg text-cyberCyan hover:bg-cyberCyan/20 hover:text-white transition-all shadow-sm"
                      title="Deschide Analiza Meciului"
                    >
                      <BarChart2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Loading State */}
        {isLoading && (
          <div className="py-14 flex flex-col items-center justify-center gap-3 text-center">
            <div className="h-8 w-8 rounded-full border-2 border-cyberCyan border-t-transparent animate-spin shadow-[0_0_12px_#00f0ff]" />
            <div className="text-xs text-slate-300 font-medium font-mono">
              Se calculează distribuția matematică și predicțiile Dixon-Coles...
            </div>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && filteredFixtures.length === 0 && (
          <div className="py-14 flex flex-col items-center justify-center gap-2.5 text-center text-xs text-slate-400">
            <div className="text-3xl">{searchQuery ? '🔍' : '⚽'}</div>
            <div className="font-bold text-slate-200 text-sm">
              {searchQuery ? `Niciun meci găsit pentru "${searchQuery}"` : 'Niciun meci găsit pentru filtrele selectate'}
            </div>
            <div className="text-[11px] text-slate-400 max-w-sm">
              {searchQuery ? (
                <div className="space-y-3 mt-1">
                  <p>Verifică ortografia sau caută după numele echipei ori competiției.</p>
                  {onSearchChange && (
                    <button
                      type="button"
                      onClick={() => onSearchChange('')}
                      className="px-4 py-1.5 rounded-xl bg-cyberCyan/15 border border-cyberCyan/40 text-cyberCyan font-bold hover:bg-cyberCyan/25 transition text-xs shadow-sm"
                    >
                      Resetează căutarea
                    </button>
                  )}
                </div>
              ) : (
                'Încearcă să selectezi altă categorie din meniu sau comută pe Toate ligile pentru a vedea meciurile disponibile.'
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
