import { describe, it, expect } from 'vitest';
import { settleAsianHandicap, calculateDnbProbabilities } from '../asianHandicapQuarter';

describe('Asian Handicap Quarter Lines and DNB Engine', () => {
  it('correctly settles Line -0.25 (Quarter Ball Favorite)', () => {
    const odds = 1.90;

    // Home wins 2-1: full win
    const winResult = settleAsianHandicap(2, 1, -0.25, 'HOME', odds);
    expect(winResult.outcome).toBe('WIN');
    expect(winResult.payoutMultiplier).toBe(1.90);
    expect(winResult.netProfitMultiplier).toBeCloseTo(0.90, 4);

    // Draw 1-1: half loss (-0.5 units)
    const drawResult = settleAsianHandicap(1, 1, -0.25, 'HOME', odds);
    expect(drawResult.outcome).toBe('HALF_LOSS');
    expect(drawResult.payoutMultiplier).toBe(0.50);
    expect(drawResult.netProfitMultiplier).toBe(-0.50);

    // Away wins 0-1: full loss
    const lossResult = settleAsianHandicap(0, 1, -0.25, 'HOME', odds);
    expect(lossResult.outcome).toBe('LOSS');
    expect(lossResult.payoutMultiplier).toBe(0.0);
    expect(lossResult.netProfitMultiplier).toBe(-1.0);
  });

  it('correctly settles Line +0.25 (Quarter Ball Underdog)', () => {
    const odds = 1.95;

    // Draw 0-0 on +0.25 HOME: half win
    const drawResult = settleAsianHandicap(0, 0, 0.25, 'HOME', odds);
    expect(drawResult.outcome).toBe('HALF_WIN');
    expect(drawResult.payoutMultiplier).toBeCloseTo(1 + 0.95 / 2, 4);
    expect(drawResult.netProfitMultiplier).toBeCloseTo(0.475, 4);

    // Home wins 1-0 on +0.25 HOME: full win
    const winResult = settleAsianHandicap(1, 0, 0.25, 'HOME', odds);
    expect(winResult.outcome).toBe('WIN');
    expect(winResult.payoutMultiplier).toBe(1.95);
  });

  it('correctly calculates DNB conditional probabilities from 1X2 distribution', () => {
    // Prob: Home 50%, Draw 30%, Away 20%
    const dnb = calculateDnbProbabilities(0.50, 0.30, 0.20);

    // Home DNB = 0.50 / 0.70 = ~0.7143 -> Fair Odds ~ 1.40
    // Away DNB = 0.20 / 0.70 = ~0.2857 -> Fair Odds ~ 3.50
    expect(dnb.pHomeDnb).toBeCloseTo(0.7143, 3);
    expect(dnb.pAwayDnb).toBeCloseTo(0.2857, 3);
    expect(dnb.fairOddsHomeDnb).toBeCloseTo(1.40, 2);
    expect(dnb.fairOddsAwayDnb).toBeCloseTo(3.50, 2);
  });
});
