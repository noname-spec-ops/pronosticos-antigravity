/**
 * FlashStat — Football Scores & AI Betting Radar
 * Pure Poisson Probability & Score Matrix Generator
 */

import { MODEL_CONFIG } from './config';
import type { AsianHandicapProb, ExactScoreProb } from '../types/football';

/**
 * Computes the factorial of non-negative integer n.
 */
export function factorial(n: number): number {
  if (n < 0) throw new Error('Factorial is not defined for negative numbers');
  if (n === 0 || n === 1) return 1;
  let res = 1;
  for (let i = 2; i <= n; i++) {
    res *= i;
  }
  return res;
}

/**
 * Calculates raw Poisson probability P(k; lambda) = (lambda^k * e^(-lambda)) / k!
 */
export function poissonProb(k: number, lambda: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  if (k < 0) return 0;
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
}

/**
 * Generates an uncorrected (raw Poisson) score matrix up to maxGoals (default 8 => 9x9).
 * Normalizes the grid so the sum of all cells equals exactly 1.0 (allocating residual tail).
 */
export function generateRawPoissonMatrix(
  lambdaHome: number,
  lambdaAway: number,
  maxGoals: number = MODEL_CONFIG.MATRIX.MAX_GOALS
): number[][] {
  const size = maxGoals + 1;
  const matrix: number[][] = Array.from({ length: size }, () => new Array<number>(size).fill(0));

  let totalSum = 0;
  for (let h = 0; h < size; h++) {
    for (let a = 0; a < size; a++) {
      const p = poissonProb(h, lambdaHome) * poissonProb(a, lambdaAway);
      matrix[h][a] = p;
      totalSum += p;
    }
  }

  // Normalize to guarantee exact sum = 1.0
  if (totalSum > 0) {
    for (let h = 0; h < size; h++) {
      for (let a = 0; a < size; a++) {
        matrix[h][a] = matrix[h][a] / totalSum;
      }
    }
  }

  return matrix;
}

/**
 * Derives 1X2 probabilities from a normalized score matrix.
 */
export function derive1X2FromMatrix(matrix: number[][]): { home: number; draw: number; away: number } {
  let home = 0;
  let draw = 0;
  let away = 0;

  const size = matrix.length;
  for (let h = 0; h < size; h++) {
    for (let a = 0; a < size; a++) {
      const p = matrix[h][a];
      if (h > a) home += p;
      else if (h === a) draw += p;
      else away += p;
    }
  }

  // Ensure exact sum = 1.0
  const total = home + draw + away;
  return {
    home: home / total,
    draw: draw / total,
    away: away / total,
  };
}

/**
 * Derives Over/Under market probabilities for lines 0.5, 1.5, 2.5, 3.5, 4.5.
 */
export function deriveOverUnderFromMatrix(
  matrix: number[][]
): Array<{ line: number; over: number; under: number }> {
  const lines = [0.5, 1.5, 2.5, 3.5, 4.5];
  const size = matrix.length;

  return lines.map((line) => {
    let under = 0;
    for (let h = 0; h < size; h++) {
      for (let a = 0; a < size; a++) {
        if (h + a < line) {
          under += matrix[h][a];
        }
      }
    }
    const over = Math.max(0, 1 - under);
    return { line, over, under };
  });
}

/**
 * Derives Both Teams To Score (BTTS) Yes/No probabilities.
 */
export function deriveBTTSFromMatrix(matrix: number[][]): { yes: number; no: number } {
  const size = matrix.length;
  let no = 0;

  for (let h = 0; h < size; h++) {
    for (let a = 0; a < size; a++) {
      if (h === 0 || a === 0) {
        no += matrix[h][a];
      }
    }
  }

  const yes = Math.max(0, 1 - no);
  return { yes, no };
}

/**
 * Extracts Top N exact score probabilities, sorted descending.
 */
