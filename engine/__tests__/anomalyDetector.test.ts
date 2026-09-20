import { describe, it, expect } from 'vitest';
import { AnomalyDetector } from '../anomalyDetector';
import { predictMatchCards } from '../cards';
import type { Fixture, ModelPrediction } from '../../types/football';

describe('AnomalyDetector & Temporal Cards', () => {
  it('computes temporal card intervals and critical window in predictMatchCards', () => {
    const cards = predictMatchCards(undefined, undefined, undefined, 1.3, 3.5, 'Real Madrid', 'Barcelona');
    expect(cards.temporalBreakdown).toBeDefined();
    expect(cards.temporalBreakdown?.period61_90Prob).toBeGreaterThan(0.40);
    expect(cards.derbyIntensityScore).toBeGreaterThan(5.0);
  });

  it('detects HIGH_EDGE and REFEREE_ANOMALY', () => {
    const fixture: Fixture = {
      id: 999,
      date: '2026-09-15T20:00:00Z',
      timestamp: 1789416000,
      status: 'NS',
      league: { id: 39, name: 'Premier League', country: 'England', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', logo: '', season: 2026 },
      homeTeam: { id: 1, name: 'Arsenal', logo: '' },
      awayTeam: { id: 2, name: 'Chelsea', logo: '' },
      score: { halftime: { home: null, away: null }, fulltime: { home: null, away: null }, current: { home: null, away: null } },
      h2h: [],
    };

    const prediction: ModelPrediction = {
      fixtureId: 999,
      calculatedAt: new Date().toISOString(),
      lambdaHome: 2.1,
      lambdaAway: 1.2,
      poissonLambdaHome: 2.1,
      poissonLambdaAway: 1.2,
      eloExpectedHomeWin: 0.55,
      eloExpectedAwayWin: 0.20,
      scoreMatrix: [[0]],
      probabilities1X2: { home: 0.55, draw: 0.25, away: 0.20 },
      overUnderProbabilities: [],
      bttsProbabilities: { yes: 0.58, no: 0.42 },
      topExactScores: [],
      asianHandicap: [],
      cardsPrediction: {
        expectedHomeCards: 2.8,
        expectedAwayCards: 3.2,
        expectedTotalCards: 6.0,
        overUnderCards: [],
        refereeImpactFactor: 1.28,
        h2hRivalryFactor: 1.35,
        distributionType: 'negative_binomial',
        derbyIntensityScore: 8.5,
        temporalBreakdown: {
          period0_30Prob: 0.22,
          period31_60Prob: 0.33,
          period61_90Prob: 0.45,
          criticalMinuteWindow: "75' - 90' (+45% spike)",
          secondHalfOver1_5Prob: 0.78,
          postGoalFrustrationRisk: 'HIGH',
        },
      },
      cornersPrediction: {
        expectedHomeCorners: 5.5,
        expectedAwayCorners: 4.5,
        expectedTotalCorners: 10.0,
        overUnderCorners: [],
        homeTeamOverUnder: [],
        awayTeamOverUnder: [],
        mostLikelyCornerRange: '9-11',
        distributionType: 'bivariate_poisson',
      },
      valueBets: [
        {
          id: 'vb_1',
          fixtureId: 999,
          matchName: 'Arsenal vs Chelsea',
          leagueName: 'Premier League',
          marketType: '1X2',
          selection: 'Arsenal (1)',
          bookmakerOdds: 2.10,
          fairOdds: 1.82,
          modelProb: 0.55,
          marketDeviggedProb: 0.476,
          edgePercent: 15.5,
          kellyFraction: 0.05,
          suggestedStakePercent: 1.5,
          grade: 'A+',
          isCalibratedLeague: true,
        },
      ],
      dixonColesRhoUsed: -0.13,
      isLeagueCalibrated: true,
    };

    const anomalies = AnomalyDetector.detectMatchAnomalies(fixture, prediction);
    expect(anomalies.length).toBeGreaterThanOrEqual(3);

    const types = anomalies.map(a => a.type);
    expect(types).toContain('HIGH_EDGE');
    expect(types).toContain('REFEREE_ANOMALY');
    expect(types).toContain('DERBY_FEVER');
  });
});
