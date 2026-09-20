/**
 * FlashStat — Football Scores & AI Betting Radar
 * Value Betting Detection & Kelly Stake Sizing
 */

import { MODEL_CONFIG } from './config';
import type { ValueBet, ValueGrade } from '../types/football';

export interface BetCandidate {
  fixtureId: number;
  matchName: string;
  leagueName: string;
  marketType: '1X2' | 'OU' | 'BTTS' | 'AH';
  selection: string;
  bookmakerOdds: number;
  modelProb: number;
  marketDeviggedProb: number;
  isCalibratedLeague: boolean;
  sharpConsensusProb?: number;
  bestBookmaker?: string;
  historicalMatchesCount?: number;
  lineupStatus?: 'confirmed' | 'probable' | 'unannounced';
  hasRealXg?: boolean;
  isClvPositiveLeague?: boolean;
}

/**
 * Calculates a confidence discount factor in [0.20, 1.00] based on data maturity,
 * lineup confirmations, league calibration, and sharp consensus confirmation.
 */
export function calculateConfidenceFactor(params: {
  historicalMatchesCount?: number;
  lineupStatus?: 'confirmed' | 'probable' | 'unannounced';
  isCalibratedLeague?: boolean;
  hasRealXg?: boolean;
  isSharpConfirmed?: boolean;
}): number {
  let factor = 1.0;

  // 1. Historical sample size
  const matches = params.historicalMatchesCount ?? 20;
  if (matches < 8) factor *= 0.65;
  else if (matches < 15) factor *= 0.85;

  // 2. Lineup availability
  if (params.lineupStatus === 'unannounced') factor *= 0.75;
  else if (params.lineupStatus === 'probable') factor *= 0.90;

  // 3. League calibration
  if (params.isCalibratedLeague === false) factor *= 0.60;

  // 4. Real xG presence
  if (params.hasRealXg === false) factor *= 0.90;

  // 5. Sharp market agreement
  if (params.isSharpConfirmed === false) factor *= 0.80;

  return Number(Math.max(0.20, Math.min(1.0, factor)).toFixed(2));
}

/**
 * Evaluates deviation between a soft bookmaker's price and sharp consensus probability.
 * Edge vs Sharp = ((Soft Odds * Sharp Fair Prob) - 1) * 100
 */
export function evaluateSharpSoftDeviation(
  softOdds: number,
  sharpDeviggedProb: number,
  modelProb?: number
): {
  softBookDeviationPercent: number;
  marketDisagreementPercent?: number;
  isSharpConfirmedValue: boolean;
} {
  const softBookDeviationPercent = Number(
    (((softOdds * sharpDeviggedProb) - 1) * 100).toFixed(2)
  );

  let marketDisagreementPercent: number | undefined;
  if (modelProb !== undefined && sharpDeviggedProb > 0) {
    marketDisagreementPercent = Number(
      (Math.abs(modelProb - sharpDeviggedProb) / sharpDeviggedProb * 100).toFixed(2)
    );
  }

  // A bet is sharp-confirmed if the soft odds also offer positive edge against the sharp market
  const isSharpConfirmedValue = softBookDeviationPercent > 0;

  return {
    softBookDeviationPercent,
    marketDisagreementPercent,
    isSharpConfirmedValue,
  };
}

/**
 * Computes Edge percentage: Edge% = ((P_model * Odds) - 1) * 100
 */
export function calculateEdgePercent(modelProb: number, bookmakerOdds: number): number {
  if (modelProb <= 0 || bookmakerOdds <= 1) return 0;
  return ((modelProb * bookmakerOdds) - 1) * 100;
}

/**
 * Calculates Fractional Kelly Stake (0.25x default) discounted by model uncertainty and capped at max cap.
 * Formula: Kelly = ((b * p - q) / b) * fraction * confidenceFactor
 * where b = odds - 1, p = modelProb, q = 1 - modelProb
 */
export function calculateKellyStake(
  modelProb: number,
  bookmakerOdds: number,
  fraction: number = MODEL_CONFIG.VALUE_BETTING.KELLY_FRACTION,
  maxCap: number = MODEL_CONFIG.VALUE_BETTING.MAX_BANKROLL_STAKE_CAP,
  confidenceFactor: number = 1.0
): { kellyFraction: number; suggestedStakePercent: number } {
  if (bookmakerOdds <= 1 || modelProb <= 0 || modelProb >= 1) {
    return { kellyFraction: 0, suggestedStakePercent: 0 };
  }

  const b = bookmakerOdds - 1;
  const p = modelProb;
  const q = 1 - p;

  const fullKelly = (b * p - q) / b;
  if (fullKelly <= 0) {
    return { kellyFraction: 0, suggestedStakePercent: 0 };
  }

  const safeConfidence = Math.max(0.1, Math.min(1.0, confidenceFactor));
  const scaledKelly = fullKelly * fraction * safeConfidence;
  const cappedStake = Math.min(scaledKelly, maxCap);

  return {
    kellyFraction: Number(scaledKelly.toFixed(4)),
    suggestedStakePercent: Number((cappedStake * 100).toFixed(2)),
  };
}

