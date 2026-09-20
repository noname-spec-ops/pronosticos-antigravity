/**
 * FlashStat — Football Scores & AI Betting Radar
 * Negative Binomial Cards & Referee Aggression Modeling
 */

import { MODEL_CONFIG } from './config';
import type { CardsPrediction, Lineup, PlayerStats, Referee, PlayerCardRisk } from '../types/football';

/**
 * Calculates player card aggression index:
 * Aggression = ((Yellow + 2 * Red) + (FoulsCommitted / match)) normalized per 90 mins.
 */
export function calculatePlayerAggression(player: PlayerStats): number {
  const matchesEquivalent = Math.max(1, player.minutesPlayed / 90);
  const cardPoints = player.yellowCards + player.redCards * 2;
  const foulsPerMatch = player.foulsCommitted / matchesEquivalent;
  const cardRatePerMatch = cardPoints / matchesEquivalent;

  return Number((cardRatePerMatch * 1.5 + foulsPerMatch * 0.25).toFixed(3));
}

/**
 * Computes squad total card expectation for starting lineup.
 */
export function calculateLineupAggression(lineup?: Lineup): number {
  if (!lineup || !lineup.startingXI || lineup.startingXI.length === 0) {
    return 2.1; // Default average cards per team
  }

  const startingXI = lineup.startingXI.slice(0, 11);
  let totalAggression = 0;

  for (const player of startingXI) {
    totalAggression += calculatePlayerAggression(player);
  }

  // Baseline scaled to typical team card average (~2.1 per match)
  const averageXI = totalAggression / Math.max(1, startingXI.length);
  return Number(Math.max(1.0, Math.min(4.5, averageXI * 2.1)).toFixed(2));
}

/**
 * Log-Gamma function for negative binomial PMF computation with real r.
 */
