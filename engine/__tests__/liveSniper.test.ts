import { describe, it, expect } from 'vitest';
import { scanLiveSniperOpportunities } from '../liveSniper';
import type { Fixture } from '../../types/football';

describe('Quantitative Live Sniper Engine (engine/liveSniper.ts)', () => {
  const mockLiveFixtures: Fixture[] = [
    {
      id: 201,
      date: '2026-09-12T16:00:00Z',
      timestamp: 1789130000,
      status: '2H',
      elapsedMinute: 68,
      league: { id: 39, name: 'Premier League', country: 'Anglia', season: 2026 },
      homeTeam: { id: 1, name: 'Manchester City', logo: '' },
      awayTeam: { id: 2, name: 'Arsenal', logo: '' },
      score: { halftime: { home: 0, away: 1 }, fulltime: { home: null, away: null }, current: { home: 0, away: 1 } },
      stats: {
        possession: { home: 68, away: 32 },
        shotsOnTarget: { home: 8, away: 2 },
        shotsTotal: { home: 18, away: 4 },
        corners: { home: 9, away: 1 },
        fouls: { home: 5, away: 11 },
        yellowCards: { home: 1, away: 3 },
        redCards: { home: 0, away: 0 },
        expectedGoals: { home: 2.35, away: 0.60 },
      },
    },
    {
      id: 202,
      date: '2026-09-12T16:30:00Z',
      timestamp: 1789131000,
      status: 'NS', // Not started match
      elapsedMinute: 0,
      league: { id: 140, name: 'La Liga', country: 'Spania', season: 2026 },
      homeTeam: { id: 3, name: 'Real Madrid', logo: '' },
      awayTeam: { id: 4, name: 'Barcelona', logo: '' },
      score: { halftime: { home: null, away: null }, fulltime: { home: null, away: null }, current: { home: 0, away: 0 } },
    },
  ];

  it('detects extreme live sniper opportunity when dominant team is trailing late', () => {
    const scan = scanLiveSniperOpportunities(mockLiveFixtures);

    expect(scan.liveMatchesEvaluated).toBe(1);
    expect(scan.snipeOpportunitiesCount).toBe(1);

    const opp = scan.opportunities[0];
    expect(opp.fixtureId).toBe(201);
    expect(opp.dominantTeam).toBe('Manchester City');
    expect(opp.recommendedBet).toContain('Manchester City');
    expect(opp.urgency).toBe('EXTREME');
    expect(opp.edgePercent).toBeGreaterThanOrEqual(18);
    expect(opp.confidenceScore).toBeGreaterThanOrEqual(70);
  });
});
