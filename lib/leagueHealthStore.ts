/**
 * FlashStat — League Health & Risk Gating Store (lib/leagueHealthStore.ts)
 * 
 * Loads empirical backtest performance metrics per league from fixtures/backtest_metrics.json.
 * Enforces risk gates so unproven, unprofitable, or under-sampled leagues are NEVER marked as actionable.
 */

import fs from 'fs';
import path from 'path';

export interface LeagueHealthRecord {
  leagueId: number;
  leagueName: string;
  matchesCount: number;
  brierScore1X2: number;
  bookmakerBrierScore1X2: number | null;
  beatsBookmakerBrier: boolean | null;
  logLoss1X2: number;
  simulatedRoiPercent: number;
  roiCi95: [number, number];
  isRoiSignificant: boolean;
  clvMetrics: {
    avgClvPercent: number;
    positiveClvRatePercent: number;
    ci95: [number, number];
    isSignificant: boolean;
  };
  totalBetsPlaced: number;
  winRate: number;
  maxDrawdownPercent: number;
}

interface BacktestMetricsBundle {
  overallRoiPercent: number;
  isOverallProfitable: boolean;
  leagueHealthMap?: Record<string, LeagueHealthRecord>;
}

class LeagueHealthStore {
  private loaded = false;
  private healthMap: Record<string, LeagueHealthRecord> | null = null;

  private load(): void {
    if (this.loaded) return;
    this.loaded = true;

    try {
      const candidates = [
        path.resolve(process.cwd(), 'fixtures', 'backtest_metrics.json'),
        path.resolve(process.cwd(), 'data', 'backtest_metrics.json'),
      ];

      for (const p of candidates) {
        if (fs.existsSync(p)) {
          const raw = fs.readFileSync(p, 'utf-8');
          const data = JSON.parse(raw) as BacktestMetricsBundle;
          if (data.leagueHealthMap) {
            this.healthMap = data.leagueHealthMap;
            return;
          }
        }
      }
    } catch (err) {
      console.warn('[LeagueHealthStore] Failed to load backtest_metrics.json:', (err as Error).message);
    }
  }

  public getLeagueHealth(leagueId?: number | string): LeagueHealthRecord | null {
    this.load();
    if (!this.healthMap || !leagueId) return null;
    return this.healthMap[String(leagueId)] ?? null;
  }

  /**
   * Evaluates whether a league meets strict empirical standards for actionable betting recommendations.
   * A league is actionable ONLY IF:
   * 1. It has backtest data with >= 100 bets placed.
   * 2. beatsBookmakerBrier is true (or not false).
   * 3. It does not have statistically significant negative ROI.
   * 4. CLV is positive and significant.
   */
  public isLeagueActionable(leagueId?: number | string): {
    actionable: boolean;
    isClvPositive: boolean;
    reason?: string;
  } {
    const health = this.getLeagueHealth(leagueId);
    if (!health) {
      return {
        actionable: false,
        isClvPositive: false,
        reason: 'Competiție fără istoric de backtest — predicție orientativă.',
      };
    }

    const isClvPositive = health.clvMetrics.avgClvPercent > 0 && health.clvMetrics.isSignificant;

    // Check sample size
    if (health.totalBetsPlaced < 100) {
      return {
        actionable: false,
        isClvPositive,
        reason: `Eșantion insuficient (${health.totalBetsPlaced} pariuri evaluate, minim 100 necesar).`,
      };
    }

    // Check Brier score against market
    if (health.beatsBookmakerBrier === false) {
      return {
        actionable: false,
        isClvPositive,
        reason: `Modelul nu depășește acuratețea pieței în această ligă (Brier ${health.brierScore1X2} vs casă ${health.bookmakerBrierScore1X2}).`,
      };
    }

    // Check ROI significance
    if (health.simulatedRoiPercent <= 0 && health.isRoiSignificant) {
      return {
        actionable: false,
        isClvPositive,
        reason: `ROI istoric negativ demonstrat statistic (${health.simulatedRoiPercent.toFixed(1)}%).`,
      };
    }

    if (!isClvPositive) {
      return {
        actionable: false,
        isClvPositive: false,
        reason: 'CLV istoric non-pozitiv — piața nu a fost bătută pe linia de închidere.',
      };
    }

    return {
      actionable: true,
      isClvPositive: true,
    };
  }

  public reset(): void {
    this.loaded = false;
    this.healthMap = null;
  }
}

export const leagueHealthStore = new LeagueHealthStore();
