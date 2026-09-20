/**
 * FlashStat - Exponential Time-Decay Model (engine/timeDecayModel.ts)
 * 
 * Implements Dixon-Coles exponential time-decay weighting:
 * w(t) = exp(-xi * Delta_t)
 * 
 * Ensures that recent form (last 30-90 days) carries higher statistical weight
 * while maintaining asymptotic stability through prior shrinkage.
 */

export interface HistoricalMatchEntry {
  date: string; // ISO date string (YYYY-MM-DD)
  homeTeam: string;
  awayTeam: string;
  homeGoals: number;
  awayGoals: number;
}

export interface TeamDecayedStats {
  team: string;
  effectiveMatchesCount: number; // sum of weights
  weightedAttackScore: number;
  weightedDefenseScore: number;
  decayedLambdaHome: number;
  decayedLambdaAway: number;
}

/**
 * Calculates exponential decay weight for a past match
 * @param matchDate Date of historical match
 * @param referenceDate Current evaluation date
 * @param halfLifeDays Half-life in days (default: 180 days)
 */
export function calculateTimeDecayWeight(
  matchDate: string,
  referenceDate: string,
  halfLifeDays: number = 180
): number {
  const dMatch = new Date(matchDate).getTime();
  const dRef = new Date(referenceDate).getTime();

  if (isNaN(dMatch) || isNaN(dRef)) return 1.0;

  const diffDays = Math.max(0, (dRef - dMatch) / (1000 * 60 * 60 * 24));
  const xi = Math.LN2 / halfLifeDays; // ~0.00385 for 180 days

  return Math.exp(-xi * diffDays);
}

/**
 * Computes time-decay weighted attack and defense ratings for a team
 */
export function computeTeamDecayedRatings(
  teamName: string,
  matches: HistoricalMatchEntry[],
  referenceDate: string,
  leagueAvgGoalsPerMatch: number = 1.45,
  halfLifeDays: number = 180,
  priorWeight: number = 5.0
): TeamDecayedStats {
  let sumWeight = 0;
  let sumWeightedScored = 0;
  let sumWeightedConceded = 0;

  for (const m of matches) {
    if (m.homeTeam !== teamName && m.awayTeam !== teamName) continue;

    const w = calculateTimeDecayWeight(m.date, referenceDate, halfLifeDays);
    const scored = m.homeTeam === teamName ? m.homeGoals : m.awayGoals;
    const conceded = m.homeTeam === teamName ? m.awayGoals : m.homeGoals;

    sumWeight += w;
    sumWeightedScored += w * scored;
    sumWeightedConceded += w * conceded;
  }

  if (sumWeight === 0) {
    return {
      team: teamName,
      effectiveMatchesCount: 0,
      weightedAttackScore: 1.0,
      weightedDefenseScore: 1.0,
      decayedLambdaHome: leagueAvgGoalsPerMatch,
      decayedLambdaAway: leagueAvgGoalsPerMatch,
    };
  }

  const rawAttackAvg = sumWeightedScored / sumWeight;
  const rawDefenseAvg = sumWeightedConceded / sumWeight;

  // Bayesian shrinkage toward league average
  const shrinkFactor = sumWeight / (sumWeight + priorWeight);
  const shrunkAttack = shrinkFactor * rawAttackAvg + (1 - shrinkFactor) * leagueAvgGoalsPerMatch;
  const shrunkDefense = shrinkFactor * rawDefenseAvg + (1 - shrinkFactor) * leagueAvgGoalsPerMatch;

  const attackRatio = shrunkAttack / leagueAvgGoalsPerMatch;
  const defenseRatio = shrunkDefense / leagueAvgGoalsPerMatch;

  return {
    team: teamName,
    effectiveMatchesCount: Number(sumWeight.toFixed(2)),
    weightedAttackScore: Number(attackRatio.toFixed(3)),
    weightedDefenseScore: Number(defenseRatio.toFixed(3)),
    decayedLambdaHome: Number(shrunkAttack.toFixed(3)),
    decayedLambdaAway: Number(shrunkDefense.toFixed(3)),
  };
}
