import { describe, it, expect } from 'vitest';
import {
  factorial,
  poissonProb,
  generateRawPoissonMatrix,
  derive1X2FromMatrix,
  deriveOverUnderFromMatrix,
  deriveBTTSFromMatrix,
  deriveTopExactScores,
  deriveAsianHandicap,
} from '../poisson';

describe('Poisson Engine & Distribution', () => {
  it('computes factorial correctly', () => {
    expect(factorial(0)).toBe(1);
    expect(factorial(1)).toBe(1);
    expect(factorial(4)).toBe(24);
    expect(factorial(5)).toBe(120);
  });

  it('computes valid Poisson probabilities', () => {
    const p0 = poissonProb(0, 1.5);
    const p1 = poissonProb(1, 1.5);
    const p2 = poissonProb(2, 1.5);

    expect(p0).toBeCloseTo(Math.exp(-1.5), 5);
    expect(p1).toBeCloseTo(1.5 * Math.exp(-1.5), 5);
    expect(p2).toBeCloseTo((2.25 * Math.exp(-1.5)) / 2, 5);
  });

  it('generates a 9x9 matrix (0-8 goals) summing strictly to 1.0', () => {
    const lambdaH = 1.65;
    const lambdaA = 1.15;
    const matrix = generateRawPoissonMatrix(lambdaH, lambdaA, 8);

    expect(matrix.length).toBe(9);
    expect(matrix[0].length).toBe(9);

    let sum = 0;
    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < matrix[r].length; c++) {
        sum += matrix[r][c];
      }
    }

    expect(sum).toBeCloseTo(1.0, 6);
  });

  it('derives 1X2 probabilities where sum equals 1.0', () => {
    const matrix = generateRawPoissonMatrix(1.8, 0.9, 8);
    const probs = derive1X2FromMatrix(matrix);

    expect(probs.home + probs.draw + probs.away).toBeCloseTo(1.0, 6);
    expect(probs.home).toBeGreaterThan(probs.away); // 1.8 vs 0.9 => Home favored
  });

  it('derives Over/Under lines where over + under = 1.0', () => {
    const matrix = generateRawPoissonMatrix(1.5, 1.2, 8);
    const ou = deriveOverUnderFromMatrix(matrix);

    expect(ou.length).toBe(5); // 0.5, 1.5, 2.5, 3.5, 4.5
    for (const item of ou) {
      expect(item.over + item.under).toBeCloseTo(1.0, 5);
    }
  });

  it('derives BTTS probabilities where yes + no = 1.0', () => {
    const matrix = generateRawPoissonMatrix(1.4, 1.3, 8);
    const btts = deriveBTTSFromMatrix(matrix);

    expect(btts.yes + btts.no).toBeCloseTo(1.0, 5);
  });

  it('derives top exact scores sorted descending', () => {
    const matrix = generateRawPoissonMatrix(1.4, 1.1, 8);
    const topScores = deriveTopExactScores(matrix, 10);

    expect(topScores.length).toBe(10);
    for (let i = 0; i < topScores.length - 1; i++) {
      expect(topScores[i].probability).toBeGreaterThanOrEqual(topScores[i + 1].probability);
    }
  });

  it('derives Asian Handicap lines correctly', () => {
    const matrix = generateRawPoissonMatrix(2.0, 0.8, 8);
    const ah = deriveAsianHandicap(matrix);

    expect(ah.length).toBe(21);
    const ahZero = ah.find((l) => l.line === 0);
    expect(ahZero).toBeDefined();
    expect(ahZero!.homeWinProb + ahZero!.awayWinProb + (ahZero!.pushProb || 0)).toBeCloseTo(1.0, 3);
  });
});
