import { describe, it, expect } from 'vitest';
import {
  calculateTimeDecayWeight,
  applyBayesianShrinkage,
  calculateLeagueTeamStrengths,
  calculateMatchPoissonLambdas,
  type HistoricalMatchRecord,
} from '../teamStrength';

describe('Team Strength & Attack/Defense Calculation', () => {
  it('computes exponential time-decay weight properly', () => {
    const today = new Date('2026-03-01');
    const sameDay = new Date('2026-03-01');
    const halfLifeAgo = new Date('2025-09-02'); // ~180 days prior

    const w0 = calculateTimeDecayWeight(sameDay, today, 180);
    const wHalf = calculateTimeDecayWeight(halfLifeAgo, today, 180);

    expect(w0).toBeCloseTo(1.0, 4);
    expect(wHalf).toBeCloseTo(0.5, 2);
  });

  it('applies Bayesian shrinkage towards 1.0 for small match samples', () => {
    const rawHighAttack = 1.8; // e.g. a newly promoted team had 2 crazy high scoring games
    const shrunk3Matches = applyBayesianShrinkage(rawHighAttack, 3, 15);
    const shrunk10Matches = applyBayesianShrinkage(rawHighAttack, 10, 15);
    const unshrunk20Matches = applyBayesianShrinkage(rawHighAttack, 20, 15);

    expect(shrunk3Matches).toBeLessThan(rawHighAttack);
    expect(shrunk3Matches).toBeGreaterThan(1.0);
    expect(shrunk10Matches).toBeGreaterThan(shrunk3Matches);
    expect(unshrunk20Matches).toBe(rawHighAttack);
  });

  it('aggregates league match records into normalized team metrics', () => {
    const matches: HistoricalMatchRecord[] = [
      { date: '2026-02-01', homeTeamId: 1, awayTeamId: 2, homeGoals: 3, awayGoals: 0 },
      { date: '2026-02-05', homeTeamId: 2, awayTeamId: 1, homeGoals: 1, awayGoals: 2 },
      { date: '2026-02-10', homeTeamId: 1, awayTeamId: 3, homeGoals: 2, awayGoals: 1 },
      { date: '2026-02-15', homeTeamId: 3, awayTeamId: 2, homeGoals: 1, awayGoals: 1 },
    ];

    const teamStrengths = calculateLeagueTeamStrengths(matches, new Date('2026-03-01'));

    expect(teamStrengths.has(1)).toBe(true);
    expect(teamStrengths.has(2)).toBe(true);
    expect(teamStrengths.has(3)).toBe(true);

    const team1 = teamStrengths.get(1)!;
    expect(team1.homeAttack).toBeGreaterThan(1.0); // Scored 3 and 2 at home
  });

  it('calculates match Poisson lambdas based on attack/defense', () => {
    const homeTeam = {
      teamId: 1,
      teamName: 'Team Alpha',
      matchesEvaluated: 20,
      homeAttack: 1.3,
      homeDefense: 0.8,
      awayAttack: 1.1,
      awayDefense: 0.9,
      leagueAvgGoalsHome: 1.5,
      leagueAvgGoalsAway: 1.2,
      isShrinkageApplied: false,
      homeAdvantageIndex: 1.0,
    };

    const awayTeam = {
      teamId: 2,
      teamName: 'Team Beta',
      matchesEvaluated: 20,
      homeAttack: 1.0,
      homeDefense: 1.1,
      awayAttack: 0.9,
      awayDefense: 1.2,
      leagueAvgGoalsHome: 1.5,
      leagueAvgGoalsAway: 1.2,
      isShrinkageApplied: false,
      homeAdvantageIndex: 1.0,
    };

    const { lambdaHome, lambdaAway } = calculateMatchPoissonLambdas(homeTeam, awayTeam);

    // lambdaHome = 1.3 * 1.2 * 1.5 = 2.34
    // lambdaAway = 0.9 * 0.8 * 1.2 = 0.864
    expect(lambdaHome).toBeCloseTo(2.34, 2);
    expect(lambdaAway).toBeCloseTo(0.864, 2);
  });
});
