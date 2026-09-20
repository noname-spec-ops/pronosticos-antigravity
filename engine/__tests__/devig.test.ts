import { describe, it, expect } from 'vitest';
import {
  calculateOverround,
  devigMultiplicative,
  devigShin,
  devig2WayMarket,
} from '../devig';

describe('Devigging Engine', () => {
  const sampleOdds = {
    home: 2.10,
    draw: 3.40,
    away: 3.80,
  };

  it('calculates bookmaker overround correctly', () => {
    const overround = calculateOverround(sampleOdds);
    // 1/2.10 + 1/3.40 + 1/3.80 = 0.47619 + 0.29411 + 0.26315 = ~1.03345
    expect(overround).toBeGreaterThan(1.0);
    expect(overround).toBeCloseTo(1.0335, 3);
  });

  it('performs multiplicative devigging where probabilities sum to 1.0', () => {
    const devigged = devigMultiplicative(sampleOdds);

    expect(devigged.home + devigged.draw + devigged.away).toBeCloseTo(1.0, 3);
    expect(devigged.marginPercent).toBeGreaterThan(0);
    expect(devigged.method).toBe('multiplicative');
  });

  it('performs Shin devigging where probabilities sum to 1.0', () => {
    const devigged = devigShin(sampleOdds);

    expect(devigged.home + devigged.draw + devigged.away).toBeCloseTo(1.0, 3);
    expect(devigged.method).toBe('shin');
  });

  it('devigs 2-way Over/Under or BTTS markets', () => {
    // Over 2.5 @ 1.95, Under 2.5 @ 1.95 => 1/1.95 + 1/1.95 = ~1.0256 (2.56% margin)
    const res = devig2WayMarket(1.95, 1.95);

    expect(res.probA).toBeCloseTo(0.5, 2);
    expect(res.probB).toBeCloseTo(0.5, 2);
    expect(res.probA + res.probB).toBeCloseTo(1.0, 3);
    expect(res.marginPercent).toBeGreaterThan(2.0);
  });
});
