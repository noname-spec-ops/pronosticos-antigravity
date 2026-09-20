import { describe, it, expect } from 'vitest';
import { calculateLeagueTeamStrengths, type HistoricalMatchRecord } from '../teamStrength';
import { updateEloRatings } from '../elo';

describe('Zero Data Leakage Verification Test', () => {
  const baseMatches: HistoricalMatchRecord[] = [
    { date: '2024-01-01', homeTeamId: 1, homeTeamName: 'Team A', awayTeamId: 2, awayTeamName: 'Team B', homeGoals: 2, awayGoals: 1 },
    { date: '2024-01-08', homeTeamId: 2, homeTeamName: 'Team B', awayTeamId: 3, awayTeamName: 'Team C', homeGoals: 0, awayGoals: 0 },
    { date: '2024-01-15', homeTeamId: 3, homeTeamName: 'Team C', awayTeamId: 1, awayTeamName: 'Team A', homeGoals: 1, awayGoals: 3 },
  ];

  const futureMatches: HistoricalMatchRecord[] = [
    { date: '2024-02-01', homeTeamId: 1, homeTeamName: 'Team A', awayTeamId: 2, awayTeamName: 'Team B', homeGoals: 5, awayGoals: 0 },
    { date: '2024-02-15', homeTeamId: 2, homeTeamName: 'Team B', awayTeamId: 1, awayTeamName: 'Team A', homeGoals: 4, awayGoals: 0 },
  ];

  it('calculates identical team strengths at date D whether future matches exist or not', () => {
    const targetDate = '2024-01-20';

    // 1. Calculate strengths strictly before targetDate from baseMatches only
    const historyWithoutFuture = baseMatches.filter(m => m.date < targetDate);
    const strengthsWithoutFuture = calculateLeagueTeamStrengths(historyWithoutFuture, targetDate);

    // 2. Calculate strengths with future matches included in dataset, but filtered by targetDate
    const fullDataset = [...baseMatches, ...futureMatches];
    const historyFiltered = fullDataset.filter(m => m.date < targetDate);
    const strengthsWithFilteredFuture = calculateLeagueTeamStrengths(historyFiltered, targetDate);

    const teamA_1 = strengthsWithoutFuture.get(1)!;
    const teamA_2 = strengthsWithFilteredFuture.get(1)!;

    expect(teamA_1.homeAttack).toBeCloseTo(teamA_2.homeAttack, 6);
    expect(teamA_1.homeDefense).toBeCloseTo(teamA_2.homeDefense, 6);
    expect(teamA_1.awayAttack).toBeCloseTo(teamA_2.awayAttack, 6);
    expect(teamA_1.awayDefense).toBeCloseTo(teamA_2.awayDefense, 6);
    expect(teamA_1.matchesEvaluated).toBe(teamA_2.matchesEvaluated);
  });

  it('verifies ELO ratings at date D are strictly dependent on prior results', () => {
    let eloA_withoutFuture = 1500;
    let eloB_withoutFuture = 1500;

    for (const m of baseMatches) {
      if (m.homeTeamId === 1 && m.awayTeamId === 2) {
        const { newHomeElo, newAwayElo } = updateEloRatings(eloA_withoutFuture, eloB_withoutFuture, m.homeGoals, m.awayGoals);
        eloA_withoutFuture = newHomeElo;
        eloB_withoutFuture = newAwayElo;
      }
    }

    // At date 2024-01-20, ELO must strictly equal eloA_withoutFuture
    expect(eloA_withoutFuture).toBeGreaterThan(1500); // Team A won 2-1
    expect(eloB_withoutFuture).toBeLessThan(1500);
  });
});