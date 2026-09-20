import { describe, it, expect } from 'vitest';
import { bivariatePoissonPmf, generateBivariatePoissonMatrix, applyDrawInflation } from '../bivariatePoisson';

describe('Bivariate Poisson & Draw Inflation Engine', () => {
  it('computes bivariate Poisson probability mass correctly', () => {
    // With lambda3 = 0, bivariate Poisson must equal product of independent Poisson distributions
    const pBiv0 = bivariatePoissonPmf(1, 1, 1.5, 1.2, 0);
    const pIndHome = (Math.pow(1.5, 1) * Math.exp(-1.5)) / 1; // 0.3347
    const pIndAway = (Math.pow(1.2, 1) * Math.exp(-1.2)) / 1; // 0.3614
    expect(pBiv0).toBeCloseTo(pIndHome * pIndAway, 4);

    // With lambda3 > 0, probability of matching scores (1-1, 2-2) increases due to covariance
    const pBivCov = bivariatePoissonPmf(1, 1, 1.5, 1.2, 0.15);
    expect(pBivCov).toBeGreaterThan(pBiv0);
  });

  it('generates normalized 9x9 joint score matrix summing to 1.0', () => {
    const matrix = generateBivariatePoissonMatrix(1.8, 1.1, 0.10, 8);
    expect(matrix.length).toBe(9);
    expect(matrix[0].length).toBe(9);

    let sum = 0;
    for (let h = 0; h < 9; h++) {
      for (let a = 0; a < 9; a++) {
        sum += matrix[h][a];
      }
    }
    expect(sum).toBeCloseTo(1.0, 4);
  });

  it('applies draw inflation correctly while preserving probability mass of 1.0', () => {
    const rawProbs = { home: 0.50, draw: 0.25, away: 0.25 };
    const inflated = applyDrawInflation(rawProbs, 1.08); // 8% draw inflation

    expect(inflated.draw).toBeGreaterThan(rawProbs.draw);
    const total = inflated.home + inflated.draw + inflated.away;
    expect(total).toBeCloseTo(1.0, 3);
  });
});
