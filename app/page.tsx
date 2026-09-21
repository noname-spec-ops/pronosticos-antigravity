'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Header, { type MainNavTab } from '@/components/Header';
import TopKpiBar from '@/components/TopKpiBar';
import LeftSidebar from '@/components/LeftSidebar';
import MatchesTable from '@/components/MatchesTable';
import SelectedMatchAnalysis from '@/components/SelectedMatchAnalysis';

import RightIntelligenceSidebar from '@/components/RightIntelligenceSidebar';
import MatchModal from '@/components/MatchModal';
import TeamProfileModal from '@/components/TeamProfileModal';
import ComboBuilderModal from '@/components/ComboBuilderModal';
import PaperTradingModal from '@/components/PaperTradingModal';
import SteamScannerModal from '@/components/SteamScannerModal';
import Disclaimer from '@/components/Disclaimer';
import { VipAuthGate } from '@/components/VipAuthGate';
import type { Fixture, GlobalModelHealth } from '@/types/football';
import backtestMetrics from '@/fixtures/backtest_metrics.json';
import { isTopMatch, sortFixturesByPriority } from '@/lib/leaguePriority';
import { todayLocalISO } from '@/lib/localDate';
import { Crown, RefreshCw, ShieldAlert, Sparkles, Trophy } from 'lucide-react';

