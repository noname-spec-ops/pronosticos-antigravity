import { describe, it, expect, beforeAll } from 'vitest';
import { statsDatabase } from '../../lib/database/statsDatabase';

describe('Football Statistics Database Engine (lib/database/statsDatabase.ts)', () => {
  beforeAll(() => {
    statsDatabase.initialize();
  });

  it('retrieves accurate deep statistical breakdown for top clubs', () => {
    const cityStats = statsDatabase.getTeamDeepStats('Man City', 'E0');
    expect(cityStats).not.toBeNull();
    if (cityStats) {
      expect(cityStats.totalMatches).toBeGreaterThan(100);
      expect(cityStats.halfTimeBreakdown.goalsScored1H).toBeGreaterThan(0);
      expect(cityStats.halfTimeBreakdown.goalsScored2H).toBeGreaterThan(0);
      expect(cityStats.halfTimeBreakdown.pctGoalsScored1H + cityStats.halfTimeBreakdown.pctGoalsScored2H).toBeCloseTo(100, 0);
      expect(cityStats.homeStats.winPct).toBeGreaterThan(50);
      expect(cityStats.cornerStats.cornersWonAvg).toBeGreaterThan(0);
      expect(cityStats.shotEfficiency.conversionRatePct).toBeGreaterThan(0);
    }
  });

  it('computes authentic H2H tactical insights between historic rivals', () => {
    const h2h = statsDatabase.getH2HTacticalAnalysis('Man City', 'Arsenal');
    expect(h2h).not.toBeNull();
    if (h2h) {
      expect(h2h.matchesCount).toBeGreaterThan(5);
      expect(h2h.avgGoals).toBeGreaterThan(0);
      expect(h2h.recentMeetings.length).toBeGreaterThan(0);
      expect(h2h.tacticalInsights.length).toBeGreaterThan(0);
    }
  });

  it('returns null gracefully for non-existent teams', () => {
    const fake = statsDatabase.getTeamDeepStats('Fake Nonexistent FC 9999');
    expect(fake).toBeNull();

    const fakeH2H = statsDatabase.getH2HTacticalAnalysis('Fake A', 'Fake B');
    expect(fakeH2H).toBeNull();
  });
});