export function deriveTopExactScores(
  matrix: number[][],
  topN: number = 10
): ExactScoreProb[] {
  const list: ExactScoreProb[] = [];
  const size = matrix.length;

  for (let h = 0; h < size; h++) {
    for (let a = 0; a < size; a++) {
      const prob = matrix[h][a];
      list.push({
        homeGoals: h,
        awayGoals: a,
        probability: prob,
        fairOdds: prob > 0 ? Number((1 / prob).toFixed(2)) : 999,
      });
    }
  }

  return list.sort((x, y) => y.probability - x.probability).slice(0, topN);
}

/**
 * Derives comprehensive Asian Handicap lines from -2.50 to +2.50 in 0.25 increments,
 * correctly resolving integer push lines and split quarter-ball lines.
 */
export function deriveAsianHandicap(
  matrix: number[][],
  customLines?: number[]
): AsianHandicapProb[] {
  const lines = customLines ?? [
    -2.5, -2.25, -2.0, -1.75, -1.5, -1.25, -1.0, -0.75, -0.5, -0.25,
    0,
    0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.25, 2.5
  ];
  const size = matrix.length;

  // Helper to compute raw outcome probabilities for an exact half or integer line
  function evaluateSimpleLine(line: number): { winHome: number; winAway: number; push: number } {
    let winHome = 0;
    let winAway = 0;
    let push = 0;

    for (let h = 0; h < size; h++) {
      for (let a = 0; a < size; a++) {
        const diff = (h + line) - a;
        if (diff > 0.0001) {
          winHome += matrix[h][a];
        } else if (diff < -0.0001) {
          winAway += matrix[h][a];
        } else {
          push += matrix[h][a];
        }
      }
    }

    return { winHome, winAway, push };
  }

  return lines.map((line) => {
    const isQuarterLine = Math.abs((line * 4) % 2) === 1; // e.g. -0.25, +0.75

    if (isQuarterLine) {
      const lower = line - 0.25;
      const upper = line + 0.25;
      const evalLower = evaluateSimpleLine(lower);
      const evalUpper = evaluateSimpleLine(upper);

      // Quarter line splits stake 50% on lower and 50% on upper
      const homeWinProb = Number((0.5 * evalLower.winHome + 0.5 * evalUpper.winHome).toFixed(4));
      const awayWinProb = Number((0.5 * evalLower.winAway + 0.5 * evalUpper.winAway).toFixed(4));
      const pushProb = Number((0.5 * evalLower.push + 0.5 * evalUpper.push).toFixed(4));

      // Decisive probability for fair odds pricing
      const decisiveHome = (evalLower.winHome + (evalLower.push ? 0 : 0) + evalUpper.winHome) / 
        ((evalLower.winHome + evalLower.winAway) + (evalUpper.winHome + evalUpper.winAway));

      const fairOddsHome = homeWinProb > 0 ? Number((1 / homeWinProb).toFixed(2)) : 999;
      const fairOddsAway = awayWinProb > 0 ? Number((1 / awayWinProb).toFixed(2)) : 999;

      return {
        line,
        homeWinProb,
        awayWinProb,
        pushProb,
        fairOddsHome,
        fairOddsAway,
      };
    }

    const { winHome, winAway, push } = evaluateSimpleLine(line);

    let decisiveHomeProb = winHome;
    let decisiveAwayProb = winAway;
    if (push > 0) {
      const totalDecisive = winHome + winAway;
      if (totalDecisive > 0) {
        decisiveHomeProb = winHome / totalDecisive;
        decisiveAwayProb = winAway / totalDecisive;
      }
    }

    const fairOddsHome = decisiveHomeProb > 0 ? Number((1 / decisiveHomeProb).toFixed(2)) : 999;
    const fairOddsAway = decisiveAwayProb > 0 ? Number((1 / decisiveAwayProb).toFixed(2)) : 999;

    return {
      line,
      homeWinProb: Number(winHome.toFixed(4)),
      awayWinProb: Number(winAway.toFixed(4)),
      pushProb: Number(push.toFixed(4)),
      fairOddsHome,
      fairOddsAway,
    };
  });
}
