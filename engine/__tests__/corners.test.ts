import { describe, it, expect } from 'vitest';
import { predictMatchCorners, projectLiveCorners } from '../corners';

describe('Bivariate Poisson Corners Engine', () => {
  it('calculates expected corners and over/under line probabilities accurately', () => {
    const res = predictMatchCorners({
      homeTeamCornersAvg: 6.5,
      homeTeamCornersConcededAvg: 3.5,
      awayTeamCornersAvg: 4.8,
      awayTeamCornersConcededAvg: 5.8,
    });

    expect(res.expectedHomeCorners).toBeGreaterThan(5.0);
    expect(res.expectedAwayCorners).toBeGreaterThan(3.5);
    expect(res.expectedTotalCorners).toBeCloseTo(res.expectedHomeCorners + res.expectedAwayCorners, 2);

    expect(res.overUnderCorners.length).toBe(7);
    // Over prob should strictly decrease as line increases
    for (let i = 1; i < res.overUnderCorners.length; i++) {
      expect(res.overUnderCorners[i].overProb).toBeLessThanOrEqual(res.overUnderCorners[i - 1].overProb);
      expect(res.overUnderCorners[i].fairOverOdds).toBeGreaterThanOrEqual(res.overUnderCorners[i - 1].fairOverOdds);
    }
  });

  it('generates team-specific lines for home and away', () => {
    const res = predictMatchCorners({
      homeTeamCornersAvg: 7.2,
      awayTeamCornersAvg: 3.8,
    });

    expect(res.homeTeamOverUnder.length).toBe(4); // 3.5, 4.5, 5.5, 6.5
    expect(res.awayTeamOverUnder.length).toBe(4); // 2.5, 3.5, 4.5, 5.5
    expect(res.mostLikelyCornerRange).toContain('Cornere');
  });

  it('projects live in-play corner totals correctly', () => {
    // At minute 60 with 7 corners taken so far (4 home, 3 away), expected prematch 10
    const live = projectLiveCorners(4, 3, 60, 5.5, 4.5);

    expect(live.cornersPacePer10Min).toBeCloseTo(1.17, 1);
    expect(live.projectedTotalCorners).toBeGreaterThanOrEqual(7);
    expect(live.projectedHomeCorners).toBeGreaterThanOrEqual(4);
    expect(live.projectedAwayCorners).toBeGreaterThanOrEqual(3);
  });
});
