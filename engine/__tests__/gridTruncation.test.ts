import { describe, it, expect } from 'vitest';
import { MODEL_CONFIG } from '../config';
import { generateRawPoissonMatrix, poissonProb, derive1X2FromMatrix, deriveOverUnderFromMatrix } from '../poisson';
import { generateDixonColesMatrix } from '../dixonColes';

/** Exact P(goals > maxGoals) for one Poisson-distributed team. */
function tailMass(lambda: number, maxGoals: number): number {
  let cdf = 0;
  for (let k = 0; k <= maxGoals; k++) cdf += poissonProb(k, lambda);
  return 1 - cdf;
}

/** Highest lambda the prediction pipeline can produce (engine/index.ts clamp). */
const MAX_PIPELINE_LAMBDA = 5.5;

describe('score grid truncation', () => {
  it('uses a grid wide enough for the highest lambda the pipeline allows', () => {
    expect(MODEL_CONFIG.MATRIX.MAX_GOALS).toBeGreaterThanOrEqual(16);
    expect(MODEL_CONFIG.MATRIX.GRID_SIZE).toBe(MODEL_CONFIG.MATRIX.MAX_GOALS + 1);
  });

  it('discards less than 0.02% of joint mass at the maximum lambda', () => {
    // Anything discarded is redistributed by normalisation into the low-score
    // cells, which biases Over/Under and exact-score markets.
    const cdf = 1 - tailMass(MAX_PIPELINE_LAMBDA, MODEL_CONFIG.MATRIX.MAX_GOALS);
    const jointDiscarded = 1 - cdf * cdf;
    expect(jointDiscarded).toBeLessThan(0.0002);
  });

  it('would have discarded about 20% of joint mass on the old 8-goal grid', () => {
    // Documents the defect this change fixes.
    const cdf8 = 1 - tailMass(MAX_PIPELINE_LAMBDA, 8);
    expect(1 - cdf8 * cdf8).toBeGreaterThan(0.15);
  });

  it('keeps the matrix normalised at the wider size', () => {
    for (const [lh, la] of [[0.3, 0.2], [1.55, 1.2], [3.5, 2.8], [5.5, 5.5]]) {
      for (const m of [generateRawPoissonMatrix(lh, la), generateDixonColesMatrix(lh, la, -0.13)]) {
        expect(m.length).toBe(MODEL_CONFIG.MATRIX.GRID_SIZE);
        const sum = m.flat().reduce((a, b) => a + b, 0);
        expect(sum).toBeCloseTo(1, 9);
        expect(m.flat().every((p) => p >= 0 && Number.isFinite(p))).toBe(true);
      }
    }
  });

  it('lowers Over 2.5 on a high-scoring fixture compared with the truncated grid', () => {
    // The old grid pushed tail mass back into low scores, which inflated Under
    // and understated Over on exactly the fixtures where it matters most.
    const wide = deriveOverUnderFromMatrix(generateDixonColesMatrix(3.2, 2.9, -0.13, 16));
    const narrow = deriveOverUnderFromMatrix(generateDixonColesMatrix(3.2, 2.9, -0.13, 8));
    const wideOver = wide.find((m) => m.line === 2.5)!.over;
    const narrowOver = narrow.find((m) => m.line === 2.5)!.over;
    expect(wideOver).toBeGreaterThan(narrowOver);
  });

  it('keeps 1X2 probabilities stable for ordinary fixtures', () => {
    // For typical lambdas the tail is negligible, so widening the grid must not
    // move the main market.
    const wide = derive1X2FromMatrix(generateDixonColesMatrix(1.55, 1.2, -0.13, 16));
    const narrow = derive1X2FromMatrix(generateDixonColesMatrix(1.55, 1.2, -0.13, 8));
    expect(wide.home).toBeCloseTo(narrow.home, 3);
    expect(wide.draw).toBeCloseTo(narrow.draw, 3);
    expect(wide.away).toBeCloseTo(narrow.away, 3);
  });

  it('computes factorials across the wider grid without overflow', () => {
    for (let k = 0; k <= MODEL_CONFIG.MATRIX.MAX_GOALS; k++) {
      expect(Number.isFinite(poissonProb(k, 5.5))).toBe(true);
      expect(poissonProb(k, 5.5)).toBeGreaterThanOrEqual(0);
    }
  });
});
