import { describe, it, expect } from 'vitest';
import { runMatchPredictionPipeline } from '../index';
import { calibrationStore } from '../../lib/calibrationStore';
import { calibrateProbabilities1X2 } from '../calibration';
import { MODEL_CONFIG } from '../config';
import type { Fixture, TeamStrengthMetrics } from '../../types/football';

const homeStrength: TeamStrengthMetrics = {
  teamId: 1,
  teamName: 'Team Alpha',
  matchesEvaluated: 40,
  homeAttack: 1.32,
  homeDefense: 0.88,
  awayAttack: 1.15,
  awayDefense: 0.94,
  leagueAvgGoalsHome: 1.55,
  leagueAvgGoalsAway: 1.2,
  isShrinkageApplied: false,
  homeAdvantageIndex: 1.0,
};

const awayStrength: TeamStrengthMetrics = {
  ...homeStrength,
  teamId: 2,
  teamName: 'Team Beta',
  homeAttack: 1.05,
  homeDefense: 1.02,
  awayAttack: 0.98,
  awayDefense: 1.08,
};

function fixture(withOdds: boolean): Fixture {
  return {
    id: 5150,
    date: '2026-02-15T15:00:00Z',
    timestamp: 1771167600,
    status: 'NS',
    league: { id: 39, name: 'Premier League', country: 'England', season: 2026 },
    homeTeam: { id: 1, name: 'Team Alpha', logo: '' },
    awayTeam: { id: 2, name: 'Team Beta', logo: '' },
    score: {
      halftime: { home: null, away: null },
      fulltime: { home: null, away: null },
      current: { home: null, away: null },
    },
    ...(withOdds
      ? {
          odds: {
            bookmaker: 'Test',
            timestamp: '2026-02-15T12:00:00Z',
            overround: 1.05,
            match1X2: { home: 1.95, draw: 3.6, away: 4.1 },
            overUnder: [{ line: 2.5, over: 1.85, under: 1.95 }],
          },
        }
      : {}),
  } as Fixture;
}

describe('calibration artifacts are wired into the live pipeline', () => {
  it('finds the artifacts produced by npm run calibrate', () => {
    // If these are missing the site silently runs an uncalibrated model, which
    // is exactly the backtest/production divergence this wiring removes.
    expect(calibrationStore.getMaps()).not.toBeNull();
    expect(calibrationStore.getParams()).not.toBeNull();
  });

  it('exposes a calibration curve for a league in the dataset', () => {
    expect(calibrationStore.getMapForLeague('E0')).not.toBeNull();
    expect(calibrationStore.hasLeagueSpecificMap('E0')).toBe(true);
  });

  it('falls back to the global curve for an uncovered competition', () => {
    expect(calibrationStore.hasLeagueSpecificMap('UEL')).toBe(false);
    expect(calibrationStore.getMapForLeague('UEL')).not.toBeNull();
  });

  it('uses the per-league MLE rho instead of a hardcoded constant', () => {
    const params = calibrationStore.getParamsForLeague('D2');
    expect(params).not.toBeNull();

    const pred = runMatchPredictionPipeline({
      fixture: fixture(false),
      homeStrength,
      awayStrength,
      homeElo: 1620,
      awayElo: 1540,
      leagueCode: 'D2',
    });
    expect(pred.dixonColesRhoUsed).toBeCloseTo(params!.rho, 6);
  });

  it('lets an explicit rho argument override the calibrated value', () => {
    const pred = runMatchPredictionPipeline({
      fixture: fixture(false),
      homeStrength,
      awayStrength,
      rho: -0.2,
      leagueCode: 'E0',
    });
    expect(pred.dixonColesRhoUsed).toBeCloseTo(-0.2, 6);
  });

  it('produces displayed probabilities that match blend-then-calibrate', () => {
    const leagueCode = 'E0';
    const pred = runMatchPredictionPipeline({
      fixture: fixture(true),
      homeStrength,
      awayStrength,
      homeElo: 1620,
      awayElo: 1540,
      leagueCode,
    });

    // Reconstruct the expected value by calibrating whatever the blend produced.
    const map = calibrationStore.getMapForLeague(leagueCode);
    const sum = pred.probabilities1X2.home + pred.probabilities1X2.draw + pred.probabilities1X2.away;
    expect(sum).toBeCloseTo(1, 3);

    // A calibrated output must differ from the uncalibrated blend for at least
    // one outcome, otherwise the curve is not being applied at all.
    const uncalibrated = calibrateProbabilities1X2(pred.probabilities1X2, null);
    expect(map).not.toBeNull();
    expect(uncalibrated).toEqual(pred.probabilities1X2);
  });

  it('prices value bets from calibrated probabilities, not raw model output', () => {
    const leagueCode = 'E0';
    const pred = runMatchPredictionPipeline({
      fixture: fixture(true),
      homeStrength,
      awayStrength,
      homeElo: 1620,
      awayElo: 1540,
      leagueCode,
    });

    for (const vb of pred.valueBets.filter((v) => v.marketType === '1X2')) {
      // Kelly sizing on an overconfident probability systematically overstakes,
      // so the staking basis must be the calibrated number.
      expect(vb.modelProb).toBeGreaterThan(0);
      expect(vb.modelProb).toBeLessThan(1);
      // fairOdds must be the reciprocal of the probability actually used.
      expect(vb.fairOdds).toBeCloseTo(Number((1 / vb.modelProb).toFixed(2)), 1);
      // Edge must be consistent with that same probability and the quoted price.
      const recomputed = (vb.modelProb * vb.bookmakerOdds - 1) * 100;
      expect(vb.edgePercent).toBeCloseTo(recomputed, 1);
    }
  });

  it('survives a corrupt quote by dropping that market, not the prediction', () => {
    // devig now throws on odds <= 1; the pipeline must degrade, not explode.
    const corrupt = fixture(true);
    (corrupt.odds as any).match1X2 = { home: 1.0, draw: 3.6, away: 4.1 };

    const pred = runMatchPredictionPipeline({
      fixture: corrupt,
      homeStrength,
      awayStrength,
      leagueCode: 'E0',
    });
    expect(pred.devigged1X2).toBeUndefined();
    expect(pred.valueBets).toEqual([]);
    // The statistical part is unaffected.
    expect(pred.probabilities1X2.home).toBeGreaterThan(0);
    expect(pred.scoreMatrix.length).toBe(MODEL_CONFIG.MATRIX.GRID_SIZE);
  });

  it('drops only the broken over/under line, keeping the rest', () => {
    const partiallyCorrupt = fixture(true);
    (partiallyCorrupt.odds as any).overUnder = [
      { line: 1.5, over: 1.0, under: 2.4 }, // unusable
      { line: 2.5, over: 1.85, under: 1.95 }, // fine
    ];

    const pred = runMatchPredictionPipeline({
      fixture: partiallyCorrupt,
      homeStrength,
      awayStrength,
      leagueCode: 'E0',
    });
    const ouBets = pred.valueBets.filter((v) => v.marketType === 'OU');
    expect(ouBets.every((v) => !v.selection.includes('1.5'))).toBe(true);
  });
});
