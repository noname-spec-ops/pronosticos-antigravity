import { describe, it, expect } from 'vitest';
import { fitPava, interpolateIsotonic, calibrateProbabilities1X2, type CalibrationPoint } from '../calibration';

describe('Isotonic Regression & PAVA Calibration Engine', () => {
  it('fits monotonically non-decreasing step function using PAVA', () => {
    // Non-monotonic noisy points
    const points: CalibrationPoint[] = [
      { pred: 0.1, actual: 0 },
      { pred: 0.2, actual: 1 },
      { pred: 0.3, actual: 0 }, // violator
      { pred: 0.4, actual: 1 },
      { pred: 0.7, actual: 0 },
      { pred: 0.8, actual: 1 },
      { pred: 0.9, actual: 1 },
    ];

    const steps = fitPava(points);
    expect(steps.length).toBeGreaterThan(0);

    // Verify strict monotonicity: for all i, calibrated[i+1] >= calibrated[i]
    for (let i = 0; i < steps.length - 1; i++) {
      expect(steps[i + 1].calibrated).toBeGreaterThanOrEqual(steps[i].calibrated);
      expect(steps[i + 1].pred).toBeGreaterThanOrEqual(steps[i].pred);
    }
  });

  it('interpolates intermediate probabilities accurately', () => {
    const steps = [
      { pred: 0.0, calibrated: 0.0, weight: 1 },
      { pred: 0.5, calibrated: 0.4, weight: 1 },
      { pred: 1.0, calibrated: 0.9, weight: 1 },
    ];

    const pMid = interpolateIsotonic(0.25, steps);
    expect(pMid).toBeCloseTo(0.2, 2);

    const pUpper = interpolateIsotonic(0.75, steps);
    expect(pUpper).toBeCloseTo(0.65, 2);
  });

  it('normalizes calibrated 1X2 probabilities to sum to 1.0', () => {
    const rawProbs = { home: 0.55, draw: 0.25, away: 0.20 };
    const map = {
      homeSteps: [
        { pred: 0.0, calibrated: 0.05, weight: 1 },
        { pred: 0.5, calibrated: 0.48, weight: 1 },
        { pred: 1.0, calibrated: 0.95, weight: 1 },
      ],
      drawSteps: [
        { pred: 0.0, calibrated: 0.05, weight: 1 },
        { pred: 0.3, calibrated: 0.28, weight: 1 },
        { pred: 1.0, calibrated: 0.85, weight: 1 },
      ],
      awaySteps: [
        { pred: 0.0, calibrated: 0.05, weight: 1 },
        { pred: 0.3, calibrated: 0.22, weight: 1 },
        { pred: 1.0, calibrated: 0.85, weight: 1 },
      ],
    };

    const calibrated = calibrateProbabilities1X2(rawProbs, map);
    const sum = calibrated.home + calibrated.draw + calibrated.away;
    expect(sum).toBeCloseTo(1.0, 3);
  });
});
