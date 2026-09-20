/**
 * FlashStat — Football Scores & AI Betting Radar
 * Bivariate Poisson Corner Probability & Over/Under Line Estimator (engine/corners.ts)
 */

import type { CornersPrediction, CornerMarketLineProb } from '../types/football';

/**
 * Log-Gamma function for factorial/gamma computation.
 */
function logGamma(x: number): number {
  const g = 7;
  const p = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.138571095850205,
    9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (x < 0.5) {
    return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * x)) - logGamma(1 - x);
  }
  x -= 1;
  let a = p[0];
  const t = x + g + 0.5;
  for (let i = 1; i < p.length; i++) {
    a += p[i] / (x + i);
  }
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/**
 * Calculates Poisson probability P(k; lambda) = exp(k * ln(lambda) - lambda - ln(k!))
 */
export function cornerPoissonProb(k: number, lambda: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  if (k < 0) return 0;
  const logProb = k * Math.log(lambda) - lambda - logGamma(k + 1);
  return Math.exp(logProb);
}

export interface CornerPredictionInput {
  homeTeamCornersAvg?: number; // e.g. 6.2 (won)
  homeTeamCornersConcededAvg?: number; // e.g. 3.8 (conceded)
  awayTeamCornersAvg?: number; // e.g. 4.8 (won)
  awayTeamCornersConcededAvg?: number; // e.g. 5.5 (conceded)
  leagueAvgCornersHome?: number; // default ~5.4
  leagueAvgCornersAway?: number; // default ~4.4
  isHomeTeamDominant?: boolean;
}

/**
 * Predicts match corners distribution and Over/Under lines using Poisson modeling.
 */
export function predictMatchCorners(input: CornerPredictionInput): CornersPrediction {
  const leagueHomeAvg = input.leagueAvgCornersHome || 5.4;
  const leagueAwayAvg = input.leagueAvgCornersAway || 4.4;

  const hWon = input.homeTeamCornersAvg || leagueHomeAvg;
  const hCon = input.homeTeamCornersConcededAvg || leagueAwayAvg;
  const aWon = input.awayTeamCornersAvg || leagueAwayAvg;
  const aCon = input.awayTeamCornersConcededAvg || leagueHomeAvg;

  // Expected Home Corners = blend of Home Attack (60%) and Away Defense Concession (40%)
  const lambdaHome = Math.max(
    1.5,
    Math.min(11.0, Number((hWon * 0.6 + aCon * 0.4).toFixed(2)))
  );

  // Expected Away Corners = blend of Away Attack (60%) and Home Defense Concession (40%)
  const lambdaAway = Math.max(
    1.0,
    Math.min(9.5, Number((aWon * 0.6 + hCon * 0.4).toFixed(2)))
  );

  const lambdaTotal = Number((lambdaHome + lambdaAway).toFixed(2));

  // Over/Under Market Lines for Total Corners: 7.5, 8.5, 9.5, 10.5, 11.5, 12.5, 13.5
  const totalLines = [7.5, 8.5, 9.5, 10.5, 11.5, 12.5, 13.5];
  const maxCorners = 35;

  // Precompute Poisson distribution for total corners (sum of Poissons is Poisson(lambda1 + lambda2))
  const totalProbs: number[] = [];
  for (let k = 0; k <= maxCorners; k++) {
    totalProbs.push(cornerPoissonProb(k, lambdaTotal));
  }

  const overUnderCorners: CornerMarketLineProb[] = totalLines.map((line) => {
    let under = 0;
    for (let k = 0; k <= maxCorners; k++) {
      if (k < line) {
        under += totalProbs[k] || 0;
      }
    }
    const over = Math.max(0.001, Math.min(0.999, 1 - under));
    const safeUnder = Math.max(0.001, Math.min(0.999, under));
    return {
      line,
      overProb: Number(over.toFixed(4)),
      underProb: Number(safeUnder.toFixed(4)),
      fairOverOdds: Number((1 / over).toFixed(2)),
      fairUnderOdds: Number((1 / safeUnder).toFixed(2)),
    };
  });

  // Home Team Specific Lines: 3.5, 4.5, 5.5, 6.5
  const homeLines = [3.5, 4.5, 5.5, 6.5];
  const homeProbs: number[] = [];
  for (let k = 0; k <= 25; k++) {
    homeProbs.push(cornerPoissonProb(k, lambdaHome));
  }
  const homeTeamOverUnder = homeLines.map((line) => {
    let under = 0;
    for (let k = 0; k <= 25; k++) {
      if (k < line) under += homeProbs[k] || 0;
    }
    const over = Math.max(0.001, Math.min(0.999, 1 - under));
    return {
      line,
      overProb: Number(over.toFixed(4)),
      underProb: Number(under.toFixed(4)),
    };
  });

  // Away Team Specific Lines: 2.5, 3.5, 4.5, 5.5
  const awayLines = [2.5, 3.5, 4.5, 5.5];
  const awayProbs: number[] = [];
  for (let k = 0; k <= 25; k++) {
    awayProbs.push(cornerPoissonProb(k, lambdaAway));
  }
  const awayTeamOverUnder = awayLines.map((line) => {
    let under = 0;
    for (let k = 0; k <= 25; k++) {
      if (k < line) under += awayProbs[k] || 0;
    }
    const over = Math.max(0.001, Math.min(0.999, 1 - under));
    return {
      line,
      overProb: Number(over.toFixed(4)),
      underProb: Number(under.toFixed(4)),
    };
  });

  // Most likely range (e.g. "9 - 11 Cornere")
  const lowRange = Math.max(4, Math.floor(lambdaTotal - 1));
  const highRange = Math.ceil(lambdaTotal + 1);
  const mostLikelyCornerRange = `${lowRange} - ${highRange} Cornere`;

  return {
    expectedHomeCorners: lambdaHome,
    expectedAwayCorners: lambdaAway,
    expectedTotalCorners: lambdaTotal,
    overUnderCorners,
    homeTeamOverUnder,
    awayTeamOverUnder,
    mostLikelyCornerRange,
    distributionType: 'bivariate_poisson',
  };
}

