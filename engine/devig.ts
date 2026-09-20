/**
 * FlashStat — Football Scores & AI Betting Radar
 * Odds Devigging & True Market Probability Estimation
 *
 * Supports:
 * - Multiplicative (Proportional) Devigging
 * - Shin's Method (Insider trader & favorite-longshot bias correction)
 *
 * Invariants enforced here:
 * - Returned probabilities always sum to exactly 1 (no rounding drift).
 * - Malformed input (odds <= 1, NaN, missing) is rejected rather than propagated
 *   as a negative or null "probability" into the value-bet engine.
 */

import type { DeviggedProbabilities, Raw1X2Odds } from '../types/football';

/** Decimal odds must be a finite number strictly above 1.0 to imply a probability < 1. */
function isValidOdd(o: unknown): o is number {
  return typeof o === 'number' && Number.isFinite(o) && o > 1;
}

/**
 * Rounds a probability vector to 4 dp while preserving the sum-to-one invariant,
 * by giving the residual to the largest component.
 *
 * Rounding each element independently (as before) left the vector summing to
 * 0.9999 or 1.0001, and those values are consumed directly as market
 * probabilities by the edge calculation and the market blend.
 */
function roundPreservingSum(values: number[]): number[] {
  const rounded = values.map((v) => Number(v.toFixed(4)));
  const drift = Number((1 - rounded.reduce((a, b) => a + b, 0)).toFixed(10));
  if (drift === 0) return rounded;

  let maxIdx = 0;
  for (let i = 1; i < rounded.length; i++) {
    if (rounded[i] > rounded[maxIdx]) maxIdx = i;
  }
  rounded[maxIdx] = Number((rounded[maxIdx] + drift).toFixed(10));
  return rounded;
}

/**
 * Calculates bookmaker overround from 1X2 odds.
 * Returns NaN for malformed input — callers must not treat that as a fair book.
 */
export function calculateOverround(odds: Raw1X2Odds): number {
  if (!isValidOdd(odds?.home) || !isValidOdd(odds?.draw) || !isValidOdd(odds?.away)) {
    return NaN;
  }
  return 1 / odds.home + 1 / odds.draw + 1 / odds.away;
}

/**
 * Multiplicative (proportional) devigging for the 1X2 market.
 * Throws on malformed odds so a corrupt feed fails loudly instead of producing
 * a negative probability that silently becomes a huge phantom edge.
 */
export function devigMultiplicative(odds: Raw1X2Odds): DeviggedProbabilities {
  if (!isValidOdd(odds?.home) || !isValidOdd(odds?.draw) || !isValidOdd(odds?.away)) {
    throw new Error(
      `devigMultiplicative: invalid 1X2 odds ${JSON.stringify(odds)} (each must be a finite number > 1)`
    );
  }

  const qH = 1 / odds.home;
  const qD = 1 / odds.draw;
  const qA = 1 / odds.away;
  const overround = qH + qD + qA;

  const [home, draw, away] = roundPreservingSum([qH / overround, qD / overround, qA / overround]);

  return {
    home,
    draw,
    away,
    overround: Number(overround.toFixed(4)),
    marginPercent: Number(((overround - 1) * 100).toFixed(2)),
    method: 'multiplicative',
  };
}

/**
 * Shin's method for extracting true probabilities from bookmaker odds.
 *
 * Reference: Shin, H. S. (1993), "Measuring the Incidence of Insider Trading in a
 * Market for State-Contingent Claims".
 *
 * Model: with a proportion z of insider money, the book's implied probability
 * q_i relates to the true probability p_i by
 *
 *     q_i / S = z * p_i^2 / (sum_j p_j^2 ... )   [implicit form]
 *
 * solved in the standard closed form
 *
 *     p_i(z) = ( sqrt( z^2 + 4 * (1 - z) * q_i^2 / S ) - z ) / ( 2 * (1 - z) )
 *
 * where S = sum_i q_i is the overround, and z is found by requiring sum_i p_i = 1.
 *
 * The previous implementation was wrong in three compounding ways:
 *  1. the bisection solved `sqrt(z^2 + 4(1-z) * qn^2 / 1)` while the final result
 *     used `sqrt(z^2 + 4(1-z) * qn)` — a different equation, so the z that was
 *     solved for did not belong to the formula that produced the output;
 *  2. it fed pre-normalised q values (summing to 1), which destroys the margin
 *     information the model needs — at z = 0 the constraint is then satisfied for
 *     every z, so the search returned an arbitrary value;
 *  3. it re-normalised the result at the end, which hid the damage because the
 *     output still summed to 1 while being badly skewed.
 * Measured effect on a 1.20 / 7.00 / 15.00 book: favourite reported at 0.5893
 * instead of 0.8139 — a 22 percentage point error.
 */
