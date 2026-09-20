import { describe, it, expect } from 'vitest';
import {
  calculateLeagueTeamStrengths,
  calculateMatchPoissonLambdas,
  type HistoricalMatchRecord,
} from '../teamStrength';

describe('Real xG Integration & Shot-Proxy Fallback', () => {
  const sampleMatchesWithXg: HistoricalMatchRecord[] = [
    {
      id: 1,
      date: '2025-01-10',
      homeTeamId: 10,
      homeTeamName: 'Arsenal',
      awayTeamId: 20,
      awayTeamName: 'Chelsea',
      homeGoals: 1, // Scored only 1 goal
      awayGoals: 0,
      homeShotsOnTarget: 6,
      awayShotsOnTarget: 2,
      homeXg: 2.8,  // But produced 2.80 xG (high creation)
      awayXg: 0.4,
    },
    {
      id: 2,
      date: '2025-01-17',
      homeTeamId: 20,
      homeTeamName: 'Chelsea',
      awayTeamId: 10,
      awayTeamName: 'Arsenal',
      homeGoals: 2,
      awayGoals: 2,
      homeShotsOnTarget: 4,
      awayShotsOnTarget: 5,
      homeXg: 1.1,
      awayXg: 2.4,
    },
  ];

  it('correctly incorporates real xG into team strength calculations', () => {
    const strengths = calculateLeagueTeamStrengths(sampleMatchesWithXg);
    expect(strengths.has(10)).toBe(true);
    expect(strengths.has(20)).toBe(true);

    const arsenal = strengths.get(10)!;
    const chelsea = strengths.get(20)!;

    // Arsenal created high xG (2.8 and 2.4) -> homeAttack and awayAttack should be robust
    expect(arsenal.homeAttack).toBeGreaterThan(0.5);
    expect(arsenal.awayAttack).toBeGreaterThan(0.5);
    expect(chelsea.homeDefense).toBeGreaterThan(0);
  });

  it('calculates valid Poisson lambdas when real xG is present', () => {
    const strengths = calculateLeagueTeamStrengths(sampleMatchesWithXg);
    const arsenal = strengths.get(10)!;
    const chelsea = strengths.get(20)!;

    const { lambdaHome, lambdaAway } = calculateMatchPoissonLambdas(arsenal, chelsea);
    expect(lambdaHome).toBeGreaterThan(0.2);
    expect(lambdaAway).toBeGreaterThan(0.2);
    expect(Number.isFinite(lambdaHome)).toBe(true);
    expect(Number.isFinite(lambdaAway)).toBe(true);
  });

  it('falls back smoothly when xG is undefined or null', () => {
    const matchesNoXg: HistoricalMatchRecord[] = [
      {
        id: 3,
        date: '2025-01-24',
        homeTeamId: 30,
        homeTeamName: 'Liverpool',
        awayTeamId: 40,
        awayTeamName: 'Everton',
        homeGoals: 2,
        awayGoals: 0,
        homeShotsOnTarget: 8,
        awayShotsOnTarget: 1,
      },
    ];

    const strengths = calculateLeagueTeamStrengths(matchesNoXg);
    const liverpool = strengths.get(30)!;
    expect(liverpool).toBeDefined();
    expect(liverpool.homeAttack).toBeGreaterThan(0.5);
  });
});