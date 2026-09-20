import { describe, it, expect } from 'vitest';
import {
  calculateEdgePercent,
  calculateKellyStake,
  classifyValueGrade,
  evaluateValueBet,
  type BetCandidate,
} from '../valueBets';

describe('Value Betting Engine & Kelly Criterion', () => {
  it('computes edge percentage accurately', () => {
    // Model prob = 0.55, Bookmaker Odds = 2.00 => Edge = ((0.55 * 2.0) - 1) * 100 = 10%
    const edge = calculateEdgePercent(0.55, 2.0);
    expect(edge).toBeCloseTo(10.0, 2);
  });

  it('calculates fractional Kelly stake and caps it at 2% bankroll', () => {
    // Huge edge candidate: prob 0.60 @ odds 2.50
    // b = 1.5, p = 0.6, q = 0.4 => full Kelly = (1.5 * 0.6 - 0.4) / 1.5 = 0.5 / 1.5 = 0.3333
    // Quarter Kelly = 0.3333 * 0.25 = 0.0833 (8.33%)
    // Capped at 2% (0.02)
    const { kellyFraction, suggestedStakePercent } = calculateKellyStake(0.60, 2.50);

    expect(kellyFraction).toBeGreaterThan(0.02);
    expect(suggestedStakePercent).toBe(2.0); // Capped at 2.0%
  });

  it('classifies value grades B, A, A+, SUSPECT according to edge thresholds', () => {
    expect(classifyValueGrade(6.5)).toBe('B');       // 5-8%
    expect(classifyValueGrade(9.5)).toBe('A');       // 8-12%
    expect(classifyValueGrade(13.5)).toBe('A+');     // 12-15%
    expect(classifyValueGrade(18.0)).toBe('SUSPECT');// >15%
  });

  it('evaluates value bet candidates correctly', () => {
    // 1. Candidate below 5% edge => returns null
    const subThresholdCandidate: BetCandidate = {
      fixtureId: 101,
      matchName: 'Team A vs Team B',
      leagueName: 'Premier League',
      marketType: '1X2',
      selection: '1 (Team A)',
      bookmakerOdds: 2.00,
      modelProb: 0.51, // Edge = 2%
      marketDeviggedProb: 0.48,
      isCalibratedLeague: true,
    };
    expect(evaluateValueBet(subThresholdCandidate)).toBeNull();

    // 2. Candidate with 10% edge => Grade A
    const validCandidate: BetCandidate = {
      fixtureId: 102,
      matchName: 'Team C vs Team D',
      leagueName: 'LaLiga',
      marketType: '1X2',
      selection: '1 (Team C)',
      bookmakerOdds: 2.20,
      modelProb: 0.50, // Edge = ((0.5 * 2.2) - 1) * 100 = 10%
      marketDeviggedProb: 0.43,
      isCalibratedLeague: true,
    };
    const vb = evaluateValueBet(validCandidate);
    expect(vb).not.toBeNull();
    expect(vb!.grade).toBe('A');
    expect(vb!.edgePercent).toBe(10.0);
    expect(vb!.fairOdds).toBe(2.0);

    // 3. Candidate with >15% edge => SUSPECT: rejected by default
    const suspectCandidate: BetCandidate = {
      fixtureId: 103,
      matchName: 'Team E vs Team F',
      leagueName: 'Serie A',
      marketType: '1X2',
      selection: '2 (Team F)',
      bookmakerOdds: 4.50,
      modelProb: 0.30, // Edge = ((0.30 * 4.50) - 1) * 100 = 35%
      marketDeviggedProb: 0.21,
      isCalibratedLeague: true,
    };
    const vbRejected = evaluateValueBet(suspectCandidate);
    expect(vbRejected).toBeNull();

    const vbSuspect = evaluateValueBet(suspectCandidate, { rejectSuspect: false });
    expect(vbSuspect).not.toBeNull();
    expect(vbSuspect!.grade).toBe('SUSPECT');
    expect(vbSuspect!.warningNote).toContain('SUSPECT');
  });
});