function logGamma(x: number): number {
  // Lanczos approximation
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
 * Negative Binomial PMF: P(K = k; mu, r)
 */
export function negBinomialProb(k: number, mu: number, r: number = MODEL_CONFIG.CARDS.NEGATIVE_BINOMIAL_DISPERSION_R): number {
  if (k < 0) return 0;
  if (mu <= 0) return k === 0 ? 1 : 0;

  const p = r / (r + mu);
  const logProb =
    logGamma(k + r) -
    logGamma(k + 1) -
    logGamma(r) +
    r * Math.log(p) +
    k * Math.log(1 - p);

  return Math.exp(logProb);
}

/**
 * Calculates individual player card risk score & fair odds (Qwen Sharp Model):
 * Position (CB/DM: +3, CM: +2, FW: +1) + Card History + Foul Rate * Ref Severity * Rivalry Factor.
 */
export function calculatePlayerCardRisk(
  player: PlayerStats,
  teamName: string,
  refSeverity: number = 1.0,
  rivalryFactor: number = 1.0
): PlayerCardRisk {
  const pos = (player.position || 'CM').toUpperCase();
  let posFactor = 1.0;
  if (['CB', 'DM', 'LB', 'RB', 'DEF', 'D'].includes(pos)) {
    posFactor = pos === 'CB' || pos === 'DM' ? 3.0 : 2.5;
  } else if (['CM', 'CAM', 'MID', 'M'].includes(pos)) {
    posFactor = 2.0;
  } else {
    posFactor = 1.0;
  }

  const foulsAvg = Number((player.foulsCommitted / Math.max(1, player.minutesPlayed / 90)).toFixed(1));
  const cardPoints = player.yellowCards + player.redCards * 2;
  const rawRiskScore = posFactor * 1.5 + cardPoints * 0.8 + foulsAvg * 1.2;
  const finalScore = Number((rawRiskScore * refSeverity * rivalryFactor).toFixed(1));

  const riskLevel: 'HIGH' | 'MEDIUM' | 'LOW' = finalScore >= 7.0 ? 'HIGH' : finalScore >= 4.5 ? 'MEDIUM' : 'LOW';
  const cardProb = Math.min(0.65, Math.max(0.12, Number((finalScore * 0.045).toFixed(2))));
  const fairOdds = Number((1 / cardProb).toFixed(2));

  return {
    id: player.id,
    name: player.name,
    teamName,
    position: player.position,
    riskScore: finalScore,
    riskLevel,
    cardProbability: cardProb,
    fairOdds,
    foulsAvg,
  };
}

/**
 * Evaluates full cards expectation and Over/Under lines using Negative Binomial distribution.
 */
export function predictMatchCards(
  homeLineup?: Lineup,
  awayLineup?: Lineup,
  referee?: Referee,
  h2hRivalryFactor: number = MODEL_CONFIG.CARDS.DEFAULT_RIVALRY_FACTOR,
  dispersionR: number = MODEL_CONFIG.CARDS.NEGATIVE_BINOMIAL_DISPERSION_R,
  homeTeamName: string = 'Gazde',
  awayTeamName: string = 'Oaspeți'
): CardsPrediction {
  const homeBase = calculateLineupAggression(homeLineup);
  const awayBase = calculateLineupAggression(awayLineup);

  const refSeverity = referee && referee.severityIndex > 0 ? referee.severityIndex : 1.0;
  const rivalry = Math.max(0.8, Math.min(1.5, h2hRivalryFactor));

  const expectedHomeCards = Number((homeBase * refSeverity * rivalry).toFixed(2));
  const expectedAwayCards = Number((awayBase * refSeverity * rivalry).toFixed(2));
  const expectedTotalCards = Number((expectedHomeCards + expectedAwayCards).toFixed(2));

  // Over/Under cards distribution (lines 2.5, 3.5, 4.5, 5.5, 6.5)
  const lines = [2.5, 3.5, 4.5, 5.5, 6.5];
  const maxK = MODEL_CONFIG.CARDS.MAX_CARDS_GRID;

  const probs: number[] = [];
  for (let k = 0; k <= maxK; k++) {
    probs.push(negBinomialProb(k, expectedTotalCards, dispersionR));
  }

  const overUnderCards = lines.map((line) => {
    let under = 0;
    for (let k = 0; k <= maxK; k++) {
      if (k < line) {
        under += probs[k] || 0;
      }
    }
    const over = Math.max(0, 1 - under);
    return {
      line,
      overProb: Number(over.toFixed(4)),
      underProb: Number(under.toFixed(4)),
    };
  });

  // Calculate high-risk individual players (Jugador con Tarjeta)
  const allPlayers: PlayerCardRisk[] = [];
  if (homeLineup?.startingXI) {
    for (const p of homeLineup.startingXI) {
      allPlayers.push(calculatePlayerCardRisk(p, homeTeamName, refSeverity, rivalry));
    }
  }
  if (awayLineup?.startingXI) {
    for (const p of awayLineup.startingXI) {
      allPlayers.push(calculatePlayerCardRisk(p, awayTeamName, refSeverity, rivalry));
    }
  }

  allPlayers.sort((a, b) => b.riskScore - a.riskScore);
  const highRiskPlayers = allPlayers.slice(0, 6);

  // Temporal analysis (Qwen Mathematical Card Timing Engine)
  const isHighIntensity = rivalry > 1.15 || refSeverity > 1.15;
  const period0_30Prob = Number((isHighIntensity ? 0.22 : 0.18).toFixed(2));
  const period31_60Prob = Number((isHighIntensity ? 0.33 : 0.32).toFixed(2));
  const period61_90Prob = Number((1 - period0_30Prob - period31_60Prob).toFixed(2));

  // Second half cards lambda (~60% of all match cards appear in 2H)
  const lambda2H = expectedTotalCards * 0.60;
  let probUnder2H1_5 = 0;
  for (let k = 0; k < 1.5; k++) {
    probUnder2H1_5 += negBinomialProb(k, lambda2H, dispersionR);
  }
  const secondHalfOver1_5Prob = Number(Math.max(0.05, Math.min(0.95, 1 - probUnder2H1_5)).toFixed(3));

  const postGoalFrustrationRisk: 'LOW' | 'MODERATE' | 'HIGH' =
    rivalry >= 1.25 || expectedTotalCards >= 5.0 ? 'HIGH' : rivalry >= 1.1 ? 'MODERATE' : 'LOW';

  const derbyIntensityScore = Number(
    Math.min(10, Math.max(1, ((rivalry - 0.8) / 0.7) * 5 + (expectedTotalCards / 5.0) * 5)).toFixed(1)
  );

  return {
    expectedHomeCards,
    expectedAwayCards,
    expectedTotalCards,
    overUnderCards,
    refereeImpactFactor: Number(refSeverity.toFixed(2)),
    h2hRivalryFactor: Number(rivalry.toFixed(2)),
    distributionType: 'negative_binomial',
    highRiskPlayers,
    temporalBreakdown: {
      period0_30Prob,
      period31_60Prob,
      period61_90Prob,
      criticalMinuteWindow: "75' - 90' (+45% spike)",
      secondHalfOver1_5Prob,
      postGoalFrustrationRisk,
    },
    derbyIntensityScore,
  };
}
