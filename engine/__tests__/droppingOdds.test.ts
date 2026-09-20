import { describe, it, expect } from 'vitest';
import { analyzeDroppingOdds } from '../droppingOdds';
import { runMatchPredictionPipeline } from '../index';
import type { Fixture } from '../../types/football';

describe('Dropping Odds & Smart Money Inflow Radar', () => {
  it('detects sharp steam moves and large odds drops on 1X2 market', () => {
    const res = analyzeDroppingOdds({
      homeTeamName: 'Arsenal',
      awayTeamName: 'Chelsea',
      odds: {
        bookmaker: 'Betfair',
        timestamp: '2026-09-11T12:00:00Z',
        overround: 1.04,
        match1X2: { home: 1.75, draw: 3.70, away: 4.80 },
        opening1X2: { home: 2.10, draw: 3.50, away: 3.40 },
        overUnder: [{ line: 2.5, over: 1.80, under: 2.05 }],
        btts: { yes: 1.75, no: 2.05 },
      },
    });

    expect(res.hasDroppingOdds).toBe(true);
    expect(res.dominantMovement).toBe('home_steam');
    expect(res.maxDropPercent).toBeGreaterThanOrEqual(16);

    const homeAlert = res.alerts.find((a) => a.id === 'drop-1x2-home');
    expect(homeAlert).toBeDefined();
    expect(homeAlert?.severity).toBe('extreme');
    expect(homeAlert?.signalType).toBe('sharp_steam');

    const awayAlert = res.alerts.find((a) => a.id === 'drop-1x2-away');
    expect(awayAlert).toBeDefined();
    expect(awayAlert?.severity).toBe('drift');
  });

  it('detects market steam on Over 2.5 goals and BTTS', () => {
    const res = analyzeDroppingOdds({
      homeTeamName: 'Real Madrid',
      awayTeamName: 'Barcelona',
      odds: {
        bookmaker: 'Pinnacle',
        timestamp: '2026-09-11T12:00:00Z',
        overround: 1.02,
        match1X2: { home: 2.20, draw: 3.50, away: 3.10 },
        opening1X2: { home: 2.20, draw: 3.50, away: 3.10 },
        overUnder: [{ line: 2.5, over: 1.62, under: 2.30 }],
        openingOverUnder: [{ line: 2.5, over: 1.95, under: 1.88 }],
        btts: { yes: 1.55, no: 2.45 },
        openingBtts: { yes: 1.75, no: 2.05 },
      },
    });

    expect(res.hasDroppingOdds).toBe(true);
    expect(res.dominantMovement).toBe('over_steam');

    const overAlert = res.alerts.find((a) => a.id === 'drop-ou-over25');
    expect(overAlert).toBeDefined();
    expect(overAlert?.changePercent).toBeLessThan(-15);

    const bttsAlert = res.alerts.find((a) => a.id === 'drop-btts-yes');
    expect(bttsAlert).toBeDefined();
    expect(bttsAlert?.severity).toBe('high');
  });

  it('integrates cleanly into prediction pipeline with dropping odds metadata', () => {
    const mockFixture: Fixture = {
      id: 8801,
      date: '2026-09-11T20:00:00Z',
      timestamp: 1789128000,
      status: 'NS',
      league: { id: 39, name: 'Premier League', country: 'England', season: 2026 },
      homeTeam: { id: 42, name: 'Liverpool', logo: '' },
      awayTeam: { id: 47, name: 'Everton', logo: '' },
      score: { halftime: { home: null, away: null }, fulltime: { home: null, away: null }, current: { home: null, away: null } },
      odds: {
        bookmaker: 'Betfair',
        timestamp: '2026-09-11T12:00:00Z',
        overround: 1.04,
        match1X2: { home: 1.45, draw: 4.50, away: 7.20 },
        opening1X2: { home: 1.68, draw: 4.00, away: 5.20 },
        overUnder: [{ line: 2.5, over: 1.65, under: 2.25 }],
        btts: { yes: 1.80, no: 2.00 },
      },
    };

    const pred = runMatchPredictionPipeline({
      fixture: mockFixture,
      homeStrength: {
        teamId: 42,
        teamName: 'Liverpool',
        matchesEvaluated: 20,
        homeAttack: 1.5,
        homeDefense: 0.8,
        awayAttack: 1.3,
        awayDefense: 0.9,
        leagueAvgGoalsHome: 1.5,
        leagueAvgGoalsAway: 1.2,
        isShrinkageApplied: false,
        homeAdvantageIndex: 1.0,
      },
      awayStrength: {
        teamId: 47,
        teamName: 'Everton',
        matchesEvaluated: 20,
        homeAttack: 1.0,
        homeDefense: 1.2,
        awayAttack: 0.9,
        awayDefense: 1.3,
        leagueAvgGoalsHome: 1.5,
        leagueAvgGoalsAway: 1.2,
        isShrinkageApplied: false,
        homeAdvantageIndex: 1.0,
      },
    });

    expect(pred.droppingOddsAnalysis).toBeDefined();
    expect(pred.droppingOddsAnalysis?.hasDroppingOdds).toBe(true);
    expect(pred.droppingOddsAnalysis?.dominantMovement).toBe('home_steam');
  });
});
