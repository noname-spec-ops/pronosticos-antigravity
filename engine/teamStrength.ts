/**
 * FlashStat — Football Scores & AI Betting Radar
 * Team Attack & Defense Strength Calculation
 * 
 * Includes:
 * - Exponential time-decay weighting (half-life 180 days)
 * - Bayesian shrinkage towards league average for small samples (<15 matches)
 * - Opponent strength adjustment
 */

import { MODEL_CONFIG } from './config';
import type { TeamStrengthMetrics } from '../types/football';

export interface HistoricalMatchRecord {
  id?: number | string;
  date: string; // ISO date string e.g. "2025-10-15"
  homeTeamId: number;
  homeTeamName?: string;
  awayTeamId: number;
  awayTeamName?: string;
  homeGoals: number;
  awayGoals: number;
  homeShotsOnTarget?: number | null;
  awayShotsOnTarget?: number | null;
  homeXg?: number | null;
  awayXg?: number | null;
}

/**
 * Calculates exponential time decay weight: w = exp(-ln(2) * daysAgo / halfLifeDays)
 */
export function calculateTimeDecayWeight(
  matchDate: string | Date,
  referenceDate: string | Date = new Date(),
  halfLifeDays: number = MODEL_CONFIG.TEAM_STRENGTH.HALF_LIFE_DAYS
): number {
  const matchMs = new Date(matchDate).getTime();
  const refMs = new Date(referenceDate).getTime();
  const diffDays = Math.max(0, (refMs - matchMs) / (1000 * 60 * 60 * 24));
  const decayRate = Math.LN2 / halfLifeDays;

  return Math.exp(-decayRate * diffDays);
}

/**
 * Applies Bayesian shrinkage towards league average (1.0) when matches count is small.
 */
/**
 * Applies Bayesian shrinkage towards league average (1.0) or custom prior when matches count is below threshold.
 * Formula: weight = n / (n + 5), shrunkMetric = weight * raw + (1 - weight) * priorMean
 */
export function applyBayesianShrinkage(
  rawMetric: number,
  matchesCount: number,
  threshold: number = MODEL_CONFIG.TEAM_STRENGTH.MIN_MATCHES_THRESHOLD,
  priorMean: number = 1.0
): number {
  if (matchesCount >= threshold) return rawMetric;
  const weight = matchesCount / (matchesCount + 5);
  return weight * rawMetric + (1 - weight) * priorMean;
}

/**
 * Computes attack and defense strengths for all teams in a league given historical matches,
 * incorporating exponential time decay, xG/shots-on-target proxy, 2-pass opponent difficulty adjustment,
 * and continuous Bayesian shrinkage.
 */
