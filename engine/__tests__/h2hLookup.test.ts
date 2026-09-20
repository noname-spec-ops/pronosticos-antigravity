import { describe, it, expect } from 'vitest';
import { apiFootballService } from '../../services/apiFootball';
import { strengthStore } from '../../lib/strengthStore';

describe('H2H Lookup & Team Alias Resolution', () => {
  it('finds direct matches between Manchester City and Arsenal using aliases', () => {
    const direct = apiFootballService.findHistoricalH2H('Manchester City', 'Arsenal');
    expect(direct.length).toBeGreaterThan(0);
    expect(direct[0].homeScore).toBeDefined();
    expect(direct[0].totalCards).toBeGreaterThanOrEqual(0);
  });

  it('finds direct matches between Manchester United and Liverpool', () => {
    const direct = apiFootballService.findHistoricalH2H('Manchester United', 'Liverpool');
    expect(direct.length).toBeGreaterThan(0);
  });

  it('finds direct matches between Real Madrid and Atletico Madrid', () => {
    const direct = apiFootballService.findHistoricalH2H('Real Madrid', 'Atletico Madrid');
    expect(direct.length).toBeGreaterThan(0);
  });

  it('returns empty array cleanly for non-existent fictional teams without errors', () => {
    const direct = apiFootballService.findHistoricalH2H('Fictional Team A', 'Fictional Team B');
    expect(direct).toEqual([]);
  });

  it('computes home and away seasonal averages accurately from historical matches', () => {
    const homeStats = strengthStore.getTeamHomeAwayStats('Manchester City', 'E0', true);
    const awayStats = strengthStore.getTeamHomeAwayStats('Liverpool', 'E0', false);

    expect(homeStats).toBeDefined();
    expect(homeStats?.scoredAvg).toBeGreaterThan(1.0);
    expect(homeStats?.matchesPlayed).toBeGreaterThan(5);
    expect(homeStats?.winPct).toBeGreaterThan(0);

    expect(awayStats).toBeDefined();
    expect(awayStats?.matchesPlayed).toBeGreaterThan(5);
    expect(awayStats?.totalGoalsAvg).toBeGreaterThan(0);
  });

  it('generates authentic probable lineups for premier teams prior to official release', () => {
    const cityLineup = strengthStore.getProbableLineup('Manchester City', 'E0');
    const realLineup = strengthStore.getProbableLineup('Real Madrid', 'SP1');

    expect(cityLineup).toBeDefined();
    expect(cityLineup?.formation).toBe('4-3-3');
    expect(cityLineup?.isConfirmed).toBe(false);
    expect(cityLineup?.startingXI.length).toBe(11);
    expect(cityLineup?.startingXI.some((p) => p.name.includes('Haaland'))).toBe(true);

    expect(realLineup).toBeDefined();
    expect(realLineup?.startingXI.some((p) => p.name.includes('Mbappe'))).toBe(true);
  });

  it('computes authentic standings tables and team ranks from real league matches', () => {
    const tableE0 = strengthStore.getLeagueStandings('E0');
    expect(tableE0.length).toBeGreaterThan(15);
    expect(tableE0[0].rank).toBe(1);
    // The dataset now reaches the in-progress season, so the leader's points
    // reflect however many matchdays have been played rather than a full season.
    const playedByLeader = tableE0[0].played;
    expect(playedByLeader).toBeGreaterThan(0);
    expect(tableE0[0].points).toBeGreaterThan(0);
    expect(tableE0[0].points).toBeLessThanOrEqual(playedByLeader * 3);
    expect(tableE0[0].zone).toBe('champions_league');

    const cityStanding = strengthStore.getTeamStanding('Manchester City', 'E0');
    expect(cityStanding).toBeDefined();
    expect(cityStanding?.rank).toBeGreaterThanOrEqual(1);
    // Same reason: the current season is only a few matchdays old.
    expect(cityStanding?.points).toBeGreaterThanOrEqual(0);
    expect(cityStanding!.points).toBeLessThanOrEqual(cityStanding!.played * 3);
  });

  it('supports European Cups (UCL/UEL) cross-league strength and ELO resolution seamlessly', () => {
    // Cross-league: Real Madrid (SP1) vs Manchester City (E0) in Champions League
    const realMetrics = strengthStore.getTeamMetrics('Real Madrid', 'UCL');
    const cityMetrics = strengthStore.getTeamMetrics('Manchester City', 'UCL');

    expect(realMetrics).toBeDefined();
    expect(cityMetrics).toBeDefined();
    expect(realMetrics?.elo).toBeGreaterThan(1500);
    expect(cityMetrics?.elo).toBeGreaterThan(1500);
    expect(realMetrics?.matchesEvaluated).toBeGreaterThan(20);
    expect(cityMetrics?.matchesEvaluated).toBeGreaterThan(20);
  });
});