/**
 * Determines Value Grade based on Edge%:
 * - B: 5.0% - 7.99%
 * - A: 8.0% - 11.99%
 * - A+: 12.0% - 14.99%
 * - SUSPECT: >= 15.0% (indicates likely stale odds, model error or lineup change)
 */
export function classifyValueGrade(edgePercent: number): ValueGrade {
  if (edgePercent >= MODEL_CONFIG.VALUE_BETTING.SUSPECT_EDGE_PERCENT) {
    return 'SUSPECT';
  }
  if (edgePercent >= MODEL_CONFIG.VALUE_BETTING.GRADES.A_PLUS.min) {
    return 'A+';
  }
  if (edgePercent >= MODEL_CONFIG.VALUE_BETTING.GRADES.A.min) {
    return 'A';
  }
  return 'B';
}

/**
 * Evaluates a candidate bet and returns a ValueBet if edge >= 5%, otherwise null.
 */
export function evaluateValueBet(
  candidate: BetCandidate,
  options?: { rejectSuspect?: boolean }
): ValueBet | null {
  const edgePercent = Number(calculateEdgePercent(candidate.modelProb, candidate.bookmakerOdds).toFixed(2));

  if (edgePercent < MODEL_CONFIG.VALUE_BETTING.MIN_EDGE_PERCENT) {
    return null;
  }

  const grade = classifyValueGrade(edgePercent);
  const rejectSuspect = options?.rejectSuspect !== false;
  if (rejectSuspect && grade === 'SUSPECT') {
    return null;
  }

  let softBookDeviationPercent: number | undefined;
  let marketDisagreementPercent: number | undefined;
  let isSharpConfirmed: boolean | undefined;

  if (candidate.sharpConsensusProb !== undefined && candidate.sharpConsensusProb > 0) {
    const sharpMetrics = evaluateSharpSoftDeviation(
      candidate.bookmakerOdds,
      candidate.sharpConsensusProb,
      candidate.modelProb
    );
    softBookDeviationPercent = sharpMetrics.softBookDeviationPercent;
    marketDisagreementPercent = sharpMetrics.marketDisagreementPercent;
    isSharpConfirmed = sharpMetrics.isSharpConfirmedValue;
  }

  const confidenceFactor = calculateConfidenceFactor({
    historicalMatchesCount: candidate.historicalMatchesCount,
    lineupStatus: candidate.lineupStatus,
    isCalibratedLeague: candidate.isCalibratedLeague,
    hasRealXg: candidate.hasRealXg,
    isSharpConfirmed,
  });

  const fairOdds = candidate.modelProb > 0 ? Number((1 / candidate.modelProb).toFixed(2)) : 999;
  const { kellyFraction, suggestedStakePercent } = calculateKellyStake(
    candidate.modelProb,
    candidate.bookmakerOdds,
    MODEL_CONFIG.VALUE_BETTING.KELLY_FRACTION,
    MODEL_CONFIG.VALUE_BETTING.MAX_BANKROLL_STAKE_CAP,
    confidenceFactor
  );

  // Smart 1X2 Market Gating:
  // 1X2 is hyper-efficient; only mark actionable if calibrated and proven or sharp-confirmed
  let isActionable = true;
  let warningNote: string | undefined;

  if (grade === 'SUSPECT') {
    isActionable = false;
    warningNote = 'SUSPECT — Verifica datele (edge > 15% sugereaza eroare de model sau cota expirata).';
  } else if (candidate.marketType === '1X2') {
    const isSharpApproved = isSharpConfirmed === true;
    const isProvenLeague = candidate.isCalibratedLeague && candidate.isClvPositiveLeague === true;
    if (!isProvenLeague && !isSharpApproved) {
      isActionable = false;
      warningNote = 'Piața 1X2 este orientativă — modelul nu a demonstrat CLV pozitiv pe această competiție.';
    }
  } else if (!candidate.isCalibratedLeague) {
    warningNote = 'Model nevalidat pe aceasta competitie — estimare strict orientativa.';
  }

  return {
    id: `${candidate.fixtureId}-${candidate.marketType}-${candidate.selection.replace(/\s+/g, '_')}`,
    fixtureId: candidate.fixtureId,
    matchName: candidate.matchName,
    leagueName: candidate.leagueName,
    marketType: candidate.marketType,
    selection: candidate.selection,
    bookmakerOdds: candidate.bookmakerOdds,
    fairOdds,
    modelProb: Number(candidate.modelProb.toFixed(4)),
    marketDeviggedProb: Number(candidate.marketDeviggedProb.toFixed(4)),
    edgePercent,
    kellyFraction,
    suggestedStakePercent,
    grade,
    isCalibratedLeague: candidate.isCalibratedLeague,
    sharpConsensusProb: candidate.sharpConsensusProb ? Number(candidate.sharpConsensusProb.toFixed(4)) : undefined,
    softBookDeviationPercent,
    marketDisagreementPercent,
    bestBookmaker: candidate.bestBookmaker,
    confidenceFactor,
    isActionable,
    warningNote,
  };
}
