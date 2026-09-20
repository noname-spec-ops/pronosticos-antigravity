import { describe, it, expect } from 'vitest';
import { evaluateModelDrift } from '../driftMonitor';

describe('Statistical Model Drift Monitor', () => {
  it('reports normal status when rolling metrics match baseline', () => {
    // 30 predictions with good calibration and positive CLV
    const evals = Array.from({ length: 30 }, () => ({
      modelProb: 0.60,
      actualOutcome: 1,
      clvPercent: 3.5,
    }));

    const status = evaluateModelDrift(evals, 0.58);
    expect(status.isDriftDetected).toBe(false);
    expect(status.driftSeverity).toBe('normal');
    expect(status.recommendedAction).toBe('NONE');
  });

  it('detects moderate drift when Brier degrades by >3%', () => {
    // 30 predictions with higher error rate (e.g. model predicted 0.80 but actual is 0)
    const evals = [
      ...Array.from({ length: 18 }, () => ({ modelProb: 0.55, actualOutcome: 1, clvPercent: 1.0 })),
      ...Array.from({ length: 12 }, () => ({ modelProb: 0.75, actualOutcome: 0, clvPercent: -1.5 })),
    ];

    const status = evaluateModelDrift(evals, 0.30);
    expect(status.isDriftDetected).toBe(true);
    expect(status.driftSeverity).toBe('critical');
    expect(status.recommendedAction).toBe('FULL_RECALIBRATION');
  });
});