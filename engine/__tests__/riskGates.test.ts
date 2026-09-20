import { describe, it, expect } from 'vitest';
import { evaluateValueBet } from '../valueBets';
import { leagueHealthStore } from '../../lib/leagueHealthStore';

describe('ETAPA A — Risk Gating & Empirical Validation Gates', () => {
  it('blocks 1X2 bet from being actionable when isClvPositiveLeague is false or undefined', () => {
    const bet = evaluateValueBet({
      fixtureId: 101,
      matchName: 'Team A vs Team B',
      leagueName: 'Premier League',
      marketType: '1X2',
      selection: '1 (Team A)',
      bookmakerOdds: 2.10,
      modelProb: 0.52, // edge = (0.52 * 2.10 - 1) = +9.2% (Grade A)
      marketDeviggedProb: 0.46,
      isCalibratedLeague: true,
      isClvPositiveLeague: false, // unproven/unprofitable CLV
    });

    expect(bet).not.toBeNull();
    expect(bet?.isActionable).toBe(false);
    expect(bet?.warningNote).toContain('Piața 1X2 este orientativă');
  });

  it('allows 1X2 bet when league has proven positive CLV and is calibrated', () => {
    const bet = evaluateValueBet({
      fixtureId: 102,
      matchName: 'Team C vs Team D',
      leagueName: 'Test League',
      marketType: '1X2',
      selection: '1 (Team C)',
      bookmakerOdds: 2.10,
      modelProb: 0.52, // edge = +9.2% (Grade A)
      marketDeviggedProb: 0.46,
      isCalibratedLeague: true,
      isClvPositiveLeague: true,
    });

    expect(bet).not.toBeNull();
    expect(bet?.isActionable).toBe(true);
  });

  it('correctly assesses league actionability through leagueHealthStore', () => {
    // Premier League (id: 39) has beatsBookmakerBrier: false in current backtest
    const plHealth = leagueHealthStore.isLeagueActionable(39);
    expect(plHealth.actionable).toBe(false);
    expect(plHealth.reason).toBeDefined();

    // UCL (id: 2) has beatsBookmakerBrier: null and totalBetsPlaced: 0 (< 100)
    const uclHealth = leagueHealthStore.isLeagueActionable(2);
    expect(uclHealth.actionable).toBe(false);
    expect(uclHealth.reason).toContain('Eșantion insuficient');
  });

  it('marks bets with edge > 15% as SUSPECT and not actionable when evaluated with rejectSuspect: false', () => {
    const bet = evaluateValueBet(
      {
        fixtureId: 103,
        matchName: 'Team E vs Team F',
        leagueName: 'Premier League',
        marketType: 'OU',
        selection: 'Over 2.5',
        bookmakerOdds: 3.50,
        modelProb: 0.60, // Edge = (0.60 * 3.50 - 1) = +110% >> 15%
        marketDeviggedProb: 0.28,
        isCalibratedLeague: true,
        isClvPositiveLeague: true,
      },
      { rejectSuspect: false }
    );

    expect(bet).not.toBeNull();
    expect(bet?.grade).toBe('SUSPECT');
    expect(bet?.isActionable).toBe(false);
    expect(bet?.warningNote).toContain('SUSPECT');
  });
});
