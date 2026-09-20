import { describe, it, expect } from 'vitest';
import { runMatchPredictionPipeline } from '../index';
import { calculateMatchPoissonLambdas } from '../teamStrength';
import { eloToLambdas } from '../elo';
import { generateDixonColesMatrix } from '../dixonColes';
import { derive1X2FromMatrix } from '../poisson';
import { devigMultiplicative } from '../devig';
import { blendWithMarketPrior } from '../marketBlending';
import { calibrateProbabilities1X2 } from '../calibration';
import { evaluateValueBet } from '../valueBets';
import { calibrationStore } from '../../lib/calibrationStore';
import { MODEL_CONFIG } from '../config';
import type { Fixture, TeamStrengthMetrics } from '../../types/football';

/**
 * Parity between the live pipeline (engine/index.ts) and the offline backtest
 * (scripts/backtest.ts).
 *
 * These must agree, otherwise the published ROI / Brier / CLV figures describe a
 * model the website does not run. The divergence that existed before: the
 * backtest applied per-league MLE parameters and PAVA calibration, while the
 * pipeline used a hardcoded rho and no calibration at all.
 *
 * This file reproduces the backtest's exact sequence. When scripts/backtest.ts
 * changes, this must change with it.
 */

const LEAGUE_CODE = 'E0';

const dummyHomeStrength: TeamStrengthMetrics = {
  teamId: 1,
  teamName: 'Team Alpha',
  matchesEvaluated: 30,
  homeAttack: 1.35,
  homeDefense: 0.85,
  awayAttack: 1.2,
  awayDefense: 0.9,
  leagueAvgGoalsHome: 1.55,
  leagueAvgGoalsAway: 1.2,
  isShrinkageApplied: true,
  homeAdvantageIndex: 1.0,
};

const dummyAwayStrength: TeamStrengthMetrics = {
  teamId: 2,
  teamName: 'Team Beta',
  matchesEvaluated: 30,
  homeAttack: 1.15,
  homeDefense: 0.95,
  awayAttack: 1.1,
  awayDefense: 1.05,
  leagueAvgGoalsHome: 1.55,
  leagueAvgGoalsAway: 1.2,
  isShrinkageApplied: true,
  homeAdvantageIndex: 1.0,
};

const dummyFixture: Fixture = {
  id: 12345,
  date: '2025-02-15T15:00:00Z',
  timestamp: 1739631600,
  status: 'NS',
  league: { id: 39, name: 'Premier League', country: 'England', season: 2024 },
  homeTeam: { id: 1, name: 'Team Alpha', logo: '' },
  awayTeam: { id: 2, name: 'Team Beta', logo: '' },
  score: {
    halftime: { home: null, away: null },
    fulltime: { home: null, away: null },
    current: { home: 0, away: 0 },
  },
  odds: {
    bookmaker: 'Betfair',
    timestamp: '2025-02-15T15:00:00Z',
    overround: 1.05,
    match1X2: { home: 1.95, draw: 3.6, away: 4.1 },
    overUnder: [{ line: 2.5, over: 1.85, under: 1.95 }],
    btts: { yes: 1.75, no: 2.05 },
  },
};

