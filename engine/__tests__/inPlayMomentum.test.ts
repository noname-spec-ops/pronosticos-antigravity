import { describe, it, expect } from 'vitest';
import { calculateInPlayMomentum } from '../inPlayMomentum';
import type { MatchStats } from '../../types/football';

describe('In-Play Momentum Tracker & Imminent Goal Detector (engine/inPlayMomentum.ts)', () => {
  const mockBalancedStats: MatchStats = {
    possession: { home: 50, away: 50 },
    shotsOnTarget: { home: 3, away: 3 },
    shotsTotal: { home: 7, away: 7 },
    corners: { home: 3, away: 3 },
    fouls: { home: 6, away: 6 },
    yellowCards: { home: 1, away: 1 },
    redCards: { home: 0, away: 0 },
    expectedGoals: { home: 0.85, away: 0.85 },
  };

  it('calculates balanced momentum when teams have identical statistics', () => {
    const result = calculateInPlayMomentum({
      stats: mockBalancedStats,
      elapsedMinute: 55,
      status: '2H',
      currentScore: { home: 1, away: 1 },
      homeTeamName: 'Arsenal',
      awayTeamName: 'Chelsea',
    });

    expect(result.homeMomentum).toBe(50);
    expect(result.awayMomentum).toBe(50);
    expect(result.dominantTeam).toBe('balanced');
    expect(result.pressureDifferential).toBe(0);
  });

  it('detects high home dominance and triggers imminent goal alert', () => {
    const dominantHomeStats: MatchStats = {
      possession: { home: 68, away: 32 },
      shotsOnTarget: { home: 8, away: 1 },
      shotsTotal: { home: 18, away: 3 },
      corners: { home: 9, away: 1 },
      fouls: { home: 4, away: 12 },
      yellowCards: { home: 0, away: 3 },
      redCards: { home: 0, away: 0 },
      expectedGoals: { home: 2.45, away: 0.20 },
    };

    const result = calculateInPlayMomentum({
      stats: dominantHomeStats,
      elapsedMinute: 65,
      status: '2H',
      currentScore: { home: 0, away: 0 },
      homeTeamName: 'Manchester City',
      awayTeamName: 'Everton',
      prematchLambdaHome: 2.2,
      prematchLambdaAway: 0.6,
    });

    expect(result.homeMomentum).toBeGreaterThan(70);
    expect(result.dominantTeam).toBe('home');
    expect(result.momentumTrend).toBe('home_surging');
    expect(result.isHighPressureState).toBe(true);

    const imminentAlert = result.alerts.find((a) => a.type === 'imminent_goal');
    expect(imminentAlert).toBeDefined();
    expect(imminentAlert?.team).toBe('home');
    expect(imminentAlert?.severity).toBe('high');
    expect(imminentAlert?.confidencePercent).toBeGreaterThan(65);
  });

  it('adjusts momentum for red cards correctly', () => {
    const redCardStats: MatchStats = {
      possession: { home: 55, away: 45 },
      shotsOnTarget: { home: 4, away: 3 },
      shotsTotal: { home: 9, away: 7 },
      corners: { home: 4, away: 3 },
      fouls: { home: 8, away: 14 },
      yellowCards: { home: 1, away: 3 },
      redCards: { home: 0, away: 1 }, // Away has a red card
      expectedGoals: { home: 1.1, away: 0.7 },
    };

    const result = calculateInPlayMomentum({
      stats: redCardStats,
      elapsedMinute: 50,
      status: '2H',
      currentScore: { home: 1, away: 1 },
    });

    expect(result.homeMomentum).toBeGreaterThan(55);
    expect(result.alerts.some((a) => a.type === 'card_tension')).toBe(true);
  });

  it('detects defensive lock / low pace when shots and xG are low late in the match', () => {
    const lowPaceStats: MatchStats = {
      possession: { home: 51, away: 49 },
      shotsOnTarget: { home: 1, away: 1 },
      shotsTotal: { home: 4, away: 3 },
      corners: { home: 2, away: 1 },
      fouls: { home: 7, away: 8 },
      yellowCards: { home: 1, away: 0 },
      redCards: { home: 0, away: 0 },
      expectedGoals: { home: 0.25, away: 0.20 },
    };

    const result = calculateInPlayMomentum({
      stats: lowPaceStats,
      elapsedMinute: 75,
      status: '2H',
      currentScore: { home: 0, away: 0 },
    });

    const lockAlert = result.alerts.find((a) => a.type === 'defensive_lock');
    expect(lockAlert).toBeDefined();
    expect(lockAlert?.suggestedMarket).toContain('Under');
  });

  it('computes valid remaining Poisson goal probabilities summing consistently', () => {
    const result = calculateInPlayMomentum({
      stats: mockBalancedStats,
      elapsedMinute: 70,
      status: '2H',
      currentScore: { home: 2, away: 1 },
      prematchLambdaHome: 1.6,
      prematchLambdaAway: 1.2,
    });

    const { homeNextGoal, awayNextGoal, noMoreGoals, atLeastOneMoreGoal } = result.liveNextGoalProbabilities;

    expect(noMoreGoals).toBeGreaterThan(0);
    expect(noMoreGoals).toBeLessThan(1);
    expect(atLeastOneMoreGoal).toBeCloseTo(1 - noMoreGoals, 2);
    expect(homeNextGoal + awayNextGoal).toBeCloseTo(atLeastOneMoreGoal, 2);
    expect(result.expectedRemainingGoals).toBeGreaterThan(0);
  });

  it('calculates dynamic and non-identical in-play live odds and recommended bets', () => {
    const attackingHomeStats: MatchStats = {
      possession: { home: 62, away: 38 },
      shotsOnTarget: { home: 7, away: 2 },
      shotsTotal: { home: 14, away: 5 },
      corners: { home: 8, away: 2 },
      fouls: { home: 7, away: 11 },
      yellowCards: { home: 1, away: 2 },
      redCards: { home: 0, away: 0 },
      expectedGoals: { home: 2.1, away: 0.5 },
    };

    const result = calculateInPlayMomentum({
      stats: attackingHomeStats,
      elapsedMinute: 68,
      status: '2H',
      currentScore: { home: 2, away: 1 },
      homeTeamName: 'Manchester City',
      awayTeamName: 'Arsenal',
    });

    expect(result.liveOdds).toBeDefined();
    expect(result.liveOdds?.homeNextGoalOdd).toBeGreaterThan(1.15);
    expect(result.liveOdds?.awayNextGoalOdd).toBeGreaterThan(result.liveOdds!.homeNextGoalOdd); // Away is underdog
    expect(result.liveOdds?.liveOverLine).toBe(3.5); // 2+1 + 0.5 = 3.5
    expect(result.liveOdds?.recommendedBet.selection).toContain('Manchester City');
    expect(result.liveOdds?.recommendedBet.odd).toBe(result.liveOdds?.homeNextGoalOdd);
    expect(result.liveOdds?.recommendedBet.edgePercent).toBeGreaterThan(0);
  });
});
