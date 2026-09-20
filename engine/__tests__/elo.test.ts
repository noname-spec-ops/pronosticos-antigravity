import { describe, it, expect } from 'vitest';
import {
  calculateEloExpectation,
  calculateGoalDiffMultiplier,
  updateEloRatings,
  eloToLambdas,
} from '../elo';

describe('ELO Engine', () => {
  it('adds home advantage correctly in expectation', () => {
    // Equal teams: 1500 vs 1500, with +75 home advantage => expectedHome > 0.5
    const { expectedHome, expectedAway } = calculateEloExpectation(1500, 1500, 75);

    expect(expectedHome).toBeGreaterThan(0.5);
    expect(expectedHome + expectedAway).toBeCloseTo(1.0, 5);
  });

  it('computes goal difference multiplier scaling', () => {
    const mult1 = calculateGoalDiffMultiplier(1, 0); // GD 1 => ln(2) ~ 0.693
    const mult3 = calculateGoalDiffMultiplier(4, 1); // GD 3 => ln(4) ~ 1.386

    expect(mult3).toBeGreaterThan(mult1);
    expect(calculateGoalDiffMultiplier(2, 2)).toBe(1.0);
  });

  it('updates ratings consistently after a match', () => {
    // Home team 1500 wins 2-0 against Away team 1500
    const { newHomeElo, newAwayElo, deltaElo } = updateEloRatings(1500, 1500, 2, 0);

    expect(deltaElo).toBeGreaterThan(0);
    expect(newHomeElo).toBe(1500 + deltaElo);
    expect(newAwayElo).toBe(1500 - deltaElo);
  });

  it('converts ELO differential into bounded lambda values', () => {
    const { eloLambdaHome, eloLambdaAway } = eloToLambdas(1700, 1400, 1.55, 1.20);

    expect(eloLambdaHome).toBeGreaterThan(1.55);
    expect(eloLambdaAway).toBeLessThan(1.20);
    expect(eloLambdaHome).toBeLessThanOrEqual(5.0);
    expect(eloLambdaAway).toBeGreaterThanOrEqual(0.2);
  });
});
