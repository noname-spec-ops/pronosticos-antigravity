/**
 * FlashStat — Football Scores & AI Betting Radar
 * In-Play Momentum Tracker & Live Smart Alerts (engine/inPlayMomentum.ts)
 * 
 * Mathematical model:
 * 1. Pressure Index (PPI / Momentum 0-100) calculated from live stats:
 *    - Shots on Target & Total Shots pace
 *    - Dangerous attacking corners & possession dominance
 *    - xG accumulation rate & red card numerical imbalances
 * 2. Imminent Goal Detection:
 *    - High tempo & offensive siege detection (Over 0.5 live / Next Goal alert)
 *    - Defensive gridlock (Under live alert)
 *    - Match volatility & disciplinary card surges
 * 3. In-Play Poisson Remaining Goal Distribution & Next Team to Score Projections.
 */

import type { MatchStats, MatchStatus } from '../types/football';

export interface InPlayAlert {
  id: string;
  type: 'imminent_goal' | 'extreme_pressure' | 'defensive_lock' | 'card_tension' | 'comeback_surge';
  severity: 'high' | 'medium' | 'info';
  team?: 'home' | 'away';
  title: string;
  description: string;
  suggestedMarket: string;
  confidencePercent: number;
}

export interface InPlayLiveOdds {
  homeNextGoalOdd: number;
  awayNextGoalOdd: number;
  noMoreGoalsOdd: number;
  liveOverLine: number;
  liveOverOdd: number;
  liveUnderOdd: number;
  recommendedBet: {
    selection: string;
    odd: number;
    fairOdd: number;
    marketType: string;
    reasoning: string;
    confidencePercent: number;
    edgePercent: number;
  };
}

export interface InPlayMomentumResult {
  homeMomentum: number; // 0 - 100
  awayMomentum: number; // 0 - 100
  dominantTeam: 'home' | 'away' | 'balanced';
  momentumTrend: 'home_surging' | 'away_surging' | 'neutral';
  pressureDifferential: number; // homeMomentum - awayMomentum (-100 to +100)
  alerts: InPlayAlert[];
  liveNextGoalProbabilities: {
    homeNextGoal: number; // e.g. 0.54
    awayNextGoal: number; // e.g. 0.28
    noMoreGoals: number;  // e.g. 0.18
    atLeastOneMoreGoal: number; // 1 - noMoreGoals
  };
  lambdaRemainingHome: number;
  lambdaRemainingAway: number;
  expectedRemainingGoals: number;
  isHighPressureState: boolean;
  liveOdds?: InPlayLiveOdds;
}

export interface InPlayTrackerInput {
  stats: MatchStats;
  elapsedMinute: number;
  status: MatchStatus;
  currentScore: { home: number; away: number };
  homeTeamName?: string;
  awayTeamName?: string;
  prematchLambdaHome?: number;
  prematchLambdaAway?: number;
}

/**
 * Calculates in-play offensive momentum, detects imminent goal conditions,
 * and projects remaining goals using an in-play Poisson decay model.
 */