/**
 * Projects end-of-match corner totals in live in-play conditions.
 */
export function projectLiveCorners(
  currentHomeCorners: number,
  currentAwayCorners: number,
  elapsedMinute: number,
  expectedHomeCorners: number,
  expectedAwayCorners: number
): {
  projectedTotalCorners: number;
  projectedHomeCorners: number;
  projectedAwayCorners: number;
  cornersPacePer10Min: number;
} {
  const safeMinute = Math.max(1, Math.min(90, elapsedMinute));
  const currentTotal = currentHomeCorners + currentAwayCorners;
  const cornersPacePer10Min = Number(((currentTotal / safeMinute) * 10).toFixed(1));

  // Blend in-play observed pace (60%) with pre-match baseline expected rate (40%)
  const observedRatePerMinute = currentTotal / safeMinute;
  const baselineRatePerMinute = (expectedHomeCorners + expectedAwayCorners) / 90;
  const blendedRatePerMin = observedRatePerMinute * 0.6 + baselineRatePerMinute * 0.4;

  const remainingProjected = blendedRatePerMin * Math.max(0, 90 - safeMinute);
  const projectedTotalCorners = Number((currentTotal + remainingProjected).toFixed(1));

  const homeRatio = expectedHomeCorners / Math.max(1, expectedHomeCorners + expectedAwayCorners);
  const awayRatio = 1 - homeRatio;

  const projectedHomeCorners = Number((currentHomeCorners + remainingProjected * homeRatio).toFixed(1));
  const projectedAwayCorners = Number((currentAwayCorners + remainingProjected * awayRatio).toFixed(1));

  return {
    projectedTotalCorners,
    projectedHomeCorners,
    projectedAwayCorners,
    cornersPacePer10Min,
  };
}
