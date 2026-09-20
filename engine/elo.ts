/**
 * FlashStat — Football Scores & AI Betting Radar
 * ELO Rating System & Goal Expectation Regression
 */

import { MODEL_CONFIG } from './config';
import type { EloRating } from '../types/football';

/**
 * Calculates win expectation for the home team given ELO ratings and home advantage.
 */
export function calculateEloExpectation(
  eloHome: number,
  eloAway: number,
  homeAdvantage: number = MODEL_CONFIG.ELO.HOME_ADVANTAGE_PTS
): { expectedHome: number; expectedAway: number } {
  const diff = eloAway - (eloHome + homeAdvantage);
  const expectedHome = 1 / (1 + Math.pow(10, diff / MODEL_CONFIG.ELO.REGRESSION_SCALE));
  const expectedAway = 1 - expectedHome;

  return { expectedHome, expectedAway };
}

/**
 * Calculates the goal difference multiplier: mult = ln(|GD| + 1)
 */
export function calculateGoalDiffMultiplier(homeGoals: number, awayGoals: number): number {
  const gd = Math.abs(homeGoals - awayGoals);
  if (gd === 0) return 1.0;
  return Math.log(gd + 1);
}

/**
 * Updates ELO ratings for both teams following a match result.
 */
export function updateEloRatings(
  currentHomeElo: number,
  currentAwayElo: number,
  homeGoals: number,
  awayGoals: number,
  kFactor: number = MODEL_CONFIG.ELO.K_FACTOR,
  homeAdvantage: number = MODEL_CONFIG.ELO.HOME_ADVANTAGE_PTS
): { newHomeElo: number; newAwayElo: number; deltaElo: number } {
  const { expectedHome } = calculateEloExpectation(currentHomeElo, currentAwayElo, homeAdvantage);

  let actualScoreHome = 0.5;
  if (homeGoals > awayGoals) actualScoreHome = 1.0;
  else if (homeGoals < awayGoals) actualScoreHome = 0.0;

  const gdMultiplier = calculateGoalDiffMultiplier(homeGoals, awayGoals);
  const deltaElo = Math.round(kFactor * gdMultiplier * (actualScoreHome - expectedHome));

  return {
    newHomeElo: currentHomeElo + deltaElo,
    newAwayElo: currentAwayElo - deltaElo,
    deltaElo,
  };
}

/**
 * Converts ELO rating differences into Poisson lambda expectations via calibrated regression.
 */
export function eloToLambdas(
  eloHome: number,
  eloAway: number,
  leagueAvgHome: number = MODEL_CONFIG.TEAM_STRENGTH.DEFAULT_LEAGUE_AVG_HOME_GOALS,
  leagueAvgAway: number = MODEL_CONFIG.TEAM_STRENGTH.DEFAULT_LEAGUE_AVG_AWAY_GOALS,
  homeAdvantage: number = MODEL_CONFIG.ELO.HOME_ADVANTAGE_PTS
): { eloLambdaHome: number; eloLambdaAway: number } {
  const eloDiff = (eloHome + homeAdvantage) - eloAway;

  // Scale factor: an ELO diff of 400 points represents ~10x win ratio, modulating lambdas by ~1.6x
  const homeMultiplier = Math.pow(10, eloDiff / 1000);
  const awayMultiplier = Math.pow(10, -eloDiff / 1000);

  const eloLambdaHome = Math.max(0.2, Math.min(5.0, leagueAvgHome * homeMultiplier));
  const eloLambdaAway = Math.max(0.2, Math.min(5.0, leagueAvgAway * awayMultiplier));

  return { eloLambdaHome, eloLambdaAway };
}
