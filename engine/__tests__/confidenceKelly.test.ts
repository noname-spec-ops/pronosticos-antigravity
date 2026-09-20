import { describe, it, expect } from 'vitest';
import {
  calculateConfidenceFactor,
  calculateKellyStake,
} from '../valueBets';

describe('Confidence-Discounted Kelly Staking Engine', () => {
  it('returns 1.0 confidence for fully mature and calibrated matches', () => {
    const factor = calculateConfidenceFactor({
      historicalMatchesCount: 25,
      lineupStatus: 'confirmed',
      isCalibratedLeague: true,
      hasRealXg: true,
      isSharpConfirmed: true,
    });
    expect(factor).toBe(1.0);
  });

  it('discounts confidence when sample size is small or lineups unannounced', () => {
    const factor = calculateConfidenceFactor({
      historicalMatchesCount: 5, // small sample -> 0.65
      lineupStatus: 'unannounced', // unannounced -> 0.75
      isCalibratedLeague: true,
      hasRealXg: true,
    });
    // 0.65 * 0.75 = ~0.4875 -> ~0.49
    expect(factor).toBeLessThan(0.60);
    expect(factor).toBeGreaterThan(0.30);
  });

  it('discounts stake size proportionally to confidence factor', () => {
    // 55% prob @ 2.0 odds => full Kelly = (1 * 0.55 - 0.45) / 1 = 0.10
    // quarter Kelly = 0.025 (2.5%), capped at 2.0%
    const fullConf = calculateKellyStake(0.55, 2.0, 0.25, 0.02, 1.0);
    expect(fullConf.suggestedStakePercent).toBe(2.0);

    // With 0.40 confidence factor: quarter Kelly = 0.025 * 0.40 = 0.010 (1.0%)
    const lowConf = calculateKellyStake(0.55, 2.0, 0.25, 0.02, 0.40);
    expect(lowConf.suggestedStakePercent).toBe(1.0);
  });
});