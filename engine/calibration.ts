/**
 * FlashStat — Isotonic Probability Calibration Engine
 * Implements the Pool Adjacent Violators Algorithm (PAVA)
 * for non-parametric monotonic calibration of predicted probabilities.
 */

export interface CalibrationPoint {
  pred: number; // predicted probability
  actual: number; // actual outcome (0 or 1)
}

export interface IsotonicStep {
  pred: number;
  calibrated: number;
  weight: number;
}

export interface OutcomeCalibrationMap {
  homeSteps: IsotonicStep[];
  drawSteps: IsotonicStep[];
  awaySteps: IsotonicStep[];
}

export type LeagueCalibrationMaps = Record<string, OutcomeCalibrationMap>;

/**
 * Pool Adjacent Violators Algorithm (PAVA)
 * Fits a monotonically non-decreasing step function to (pred, actual) pairs.
 */
export function fitPava(points: CalibrationPoint[]): IsotonicStep[] {
  if (points.length === 0) {
    return [
      { pred: 0.0, calibrated: 0.0, weight: 1 },
      { pred: 1.0, calibrated: 1.0, weight: 1 },
    ];
  }

  // 1. Sort ascending by predicted probability
  const sorted = [...points].sort((a, b) => a.pred - b.pred);

  // 2. Initialize blocks: each point is its own block with weight 1
  interface Block {
    predMin: number;
    predMax: number;
    predMean: number;
    value: number; // weighted mean of actuals
    weight: number;
  }

  const blocks: Block[] = sorted.map((pt) => ({
    predMin: pt.pred,
    predMax: pt.pred,
    predMean: pt.pred,
    value: pt.actual,
    weight: 1,
  }));

  // 3. Pool adjacent violators (where block[i].value > block[i+1].value)
  let i = 0;
  while (i < blocks.length - 1) {
    if (blocks[i].value > blocks[i + 1].value) {
      // Violator detected — merge block[i] and block[i+1]
      const b1 = blocks[i];
      const b2 = blocks[i + 1];
      const totalWeight = b1.weight + b2.weight;
      const mergedValue = (b1.value * b1.weight + b2.value * b2.weight) / totalWeight;
      const mergedPredMean = (b1.predMean * b1.weight + b2.predMean * b2.weight) / totalWeight;

      const mergedBlock: Block = {
        predMin: b1.predMin,
        predMax: b2.predMax,
        predMean: mergedPredMean,
        value: mergedValue,
        weight: totalWeight,
      };

      blocks.splice(i, 2, mergedBlock);

      // Check backwards to see if merging caused earlier violations
      if (i > 0) {
        i--;
      }
    } else {
      i++;
    }
  }

  // 4. Convert blocks to IsotonicSteps
  const steps: IsotonicStep[] = blocks.map((b) => ({
    pred: Number(b.predMean.toFixed(4)),
    calibrated: Number(Math.max(0.001, Math.min(0.999, b.value)).toFixed(4)),
    weight: b.weight,
  }));

  // Ensure boundary anchors
  if (steps[0].pred > 0.01) {
    steps.unshift({ pred: 0.0, calibrated: Math.min(0.01, steps[0].calibrated * 0.5), weight: 1 });
  }
  if (steps[steps.length - 1].pred < 0.99) {
    steps.push({ pred: 1.0, calibrated: Math.max(0.99, steps[steps.length - 1].calibrated), weight: 1 });
  }

  return steps;
}

/**
 * Linearly interpolates a single probability on an isotonic step function.
 */
export function interpolateIsotonic(p: number, steps: IsotonicStep[]): number {
  if (steps.length === 0) return p;
  if (p <= steps[0].pred) return steps[0].calibrated;
  if (p >= steps[steps.length - 1].pred) return steps[steps.length - 1].calibrated;

  for (let i = 0; i < steps.length - 1; i++) {
    const s1 = steps[i];
    const s2 = steps[i + 1];
    if (p >= s1.pred && p <= s2.pred) {
      if (s2.pred === s1.pred) return s1.calibrated;
      const t = (p - s1.pred) / (s2.pred - s1.pred);
      return s1.calibrated + t * (s2.calibrated - s1.calibrated);
    }
  }

  return p;
}

/**
 * Applies isotonic calibration to a 1X2 probability distribution
 * and normalizes the output to strictly sum to 1.0.
 */
export function calibrateProbabilities1X2(
  rawProbs: { home: number; draw: number; away: number },
  map?: OutcomeCalibrationMap | null
): { home: number; draw: number; away: number } {
  if (!map) return rawProbs;

  const calHome = interpolateIsotonic(rawProbs.home, map.homeSteps);
  const calDraw = interpolateIsotonic(rawProbs.draw, map.drawSteps);
  const calAway = interpolateIsotonic(rawProbs.away, map.awaySteps);

  const sum = calHome + calDraw + calAway;
  if (sum <= 0) return rawProbs;

  return {
    home: Number((calHome / sum).toFixed(4)),
    draw: Number((calDraw / sum).toFixed(4)),
    away: Number((calAway / sum).toFixed(4)),
  };
}
