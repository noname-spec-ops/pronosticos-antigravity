import { describe, it, expect } from 'vitest';
import {
  calculateOddsDropPercent,
  classifySteamVelocity,
  calculateProjectedClosingOdd,
  scanSteamAlerts,
} from '../steamTracker';
import type { Fixture } from '@/types/football';

describe('Steam Tracker & Line Movement Engine', () => {
  it('correctly calculates percentage drop', () => {
    expect(calculateOddsDropPercent(2.0, 1.80)).toBe(10.0);
    expect(calculateOddsDropPercent(2.20, 1.98)).toBe(10.0);
    expect(calculateOddsDropPercent(1.50, 1.50)).toBe(0.0);
  });

  it('classifies steam velocity correctly', () => {
    expect(classifySteamVelocity(9.5)).toBe('rapid');
    expect(classifySteamVelocity(6.2)).toBe('moderate');
    expect(classifySteamVelocity(4.1)).toBe('steady');
  });

  it('calculates projected closing odds with damping', () => {
    const projRapid = calculateProjectedClosingOdd(2.0, 9.0);
    expect(projRapid).toBeLessThan(2.0);
    expect(projRapid).toBe(1.92);

    const projModerate = calculateProjectedClosingOdd(2.0, 6.0);
    expect(projModerate).toBe(1.95);
  });

  it('detects steam alerts and Reverse Line Movement in fixture callsets', () => {
    const mockFixture: Fixture = {
      id: 9991,
      date: '2026-09-11T20:00:00Z',
      timestamp: 1789120800,
      status: 'NS',
      league: { id: 39, name: 'Premier League', country: 'England', season: 2026 },
      homeTeam: { id: 33, name: 'Tottenham', logo: 'https://media.api-sports.io/football/teams/33.png' },
      awayTeam: { id: 40, name: 'Liverpool', logo: 'https://media.api-sports.io/football/teams/40.png' },
      score: { current: { home: null, away: null }, halftime: { home: null, away: null }, fulltime: { home: null, away: null } },
      odds: {
        match1X2: { home: 1.85, draw: 3.60, away: 4.10 },
        overUnder: [{ line: 2.5, over: 1.75, under: 2.10 }],
        bookmaker: 'Pinnacle',
        timestamp: '2026-09-11T20:00:00Z',
        btts: { yes: 1.65, no: 2.20 },
        overround: 1.035,
      },
      prediction: {
        lambdaHome: 1.95,
        lambdaAway: 1.10,
        probabilities1X2: { home: 0.62, draw: 0.22, away: 0.16 },
        overUnderProbabilities: [{ line: 2.5, over: 0.64, under: 0.36 }],
        bttsProbabilities: { yes: 0.58, no: 0.42 },
        droppingOddsAnalysis: {
          hasDroppingOdds: true,
          dominantMovement: 'home_steam',
          maxDropPercent: 11.5,
          alerts: [],
          steamSummary: 'Cădere accelerată de cotă pe Tottenham de la 2.10 la 1.85.',
        },
      } as any,
    };

    const alerts = scanSteamAlerts([mockFixture]);
    expect(alerts.length).toBeGreaterThan(0);

    const topAlert = alerts[0];
    expect(topAlert.fixtureId).toBe(9991);
    expect(topAlert.dropPercent).toBe(11.5);
    expect(topAlert.steamVelocity).toBe('rapid');
    expect(topAlert.urgency).toBe('critical');
    expect(topAlert.softBookLag?.laggingBookmakers.length).toBeGreaterThan(0);
  });
});
