import { describe, it, expect } from 'vitest';
import {
  predictResidualCorrection,
  computeAlphaProbabilities,
  normalizeFeatures,
  type ResidualFeatures,
} from '../residualModel';

describe('Residual Model (Market Residual Learning — Etapa 6)', () => {
  const sampleFeatures: ResidualFeatures = {
    lambdaDiff: 0.85,
    eloDiffNormalized: 0.50,
    restDaysDelta: 3,
    travelDistanceKm1000: 0.45,
    formXgDiff: 0.60,
    steamMomentum: 0.04, // 4% steam move in favor of home
    marketDisagreement: 0.05,
    leagueHomeAdvantage: 0.44,
  };

  it('normalizes 8-feature vectors with means and standard deviations', () => {
    const means = [0.35, 0.22, 0.0, 0.28, 0.15, 0.0, 0.04, 0.44];
    const stds = [0.85, 0.72, 2.1, 0.35, 0.90, 0.05, 0.03, 0.06];

    const norm = normalizeFeatures(sampleFeatures, means, stds);
    expect(norm).toHaveLength(8);
    expect(norm[0]).toBeCloseTo((0.85 - 0.35) / 0.85, 2);
  });

  it('predicts bounded residual corrections strictly within [-0.08, +0.08]', () => {
    const extremeFeatures: ResidualFeatures = {
      lambdaDiff: 5.0,
      eloDiffNormalized: 4.0,
      restDaysDelta: 10,
      travelDistanceKm1000: 5.0,
      formXgDiff: 4.0,
      steamMomentum: 0.25,
      marketDisagreement: 0.30,
      leagueHomeAdvantage: 0.60,
    };

    const corrections = predictResidualCorrection(extremeFeatures);
    expect(corrections.deltaHome).toBeLessThanOrEqual(0.08);
    expect(corrections.deltaHome).toBeGreaterThanOrEqual(-0.08);
    expect(corrections.deltaDraw).toBeLessThanOrEqual(0.08);
    expect(corrections.deltaDraw).toBeGreaterThanOrEqual(-0.08);
    expect(corrections.deltaAway).toBeLessThanOrEqual(0.08);
    expect(corrections.deltaAway).toBeGreaterThanOrEqual(-0.08);
  });

  it('computes normalized Alpha Probabilities summing strictly to 1.0', () => {
    const marketDevigged = { home: 0.52, draw: 0.26, away: 0.22 };
    const alpha = computeAlphaProbabilities(marketDevigged, sampleFeatures);

    expect(alpha.home).toBeGreaterThan(0);
    expect(alpha.draw).toBeGreaterThan(0);
    expect(alpha.away).toBeGreaterThan(0);

    const sum = Number((alpha.home + alpha.draw + alpha.away).toFixed(4));
    expect(sum).toBeCloseTo(1.0, 3);
  });

  it('confirms Alpha edge when steam move and model signal align', () => {
    const marketDevigged = { home: 0.50, draw: 0.27, away: 0.23 };
    const alpha = computeAlphaProbabilities(marketDevigged, sampleFeatures);

    expect(alpha.rawCorrections.deltaHome).toBeGreaterThan(0);
    expect(alpha.home).toBeGreaterThan(marketDevigged.home);
  });
});
