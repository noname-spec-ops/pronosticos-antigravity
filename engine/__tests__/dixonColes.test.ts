import { describe, it, expect } from 'vitest';
import { tauFactor, generateDixonColesMatrix } from '../dixonColes';
import { generateRawPoissonMatrix } from '../poisson';

describe('Dixon-Coles Low Scoring Model', () => {
  const rho = -0.13;
  const lambdaH = 1.5;
  const lambdaA = 1.2;

  it('adjusts tau correctly for 0-0, 1-0, 0-1, 1-1', () => {
    // tau(0,0) = 1 - lambdaH * lambdaA * rho => with rho=-0.13, tau > 1 (boosts 0-0)
    const tau00 = tauFactor(0, 0, lambdaH, lambdaA, rho);
    expect(tau00).toBeGreaterThan(1.0);
    expect(tau00).toBeCloseTo(1 - (1.5 * 1.2 * -0.13), 4);

    // tau(1,0) = 1 + lambdaA * rho => with negative rho, tau < 1 (lowers 1-0)
    const tau10 = tauFactor(1, 0, lambdaH, lambdaA, rho);
    expect(tau10).toBeLessThan(1.0);

    // tau(0,1) = 1 + lambdaH * rho => with negative rho, tau < 1 (lowers 0-1)
    const tau01 = tauFactor(0, 1, lambdaH, lambdaA, rho);
    expect(tau01).toBeLessThan(1.0);

    // tau(1,1) = 1 - rho => with negative rho, tau > 1 (boosts 1-1)
    const tau11 = tauFactor(1, 1, lambdaH, lambdaA, rho);
    expect(tau11).toBeGreaterThan(1.0);
    expect(tau11).toBeCloseTo(1 - (-0.13), 4);

    // Other scores: tau === 1.0
    expect(tauFactor(2, 1, lambdaH, lambdaA, rho)).toBe(1.0);
    expect(tauFactor(3, 0, lambdaH, lambdaA, rho)).toBe(1.0);
  });

  it('generates a Dixon-Coles matrix that sums strictly to 1.0', () => {
    const matrix = generateDixonColesMatrix(lambdaH, lambdaA, rho, 8);

    let sum = 0;
    for (let h = 0; h < matrix.length; h++) {
      for (let a = 0; a < matrix[h].length; a++) {
        sum += matrix[h][a];
      }
    }

    expect(sum).toBeCloseTo(1.0, 6);
  });

  it('increases 0-0 and 1-1 probabilities compared to raw Poisson with negative rho', () => {
    const raw = generateRawPoissonMatrix(lambdaH, lambdaA, 8);
    const dc = generateDixonColesMatrix(lambdaH, lambdaA, rho, 8);

    expect(dc[0][0]).toBeGreaterThan(raw[0][0]);
    expect(dc[1][1]).toBeGreaterThan(raw[1][1]);
  });
});
