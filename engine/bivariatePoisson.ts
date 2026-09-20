/**
 * FlashStat — Bivariate Poisson Model (Holgate Distribution)
 * Models joint goal distribution of home and away teams with non-zero covariance (lambda3).
 * Captures game pace correlation (open vs tight matches).
 */

function factorial(n: number): number {
  let res = 1;
  for (let i = 2; i <= n; i++) {
    res *= i;
  }
  return res;
}

function combinations(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  let c = 1;
  for (let i = 1; i <= k; i++) {
    c = (c * (n - (k - i))) / i;
  }
  return c;
}

/**
 * Computes the joint bivariate Poisson probability P(X=x, Y=y)
 */
export function bivariatePoissonPmf(
  x: number,
  y: number,
  lambdaHome: number,
  lambdaAway: number,
  lambda3: number = 0
): number {
  const l3 = Math.max(0, Math.min(lambda3, Math.min(lambdaHome, lambdaAway) * 0.95));
  const l1 = Math.max(0.01, lambdaHome - l3);
  const l2 = Math.max(0.01, lambdaAway - l3);

  const baseExp = Math.exp(-(l1 + l2 + l3));
  const term1 = Math.pow(l1, x) / factorial(x);
  const term2 = Math.pow(l2, y) / factorial(y);

  if (l3 <= 0.0001) {
    return baseExp * term1 * term2;
  }

  let sum = 0;
  const maxK = Math.min(x, y);
  const ratio = l3 / (l1 * l2);

  for (let k = 0; k <= maxK; k++) {
    const termK = combinations(x, k) * combinations(y, k) * factorial(k) * Math.pow(ratio, k);
    sum += termK;
  }

  return baseExp * term1 * term2 * sum;
}

/**
 * Generates a full (maxGoals+1) x (maxGoals+1) joint score matrix using Bivariate Poisson.
 */
export function generateBivariatePoissonMatrix(
  lambdaHome: number,
  lambdaAway: number,
  lambda3: number = 0,
  maxGoals: number = 8
): number[][] {
  const matrix: number[][] = [];
  let totalSum = 0;

  for (let h = 0; h <= maxGoals; h++) {
    const row: number[] = [];
    for (let a = 0; a <= maxGoals; a++) {
      const p = bivariatePoissonPmf(h, a, lambdaHome, lambdaAway, lambda3);
      row.push(p);
      totalSum += p;
    }
    matrix.push(row);
  }

  // Renormalize matrix so that probabilities sum to exactly 1.0
  if (totalSum > 0) {
    for (let h = 0; h <= maxGoals; h++) {
      for (let a = 0; a <= maxGoals; a++) {
        matrix[h][a] /= totalSum;
      }
    }
  }

  return matrix;
}

/**
 * Applies multiplicative draw inflation (delta) to 1X2 probabilities.
 * P'(X) = P(X) * delta
 * P'(1) = P(1) * k, P'(2) = P(2) * k where k = (1 - P'(X)) / (P(1) + P(2))
 */
export function applyDrawInflation(
  probs: { home: number; draw: number; away: number },
  delta: number = 1.0
): { home: number; draw: number; away: number } {
  if (delta === 1.0 || delta <= 0.5 || delta >= 1.5) {
    return probs;
  }

  const targetDraw = Math.min(0.90, Math.max(0.05, probs.draw * delta));
  const nonDrawSum = probs.home + probs.away;

  if (nonDrawSum <= 0.0001) {
    return probs;
  }

  const k = (1.0 - targetDraw) / nonDrawSum;
  const newHome = probs.home * k;
  const newAway = probs.away * k;

  const total = newHome + targetDraw + newAway;

  return {
    home: Number((newHome / total).toFixed(4)),
    draw: Number((targetDraw / total).toFixed(4)),
    away: Number((newAway / total).toFixed(4)),
  };
}
