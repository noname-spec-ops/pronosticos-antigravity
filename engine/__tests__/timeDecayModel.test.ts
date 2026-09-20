import { describe, it, expect } from 'vitest';
import { calculateTimeDecayWeight, computeTeamDecayedRatings } from '../timeDecayModel';

describe('Exponential Time-Decay Model (xi-Decay)', () => {
  it('gives exact half-weight at halfLifeDays', () => {
    const refDate = '2026-06-01';
    const matchDate180d = '2025-12-03'; // ~180 days prior

    const weight = calculateTimeDecayWeight(matchDate180d, refDate, 180);
    expect(weight).toBeCloseTo(0.50, 1);
  });

  it('gives weight ~1.0 for today matches and smaller weight for older matches', () => {
    const refDate = '2026-06-01';
    const weightToday = calculateTimeDecayWeight('2026-06-01', refDate, 180);
    const weight1YearAgo = calculateTimeDecayWeight('2025-06-01', refDate, 180);

    expect(weightToday).toBe(1.0);
    expect(weight1YearAgo).toBeCloseTo(0.25, 1); // 2 half-lives = 0.25
    expect(weightToday).toBeGreaterThan(weight1YearAgo);
  });

  it('computes decayed ratings with Bayesian shrinkage', () => {
    const matches = [
      { date: '2026-05-20', homeTeam: 'Arsenal', awayTeam: 'Chelsea', homeGoals: 3, awayGoals: 0 },
      { date: '2026-05-10', homeTeam: 'Liverpool', awayTeam: 'Arsenal', homeGoals: 1, awayGoals: 2 },
      { date: '2025-05-10', homeTeam: 'Arsenal', awayTeam: 'Spurs', homeGoals: 1, awayGoals: 1 }, // 1 yr ago
    ];

    const ratings = computeTeamDecayedRatings('Arsenal', matches, '2026-06-01', 1.45, 180, 5.0);

    expect(ratings.team).toBe('Arsenal');
    expect(ratings.effectiveMatchesCount).toBeGreaterThan(2.0);
    expect(ratings.weightedAttackScore).toBeGreaterThan(1.0); // Scored heavily recently
  });
});
