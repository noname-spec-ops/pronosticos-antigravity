import { describe, it, expect } from 'vitest';
import { calculateMatchMotivation } from '../motivationEngine';
import { runMatchPredictionPipeline } from '../index';
import type { Fixture } from '../../types/football';

describe('Match Motivation & Stakes Engine', () => {
  it('detects famous derbies and rivalries correctly', () => {
    const northLondon = calculateMatchMotivation({
      homeTeamName: 'Arsenal FC',
      awayTeamName: 'Tottenham Hotspur',
      leagueName: 'Premier League',
    });

    expect(northLondon.isDerby).toBe(true);
    expect(northLondon.derbyName).toBe('North London Derby');
    expect(northLondon.homeMotivationScore).toBeGreaterThanOrEqual(85);

    const clasico = calculateMatchMotivation({
      homeTeamName: 'Real Madrid',
      awayTeamName: 'FC Barcelona',
      leagueName: 'La Liga',
    });

    expect(clasico.isDerby).toBe(true);
    expect(clasico.derbyName).toBe('El Clásico');

    const romaniaDerby = calculateMatchMotivation({
      homeTeamName: 'FCSB',
      awayTeamName: 'Dinamo Bucuresti',
      leagueName: 'Superliga Romania',
    });

    expect(romaniaDerby.isDerby).toBe(true);
    expect(romaniaDerby.derbyName).toBe('Marele Derby al României');
  });

  it('determines title race and relegation stakes based on standings', () => {
    const titleMatch = calculateMatchMotivation({
      homeTeamName: 'Manchester City',
      awayTeamName: 'Sheffield United',
      leagueName: 'Premier League',
      standingHome: { rank: 1, totalTeams: 20, points: 75, played: 30, won: 24, drawn: 3, lost: 3, goalDifference: 50, zone: 'champions_league' },
      standingAway: { rank: 20, totalTeams: 20, points: 15, played: 30, won: 3, drawn: 6, lost: 21, goalDifference: -45, zone: 'relegation' },
    });

    expect(titleMatch.homeStakesType).toBe('title_race');
    expect(titleMatch.awayStakesType).toBe('relegation_battle');
    expect(titleMatch.urgencyLevelAway).toBe('extreme');
    expect(titleMatch.homeMotivationMultiplier).toBeGreaterThan(1.0);
    expect(titleMatch.newsItems.length).toBeGreaterThanOrEqual(3);
  });

  it('generates structured news feed with tactical and psychological insights', () => {
    const res = calculateMatchMotivation({
      homeTeamName: 'Inter Milan',
      awayTeamName: 'AC Milan',
      leagueName: 'Serie A',
      standingHome: { rank: 2, totalTeams: 20, points: 68, played: 28, won: 21, drawn: 5, lost: 2, goalDifference: 40, zone: 'champions_league' },
      standingAway: { rank: 3, totalTeams: 20, points: 64, played: 28, won: 20, drawn: 4, lost: 4, goalDifference: 30, zone: 'champions_league' },
      formHome: {
        teamName: 'Inter',
        formSequence: ['W', 'W', 'W', 'W', 'D'],
        points: 13,
        goalsScored: 11,
        goalsConceded: 2,
        cleanSheets: 3,
        failedToScore: 0,
        over25Count: 3,
        bttsCount: 2,
        lastMatches: [],
      },
    });

    expect(res.isDerby).toBe(true);
    expect(res.newsItems.some((n) => n.type === 'derby')).toBe(true);
    expect(res.newsItems.some((n) => n.type === 'stakes')).toBe(true);
    expect(res.newsItems.some((n) => n.type === 'morale')).toBe(true);
  });

  it('integrates cleanly into master engine prediction pipeline', () => {
    const mockFixture: Fixture = {
      id: 9901,
      date: '2026-09-11T19:00:00Z',
      timestamp: 1789124400,
      status: 'NS',
      league: { id: 39, name: 'Premier League', country: 'England', season: 2026 },
      homeTeam: { id: 42, name: 'Arsenal', logo: '' },
      awayTeam: { id: 47, name: 'Tottenham', logo: '' },
      score: { halftime: { home: null, away: null }, fulltime: { home: null, away: null }, current: { home: null, away: null } },
      odds: {
        bookmaker: 'Betfair',
        timestamp: '2026-09-11T12:00:00Z',
        overround: 1.04,
        match1X2: { home: 1.95, draw: 3.60, away: 3.90 },
        overUnder: [{ line: 2.5, over: 1.80, under: 2.05 }],
        btts: { yes: 1.70, no: 2.10 },
      },
    };

    const pred = runMatchPredictionPipeline({
      fixture: mockFixture,
      homeStrength: {
        teamId: 42,
        teamName: 'Arsenal',
        matchesEvaluated: 20,
        homeAttack: 1.45,
        homeDefense: 0.85,
        awayAttack: 1.2,
        awayDefense: 0.9,
        leagueAvgGoalsHome: 1.5,
        leagueAvgGoalsAway: 1.2,
        isShrinkageApplied: false,
        homeAdvantageIndex: 1.0,
      },
      awayStrength: {
        teamId: 47,
        teamName: 'Tottenham',
        matchesEvaluated: 20,
        homeAttack: 1.3,
        homeDefense: 1.1,
        awayAttack: 1.25,
        awayDefense: 1.05,
        leagueAvgGoalsHome: 1.5,
        leagueAvgGoalsAway: 1.2,
        isShrinkageApplied: false,
        homeAdvantageIndex: 1.0,
      },
      homeElo: 1780,
      awayElo: 1680,
    });

    expect(pred.motivationAnalysis).toBeDefined();
    expect(pred.motivationAnalysis?.isDerby).toBe(true);
    expect(pred.motivationAnalysis?.derbyName).toBe('North London Derby');
    expect(pred.cardsPrediction.refereeImpactFactor).toBeGreaterThan(0);
  });
});
