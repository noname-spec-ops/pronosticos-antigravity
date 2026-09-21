import { describe, it, expect } from 'vitest';
import {
  getAllMarketCandidates,
  getHighestProbabilityPick,
  getBestBalancedPick,
  getTopExactScoresForFixture,
} from '../marketEvaluator';
import { generateRawPoissonMatrix } from '../poisson';
import type { Fixture } from '../../types/football';

describe('Multi-Market Evaluator & Highest-Probability Selector', () => {
  const dummyMatrix = generateRawPoissonMatrix(1.8, 0.9);

  const mockFixture: Fixture = {
    id: 1001,
    date: '2026-09-21T18:00:00.000Z',
    timestamp: 1789400000,
    status: 'NS',
    league: {
      id: 78, // Bundesliga
      name: 'Bundesliga',
      country: 'Germania',
      season: 2026,
    },
    homeTeam: { id: 10, name: 'Bayern Munich', logo: '' },
    awayTeam: { id: 20, name: 'Borussia Dortmund', logo: '' },
    score: {
      halftime: { home: null, away: null },
      fulltime: { home: null, away: null },
      current: { home: null, away: null },
    },
    odds: {
      bookmaker: 'Pinnacle',
      timestamp: '2026-09-21T10:00:00Z',
      match1X2: { home: 1.65, draw: 4.20, away: 4.90 },
      overUnder: [
        { line: 1.5, over: 1.18, under: 4.50 },
        { line: 2.5, over: 1.65, under: 2.25 },
        { line: 3.5, over: 2.60, under: 1.50 },
      ],
      btts: { yes: 1.60, no: 2.25 },
      overround: 1.04,
    },
    prediction: {
      fixtureId: 1001,
      calculatedAt: '2026-09-21T10:00:00Z',
      lambdaHome: 1.8,
      lambdaAway: 0.9,
      poissonLambdaHome: 1.8,
      poissonLambdaAway: 0.9,
      eloExpectedHomeWin: 0.62,
      eloExpectedAwayWin: 0.18,
      scoreMatrix: dummyMatrix,
      probabilities1X2: { home: 0.62, draw: 0.20, away: 0.18 },
      overUnderProbabilities: [
        { line: 0.5, over: 0.94, under: 0.06 },
        { line: 1.5, over: 0.81, under: 0.19 },
        { line: 2.5, over: 0.58, under: 0.42 },
        { line: 3.5, over: 0.32, under: 0.68 },
        { line: 4.5, over: 0.14, under: 0.86 },
      ],
      bttsProbabilities: { yes: 0.59, no: 0.41 },
      topExactScores: [
        { homeGoals: 2, awayGoals: 0, probability: 0.13, fairOdds: 7.69 },
        { homeGoals: 2, awayGoals: 1, probability: 0.12, fairOdds: 8.33 },
        { homeGoals: 1, awayGoals: 0, probability: 0.11, fairOdds: 9.09 },
      ],
      asianHandicap: [],
      cardsPrediction: {
        expectedHomeCards: 1.5,
        expectedAwayCards: 2.0,
        expectedTotalCards: 3.5,
        overUnderCards: [],
        refereeImpactFactor: 1.0,
        h2hRivalryFactor: 1.0,
        distributionType: 'negative_binomial',
      },
      valueBets: [],
      dixonColesRhoUsed: -0.04,
      isLeagueCalibrated: true,
    },
  };

  it('generates candidates for all market types (1X2, DC, OU 1.5/2.5/3.5, BTTS, Exact Score, Combo)', () => {
    const candidates = getAllMarketCandidates(mockFixture);
    expect(candidates.length).toBeGreaterThanOrEqual(12);

    const categories = new Set(candidates.map((c) => c.category));
    expect(categories.has('1x2')).toBe(true);
    expect(categories.has('dc')).toBe(true);
    expect(categories.has('ou_15')).toBe(true);
    expect(categories.has('ou_25') || categories.has('sniper')).toBe(true);
    expect(categories.has('btts')).toBe(true);
    expect(categories.has('exact_score')).toBe(true);
    expect(categories.has('combo')).toBe(true);
  });

  it('correctly selects the highest-probability pick with minimum odd threshold', () => {
    const safest = getHighestProbabilityPick(mockFixture, 1.15);
    expect(safest).not.toBeNull();
    // For this fixture, Peste 1.5 (81%) or 1X (82%) should be among the top
    expect(safest!.probPercent).toBeGreaterThanOrEqual(75);
    expect(safest!.odd).toBeGreaterThanOrEqual(1.15);
  });

  it('extracts top exact scores from 2D score matrix', () => {
    const exactScores = getTopExactScoresForFixture(mockFixture, 3);
    expect(exactScores.length).toBe(3);
    expect(exactScores[0].probability).toBeGreaterThan(0.05);
    expect(exactScores[0].homeGoals).toBeDefined();
    expect(exactScores[0].awayGoals).toBeDefined();
  });

  it('returns balanced pick with +EV edge or Sniper qualification', () => {
    const balanced = getBestBalancedPick(mockFixture);
    expect(balanced).not.toBeNull();
    expect(balanced!.isSniper || balanced!.probPercent >= 55).toBe(true);
  });
});
