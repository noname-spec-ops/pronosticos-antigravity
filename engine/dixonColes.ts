/**
 * FlashStat — Football Scores & AI Betting Radar
 * Dixon-Coles Low Scoring Correlation Model
 * 
 * Reference: Dixon, M. J., & Coles, S. G. (1997). 
 * "Modelling Association Football Scores and Inefficiencies in the Football Betting Market."
 */

import { MODEL_CONFIG } from './config';
import { poissonProb } from './poisson';

/**
 * Calculates the Dixon-Coles adjustment factor tau(x, y, lambda, mu, rho)
 */
export function tauFactor(x: number, y: number, lambda: number, mu: number, rho: number): number {
  if (x === 0 && y === 0) {
    return Math.max(0, 1 - lambda * mu * rho);
  }
  if (x === 1 && y === 0) {
    return Math.max(0, 1 + mu * rho);
  }
  if (x === 0 && y === 1) {
    return Math.max(0, 1 + lambda * rho);
  }
  if (x === 1 && y === 1) {
    return Math.max(0, 1 - rho);
  }
  return 1.0;
}

/**
 * Generates a Dixon-Coles adjusted score matrix (0 to maxGoals).
 * Normalizes all probabilities so that the matrix sums strictly to 1.0.
 */
export function generateDixonColesMatrix(
  lambdaHome: number,
  lambdaAway: number,
  rho: number = MODEL_CONFIG.DIXON_COLES.DEFAULT_RHO,
  maxGoals: number = MODEL_CONFIG.MATRIX.MAX_GOALS
): number[][] {
  const size = maxGoals + 1;
  const matrix: number[][] = Array.from({ length: size }, () => new Array<number>(size).fill(0));

  let totalSum = 0;

  for (let h = 0; h < size; h++) {
    for (let a = 0; a < size; a++) {
      const baseProb = poissonProb(h, lambdaHome) * poissonProb(a, lambdaAway);
      const tau = tauFactor(h, a, lambdaHome, lambdaAway, rho);
      const adjustedProb = baseProb * tau;
      matrix[h][a] = adjustedProb;
      totalSum += adjustedProb;
    }
  }

  // Renormalize matrix to guarantee sum = 1.0
  if (totalSum > 0) {
    for (let h = 0; h < size; h++) {
      for (let a = 0; a < size; a++) {
        matrix[h][a] = matrix[h][a] / totalSum;
      }
    }
  }

  return matrix;
}