export function calculateInPlayMomentum(input: InPlayTrackerInput): InPlayMomentumResult {
  const {
    stats,
    elapsedMinute,
    currentScore,
    homeTeamName = 'Gazde',
    awayTeamName = 'Oaspeți',
    prematchLambdaHome = 1.45,
    prematchLambdaAway = 1.15,
  } = input;

  const minute = Math.max(1, Math.min(100, elapsedMinute || 1));
  const timeSlice15 = Math.max(1, minute / 15);
  const timeSlice45 = Math.max(0.5, minute / 45);

  // 1. Extract xG or approximate from shot quality if missing
  const homeXG = stats.expectedGoals?.home ?? (stats.shotsOnTarget.home * 0.32 + Math.max(0, stats.shotsTotal.home - stats.shotsOnTarget.home) * 0.06);
  const awayXG = stats.expectedGoals?.away ?? (stats.shotsOnTarget.away * 0.32 + Math.max(0, stats.shotsTotal.away - stats.shotsOnTarget.away) * 0.06);

  // 2. Calculate Offensive Activity Rates
  const homeSoTRate = stats.shotsOnTarget.home / timeSlice15;
  const awaySoTRate = stats.shotsOnTarget.away / timeSlice15;

  const homeShotsRate = stats.shotsTotal.home / timeSlice15;
  const awayShotsRate = stats.shotsTotal.away / timeSlice15;

  const homeCornerRate = stats.corners.home / timeSlice15;
  const awayCornerRate = stats.corners.away / timeSlice15;

  const homeXGRate = homeXG / timeSlice45;
  const awayXGRate = awayXG / timeSlice45;

  const homePossFactor = Math.max(0.4, Math.min(1.6, (stats.possession.home || 50) / 50));
  const awayPossFactor = Math.max(0.4, Math.min(1.6, (stats.possession.away || 50) / 50));

  // Red card penalties / advantages
  const homeRedAdvantage = 1 + (stats.redCards.away * 0.22) - (stats.redCards.home * 0.28);
  const awayRedAdvantage = 1 + (stats.redCards.home * 0.22) - (stats.redCards.away * 0.28);

  // 3. Raw Offensive Power Metric
  const rawPowerHome = Math.max(
    0.1,
    (homeSoTRate * 0.35 + homeCornerRate * 0.20 + homeShotsRate * 0.15 + homeXGRate * 0.30) *
      homePossFactor *
      Math.max(0.2, homeRedAdvantage)
  );

  const rawPowerAway = Math.max(
    0.1,
    (awaySoTRate * 0.35 + awayCornerRate * 0.20 + awayShotsRate * 0.15 + awayXGRate * 0.30) *
      awayPossFactor *
      Math.max(0.2, awayRedAdvantage)
  );

  // Normalize to 0-100 Momentum Scores
  const totalPower = rawPowerHome + rawPowerAway;
  const homeMomentum = Math.round((rawPowerHome / totalPower) * 100);
  const awayMomentum = 100 - homeMomentum;
  const pressureDifferential = homeMomentum - awayMomentum;

  let dominantTeam: 'home' | 'away' | 'balanced' = 'balanced';
  let momentumTrend: 'home_surging' | 'away_surging' | 'neutral' = 'neutral';

  if (pressureDifferential >= 24) {
    dominantTeam = 'home';
    momentumTrend = 'home_surging';
  } else if (pressureDifferential <= -24) {
    dominantTeam = 'away';
    momentumTrend = 'away_surging';
  }

  // 4. In-Play Poisson Remaining Lambda Projection
  const remainingMinutesFraction = Math.max(0.05, (90 - Math.min(88, minute)) / 90);
  
  // Momentum dynamic boost multiplier (0.6x to 1.4x baseline pace)
  const homeMultiplier = 0.5 + (homeMomentum / 100);
  const awayMultiplier = 0.5 + (awayMomentum / 100);

  const lambdaRemainingHome = Number(
    Math.max(0.02, prematchLambdaHome * remainingMinutesFraction * homeMultiplier).toFixed(3)
  );
  const lambdaRemainingAway = Number(
    Math.max(0.02, prematchLambdaAway * remainingMinutesFraction * awayMultiplier).toFixed(3)
  );
  const expectedRemainingGoals = Number((lambdaRemainingHome + lambdaRemainingAway).toFixed(3));

  // Probability of no more goals: e^(-lambda_total_remaining)
  const probZeroRemaining = Math.exp(-expectedRemainingGoals);
  const atLeastOneMoreGoal = Number(Math.max(0, 1 - probZeroRemaining).toFixed(3));

  const homeNextGoal = Number(
    (atLeastOneMoreGoal * (lambdaRemainingHome / expectedRemainingGoals)).toFixed(3)
  );
  const awayNextGoal = Number(
    (atLeastOneMoreGoal * (lambdaRemainingAway / expectedRemainingGoals)).toFixed(3)
  );
  const noMoreGoals = Number(probZeroRemaining.toFixed(3));

  // 5. Intelligent Alert Engine
  const alerts: InPlayAlert[] = [];
  let isHighPressureState = false;

  // Alert 1: Imminent Goal / Offensive Siege (Home or Away)
  if (homeMomentum >= 68 && (homeSoTRate >= 1.2 || homeXG >= 1.2 || stats.corners.home >= 5)) {
    isHighPressureState = true;
    alerts.push({
      id: `alert-imminent-home-${minute}`,
      type: 'imminent_goal',
      severity: 'high',
      team: 'home',
      title: `⚡ Detector Gol Iminent: ${homeTeamName}`,
      description: `${homeTeamName} exercită o presiune masivă (${homeMomentum}% momentum, ${stats.shotsOnTarget.home} șuturi pe poartă, ${stats.corners.home} cornere). Șansă ridicată de gol în următoarele minute.`,
      suggestedMarket: `Următorul Gol: ${homeTeamName} / Over ${(currentScore.home + currentScore.away) + 0.5} Live`,
      confidencePercent: Math.min(88, Math.round(homeMomentum * 0.92)),
    });
  } else if (awayMomentum >= 68 && (awaySoTRate >= 1.2 || awayXG >= 1.2 || stats.corners.away >= 5)) {
    isHighPressureState = true;
    alerts.push({
      id: `alert-imminent-away-${minute}`,
      type: 'imminent_goal',
      severity: 'high',
      team: 'away',
      title: `⚡ Detector Gol Iminent: ${awayTeamName}`,
      description: `${awayTeamName} domină ofensiv terenul (${awayMomentum}% momentum, ${stats.shotsOnTarget.away} șuturi pe poartă). Risc iminent de gol primit de gazde.`,
      suggestedMarket: `Următorul Gol: ${awayTeamName} / Over ${(currentScore.home + currentScore.away) + 0.5} Live`,
      confidencePercent: Math.min(88, Math.round(awayMomentum * 0.92)),
    });
  }

  // Alert 2: Comeback Surge Alert
  if (currentScore.home < currentScore.away && homeMomentum >= 62 && minute >= 45) {
    alerts.push({
      id: `alert-comeback-home-${minute}`,
      type: 'comeback_surge',
      severity: 'medium',
      team: 'home',
      title: `🔥 Reacție & Asediu Egalare: ${homeTeamName}`,
      description: `${homeTeamName} este condusă pe tabelă (${currentScore.home}-${currentScore.away}), dar forțează puternic în atac (${homeMomentum}% presiune).`,
      suggestedMarket: `1X Live / Golul Următor: ${homeTeamName}`,
      confidencePercent: Math.min(82, Math.round(homeMomentum * 0.85)),
    });
  } else if (currentScore.away < currentScore.home && awayMomentum >= 62 && minute >= 45) {
    alerts.push({
      id: `alert-comeback-away-${minute}`,
      type: 'comeback_surge',
      severity: 'medium',
      team: 'away',
      title: `🔥 Reacție & Asediu Egalare: ${awayTeamName}`,
      description: `${awayTeamName} este condusă pe tabelă (${currentScore.home}-${currentScore.away}), dar își concentrează toate liniile în atac.`,
      suggestedMarket: `X2 Live / Golul Următor: ${awayTeamName}`,
      confidencePercent: Math.min(82, Math.round(awayMomentum * 0.85)),
    });
  }

  // Alert 3: Defensive Lock / Slow Pace
  const totalShotsOnTarget = stats.shotsOnTarget.home + stats.shotsOnTarget.away;
  const totalXG = homeXG + awayXG;
  if (minute >= 60 && totalShotsOnTarget <= 3 && totalXG <= 0.9 && Math.abs(pressureDifferential) < 18) {
    alerts.push({
      id: `alert-lock-${minute}`,
      type: 'defensive_lock',
      severity: 'info',
      title: '🛡️ Meci Închis / Blocaj Defensiv',
      description: `Ritm scăzut de joc după minutul ${minute} (${totalShotsOnTarget} șuturi cadrate în total, xG cumulat ${totalXG.toFixed(2)}). Tranzitul la mijlocul terenului este blocat.`,
      suggestedMarket: `Under ${(currentScore.home + currentScore.away) + 1.5} Live / Niciun Gol Următor`,
      confidencePercent: Math.round(noMoreGoals * 100),
    });
  }

  // Alert 4: High Card Tension / Disciplinary Escalation
  const totalFouls = stats.fouls.home + stats.fouls.away;
  const totalYellows = stats.yellowCards.home + stats.yellowCards.away;
  if (totalFouls >= 18 || totalYellows >= 4 || stats.redCards.home > 0 || stats.redCards.away > 0) {
    alerts.push({
      id: `alert-cards-${minute}`,
      type: 'card_tension',
      severity: totalYellows >= 5 || stats.redCards.home + stats.redCards.away > 0 ? 'high' : 'medium',
      title: '⚠️ Tensiune Crescută / Risc Cartonașe',
      description: `Meci agresiv cu ${totalFouls} faulturi și ${totalYellows} avertismente până în min ${minute}. Arbitrajul devine strict.`,
      suggestedMarket: 'Over Cartonașe Live',
      confidencePercent: Math.min(85, 50 + totalYellows * 7 + (stats.redCards.home + stats.redCards.away) * 10),
    });
  }

  // 6. Quantitative In-Play Live Odds Calculation
  const totalScoreNow = (currentScore.home || 0) + (currentScore.away || 0);
  const liveMargin = 1.07; // 7% bookmaker in-play overround

  const homeNextGoalOdd = Number(
    Math.max(1.18, Math.min(12.0, (1 / (Math.max(0.08, homeNextGoal) * liveMargin)))).toFixed(2)
  );
  const awayNextGoalOdd = Number(
    Math.max(1.18, Math.min(12.0, (1 / (Math.max(0.08, awayNextGoal) * liveMargin)))).toFixed(2)
  );
  const noMoreGoalsOdd = Number(
    Math.max(1.15, Math.min(15.0, (1 / (Math.max(0.06, noMoreGoals) * liveMargin)))).toFixed(2)
  );

  // Next Live Over/Under line
  const liveOverLine = totalScoreNow + 0.5;
  const probLiveOver = atLeastOneMoreGoal;

  const liveOverOdd = Number(
    Math.max(1.18, Math.min(9.5, (1 / (Math.max(0.09, probLiveOver) * liveMargin)))).toFixed(2)
  );
  const liveUnderOdd = Number(
    Math.max(1.18, Math.min(9.5, (1 / (Math.max(0.09, noMoreGoals) * liveMargin)))).toFixed(2)
  );

  // Dynamic In-Play Recommended Value Bet
  let recSelection = `Următorul Gol: ${dominantTeam === 'home' ? homeTeamName : dominantTeam === 'away' ? awayTeamName : (homeMomentum >= awayMomentum ? homeTeamName : awayTeamName)}`;
  let recOdd = dominantTeam === 'away' ? awayNextGoalOdd : homeNextGoalOdd;
  let recFairOdd = dominantTeam === 'away' ? Number((1 / Math.max(0.05, awayNextGoal)).toFixed(2)) : Number((1 / Math.max(0.05, homeNextGoal)).toFixed(2));
  let recMarketType = 'NEXT_GOAL';
  let recReasoning = `Presiune ofensivă ${Math.max(homeMomentum, awayMomentum)}% cu tempo ridicat pe poartă.`;
  let recConfidence = Math.min(88, Math.max(55, Math.round(Math.max(homeMomentum, awayMomentum) * 0.9)));

  // If match has a dominant imminent goal alert
  if (homeMomentum >= 68) {
    recSelection = `Următorul Gol: ${homeTeamName}`;
    recOdd = homeNextGoalOdd;
    recFairOdd = Number((1 / Math.max(0.05, homeNextGoal)).toFixed(2));
    recReasoning = `${homeTeamName} asediază careul advers (${homeMomentum}% presiune, ${stats.shotsOnTarget.home} șuturi pe poartă).`;
    recConfidence = Math.min(88, Math.round(homeMomentum * 0.92));
  } else if (awayMomentum >= 68) {
    recSelection = `Următorul Gol: ${awayTeamName}`;
    recOdd = awayNextGoalOdd;
    recFairOdd = Number((1 / Math.max(0.05, awayNextGoal)).toFixed(2));
    recReasoning = `${awayTeamName} domină clar jocul (${awayMomentum}% presiune, ${stats.shotsOnTarget.away} șuturi pe poartă).`;
    recConfidence = Math.min(88, Math.round(awayMomentum * 0.92));
  } else if (minute >= 65 && totalXG <= 0.85 && totalShotsOnTarget <= 3) {
    recSelection = `Sub ${totalScoreNow + 1.5} Goluri Live`;
    recOdd = liveUnderOdd;
    recFairOdd = Number((1 / Math.max(0.05, noMoreGoals)).toFixed(2));
    recMarketType = 'LIVE_OU';
    recReasoning = `Blocaj defensiv și ritm scăzut în min ${minute} (xG total ${totalXG.toFixed(2)}).`;
    recConfidence = Math.min(85, Math.round(noMoreGoals * 100));
  } else if (probLiveOver >= 0.65) {
    recSelection = `Peste ${liveOverLine} Goluri Live`;
    recOdd = liveOverOdd;
    recFairOdd = Number((1 / Math.max(0.05, probLiveOver)).toFixed(2));
    recMarketType = 'LIVE_OU';
    recReasoning = `Meci deschis cu ocazii de ambele părți (probabilitate gol suplimentar ${Math.round(probLiveOver * 100)}%).`;
    recConfidence = Math.round(probLiveOver * 100);
  }

  const recEdge = Math.max(3, Number((((1 / recFairOdd) * recOdd - 1) * 100).toFixed(1)));

  const liveOdds = {
    homeNextGoalOdd,
    awayNextGoalOdd,
    noMoreGoalsOdd,
    liveOverLine,
    liveOverOdd,
    liveUnderOdd,
    recommendedBet: {
      selection: recSelection,
      odd: recOdd,
      fairOdd: recFairOdd,
      marketType: recMarketType,
      reasoning: recReasoning,
      confidencePercent: recConfidence,
      edgePercent: recEdge,
    },
  };

  return {
    homeMomentum,
    awayMomentum,
    dominantTeam,
    momentumTrend,
    pressureDifferential,
    alerts,
    liveNextGoalProbabilities: {
      homeNextGoal,
      awayNextGoal,
      noMoreGoals,
      atLeastOneMoreGoal,
    },
    lambdaRemainingHome,
    lambdaRemainingAway,
    expectedRemainingGoals,
    isHighPressureState,
    liveOdds,
  };
}
