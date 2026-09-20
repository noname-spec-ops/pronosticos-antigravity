import { describe, it, expect } from 'vitest';
import { runMonteCarloSimulation, optimizeConcurrentKellyStakes } from '../monteCarlo';

describe('Monte Carlo Simulation Engine', () => {
  it('handles empty bet configurations gracefully', () => {
    const res = runMonteCarloSimulation({
      initialBankroll: 100,
      bets: [],
    });
    expect(res.simulationsCount).toBe(0);
    expect(res.medianFinalBankroll).toBe(100);
    expect(res.riskOfRuinPercent).toBe(0);
  });

  it('correctly simulates positive EV series with low risk of ruin', () => {
    // 50 bets with 55% win rate at 2.0 odds, 1.5% stake
    const bets = Array.from({ length: 50 }, () => ({
      winProb: 0.55,
      odds: 2.0,
      stakeFraction: 0.015,
    }));

    const res = runMonteCarloSimulation({
      initialBankroll: 100,
      bets,
      numSimulations: 1000,
      ruinThresholdFraction: 0.50,
    });

    expect(res.simulationsCount).toBe(1000);
    expect(res.betsPerSimulation).toBe(50);
    expect(res.medianFinalBankroll).toBeGreaterThan(100);
    expect(res.percentile95thBankroll).toBeGreaterThan(res.medianFinalBankroll);
    expect(res.medianFinalBankroll).toBeGreaterThan(res.percentile5thBankroll);
    expect(res.riskOfRuinPercent).toBeLessThan(5); // Very low ruin with 1.5% Kelly
    expect(res.trajectorySamples.length).toBeGreaterThan(0);
  });

  it('optimizes concurrent Kelly stakes to respect max daily exposure', () => {
    const rawStakes = [
      { id: 'bet1', kellyFraction: 0.03 },
      { id: 'bet2', kellyFraction: 0.04 },
      { id: 'bet3', kellyFraction: 0.05 },
    ]; // Total = 0.12 (12%)

    const optimized = optimizeConcurrentKellyStakes(rawStakes, 0.08); // Cap at 8%
    const sumOptimized = optimized.reduce((acc, s) => acc + s.optimizedFraction, 0);

    expect(sumOptimized).toBeCloseTo(0.08, 2);
    expect(optimized[0].optimizedFraction).toBeLessThan(0.03);
    expect(optimized[2].optimizedFraction).toBeGreaterThan(optimized[0].optimizedFraction);
  });
});
