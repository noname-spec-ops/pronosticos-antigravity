import { describe, it, expect } from 'vitest';
import {
  getPersistentPaperBets,
  savePaperBet,
  settlePaperBet,
  calculatePaperTradingSummary,
  type PaperBet,
} from '../paperTrading';

describe('Paper Trading Persistence & Settlement Engine', () => {
  it('loads persistent paper bets from store', () => {
    const bets = getPersistentPaperBets();
    expect(bets).toBeDefined();
    expect(Array.isArray(bets)).toBe(true);
    expect(bets.length).toBeGreaterThanOrEqual(1);
  });

  it('saves and settles a new paper bet with correct CLV and PnL calculation', () => {
    const testBet: PaperBet = {
      id: 'test-bet-persist-999',
      fixtureId: 99901,
      matchName: 'Test FC Alpha vs Test FC Beta',
      leagueName: 'Premier League',
      marketType: 'OU',
      pick: 'Over 2.5',
      placedOdds: 2.00,
      closingOdds: 2.00,
      modelProb: 0.58,
      edgePercent: 16.0,
      clvPercent: 0,
      stakeUnits: 2.0,
      placedAt: new Date().toISOString(),
      status: 'PENDING',
      category: 'SNIPER',
      isSharpBeating: false,
    };

    savePaperBet(testBet);
    const loaded = getPersistentPaperBets();
    const found = loaded.find((b) => b.id === 'test-bet-persist-999');
    expect(found).toBeDefined();

    // Settle as WON with closing odds 1.80 (beating the closing line: CLV = (2.0/1.8 - 1)*100 = +11.11%)
    const settled = settlePaperBet('test-bet-persist-999', 'WON', 1.80);
    expect(settled).not.toBeNull();
    expect(settled?.status).toBe('WON');
    expect(settled?.pnlUnits).toBe(2.0); // 2.0 * (2.0 - 1) = 2.0
    expect(settled?.clvPercent).toBeCloseTo(11.11, 1);
    expect(settled?.isSharpBeating).toBe(true);
  });

  it('computes robust summary from settled bets', () => {
    const bets = getPersistentPaperBets();
    const summary = calculatePaperTradingSummary(bets);

    expect(summary.startingBankrollUnits).toBe(100.0);
    expect(summary.totalBets).toBeGreaterThanOrEqual(1);
    expect(summary.winRatePercent).toBeGreaterThanOrEqual(0);
    expect(summary.killSwitch).toBeDefined();
  });
});