export function devigShin(odds: Raw1X2Odds): DeviggedProbabilities {
  if (!isValidOdd(odds?.home) || !isValidOdd(odds?.draw) || !isValidOdd(odds?.away)) {
    throw new Error(
      `devigShin: invalid 1X2 odds ${JSON.stringify(odds)} (each must be a finite number > 1)`
    );
  }

  const q = [1 / odds.home, 1 / odds.draw, 1 / odds.away];
  const overround = q[0] + q[1] + q[2];
  const marginPercent = Number(((overround - 1) * 100).toFixed(2));

  /**
   * p_i(z) using the RAW implied probabilities and the true overround.
   *
   * Valid for the whole search range including z = 0, where it reduces to
   * p_i = q_i / sqrt(S) — NOT to proportional devigging (q_i / S). Special-casing
   * z = 0 to the proportional result makes the constraint vanish identically at
   * the lower bound, so the search never starts and Shin silently degrades into
   * the multiplicative method.
   */
  const probsAt = (z: number): number[] =>
    q.map((qi) => (Math.sqrt(z * z + 4 * (1 - z) * (qi * qi) / overround) - z) / (2 * (1 - z)));

  /** Constraint whose root defines z: sum of probabilities minus one. */
  const constraint = (z: number): number => probsAt(z).reduce((a, b) => a + b, 0) - 1;

  // A fair or sub-fair book (overround <= 1) has no insider component to extract.
  let z = 0;
  if (overround > 1) {
    let low = 0;
    let high = 0.5; // z is a money share; well above any realistic value
    // The constraint decreases monotonically in z, so a sign change brackets the root.
    if (constraint(low) > 0 && constraint(high) < 0) {
      for (let i = 0; i < 100; i++) {
        z = (low + high) / 2;
        if (constraint(z) > 0) low = z;
        else high = z;
      }
      z = (low + high) / 2;
    }
  }

  const raw = probsAt(z);
  const sum = raw.reduce((a, b) => a + b, 0);
  // `sum` is 1 to solver precision; the division only removes residual error and
  // can no longer mask a wrong z, because z now solves the formula actually used.
  const [home, draw, away] = roundPreservingSum(raw.map((p) => p / sum));

  return {
    home,
    draw,
    away,
    overround: Number(overround.toFixed(4)),
    marginPercent,
    method: 'shin',
  };
}

/**
 * Devigs a 2-way market (e.g. Over/Under or BTTS Yes/No).
 * Throws on malformed odds, for the same reason as the 1X2 variants.
 */
export function devig2WayMarket(
  oddsA: number,
  oddsB: number
): { probA: number; probB: number; overround: number; marginPercent: number } {
  if (!isValidOdd(oddsA) || !isValidOdd(oddsB)) {
    throw new Error(
      `devig2WayMarket: invalid odds (${oddsA}, ${oddsB}) — each must be a finite number > 1`
    );
  }

  const qA = 1 / oddsA;
  const qB = 1 / oddsB;
  const overround = qA + qB;

  const [probA, probB] = roundPreservingSum([qA / overround, qB / overround]);

  return {
    probA,
    probB,
    overround: Number(overround.toFixed(4)),
    marginPercent: Number(((overround - 1) * 100).toFixed(2)),
  };
}
