import { describe, it, expect } from 'vitest';
import { evaluateValueBet, type BetCandidate } from '../valueBets';

describe('Smart Market Gating & 1X2 Actionability Rules', () => {
  it('marks uncalibrated 1X2 bets as informative (not actionable)', () => {
    const candidate: BetCandidate = {
      fixtureId: 101,
      matchName: 'Team A vs Team B',
      leagueName: 'Obscure Cup',
      marketType: '1X2',
      selection: '1 (Team A)',
      bookmakerOdds: 2.20,
      modelProb: 0.52,
      marketDeviggedProb: 0.45,
      isCalibratedLeague: false,
    };

    const vb = evaluateValueBet(candidate);
    expect(vb).not.toBeNull();
    expect(vb?.isActionable).toBe(false);
    expect(vb?.warningNote).toContain('1X2');
  });

  it('marks 1X2 bets as actionable when confirmed by positive sharp devigged line', () => {
    const candidate: BetCandidate = {
      fixtureId: 102,
      matchName: 'Real Madrid vs Barcelona',
      leagueName: 'La Liga',
      marketType: '1X2',
      selection: '1 (Real Madrid)',
      bookmakerOdds: 2.20,
      modelProb: 0.52,
      marketDeviggedProb: 0.46,
      sharpConsensusProb: 0.50, // 2.20 * 0.50 = 1.10 (10% edge vs sharp)
      isCalibratedLeague: true,
      isClvPositiveLeague: true,
    };

    const vb = evaluateValueBet(candidate);
    expect(vb).not.toBeNull();
    expect(vb?.isActionable).toBe(true);
  });

  it('always allows Over/Under and Asian Handicap with positive edge as actionable', () => {
    const candidateOU: BetCandidate = {
      fixtureId: 103,
      matchName: 'Liverpool vs Chelsea',
      leagueName: 'Premier League',
      marketType: 'OU',
      selection: 'Over 2.5',
      bookmakerOdds: 1.95,
      modelProb: 0.58,
      marketDeviggedProb: 0.51,
      isCalibratedLeague: true,
    };

    const vbOU = evaluateValueBet(candidateOU);
    expect(vbOU).not.toBeNull();
    expect(vbOU?.isActionable).toBe(true);

    const candidateAH: BetCandidate = {
      fixtureId: 104,
      matchName: 'Inter vs Milan',
      leagueName: 'Serie A',
      marketType: 'AH',
      selection: 'AH Inter (-0.25)',
      bookmakerOdds: 1.90,
      modelProb: 0.58,
      marketDeviggedProb: 0.52,
      isCalibratedLeague: true,
    };

    const vbAH = evaluateValueBet(candidateAH);
    expect(vbAH).not.toBeNull();
    expect(vbAH?.isActionable).toBe(true);
  });
});