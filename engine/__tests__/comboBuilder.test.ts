import { describe, it, expect } from 'vitest';
import {
  scoreSatisfiesMarket,
  calculateSameGameJointProbability,
  buildAndEvaluateTicket,
  type ComboSelectionItem,
} from '../comboBuilder';

describe('Combo & Acca Builder Engine', () => {
  it('correctly checks if exact score satisfies various markets', () => {
    // 2-1 score
    expect(scoreSatisfiesMarket(2, 1, 'home')).toBe(true);
    expect(scoreSatisfiesMarket(2, 1, 'draw')).toBe(false);
    expect(scoreSatisfiesMarket(2, 1, 'over_2_5')).toBe(true);
    expect(scoreSatisfiesMarket(2, 1, 'under_2_5')).toBe(false);
    expect(scoreSatisfiesMarket(2, 1, 'btts_yes')).toBe(true);
    expect(scoreSatisfiesMarket(2, 1, 'home_and_over_1_5')).toBe(true);
    expect(scoreSatisfiesMarket(2, 1, 'home_and_over_2_5')).toBe(true);

    // 0-0 score
    expect(scoreSatisfiesMarket(0, 0, 'draw')).toBe(true);
    expect(scoreSatisfiesMarket(0, 0, 'under_2_5')).toBe(true);
    expect(scoreSatisfiesMarket(0, 0, 'btts_no')).toBe(true);
    expect(scoreSatisfiesMarket(0, 0, 'btts_yes')).toBe(false);
  });

  it('calculates exact joint probability from Dixon-Coles score matrix for SGP', () => {
    // Construct small test 3x3 matrix
    const matrix = [
      [0.10, 0.05, 0.02], // 0-0, 0-1, 0-2
      [0.20, 0.15, 0.05], // 1-0, 1-1, 1-2
      [0.25, 0.10, 0.08], // 2-0, 2-1, 2-2
    ];

    // Home Win & Over 1.5 -> (2-0) [0.25] + (2-1) [0.10] = 0.35
    const joint = calculateSameGameJointProbability(matrix, ['home', 'over_1_5']);
    expect(joint).toBe(0.35);
  });

  it('evaluates multi-match independent acca with positive edge and Kelly staking', () => {
    const selections: ComboSelectionItem[] = [
      {
        id: '1',
        fixtureId: 101,
        matchName: 'Dortmund vs Frankfurt',
        leagueName: 'Bundesliga',
        marketType: 'over_2_5',
        marketLabel: '🎯 Peste 2.5',
        bookmakerOdd: 1.85,
        modelProb: 0.62,
        fairOdd: 1.61,
        edgePercent: 14.7,
      },
      {
        id: '2',
        fixtureId: 102,
        matchName: 'Ajax vs Feyenoord',
        leagueName: 'Eredivisie',
        marketType: 'over_2_5',
        marketLabel: '🎯 Peste 2.5',
        bookmakerOdd: 1.90,
        modelProb: 0.60,
        fairOdd: 1.66,
        edgePercent: 14.0,
      },
    ];

    const result = buildAndEvaluateTicket(selections);
    // Odds: 1.85 * 1.90 = 3.515 -> ~3.52
    expect(result.totalBookmakerOdds).toBeCloseTo(3.52, 1);
    // Joint prob: 0.62 * 0.60 = 0.372
    expect(result.jointModelProb).toBeCloseTo(0.372, 2);
    expect(result.overallEdgePercent).toBeGreaterThan(0);
    expect(result.suggestedStakeKellyUnits).toBeGreaterThan(0);
    expect(result.rating).toBe('GODMODE');
  });
});