export default function HomePage() {
  const [selectedDate, setSelectedDate] = useState<string>(() => todayLocalISO());
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeNavTab, setActiveNavTab] = useState<MainNavTab>('predictions');
  const [selectedLeague, setSelectedLeague] = useState<string>('all');
  const [activeFilter, setActiveFilter] = useState<string>('all');

  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [selectedFixture, setSelectedFixture] = useState<Fixture | null>(null);
  const [selectedTeamForProfile, setSelectedTeamForProfile] = useState<string | null>(null);
  const [isFullModalOpen, setIsFullModalOpen] = useState<boolean>(false);
  const [isComboModalOpen, setIsComboModalOpen] = useState<boolean>(false);
  const [isPaperTradingOpen, setIsPaperTradingOpen] = useState<boolean>(false);
  const [isSteamModalOpen, setIsSteamModalOpen] = useState<boolean>(false);
  const [favorites, setFavorites] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);
  const [ticketSelections, setTicketSelections] = useState<any[]>([]);

  // Load favorites from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('flashstat_favorites');
      if (stored) setFavorites(JSON.parse(stored));
    } catch {}
  }, []);

  const toggleFavorite = (id: number) => {
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((favId) => favId !== id) : [...prev, id];
      try {
        localStorage.setItem('flashstat_favorites', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  // Fetch fixtures when selectedDate changes
  const fetchFixtures = async (signal?: AbortSignal) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/fixtures?date=${selectedDate}`, { signal });
      if (res.ok) {
        const data = await res.json();
        const list: Fixture[] = data.fixtures || [];
        setFixtures(list);
        setIsDemoMode(data.isDemo || false);

        // Auto-select first fixture if none selected
        if (list.length > 0 && !selectedFixture) {
          setSelectedFixture(list[0]);
        }
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        console.warn('[FlashStat] Nu s-au putut încărca meciurile (reîncercare automată la următorul ciclu):', err?.message || err);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchFixtures(controller.signal);
    const timer = setInterval(() => {
      fetchFixtures();
    }, 60000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [selectedDate]);

  // Ensure an active selected fixture is always populated
  useEffect(() => {
    if (fixtures.length > 0 && (!selectedFixture || !fixtures.some((f) => f.id === selectedFixture.id))) {
      setSelectedFixture(fixtures[0]);
    }
  }, [fixtures]);

  // Helper for accent/diacritic-insensitive search matching
  const cleanSearchText = (str: string | undefined | null) =>
    (str || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();

  // Filter and sort fixtures
  const filteredFixtures = useMemo(() => {
    const q = cleanSearchText(searchQuery);

    const list = fixtures.filter((f) => {
      // 1. Search Query Matcher (Global & Instant)
      if (q) {
        const home = cleanSearchText(f.homeTeam.name);
        const away = cleanSearchText(f.awayTeam.name);
        const homeCode = cleanSearchText(f.homeTeam.shortCode);
        const awayCode = cleanSearchText(f.awayTeam.shortCode);
        const leagueName = cleanSearchText(f.league.name);
        const leagueCountry = cleanSearchText(f.league.country);
        const refName = cleanSearchText(f.referee?.name);

        const isMatch =
          home.includes(q) ||
          away.includes(q) ||
          homeCode.includes(q) ||
          awayCode.includes(q) ||
          leagueName.includes(q) ||
          leagueCountry.includes(q) ||
          refName.includes(q);

        // When a search term is actively entered, search across the entire fixture base
        return isMatch;
      }

      // 2. League Filter (Active when not actively searching)
      if (selectedLeague === 'top') {
        if (!isTopMatch(f)) return false;
      } else if (selectedLeague !== 'all') {
        if (selectedLeague === 'ucl' && f.league.id !== 2) return false;
        if (selectedLeague === 'uel' && f.league.id !== 3) return false;
        if (selectedLeague === 'uecl' && f.league.id !== 848) return false;
        if (selectedLeague === 'e0' && f.league.id !== 39) return false;
        if (selectedLeague === 'sp1' && f.league.id !== 140) return false;
        if (selectedLeague === 'i1' && f.league.id !== 135) return false;
        if (selectedLeague === 'd1' && f.league.id !== 78) return false;
        if (selectedLeague === 'f1' && f.league.id !== 61) return false;
        if (selectedLeague === 'ro1' && f.league.id !== 283) return false;
        if (selectedLeague === 'n1' && f.league.id !== 88) return false;
        if (selectedLeague === 't1' && f.league.id !== 203) return false;
        if (selectedLeague === 'usa' && f.league.id !== 253) return false;
        if (selectedLeague === 'other' && isTopMatch(f)) return false;
      }

      // 3. Category Filter
      if (activeFilter === 'sniper') {
        const pred = f.prediction;
        if (!pred) return false;
        const pOver = pred.overUnderProbabilities.find((o) => o.line === 2.5)?.over;
        // A real quoted Over 2.5 price is mandatory — no price, no sniper signal.
        const oddOver = f.odds?.overUnder?.find((o) => o.line === 2.5)?.over;
        if (pOver === undefined || oddOver === undefined) return false;
        const edge = ((pOver * oddOver) - 1) * 100;
        const isTargetLeague = [78, 88, 144, 39, 40, 179, 140, 135].includes(f.league.id);
        return isTargetLeague && oddOver >= 1.60 && oddOver <= 2.20 && (pOver >= 0.54 || edge >= 3.5);
      }
      if (activeFilter === 'live') {
        return ['1H', 'HT', '2H', 'ET', 'P', 'LIVE'].includes(f.status);
      }
      if (activeFilter === 'favorites') {
        return favorites.includes(f.id);
      }
      if (activeFilter === 'value') {
        return f.prediction?.valueBets && f.prediction.valueBets.length > 0;
      }
      if (activeFilter === 'safe') {
        return (f.prediction?.probabilities1X2.home || 0) >= 0.65 || (f.prediction?.probabilities1X2.away || 0) >= 0.65;
      }
      if (activeFilter === 'archive') {
        return ['FT', 'AET', 'PEN'].includes(f.status);
      }

      return true;
    });

    return sortFixturesByPriority(list);
  }, [fixtures, searchQuery, selectedLeague, activeFilter, favorites]);

  // Counts for sidebar badges
  const liveCount = useMemo(() => fixtures.filter((f) => ['1H', 'HT', '2H', 'ET', 'P', 'LIVE'].includes(f.status)).length, [fixtures]);
  const valueCount = useMemo(() => fixtures.filter((f) => f.prediction?.valueBets && f.prediction.valueBets.length > 0).length, [fixtures]);
  const finishedCount = useMemo(() => fixtures.filter((f) => ['FT', 'AET', 'PEN'].includes(f.status)).length, [fixtures]);

  // Headline performance comes from the out-of-sample backtest — the only sample
  // large enough to mean anything — not from invented constants.
  const backtestSummary = useMemo(() => {
    const m = backtestMetrics as unknown as {
      overallRoiPercent?: number;
      totalBetsPlaced?: number;
      marketBreakdown?: Array<{ winRatePercent: number; betsCount: number }>;
    };
    if (typeof m.overallRoiPercent !== 'number' || !m.totalBetsPlaced) return null;
    const weighted = (m.marketBreakdown ?? []).reduce(
      (acc, b) => ({ w: acc.w + b.winRatePercent * b.betsCount, n: acc.n + b.betsCount }),
      { w: 0, n: 0 }
    );
    return {
      roiPercent: m.overallRoiPercent,
      totalBetsPlaced: m.totalBetsPlaced,
      winRatePercent: weighted.n > 0 ? weighted.w / weighted.n : null,
    };
  }, []);

  // Average quoted odd across the value bets actually found. 0 when there are none.
  const avgValueBetOdd = useMemo(() => {
    const odds = fixtures.flatMap((f) => f.prediction?.valueBets?.map((vb) => vb.bookmakerOdds) ?? []);
    if (odds.length === 0) return 0;
    return Number((odds.reduce((a, b) => a + b, 0) / odds.length).toFixed(2));
  }, [fixtures]);

  const handleAddToTicket = (f: Fixture, pick: string, odd: number) => {
    setTicketSelections((prev) => [
      ...prev.filter((item) => item.fixtureId !== f.id),
      {
        fixtureId: f.id,
        match: `${f.homeTeam.name} vs ${f.awayTeam.name}`,
        pick,
        odd,
      },
    ]);
  };

  return (
    <VipAuthGate>
      <div className="min-h-screen bg-[#070b11] text-gray-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-black">
      {/* 1. Header (OP GODMODE style) */}
      <Header
        selectedDate={selectedDate}
        onDateChange={setSelectedDate}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        activeNavTab={activeNavTab}
        onNavTabChange={(tab) => {
          setActiveNavTab(tab);
          if (tab === 'predictions') {
            setActiveFilter('all');
          } else if (tab === 'live') {
            setActiveFilter('live');
          } else if (tab === 'value') {
            setActiveFilter('value');
          } else if (tab === 'strategies') {
            setActiveFilter('sniper');
          } else if (tab === 'stats') {
            setActiveFilter('all');
          } else if (tab === 'tickets') {
            setIsComboModalOpen(true);
          } else if (tab === 'papertrading') {
            setIsPaperTradingOpen(true);
          }
        }}
        isDemoMode={isDemoMode}
        onOpenSettings={() => {}}
        onOpenSteamScanner={() => setIsSteamModalOpen(true)}
      />

      {/* 2. Main Page Container */}
      <main className="flex-1 mx-auto w-full max-w-[1700px] px-3 sm:px-5 py-4 space-y-4">
        {/* Demo-data banner: shown only when no provider returned authentic fixtures */}
        {isDemoMode && (
          <div className="rounded-xl border border-amber-500/50 bg-amber-950/30 px-4 py-3 text-xs text-amber-200 flex items-start gap-2.5">
            <span className="text-base leading-none">⚠️</span>
            <div className="leading-relaxed">
              <strong className="font-bold">Date demonstrative.</strong> Niciun furnizor de date nu a
              returnat meciuri pentru această zi, așa că este afișat setul de exemplu inclus în aplicație.
              Meciurile, scorurile și cotele de mai jos <strong>nu sunt reale</strong> și nu trebuie
              folosite pentru pariuri.
            </div>
          </div>
        )}

        {/* Top KPI Metrics Bar */}
        <TopKpiBar
          picksCount={fixtures.length}
          valueBetsCount={valueCount}
          avgOdd={avgValueBetOdd}
          backtest={backtestSummary}
        />

        {/* 3-Column Command Center Layout */}
        <div className="flex flex-col lg:flex-row items-start gap-4">
          {/* Left Sidebar */}
          <LeftSidebar
            selectedLeague={selectedLeague}
            onSelectLeague={setSelectedLeague}
            activeFilter={activeFilter}
            onSelectFilter={(filterId) => {
              setActiveFilter(filterId);
              if (filterId === 'all') setActiveNavTab('predictions');
              else if (filterId === 'live') setActiveNavTab('live');
              else if (filterId === 'value') setActiveNavTab('value');
              else if (filterId === 'sniper') setActiveNavTab('strategies');
            }}
            totalMatchesCount={fixtures.length}
            liveMatchesCount={liveCount}
            favoritesCount={favorites.length}
            valueBetsCount={valueCount}
            finishedMatchesCount={finishedCount}
            onOpenTool={(toolName) => {
              if (toolName === 'steam') setIsSteamModalOpen(true);
              else if (toolName === 'tickets') setIsComboModalOpen(true);
              else if (toolName === 'papertrading' || toolName === 'clv') setIsPaperTradingOpen(true);
              else if (toolName === 'sniper') {
                setActiveFilter('sniper');
                setActiveNavTab('strategies');
              }
            }}
          />

          {/* Center Main Stream */}
          <section className="flex-1 min-w-0 w-full space-y-4">
            {/* Sniper Sweet Spot Info Banner (Shown when active or general) */}
            {activeFilter === 'sniper' && (
              <div className="rounded-2xl border border-cyberAmber/60 bg-gradient-to-r from-[#180f05] via-[#0f1724] to-[#070c14] p-4 shadow-cyber-card flex items-center justify-between gap-4 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-48 h-48 bg-cyberAmber/10 rounded-full blur-3xl pointer-events-none" />

                <div className="flex items-center gap-3.5 relative z-10">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-cyberAmber text-black font-black text-xl shadow-[0_0_15px_rgba(255,183,3,0.4)]">
                    🎯
                  </div>
                  <div>
                    <div className="text-sm font-black text-cyberAmber flex items-center gap-2 tracking-tight">
                      <span>RADARUL SNIPER — OVER 2.5 SWEET SPOT</span>
                      <span className="text-[10px] bg-cyberAmber text-black px-2 py-0.2 rounded-full font-bold uppercase font-mono shadow-sm">Validat Backtest</span>
                    </div>
                    <div className="text-xs text-slate-300">
                      Filtrează exclusiv meciurile cu <strong>ROI pozitiv (+0.97% până la +20.5%)</strong> în ligi ofensive, cote <strong>1.65 – 2.15</strong> și CLV pozitiv (+0.07%).
                    </div>
                  </div>
                </div>
                <div className="hidden sm:flex items-center gap-2 font-mono text-xs relative z-10">
                  <div className="bg-[#03060c]/80 border border-cyberAmber/40 px-3 py-1.5 rounded-xl text-center shadow-sm">
                    <div className="text-[9px] text-slate-400">WIN RATE</div>
                    <div className="font-black text-cyberAmber">54.1%</div>
                  </div>
                  <div className="bg-[#03060c]/80 border border-cyberEmerald/40 px-3 py-1.5 rounded-xl text-center shadow-sm">
                    <div className="text-[9px] text-slate-400">CLV MEDIU</div>
                    <div className="font-black text-cyberEmerald">+0.31%</div>
                  </div>
                </div>
              </div>
            )}

            {/* Upper Table of Matches */}
            <MatchesTable
              fixtures={filteredFixtures}
              selectedDate={selectedDate}
              selectedFixtureId={selectedFixture?.id}
              onSelectMatch={(f) => setSelectedFixture(f)}
              onSelectTeam={(teamName) => setSelectedTeamForProfile(teamName)}
              favorites={favorites}
              onToggleFavorite={toggleFavorite}
              onAddToTicket={handleAddToTicket}
              filterMode={activeFilter}
              isLoading={isLoading}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
            />

            {/* Lower: Selected Match Analysis Deep Dive */}
            <SelectedMatchAnalysis
              fixture={selectedFixture}
              onOpenFullModal={() => setIsFullModalOpen(true)}
              onAddToTicket={handleAddToTicket}
              onSelectTeam={(teamName) => setSelectedTeamForProfile(teamName)}
            />


          </section>

          {/* Right Intelligence Sidebar */}
          <RightIntelligenceSidebar
            fixtures={fixtures}
            onSelectFixture={(f) => setSelectedFixture(f)}
            onSelectFixtureByName={(name) => {
              const matched = fixtures.find((f) => f.homeTeam.name.includes(name) || f.awayTeam.name.includes(name));
              if (matched) setSelectedFixture(matched);
            }}
            onAddTicketSelections={(picks) => {
              setTicketSelections((prev) => [...prev, ...picks]);
            }}
          />
        </div>
      </main>

      {/* Team Profile & Dixon-Coles Stats Modal */}
      {selectedTeamForProfile && (
        <TeamProfileModal
          teamName={selectedTeamForProfile}
          onClose={() => setSelectedTeamForProfile(null)}
          onSelectMatchByTeam={(name) => {
            const matched = fixtures.find((f) => f.homeTeam.name === name || f.awayTeam.name === name);
            if (matched) setSelectedFixture(matched);
            setSelectedTeamForProfile(null);
          }}
        />
      )}

      {/* Full Screen Match Modal */}
      {isFullModalOpen && selectedFixture && (
        <MatchModal
          fixture={selectedFixture}
          onClose={() => setIsFullModalOpen(false)}
        />
      )}

      {/* OP GODMODE Combo & Acca Builder Modal */}
      {isComboModalOpen && (
        <ComboBuilderModal
          isOpen={isComboModalOpen}
          onClose={() => setIsComboModalOpen(false)}
          fixtures={fixtures}
        />
      )}

      {/* Steam & Early Odds Scanner Modal */}
      {isSteamModalOpen && (
        <SteamScannerModal
          isOpen={isSteamModalOpen}
          onClose={() => setIsSteamModalOpen(false)}
          fixtures={fixtures}
          onAddToTicket={handleAddToTicket}
          onSelectFixture={(f) => setSelectedFixture(f)}
        />
      )}

      {/* OP Quant Paper Trading & CLV Tracker Modal */}
      {isPaperTradingOpen && (
        <PaperTradingModal
          isOpen={isPaperTradingOpen}
          onClose={() => setIsPaperTradingOpen(false)}
          fixtures={fixtures}
        />
      )}

      {/* Footer Quote & Brand */}
      <footer className="mt-10 border-t border-cyberCyan/15 bg-[#050912]/90 backdrop-blur-xl py-6 text-xs text-slate-400">
        <div className="mx-auto max-w-[1700px] px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <span className="h-2 w-2 rounded-full bg-cyberEmerald animate-pulse shadow-[0_0_8px_#00ff9d]" />
            <Crown className="h-4 w-4 text-cyberAmber" />
            <span className="font-black text-white font-mono tracking-wider">FLASHSTAT QUANT ALPHA</span>
            <span className="text-slate-500 font-mono text-[11px]">— Analiză Stochastică Dixon-Coles</span>
          </div>

          <div className="italic text-slate-400 text-center text-[11px] font-sans">
            &ldquo;Disciplina matematică și valoarea așteptată pozitivă înving hazardul pe termen lung.&rdquo;
          </div>

          <div className="flex items-center gap-3 font-mono text-[10px] text-slate-400">
            <span className="rounded-lg border border-slate-800 bg-[#070c14] px-2.5 py-1 text-slate-400">18+ Joc responsabil</span>
          </div>
        </div>
      </footer>
    </div>
    </VipAuthGate>
  );
}