/** Replays the backtest's probability sequence for one match. */
function backtestProbabilities(homeElo: number, awayElo: number) {
  const params = calibrationStore.getParamsForLeague(LEAGUE_CODE);
  const map = calibrationStore.getMapForLeague(LEAGUE_CODE);

  const rho = params?.rho ?? MODEL_CONFIG.DIXON_COLES.DEFAULT_RHO;
  const poissonWeight = params?.poissonWeight ?? MODEL_CONFIG.BLEND.POISSON_WEIGHT;
  const eloWeight = params?.eloWeight ?? MODEL_CONFIG.BLEND.ELO_WEIGHT;

  const { lambdaHome: pH, lambdaAway: pA } = calculateMatchPoissonLambdas(dummyHomeStrength, dummyAwayStrength);
  const { eloLambdaHome, eloLambdaAway } = eloToLambdas(homeElo, awayElo, 1.55, 1.2);

  const lambdaHome = Number((pH * poissonWeight + eloLambdaHome * eloWeight).toFixed(4));
  const lambdaAway = Number((pA * poissonWeight + eloLambdaAway * eloWeight).toFixed(4));

  const rawProbs = derive1X2FromMatrix(generateDixonColesMatrix(lambdaHome, lambdaAway, rho));
  const devigged = devigMultiplicative(dummyFixture.odds!.match1X2);
  const blended = blendWithMarketPrior(rawProbs, devigged, MODEL_CONFIG.MARKET_PRIOR.MODEL_WEIGHT);

  return {
    displayed: calibrateProbabilities1X2(blended.probabilities1X2, map),
    selection: calibrateProbabilities1X2(rawProbs, map),
    rho,
  };
}

describe('Backtest and Engine Prediction Pipeline Parity', () => {
  const HOME_ELO = 1600;
  const AWAY_ELO = 1550;

  const pipeline = runMatchPredictionPipeline({
    fixture: dummyFixture,
    homeStrength: dummyHomeStrength,
    awayStrength: dummyAwayStrength,
    homeElo: HOME_ELO,
    awayElo: AWAY_ELO,
    isLeagueCalibrated: true,
    leagueCode: LEAGUE_CODE,
  });

  const backtest = backtestProbabilities(HOME_ELO, AWAY_ELO);

  it('uses the same Dixon-Coles rho as the backtest', () => {
    expect(pipeline.dixonColesRhoUsed).toBeCloseTo(backtest.rho, 6);
  });

  it('displays the same calibrated, market-blended probabilities', () => {
    expect(pipeline.probabilities1X2.home).toBeCloseTo(backtest.displayed.home, 3);
    expect(pipeline.probabilities1X2.draw).toBeCloseTo(backtest.displayed.draw, 3);
    expect(pipeline.probabilities1X2.away).toBeCloseTo(backtest.displayed.away, 3);
  });

  it('selects bets on the same calibrated pure-model probabilities', () => {
    // The backtest prices edge from the calibrated model probability, not from
    // the market-blended one and not from the raw one.
    const home1X2 = pipeline.valueBets.find((v) => v.marketType === '1X2' && v.selection.startsWith('1 '));
    const expectedEdge = (backtest.selection.home * dummyFixture.odds!.match1X2.home - 1) * 100;

    if (home1X2) {
      expect(home1X2.modelProb).toBeCloseTo(backtest.selection.home, 3);
      expect(home1X2.edgePercent).toBeCloseTo(expectedEdge, 1);
    } else {
      // Not selected: then the edge must genuinely be below the threshold.
      expect(expectedEdge).toBeLessThan(MODEL_CONFIG.VALUE_BETTING.MIN_EDGE_PERCENT);
    }
  });

  it('applies calibration rather than passing probabilities through', () => {
    // Guard against the calibration store silently returning null (missing
    // artifacts), which would put the site back on the uncalibrated model.
    expect(calibrationStore.getMapForLeague(LEAGUE_CODE)).not.toBeNull();
  });

  it('defaults rejectSuspect to true in valueBets evaluation', () => {
    const suspectCandidate = {
      fixtureId: 999,
      matchName: 'Man City vs Southampton',
      leagueName: 'Premier League',
      marketType: '1X2' as const,
      selection: '1 (Man City)',
      bookmakerOdds: 2.5,
      modelProb: 0.8, // Edge = ((0.8 * 2.5) - 1) * 100 = 100% (>15% SUSPECT)
      marketDeviggedProb: 0.45,
      isCalibratedLeague: true,
    };

    expect(evaluateValueBet(suspectCandidate)).toBeNull();

    const allowed = evaluateValueBet(suspectCandidate, { rejectSuspect: false });
    expect(allowed).not.toBeNull();
    expect(allowed?.grade).toBe('SUSPECT');
  });
});
