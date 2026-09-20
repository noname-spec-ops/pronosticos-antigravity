import { describe, it, expect } from 'vitest';
import { calculatePaperTradingSummary, type PaperBet } from '../paperTrading';

describe('Paper Trading & CLV Performance Tracker', () => {
  it('correctly calculates bankroll growth, CLV %, win rate and Brier score', () => {
    const bets: PaperBet[] = [
      {
        id: '1',
        fixtureId: 10,
        matchName: 'Team A vs Team B',
        leagueName: 'Bundesliga',
        marketType: 'over_2_5',
        pick: 'Peste 2.5',
        placedOdds: 2.00,
        closingOdds: 1.80, // CLV = +11.11%
        modelProb: 0.60,
        edgePercent: 20.0,
        clvPercent: 11.11,
        stakeUnits: 2.0,
        placedAt: '2026-09-10 12:00',
        status: 'WON',
        category: 'SNIPER',
        isSharpBeating: true,
      },
      {
        id: '2',
        fixtureId: 11,
        matchName: 'Team C vs Team D',
        leagueName: 'Eredivisie',
        marketType: 'over_2_5',
        pick: 'Peste 2.5',
        placedOdds: 1.90,
        closingOdds: 1.85, // CLV = +2.70%
        modelProb: 0.58,
        edgePercent: 10.2,
        clvPercent: 2.70,
        stakeUnits: 2.0,
        placedAt: '2026-09-10 13:00',
        status: 'LOST',
        category: 'SNIPER',
        isSharpBeating: true,
      },
    ];

    const summary = calculatePaperTradingSummary(bets);

    expect(summary.startingBankrollUnits).toBe(100);
    // WON: 2.0 * (2.00 - 1) = +2.0 units
    // LOST: -2.0 units
    // Net: 0.0 units
    expect(summary.netPnlUnits).toBe(0.0);
    expect(summary.currentBankrollUnits).toBe(100.0);
    expect(summary.winRatePercent).toBe(50.0);
    expect(summary.totalBets).toBe(2);
    expect(summary.wonBets).toBe(1);
    expect(summary.lostBets).toBe(1);

    // CLV average: (11.11 + 2.70) / 2 = 6.905 -> ~6.91%
    expect(summary.averageCLVPercent).toBeCloseTo(6.91, 1);
    expect(summary.positiveClvRatePercent).toBe(100.0);

    // Brier: ((0.60 - 1)^2 + (0.58 - 0)^2) / 2 = (0.16 + 0.3364) / 2 = 0.2482
    expect(summary.brierScore).toBeCloseTo(0.2482, 3);
  });
});
