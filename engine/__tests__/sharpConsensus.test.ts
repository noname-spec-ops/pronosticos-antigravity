import { describe, it, expect } from 'vitest';
import {
  evaluateSharpSoftDeviation,
  evaluateValueBet,
  type BetCandidate,
} from '../valueBets';

describe('Sharp Consensus & Multi-Bookmaker Value Detection', () => {
  it('computes soft book deviation against sharp consensus line', () => {
    // Soft odds 2.20 vs Sharp devigged prob 0.50 (Fair Sharp Odds 2.00)
    // Edge vs Sharp = ((2.20 * 0.50) - 1) * 100 = +10.0%
    const res = evaluateSharpSoftDeviation(2.20, 0.50, 0.52);
    expect(res.softBookDeviationPercent).toBe(10.0);
    expect(res.isSharpConfirmedValue).toBe(true);
    expect(res.marketDisagreementPercent).toBeCloseTo(4.0, 1);
  });

  it('detects negative deviation when soft odds lag behind sharp line', () => {
    // Soft odds 1.80 vs Sharp devigged prob 0.50
    const res = evaluateSharpSoftDeviation(1.80, 0.50);
    expect(res.softBookDeviationPercent).toBe(-10.0);
    expect(res.isSharpConfirmedValue).toBe(false);
  });

  it('populates multi-bookmaker metrics in evaluateValueBet when sharpConsensusProb provided', () => {
    const candidate: BetCandidate = {
      fixtureId: 999,
      matchName: 'Man City vs Liverpool',
      leagueName: 'Premier League',
      marketType: '1X2',
      selection: '1 (Man City)',
      bookmakerOdds: 2.10,
      modelProb: 0.54,
      marketDeviggedProb: 0.48,
      isCalibratedLeague: true,
      sharpConsensusProb: 0.50,
      bestBookmaker: 'Unibet',
    };

    const vb = evaluateValueBet(candidate);
    expect(vb).not.toBeNull();
    expect(vb?.sharpConsensusProb).toBe(0.50);
    expect(vb?.softBookDeviationPercent).toBe(5.0); // ((2.10 * 0.50) - 1) * 100 = +5.0%
    expect(vb?.marketDisagreementPercent).toBeCloseTo(8.0, 1);
    expect(vb?.bestBookmaker).toBe('Unibet');
  });
});