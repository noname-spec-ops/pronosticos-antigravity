/**
 * FlashStat — Automated Weekly Performance & Strategy Report (engine/weeklyReport.ts)
 * 
 * Generates automated quantitative audit reports with explicit capital allocation verdicts:
 * - 'OPRESTE_PARIURILE_AICI' for leagues/markets with persistent negative CLV.
 * - 'MARESTE_EXPUNEREA' for proven positive-CLV markets.
 */

import fs from 'fs';
import path from 'path';
import type { PaperBet } from './paperTrading';
import { getPersistentPaperBets, calculatePaperTradingSummary, isPersistenceBlocked, resolveDataDir } from './paperTrading';

export interface MarketVerdict {
  marketOrLeague: string;
  totalBets: number;
  winRatePercent: number;
  roiPercent: number;
  avgClvPercent: number;
  verdict: 'MARESTE_EXPUNEREA' | 'MENTINE_STABIL' | 'OPRESTE_PARIURILE_AICI';
  recommendation: string;
}

export interface WeeklyReportSummary {
  generatedAt: string;
  periodLabel: string;
  sevenDays: { totalBets: number; roiPercent: number; avgClvPercent: number; winRatePercent: number };
  thirtyDays: { totalBets: number; roiPercent: number; avgClvPercent: number; winRatePercent: number };
  allTime: { totalBets: number; roiPercent: number; avgClvPercent: number; maxDrawdownPercent: number };
  killSwitchStatus: string;
  leagueVerdicts: MarketVerdict[];
  marketVerdicts: MarketVerdict[];
  executiveSummary: string;
}

export function generateWeeklyReport(betsOverride?: PaperBet[]): WeeklyReportSummary {
  const bets = betsOverride ?? getPersistentPaperBets();
  const summary = calculatePaperTradingSummary(bets);

  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

  const bets7d = bets.filter((b) => new Date(b.placedAt).getTime() >= sevenDaysAgo);
  const bets30d = bets.filter((b) => new Date(b.placedAt).getTime() >= thirtyDaysAgo);

  const sum7d = calculatePaperTradingSummary(bets7d);
  const sum30d = calculatePaperTradingSummary(bets30d);

  // Group by league
  const byLeague = new Map<string, PaperBet[]>();
  const byMarket = new Map<string, PaperBet[]>();

  for (const b of bets) {
    if (!byLeague.has(b.leagueName)) byLeague.set(b.leagueName, []);
    byLeague.get(b.leagueName)!.push(b);

    if (!byMarket.has(b.marketType)) byMarket.set(b.marketType, []);
    byMarket.get(b.marketType)!.push(b);
  }

  /**
   * Minimum settled bets before a league/market verdict is statistically meaningful.
   * The project's own backtest needed ~2,400 bets to land a CLV confidence interval
   * that still straddled zero — 5 bets carries no information at all.
   */
  const MIN_BETS_FOR_VERDICT = 100;

  function evaluateVerdicts(map: Map<string, PaperBet[]>): MarketVerdict[] {
    const list: MarketVerdict[] = [];
    for (const [key, bList] of map.entries()) {
      const s = calculatePaperTradingSummary(bList);
      let verdict: 'MARESTE_EXPUNEREA' | 'MENTINE_STABIL' | 'OPRESTE_PARIURILE_AICI' = 'MENTINE_STABIL';
      let recommendation = 'Menține volumul curent în monitorizare.';

      // A capital-allocation verdict on a handful of bets is noise, not evidence.
      // CLV needs a few hundred settled bets before its sign means anything, so
      // below the threshold the report says "insufficient sample" instead of
      // issuing a confident recommendation.
      if (bList.length < MIN_BETS_FOR_VERDICT) {
        recommendation = `Eșantion insuficient (${bList.length}/${MIN_BETS_FOR_VERDICT} pariuri). Niciun verdict statistic valid.`;
      } else if (s.averageCLVPercent >= 2.0 && s.roiPercent >= 0) {
        verdict = 'MARESTE_EXPUNEREA';
        recommendation = `Edge confirmat: CLV +${s.averageCLVPercent}% pe ${bList.length} pariuri.`;
      } else if (s.averageCLVPercent <= -2.0) {
        verdict = 'OPRESTE_PARIURILE_AICI';
        recommendation = `Stop recomandat: CLV negativ (${s.averageCLVPercent}%) pe ${bList.length} pariuri.`;
      }

      list.push({
        marketOrLeague: key,
        totalBets: s.totalBets,
        winRatePercent: s.winRatePercent,
        roiPercent: s.roiPercent,
        avgClvPercent: s.averageCLVPercent,
        verdict,
        recommendation,
      });
    }
    return list;
  }

  const leagueVerdicts = evaluateVerdicts(byLeague);
  const marketVerdicts = evaluateVerdicts(byMarket);

  const report: WeeklyReportSummary = {
    generatedAt: new Date().toISOString(),
    periodLabel: `Săptămâna ${new Date().toLocaleDateString('ro-RO')}`,
    sevenDays: {
      totalBets: sum7d.totalBets,
      roiPercent: sum7d.roiPercent,
      avgClvPercent: sum7d.averageCLVPercent,
      winRatePercent: sum7d.winRatePercent,
    },
    thirtyDays: {
      totalBets: sum30d.totalBets,
      roiPercent: sum30d.roiPercent,
      avgClvPercent: sum30d.averageCLVPercent,
      winRatePercent: sum30d.winRatePercent,
    },
    allTime: {
      totalBets: summary.totalBets,
      roiPercent: summary.roiPercent,
      avgClvPercent: summary.averageCLVPercent,
      maxDrawdownPercent: summary.maxDrawdownPercent,
    },
    killSwitchStatus: summary.killSwitch.message,
    leagueVerdicts,
    marketVerdicts,
    executiveSummary: `Audit săptămânal finalizat. Total ${summary.totalBets} tranzacții simulate, CLV mediu: ${summary.averageCLVPercent}%, ROI: ${summary.roiPercent}%. Drawdown maxim: ${summary.maxDrawdownPercent}%.`,
  };

  // Tests must not overwrite the real report; see isPersistenceBlocked in paperTrading.
  if (!isPersistenceBlocked()) {
    const reportPath = path.join(resolveDataDir(path), 'weekly_report.json');
    try {
      const dir = path.dirname(reportPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
    } catch {}
  }

  return report;
}