export function calculateLeagueTeamStrengths(
  matches: HistoricalMatchRecord[],
  referenceDate: string | Date = new Date(),
  halfLifeDays: number = MODEL_CONFIG.TEAM_STRENGTH.HALF_LIFE_DAYS
): Map<number, TeamStrengthMetrics> {
  const statsMap = new Map<
    number,
    {
      name: string;
      homeMatches: number;
      awayMatches: number;
      homeGoalsScoredWeighted: number;
      homeGoalsConcededWeighted: number;
      homeWeightsSum: number;
      awayGoalsScoredWeighted: number;
      awayGoalsConcededWeighted: number;
      awayWeightsSum: number;
    }
  >();

  let totalHomeGoalsWeighted = 0;
  let totalAwayGoalsWeighted = 0;
  let totalHomeMatchesWeight = 0;
  let totalAwayMatchesWeight = 0;

  // Pre-calculate effective goals for all matches
  const matchEffectiveGoals = new Array<{
    m: HistoricalMatchRecord;
    weight: number;
    effectiveHome: number;
    effectiveAway: number;
  }>(matches.length);

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const weight = calculateTimeDecayWeight(m.date, referenceDate, halfLifeDays);

    // Initialize Home Team
    if (!statsMap.has(m.homeTeamId)) {
      statsMap.set(m.homeTeamId, {
        name: m.homeTeamName || `Team ${m.homeTeamId}`,
        homeMatches: 0,
        awayMatches: 0,
        homeGoalsScoredWeighted: 0,
        homeGoalsConcededWeighted: 0,
        homeWeightsSum: 0,
        awayGoalsScoredWeighted: 0,
        awayGoalsConcededWeighted: 0,
        awayWeightsSum: 0,
      });
    }

    // Initialize Away Team
    if (!statsMap.has(m.awayTeamId)) {
      statsMap.set(m.awayTeamId, {
        name: m.awayTeamName || `Team ${m.awayTeamId}`,
        homeMatches: 0,
        awayMatches: 0,
        homeGoalsScoredWeighted: 0,
        homeGoalsConcededWeighted: 0,
        homeWeightsSum: 0,
        awayGoalsScoredWeighted: 0,
        awayGoalsConcededWeighted: 0,
        awayWeightsSum: 0,
      });
    }

    let effectiveHome: number;
    if (m.homeXg !== null && m.homeXg !== undefined && m.homeXg >= 0) {
      effectiveHome = m.homeGoals * 0.30 + m.homeXg * 0.70;
    } else if (m.homeShotsOnTarget !== null && m.homeShotsOnTarget !== undefined && m.homeShotsOnTarget > 0) {
      effectiveHome = m.homeGoals * MODEL_CONFIG.XG_PROXY.GOALS_WEIGHT + (m.homeShotsOnTarget * MODEL_CONFIG.XG_PROXY.SOT_CONVERSION_FACTOR) * MODEL_CONFIG.XG_PROXY.SHOTS_ON_TARGET_WEIGHT;
    } else {
      effectiveHome = m.homeGoals;
    }

    let effectiveAway: number;
    if (m.awayXg !== null && m.awayXg !== undefined && m.awayXg >= 0) {
      effectiveAway = m.awayGoals * 0.30 + m.awayXg * 0.70;
    } else if (m.awayShotsOnTarget !== null && m.awayShotsOnTarget !== undefined && m.awayShotsOnTarget > 0) {
      effectiveAway = m.awayGoals * MODEL_CONFIG.XG_PROXY.GOALS_WEIGHT + (m.awayShotsOnTarget * MODEL_CONFIG.XG_PROXY.SOT_CONVERSION_FACTOR) * MODEL_CONFIG.XG_PROXY.SHOTS_ON_TARGET_WEIGHT;
    } else {
      effectiveAway = m.awayGoals;
    }

    matchEffectiveGoals[i] = { m, weight, effectiveHome, effectiveAway };

    const homeStats = statsMap.get(m.homeTeamId)!;
    const awayStats = statsMap.get(m.awayTeamId)!;

    homeStats.homeMatches += 1;
    homeStats.homeGoalsScoredWeighted += effectiveHome * weight;
    homeStats.homeGoalsConcededWeighted += effectiveAway * weight;
    homeStats.homeWeightsSum += weight;

    awayStats.awayMatches += 1;
    awayStats.awayGoalsScoredWeighted += effectiveAway * weight;
    awayStats.awayGoalsConcededWeighted += effectiveHome * weight;
    awayStats.awayWeightsSum += weight;

    totalHomeGoalsWeighted += effectiveHome * weight;
    totalAwayGoalsWeighted += effectiveAway * weight;
    totalHomeMatchesWeight += weight;
    totalAwayMatchesWeight += weight;
  }

  // Baseline League averages per match
  const leagueAvgHomeGoals =
    totalHomeMatchesWeight > 0
      ? totalHomeGoalsWeighted / totalHomeMatchesWeight
      : MODEL_CONFIG.TEAM_STRENGTH.DEFAULT_LEAGUE_AVG_HOME_GOALS;

  const leagueAvgAwayGoals =
    totalAwayMatchesWeight > 0
      ? totalAwayGoalsWeighted / totalAwayMatchesWeight
      : MODEL_CONFIG.TEAM_STRENGTH.DEFAULT_LEAGUE_AVG_AWAY_GOALS;

  // Pass 1: Unadjusted Baseline Strengths
  const unadjustedRatings = new Map<number, { homeAtt: number; homeDef: number; awayAtt: number; awayDef: number }>();

  for (const [teamId, s] of statsMap.entries()) {
    const rawHomeScoringRate = s.homeWeightsSum > 0 ? s.homeGoalsScoredWeighted / s.homeWeightsSum : leagueAvgHomeGoals;
    const rawHomeConcedingRate = s.homeWeightsSum > 0 ? s.homeGoalsConcededWeighted / s.homeWeightsSum : leagueAvgAwayGoals;
    const rawAwayScoringRate = s.awayWeightsSum > 0 ? s.awayGoalsScoredWeighted / s.awayWeightsSum : leagueAvgAwayGoals;
    const rawAwayConcedingRate = s.awayWeightsSum > 0 ? s.awayGoalsConcededWeighted / s.awayWeightsSum : leagueAvgHomeGoals;

    unadjustedRatings.set(teamId, {
      homeAtt: Math.max(0.3, Math.min(3.0, rawHomeScoringRate / (leagueAvgHomeGoals || 1.0))),
      homeDef: Math.max(0.3, Math.min(3.0, rawHomeConcedingRate / (leagueAvgAwayGoals || 1.0))),
      awayAtt: Math.max(0.3, Math.min(3.0, rawAwayScoringRate / (leagueAvgAwayGoals || 1.0))),
      awayDef: Math.max(0.3, Math.min(3.0, rawAwayConcedingRate / (leagueAvgHomeGoals || 1.0))),
    });
  }

  // Pass 2: Opponent Strength Normalization
  const oppAdjustedStats = new Map<
    number,
    {
      homeAdjScoredWeighted: number;
      homeAdjConcededWeighted: number;
      homeWeightsSum: number;
      awayAdjScoredWeighted: number;
      awayAdjConcededWeighted: number;
      awayWeightsSum: number;
    }
  >();

  for (const teamId of statsMap.keys()) {
    oppAdjustedStats.set(teamId, {
      homeAdjScoredWeighted: 0,
      homeAdjConcededWeighted: 0,
      homeWeightsSum: 0,
      awayAdjScoredWeighted: 0,
      awayAdjConcededWeighted: 0,
      awayWeightsSum: 0,
    });
  }

  for (const { m, weight, effectiveHome, effectiveAway } of matchEffectiveGoals) {
    const homeOppStats = unadjustedRatings.get(m.awayTeamId);
    const awayOppStats = unadjustedRatings.get(m.homeTeamId);

    const awayDefQuality = homeOppStats ? homeOppStats.awayDef : 1.0;
    const awayAttQuality = homeOppStats ? homeOppStats.awayAtt : 1.0;
    const homeDefQuality = awayOppStats ? awayOppStats.homeDef : 1.0;
    const homeAttQuality = awayOppStats ? awayOppStats.homeAtt : 1.0;

    const homeAdj = oppAdjustedStats.get(m.homeTeamId)!;
    const awayAdj = oppAdjustedStats.get(m.awayTeamId)!;

    // Normalize scoring against opponent defense; normalize conceding against opponent attack
    homeAdj.homeAdjScoredWeighted += (effectiveHome / Math.max(0.4, awayDefQuality)) * weight;
    homeAdj.homeAdjConcededWeighted += (effectiveAway / Math.max(0.4, awayAttQuality)) * weight;
    homeAdj.homeWeightsSum += weight;

    awayAdj.awayAdjScoredWeighted += (effectiveAway / Math.max(0.4, homeDefQuality)) * weight;
    awayAdj.awayAdjConcededWeighted += (effectiveHome / Math.max(0.4, homeAttQuality)) * weight;
    awayAdj.awayWeightsSum += weight;
  }

  const results = new Map<number, TeamStrengthMetrics>();

  for (const [teamId, s] of statsMap.entries()) {
    const totalMatches = s.homeMatches + s.awayMatches;
    const adj = oppAdjustedStats.get(teamId)!;

    const rawHomeScoringRate = adj.homeWeightsSum > 0 ? adj.homeAdjScoredWeighted / adj.homeWeightsSum : leagueAvgHomeGoals;
    const rawHomeConcedingRate = adj.homeWeightsSum > 0 ? adj.homeAdjConcededWeighted / adj.homeWeightsSum : leagueAvgAwayGoals;

    const rawAwayScoringRate = adj.awayWeightsSum > 0 ? adj.awayAdjScoredWeighted / adj.awayWeightsSum : leagueAvgAwayGoals;
    const rawAwayConcedingRate = adj.awayWeightsSum > 0 ? adj.awayAdjConcededWeighted / adj.awayWeightsSum : leagueAvgHomeGoals;

    // Relative to league averages (1.0 is average)
    let homeAttack = rawHomeScoringRate / (leagueAvgHomeGoals || 1.0);
    let homeDefense = rawHomeConcedingRate / (leagueAvgAwayGoals || 1.0);
    let awayAttack = rawAwayScoringRate / (leagueAvgAwayGoals || 1.0);
    let awayDefense = rawAwayConcedingRate / (leagueAvgHomeGoals || 1.0);

    // Apply Bayesian shrinkage if sample is small
    const isShrinkage = totalMatches < MODEL_CONFIG.TEAM_STRENGTH.MIN_MATCHES_THRESHOLD;
    if (isShrinkage) {
      homeAttack = applyBayesianShrinkage(homeAttack, totalMatches, MODEL_CONFIG.TEAM_STRENGTH.MIN_MATCHES_THRESHOLD, 1.0);
      homeDefense = applyBayesianShrinkage(homeDefense, totalMatches, MODEL_CONFIG.TEAM_STRENGTH.MIN_MATCHES_THRESHOLD, 1.0);
      awayAttack = applyBayesianShrinkage(awayAttack, totalMatches, MODEL_CONFIG.TEAM_STRENGTH.MIN_MATCHES_THRESHOLD, 1.0);
      awayDefense = applyBayesianShrinkage(awayDefense, totalMatches, MODEL_CONFIG.TEAM_STRENGTH.MIN_MATCHES_THRESHOLD, 1.0);
    }

    // Per-team home advantage index:
    // Raw = (home scoring rate) / (away scoring rate), normalized to 1.0 at league average.
    // A team with rawHomeAdv = 1.3 scores 30% more goals at home than away, relative to league norms.
    // Shrinkage toward 1.0 (no special home advantage) when home match count is low.
    const rawHomeAdv = (rawHomeScoringRate / (leagueAvgHomeGoals || 1.0)) /
                       Math.max(0.01, (rawAwayScoringRate / (leagueAvgAwayGoals || 1.0)));
    const homeAdvantageIndex = Number(
      applyBayesianShrinkage(rawHomeAdv, s.homeMatches, MODEL_CONFIG.TEAM_STRENGTH.MIN_MATCHES_THRESHOLD, 1.0)
        .toFixed(4)
    );

    results.set(teamId, {
      teamId,
      teamName: s.name,
      matchesEvaluated: totalMatches,
      homeAttack: Number(homeAttack.toFixed(4)),
      homeDefense: Number(homeDefense.toFixed(4)),
      awayAttack: Number(awayAttack.toFixed(4)),
      awayDefense: Number(awayDefense.toFixed(4)),
      leagueAvgGoalsHome: Number(leagueAvgHomeGoals.toFixed(4)),
      leagueAvgGoalsAway: Number(leagueAvgAwayGoals.toFixed(4)),
      isShrinkageApplied: isShrinkage,
      homeAdvantageIndex,
    });
  }

  return results;
}

/**
 * Calculates match expected goals lambda_home and lambda_away
 */
export function calculateMatchPoissonLambdas(
  homeTeamStrength: TeamStrengthMetrics,
  awayTeamStrength: TeamStrengthMetrics
): { lambdaHome: number; lambdaAway: number } {
  const lambdaHome =
    homeTeamStrength.homeAttack *
    awayTeamStrength.awayDefense *
    homeTeamStrength.leagueAvgGoalsHome;

  const lambdaAway =
    awayTeamStrength.awayAttack *
    homeTeamStrength.homeDefense *
    awayTeamStrength.leagueAvgGoalsAway;

  return {
    lambdaHome: Math.max(0.2, Math.min(6.0, Number(lambdaHome.toFixed(4)))),
    lambdaAway: Math.max(0.2, Math.min(6.0, Number(lambdaAway.toFixed(4)))),
  };
}
