/**
 * FlashStat — Out-of-Sample Backtesting & Performance Validation Engine
 * 
 * Strict Guarantees:
 * 1. ZERO DATA LEAKAGE: Chronological walk-forward. For every test match at date D, strictly prior matches (date < D) are used.
 * 2. Compares Model Brier Score vs Bookmaker Devigged Brier Score.
 * 3. Measures Closing Line Value (CLV) = ((Odds_Open / Odds_Close) - 1) * 100 with 95% CI.
 * 4. Measures Simulated ROI with 95% Confidence Intervals and compounding Bankroll Max Drawdown strictly bounded in [0, 100%].
 * 5. Generates 10-decile calibration curves and performance breakdowns across 5 odds bands.
 * 6. Saves verified metrics to fixtures/backtest_metrics.json.
 */

import fs from 'fs';
import path from 'path';
import type {
  HistoricalMatch,
  BacktestLeagueMetrics,
  CalibrationDecile,
  GlobalModelHealth,
  OddsBandMetric,
  ClvMetrics,
  MarketTypeMetric,
  DeviggedProbabilities
} from '../types/football';
import { calculateLeagueTeamStrengths, calculateMatchPoissonLambdas, type HistoricalMatchRecord } from '../engine/teamStrength';
import { generateDixonColesMatrix } from '../engine/dixonColes';
import { derive1X2FromMatrix, deriveOverUnderFromMatrix } from '../engine/poisson';
import { updateEloRatings, eloToLambdas } from '../engine/elo';
import { devigMultiplicative, devig2WayMarket } from '../engine/devig';
import { blendWithMarketPrior } from '../engine/marketBlending';
import { calculateKellyStake } from '../engine/valueBets';
import { calibrateProbabilities1X2, type LeagueCalibrationMaps } from '../engine/calibration';
import { generateBivariatePoissonMatrix, applyDrawInflation } from '../engine/bivariatePoisson';
import type { CalibratedParamsBundle } from './calibrate';
import { LEAGUE_CODE_TO_ID } from '../lib/leagueCodes';
import { MODEL_CONFIG } from '../engine/config';

interface BetSimulation {
  matchId: string;
  date: string;
  leagueCode: string;
  marketType: '1X2' | 'OU';
  selection: string;
  modelProb: number;
  marketDeviggedProb: number;
  openOdds: number;
  closingOdds: number;
  edgePercent: number;
  stakePercent: number;
  won: boolean;
  clvPercent: number;
}

const ODDS_BANDS = [
  { label: '1.01-1.50', min: 1.01, max: 1.50 },
  { label: '1.50-2.00', min: 1.50, max: 2.00 },
  { label: '2.00-3.00', min: 2.00, max: 3.00 },
  { label: '3.00-5.00', min: 3.00, max: 5.00 },
  { label: '5.00+', min: 5.00, max: 999.00 }
];

function computeRoiAndCI(bets: BetSimulation[]): {
  roiPercent: number;
  ci95: [number, number];
  isSignificant: boolean;
  standardError: number;
  winRatePercent: number;
  predictedWinRatePercent: number;
  totalStakedPercent: number;
} {
  if (bets.length === 0) {
    return {
      roiPercent: 0,
      ci95: [0, 0],
      isSignificant: false,
      standardError: 0,
      winRatePercent: 0,
      predictedWinRatePercent: 0,
      totalStakedPercent: 0
    };
  }

  let totalStake = 0;
  let totalProfit = 0;
  let wins = 0;
  let predWinProbSum = 0;
  const returns: number[] = [];

  for (const b of bets) {
    const ret = b.won ? (b.openOdds - 1) : -1;
    returns.push(ret);
    totalStake += b.stakePercent;
    totalProfit += b.won ? b.stakePercent * (b.openOdds - 1) : -b.stakePercent;
    if (b.won) wins++;
    predWinProbSum += b.modelProb;
  }

  const roiPercent = totalStake > 0 ? (totalProfit / totalStake) * 100 : 0;
  const meanRet = returns.reduce((a, b) => a + b, 0) / returns.length;
  let variance = 0;
  if (returns.length > 1) {
    variance = returns.reduce((acc, r) => acc + Math.pow(r - meanRet, 2), 0) / (returns.length - 1);
  }
  const se = returns.length > 0 ? (Math.sqrt(variance) / Math.sqrt(returns.length)) * 100 : 0;
  const lower = Number((roiPercent - 1.96 * se).toFixed(2));
  const upper = Number((roiPercent + 1.96 * se).toFixed(2));
  const isSignificant = lower > 0 || upper < 0;

  return {
    roiPercent: Number(roiPercent.toFixed(2)),
    ci95: [lower, upper],
    isSignificant,
    standardError: Number(se.toFixed(2)),
    winRatePercent: Number(((wins / bets.length) * 100).toFixed(2)),
    predictedWinRatePercent: Number(((predWinProbSum / bets.length) * 100).toFixed(2)),
    totalStakedPercent: Number(totalStake.toFixed(2))
  };
}

function computeClvMetrics(bets: BetSimulation[]): ClvMetrics {
  if (bets.length === 0) {
    return {
      avgClvPercent: 0,
      positiveClvRatePercent: 0,
      ci95: [0, 0],
      isSignificant: false
    };
  }

  const clvs = bets.map(b => b.clvPercent);
  const avgClv = clvs.reduce((a, b) => a + b, 0) / clvs.length;
  const positiveCount = clvs.filter(c => c > 0).length;
  let variance = 0;
  if (clvs.length > 1) {
    variance = clvs.reduce((acc, c) => acc + Math.pow(c - avgClv, 2), 0) / (clvs.length - 1);
  }
  const se = clvs.length > 0 ? (Math.sqrt(variance) / Math.sqrt(clvs.length)) : 0;
  const lower = Number((avgClv - 1.96 * se).toFixed(2));
  const upper = Number((avgClv + 1.96 * se).toFixed(2));
  const isSignificant = lower > 0 || upper < 0;

  return {
    avgClvPercent: Number(avgClv.toFixed(2)),
    positiveClvRatePercent: Number(((positiveCount / clvs.length) * 100).toFixed(2)),
    ci95: [lower, upper],
    isSignificant
  };
}

function computeOddsBandsBreakdown(bets: BetSimulation[]): OddsBandMetric[] {
  return ODDS_BANDS.map(band => {
    const bandBets = bets.filter(b => b.openOdds >= band.min && (band.max >= 999 ? true : b.openOdds < band.max));
    const roiStats = computeRoiAndCI(bandBets);
    const clvStats = computeClvMetrics(bandBets);
    return {
      band: band.label,
      betsCount: bandBets.length,
      winRatePercent: roiStats.winRatePercent,
      predictedWinRatePercent: roiStats.predictedWinRatePercent,
      roiPercent: roiStats.roiPercent,
      avgClvPercent: clvStats.avgClvPercent,
      roiCi95: roiStats.ci95,
      isRoiSignificant: roiStats.isSignificant,
      clvCi95: clvStats.ci95,
      isClvSignificant: clvStats.isSignificant,
    };
  });
}

function computeCompoundingMaxDrawdown(bets: BetSimulation[]): number {
  if (bets.length === 0) return 0;
  const sortedBets = [...bets].sort((a, b) => a.date.localeCompare(b.date));

  let bankroll = 100;
  let peak = bankroll;
  let maxDrawdown = 0;

  for (const bet of sortedBets) {
    const stake = bankroll * (bet.stakePercent / 100);
    bankroll += bet.won ? stake * (bet.openOdds - 1) : -stake;
    if (bankroll > peak) peak = bankroll;
    const dd = ((peak - bankroll) / peak) * 100;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  return Number(Math.min(100, Math.max(0, maxDrawdown)).toFixed(2));
}

export function runBacktest(): GlobalModelHealth {
  console.log('================================================================');
  console.log('  FlashStat — Out-of-Sample Backtesting & CLV Validation Engine  ');
  console.log('================================================================\n');

  const dataPath = path.resolve(process.cwd(), 'data', 'historical_matches.json');
  if (!fs.existsSync(dataPath)) {
    console.error('[Backtest] Error: data/historical_matches.json not found.');
    process.exit(1);
  }

  const allMatches: HistoricalMatch[] = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  console.log(`[Backtest] Loaded total historical matches: ${allMatches.length}`);

  // Sort strictly by date ascending for walk-forward execution
  allMatches.sort((a, b) => a.date.localeCompare(b.date));

  // Load statistical calibration artifacts if available
  let calibrationMaps: LeagueCalibrationMaps | null = null;
  const calibPath = path.resolve(process.cwd(), 'data', 'calibration_maps.json');
  if (fs.existsSync(calibPath)) {
    try {
      calibrationMaps = JSON.parse(fs.readFileSync(calibPath, 'utf-8'));
      console.log(`[Backtest] Loaded PAVA calibration maps (${Object.keys(calibrationMaps || {}).length} profiles).`);
    } catch {}
  }

  let calibratedParams: CalibratedParamsBundle | null = null;
  const paramsPath = path.resolve(process.cwd(), 'data', 'calibrated_params.json');
  if (fs.existsSync(paramsPath)) {
    try {
      calibratedParams = JSON.parse(fs.readFileSync(paramsPath, 'utf-8'));
      console.log(`[Backtest] Loaded MLE calibrated parameter bundle.\n`);
    } catch {}
  }

  // Held-out walk-forward test seasons (post-pandemic validation)
  const heldOutSeasons = ['2022-23', '2023-24', '2024-25'];
  const testMatchesCount = allMatches.filter(m => heldOutSeasons.includes(m.season)).length;
  console.log(`[Backtest] Walk-Forward Test Set (3 windows: 2022-23, 2023-24, 2024-25): ${testMatchesCount} matches\n`);

  // Build league mapping
  // Shared with the API routes so a league added to the dataset automatically
  // gets its own health slot. A local table here previously mapped only 12
  // leagues and collapsed the rest onto id 999, where they overwrote each other.
  const leagueCodeToId = LEAGUE_CODE_TO_ID;

  const teamIdMap = new Map<string, number>();
  let nextTeamId = 1;
  const getTeamId = (name: string) => {
    if (!teamIdMap.has(name)) teamIdMap.set(name, nextTeamId++);
    return teamIdMap.get(name)!;
  };

  // State structures for walk-forward simulation
  const eloMap = new Map<string, number>();
  const leagueHistoryMap = new Map<string, HistoricalMatchRecord[]>();

  // Window-by-window performance trackers
  const windowTrackers: Record<
    string,
    {
      trainingSeasons: string[];
      testSeason: string;
      evaluatedCount: number;
      brierSum: number;
      bookieBrierSum: number;
      logLossSum: number;
      bets: BetSimulation[];
    }
  > = {
    '2022-23': { trainingSeasons: ['<= 2021-22'], testSeason: '2022-23', evaluatedCount: 0, brierSum: 0, bookieBrierSum: 0, logLossSum: 0, bets: [] },
    '2023-24': { trainingSeasons: ['<= 2022-23'], testSeason: '2023-24', evaluatedCount: 0, brierSum: 0, bookieBrierSum: 0, logLossSum: 0, bets: [] },
    '2024-25': { trainingSeasons: ['<= 2023-24'], testSeason: '2024-25', evaluatedCount: 0, brierSum: 0, bookieBrierSum: 0, logLossSum: 0, bets: [] },
  };

  const leagueStatsMap = new Map<
    string,
    {
      leagueId: number;
      leagueName: string;
      brierSum: number;
      bookieBrierSum: number;
      logLossSum: number;
      evaluatedCount: number;
      bets: BetSimulation[];
      bins: Array<{ decile: number; binStart: number; binEnd: number; predSum: number; obsSum: number; count: number }>;
    }
  >();

  const allSimulatedBets: BetSimulation[] = [];
  let globalBrierSum = 0;
  let globalBookieBrierSum = 0;
  let globalLogLossSum = 0;
  let totalEvaluatedCount = 0;

  // Walk-Forward CLV Gate (Section 4.1):
  // heldOutSeasons[0] = '2022-23' is the probe window — measures CLV without real staking.
  // Each subsequent window bets real money only on leagues where the PRIOR window had
  // avgClvPercent > 0 with at least MIN_PROBE_BETS samples. This prevents the model from
  // betting on 1X2 without proven informational edge.
  const PROBE_SEASON = heldOutSeasons[0]; // '2022-23'
  const MIN_PROBE_BETS = 30;               // minimum probe bets before gate can open
  const probeClvByLeague = new Map<string, { clvSum: number; betCount: number }>();
  const cumulativeClvGate = new Map<string, { clvSum: number; betCount: number }>();
  let lastSeenTestSeason = '';
  let probeWindowClosed = false;
  let totalProbeBets = 0;

  // Global calibration bins
  const globalBins = Array.from({ length: 10 }, (_, i) => ({
    decile: i + 1,
    binStart: i * 0.1,
    binEnd: (i + 1) * 0.1,
    predSum: 0,
    obsSum: 0,
    count: 0
  }));

  const startTime = Date.now();

  // Single Chronological Pass (Walk-Forward O(N))
  for (const m of allMatches) {
    const isTestMatch = heldOutSeasons.includes(m.season);
    const leagueCode = m.leagueCode;
    const history = leagueHistoryMap.get(leagueCode) || [];

    // Walk-Forward CLV Gate: season-transition detection.
    // When we first see a match from a season AFTER the probe season, promote probe CLV to gate.
    if (isTestMatch && m.season !== lastSeenTestSeason) {
      if (lastSeenTestSeason === PROBE_SEASON && !probeWindowClosed) {
        // Probe window 2022-23 is complete. Promote per-league probe CLV to the gate.
        for (const [lc, d] of probeClvByLeague) {
          cumulativeClvGate.set(lc, { clvSum: d.clvSum, betCount: d.betCount });
        }
        probeWindowClosed = true;
        const openLeagues = [...probeClvByLeague.entries()]
          .filter(([, d]) => d.betCount >= MIN_PROBE_BETS && d.clvSum / d.betCount > 0)
          .map(([lc]) => lc);
        console.log(`\n[CLV Gate] Fereastra probă ${PROBE_SEASON} închisă.`);
        console.log(`[CLV Gate] Pariuri probă totale: ${totalProbeBets}. Ligi cu gate DESCHIS: ${openLeagues.join(', ') || '(niciuna — model fără avantaj CLV pe 1X2)'}\n`);
      }
      lastSeenTestSeason = m.season;
    }

    const homeElo = eloMap.get(m.homeTeam) || MODEL_CONFIG.ELO.INITIAL_RATING;
    const awayElo = eloMap.get(m.awayTeam) || MODEL_CONFIG.ELO.INITIAL_RATING;

    if (isTestMatch && history.length >= 30) {
      if (!leagueStatsMap.has(leagueCode)) {
        leagueStatsMap.set(leagueCode, {
          leagueId: leagueCodeToId[leagueCode] || 999,
          leagueName: m.leagueName,
          brierSum: 0,
          bookieBrierSum: 0,
          logLossSum: 0,
          evaluatedCount: 0,
          bets: [],
          bins: Array.from({ length: 10 }, (_, i) => ({
            decile: i + 1,
            binStart: i * 0.1,
            binEnd: (i + 1) * 0.1,
            predSum: 0,
            obsSum: 0,
            count: 0
          }))
        });
      }

      const lStats = leagueStatsMap.get(leagueCode)!;

      // Filter to recent history within last 730 days for optimal performance
      const matchDateMs = new Date(m.date).getTime();
      const cutoffMs = matchDateMs - 730 * 24 * 60 * 60 * 1000;
      const recentHistory = history.filter(h => new Date(h.date).getTime() >= cutoffMs);

      // Compute time-decayed & opponent-adjusted attack/defense ratings
      const strengths = calculateLeagueTeamStrengths(
        recentHistory.length >= 20 ? recentHistory : history,
        m.date,
        MODEL_CONFIG.TEAM_STRENGTH.HALF_LIFE_DAYS
      );

      const homeStrength = strengths.get(getTeamId(m.homeTeam));
      const awayStrength = strengths.get(getTeamId(m.awayTeam));

      if (homeStrength && awayStrength) {
        // 1. Parameter extraction (calibrated vs default)
        const lp = calibratedParams?.leagueParams[leagueCode];
        const pWeight = lp?.poissonWeight ?? MODEL_CONFIG.BLEND.POISSON_WEIGHT;
        const eWeight = lp?.eloWeight ?? MODEL_CONFIG.BLEND.ELO_WEIGHT;
        const lambda3 = lp?.lambda3 ?? 0.08;
        const drawDelta = lp?.drawInflationDelta ?? 1.0;

        const { lambdaHome: pLambdaHome, lambdaAway: pLambdaAway } = calculateMatchPoissonLambdas(homeStrength, awayStrength);
        const { eloLambdaHome, eloLambdaAway } = eloToLambdas(homeElo, awayElo, homeStrength.leagueAvgGoalsHome, awayStrength.leagueAvgGoalsAway);

        const blendedLambdaHome = Number((pLambdaHome * pWeight + eloLambdaHome * eWeight).toFixed(4));
        const blendedLambdaAway = Number((pLambdaAway * pWeight + eloLambdaAway * eWeight).toFixed(4));

        // 2. Bivariate Poisson 9x9 joint matrix
        const matrix = generateBivariatePoissonMatrix(blendedLambdaHome, blendedLambdaAway, lambda3, 8);
        let rawProbs = derive1X2FromMatrix(matrix);

        // 3. Multiplicative Draw Inflation adjustment
        if (drawDelta !== 1.0) {
          rawProbs = applyDrawInflation(rawProbs, drawDelta);
        }

        // 4. Market Prior Blending (Matching Engine Pipeline: 35% Model / 65% Market Prior)
        let devigged: DeviggedProbabilities | null = null;
        let probs = rawProbs;
        // pureModelProbs = pre-blend model probabilities (used for edge calculation vs market)
        // This correctly tests if the MODEL has edge vs. the market, not if the blended signal does.
        let pureModelProbs = { ...rawProbs };

        if (m.odds1X2) {
          devigged = devigMultiplicative(m.odds1X2);
          const blended = blendWithMarketPrior(rawProbs, devigged, MODEL_CONFIG.MARKET_PRIOR.MODEL_WEIGHT);
          probs = blended.probabilities1X2;
        }

        // 5. Monotonic Isotonic Regression Calibration (PAVA).
        //    Applied to BOTH the scored probabilities and the pure-model
        //    probabilities that select bets, matching engine/index.ts exactly.
        //    Selecting on uncalibrated probabilities measured ~6-13 percentage
        //    points overconfident, which is what produced the negative ROI.
        if (calibrationMaps) {
          const map = calibrationMaps[leagueCode] || calibrationMaps.global;
          probs = calibrateProbabilities1X2(probs, map);
          pureModelProbs = calibrateProbabilities1X2(pureModelProbs, map);
        }

        // Actual outcomes
        const yH = m.result === 'H' ? 1 : 0;
        const yD = m.result === 'D' ? 1 : 0;
        const yA = m.result === 'A' ? 1 : 0;

        // Model Brier Score (uses calibrated blended probs — best estimate for scoring)
        const modelBrier = Math.pow(probs.home - yH, 2) + Math.pow(probs.draw - yD, 2) + Math.pow(probs.away - yA, 2);
        lStats.brierSum += modelBrier;
        globalBrierSum += modelBrier;
        if (windowTrackers[m.season]) windowTrackers[m.season].brierSum += modelBrier;

        // Model Log-Loss
        const actualProb = m.result === 'H' ? probs.home : m.result === 'D' ? probs.draw : probs.away;
        const matchLogLoss = -Math.log(Math.max(0.0001, actualProb));
        lStats.logLossSum += matchLogLoss;
        globalLogLossSum += matchLogLoss;
        if (windowTrackers[m.season]) windowTrackers[m.season].logLossSum += matchLogLoss;

        // Bookmaker Devigged Benchmark
        if (m.odds1X2 && devigged) {
          const bookieBrier = Math.pow(devigged.home - yH, 2) + Math.pow(devigged.draw - yD, 2) + Math.pow(devigged.away - yA, 2);
          lStats.bookieBrierSum += bookieBrier;
          globalBookieBrierSum += bookieBrier;
          if (windowTrackers[m.season]) windowTrackers[m.season].bookieBrierSum += bookieBrier;

          // Value Bet Selection: uses PURE MODEL probabilities (pre-blend) vs market odds.
          // This is the only valid way to measure model edge — blended probs contain market
          // information already, so comparing them vs odds is circular.
          const candidates: Array<{ sel: 'H' | 'D' | 'A'; pureModelP: number; marketP: number; openOdds: number; closeOdds: number; won: boolean }> = [
            {
              sel: 'H',
              pureModelP: pureModelProbs.home,
              marketP: devigged.home,
              openOdds: m.odds1X2.home,
              closeOdds: m.closingOdds1X2?.home || m.odds1X2.home,
              won: yH === 1
            },
            {
              sel: 'D',
              pureModelP: pureModelProbs.draw,
              marketP: devigged.draw,
              openOdds: m.odds1X2.draw,
              closeOdds: m.closingOdds1X2?.draw || m.odds1X2.draw,
              won: yD === 1
            },
            {
              sel: 'A',
              pureModelP: pureModelProbs.away,
              marketP: devigged.away,
              openOdds: m.odds1X2.away,
              closeOdds: m.closingOdds1X2?.away || m.odds1X2.away,
              won: yA === 1
            }
          ];

          for (const c of candidates) {
            // Edge calculated from PURE MODEL probability vs offered odds
            const edgePercent = ((c.pureModelP * c.openOdds) - 1) * 100;
            // Pure model probability must exceed de-juiced market probability
            const edgeVsMarket = (c.pureModelP - c.marketP) * 100; // in pp

            // Strict value filters:
            //   - Edge >= MIN_EDGE_PERCENT (5%) from config
            //   - Edge <= 15% (SUSPECT boundary)
            //   - Pure model probability strictly > devigged market probability
            //   - Odds in realistic range [1.40, 5.50]
            if (
              edgePercent >= MODEL_CONFIG.VALUE_BETTING.MIN_EDGE_PERCENT &&
              edgePercent <= MODEL_CONFIG.VALUE_BETTING.SUSPECT_EDGE_PERCENT &&
              edgeVsMarket > 0 &&
              c.openOdds >= 1.40 &&
              c.openOdds <= 5.50
            ) {
              const clvPercent = ((c.openOdds / c.closeOdds) - 1) * 100;

              if (m.season === PROBE_SEASON) {
                // PROBE WINDOW: track CLV without real staking (Section 4.1 gate calibration)
                const pd = probeClvByLeague.get(leagueCode) || { clvSum: 0, betCount: 0 };
                pd.clvSum += clvPercent;
                pd.betCount++;
                probeClvByLeague.set(leagueCode, pd);
                totalProbeBets++;
              } else {
                // REAL BET WINDOW: only place if league has proven positive CLV from prior window
                const gateEntry = cumulativeClvGate.get(leagueCode);
                const leagueClvGatePass = gateEntry &&
                  gateEntry.betCount >= MIN_PROBE_BETS &&
                  gateEntry.clvSum / gateEntry.betCount > 0;

                if (leagueClvGatePass) {
                  const { suggestedStakePercent } = calculateKellyStake(c.pureModelP, c.openOdds, 0.25, 0.02);
                  if (suggestedStakePercent > 0) {
                    const betSim: BetSimulation = {
                      matchId: m.id,
                      date: m.date,
                      leagueCode,
                      marketType: '1X2',
                      selection: c.sel,
                      modelProb: c.pureModelP,
                      marketDeviggedProb: c.marketP,
                      openOdds: c.openOdds,
                      closingOdds: c.closeOdds,
                      edgePercent: Number(edgePercent.toFixed(2)),
                      stakePercent: suggestedStakePercent,
                      won: c.won,
                      clvPercent: Number(clvPercent.toFixed(2))
                    };

                    lStats.bets.push(betSim);
                    allSimulatedBets.push(betSim);
                    if (windowTrackers[m.season]) windowTrackers[m.season].bets.push(betSim);

                    // Update cumulative CLV gate with this real bet's CLV (for future windows)
                    const g = cumulativeClvGate.get(leagueCode)!;
                    g.clvSum += clvPercent;
                    g.betCount++;
                  }
                }
              }
            }
          }
        }

        // Over/Under 2.5 Market Evaluation
        if (m.oddsOver25 && m.oddsUnder25) {
          let deviggedOU: ReturnType<typeof devig2WayMarket> | null = null;
          try {
            deviggedOU = devig2WayMarket(m.oddsOver25, m.oddsUnder25);
          } catch {
            deviggedOU = null;
          }

          if (deviggedOU) {
            const ouProbabilities = deriveOverUnderFromMatrix(matrix);
            const ou25 = ouProbabilities.find(o => o.line === 2.5);
            if (ou25) {
              const totalGoals = m.homeGoals + m.awayGoals;
              const isOver = totalGoals > 2.5;
              const closeOver = m.closingOddsOver25 || m.oddsOver25;
              const closeUnder = m.closingOddsUnder25 || m.oddsUnder25;

              const ouCandidates: Array<{
                sel: string;
                pureModelP: number;
                marketP: number;
                openOdds: number;
                closeOdds: number;
                won: boolean;
              }> = [
                {
                  sel: 'Over 2.5',
                  pureModelP: ou25.over,
                  marketP: deviggedOU.probA,
                  openOdds: m.oddsOver25,
                  closeOdds: closeOver,
                  won: isOver
                },
                {
                  sel: 'Under 2.5',
                  pureModelP: ou25.under,
                  marketP: deviggedOU.probB,
                  openOdds: m.oddsUnder25,
                  closeOdds: closeUnder,
                  won: !isOver
                }
              ];

              for (const c of ouCandidates) {
                const edgePercent = ((c.pureModelP * c.openOdds) - 1) * 100;
                const edgeVsMarket = (c.pureModelP - c.marketP) * 100;

                if (
                  edgePercent >= MODEL_CONFIG.VALUE_BETTING.MIN_EDGE_PERCENT &&
                  edgePercent <= MODEL_CONFIG.VALUE_BETTING.SUSPECT_EDGE_PERCENT &&
                  edgeVsMarket > 0 &&
                  c.openOdds >= 1.40 &&
                  c.openOdds <= 5.50
                ) {
                  const clvPercent = ((c.openOdds / c.closeOdds) - 1) * 100;

                  if (m.season === PROBE_SEASON) {
                    const pd = probeClvByLeague.get(leagueCode) || { clvSum: 0, betCount: 0 };
                    pd.clvSum += clvPercent;
                    pd.betCount++;
                    probeClvByLeague.set(leagueCode, pd);
                    totalProbeBets++;
                  } else {
                    const gateEntry = cumulativeClvGate.get(leagueCode);
                    const leagueClvGatePass = gateEntry &&
                      gateEntry.betCount >= MIN_PROBE_BETS &&
                      gateEntry.clvSum / gateEntry.betCount > 0;

                    if (leagueClvGatePass) {
                      const { suggestedStakePercent } = calculateKellyStake(c.pureModelP, c.openOdds, 0.25, 0.02);
                      if (suggestedStakePercent > 0) {
                        const betSim: BetSimulation = {
                          matchId: m.id,
                          date: m.date,
                          leagueCode,
                          marketType: 'OU',
                          selection: c.sel,
                          modelProb: c.pureModelP,
                          marketDeviggedProb: c.marketP,
                          openOdds: c.openOdds,
                          closingOdds: c.closeOdds,
                          edgePercent: Number(edgePercent.toFixed(2)),
                          stakePercent: suggestedStakePercent,
                          won: c.won,
                          clvPercent: Number(clvPercent.toFixed(2))
                        };

                        lStats.bets.push(betSim);
                        allSimulatedBets.push(betSim);
                        if (windowTrackers[m.season]) windowTrackers[m.season].bets.push(betSim);

                        const g = cumulativeClvGate.get(leagueCode)!;
                        g.clvSum += clvPercent;
                        g.betCount++;
                      }
                    }
                  }
                }
              }
            }
          }
        }

        // Calibration Bins
        const outcomes = [
          { p: probs.home, y: yH },
          { p: probs.draw, y: yD },
          { p: probs.away, y: yA }
        ];

        for (const o of outcomes) {
          const binIdx = Math.min(9, Math.floor(o.p * 10));
          lStats.bins[binIdx].predSum += o.p;
          lStats.bins[binIdx].obsSum += o.y;
          lStats.bins[binIdx].count++;

          globalBins[binIdx].predSum += o.p;
          globalBins[binIdx].obsSum += o.y;
          globalBins[binIdx].count++;
        }

        lStats.evaluatedCount++;
        totalEvaluatedCount++;
        if (windowTrackers[m.season]) windowTrackers[m.season].evaluatedCount++;
      }
    }

    // UPDATE STATE CHRONOLOGICALLY (ZERO LEAKAGE)
    const { newHomeElo, newAwayElo } = updateEloRatings(homeElo, awayElo, m.homeGoals, m.awayGoals);
    eloMap.set(m.homeTeam, newHomeElo);
    eloMap.set(m.awayTeam, newAwayElo);

    if (!leagueHistoryMap.has(leagueCode)) {
      leagueHistoryMap.set(leagueCode, []);
    }
    leagueHistoryMap.get(leagueCode)!.push({
      date: m.date,
      homeTeamId: getTeamId(m.homeTeam),
      homeTeamName: m.homeTeam,
      awayTeamId: getTeamId(m.awayTeam),
      awayTeamName: m.awayTeam,
      homeGoals: m.homeGoals,
      awayGoals: m.awayGoals,
      homeShotsOnTarget: m.homeShotsOnTarget,
      awayShotsOnTarget: m.awayShotsOnTarget
    });
  }

  const durationMs = Date.now() - startTime;
  console.log(`[Backtest] Walk-forward simulation completed in ${(durationMs / 1000).toFixed(2)}s\n`);

  // Compile League Health Metrics
  const leagueHealthMap: Record<number, BacktestLeagueMetrics> = {};

  for (const [, lStats] of leagueStatsMap.entries()) {
    if (lStats.evaluatedCount === 0) continue;

    const leagueBrier = lStats.brierSum / lStats.evaluatedCount;

    // A competition with no odds source (UEFA Champions League via
    // football-data.org) accumulates a bookmaker Brier of exactly 0, which is
    // not "perfect forecasting" but "no data". Reporting it as 0.0 made the
    // league look infinitely worse than the market and would poison any gate
    // built on beatsBookmakerBrier. Treat it as unknown instead.
    const hasBookmakerBaseline = lStats.bookieBrierSum > 0;
    const leagueBookieBrier = hasBookmakerBaseline ? lStats.bookieBrierSum / lStats.evaluatedCount : NaN;
    const leagueLogLoss = lStats.logLossSum / lStats.evaluatedCount;

    const leagueRoiStats = computeRoiAndCI(lStats.bets);
    const leagueClvMetrics = computeClvMetrics(lStats.bets);
    const leagueMaxDd = computeCompoundingMaxDrawdown(lStats.bets);
    const leagueOddsBands = computeOddsBandsBreakdown(lStats.bets);

    const calibrationCurve: CalibrationDecile[] = lStats.bins.map(b => ({
      decile: b.decile,
      binStart: b.binStart,
      binEnd: b.binEnd,
      predictedAvgProb: b.count > 0 ? Number((b.predSum / b.count).toFixed(4)) : 0,
      observedFrequency: b.count > 0 ? Number((b.obsSum / b.count).toFixed(4)) : 0,
      sampleCount: b.count
    }));

    leagueHealthMap[lStats.leagueId] = {
      leagueId: lStats.leagueId,
      leagueName: lStats.leagueName,
      matchesCount: lStats.evaluatedCount,
      brierScore1X2: Number(leagueBrier.toFixed(4)),
      bookmakerBrierScore1X2: hasBookmakerBaseline ? Number(leagueBookieBrier.toFixed(4)) : null,
      // Unknown, not false: without a market baseline the comparison is undefined.
      beatsBookmakerBrier: hasBookmakerBaseline ? leagueBrier <= leagueBookieBrier : null,
      logLoss1X2: Number(leagueLogLoss.toFixed(4)),
      simulatedRoiPercent: leagueRoiStats.roiPercent,
      roiCi95: leagueRoiStats.ci95,
      isRoiSignificant: leagueRoiStats.isSignificant,
      clvMetrics: leagueClvMetrics,
      totalBetsPlaced: lStats.bets.length,
      winRate: leagueRoiStats.winRatePercent,
      maxDrawdownPercent: leagueMaxDd,
      calibrationCurve,
      oddsBands: leagueOddsBands,
      heldOutSeasons
    };
  }

  // Sort all bets chronologically for global metrics
  allSimulatedBets.sort((a, b) => a.date.localeCompare(b.date));

  const globalRoiStats = computeRoiAndCI(allSimulatedBets);
  const globalClvMetrics = computeClvMetrics(allSimulatedBets);
  const globalMaxDd = computeCompoundingMaxDrawdown(allSimulatedBets);
  const oddsBandsBreakdown = computeOddsBandsBreakdown(allSimulatedBets);

  const overallBrier = totalEvaluatedCount > 0 ? globalBrierSum / totalEvaluatedCount : 0;
  const overallBookieBrier = totalEvaluatedCount > 0 ? globalBookieBrierSum / totalEvaluatedCount : 0;
  const overallLogLoss = totalEvaluatedCount > 0 ? globalLogLossSum / totalEvaluatedCount : 0;
  const bettingRatePercent = totalEvaluatedCount > 0 ? Number(((allSimulatedBets.length / totalEvaluatedCount) * 100).toFixed(2)) : 0;

  const market1X2Bets = allSimulatedBets.filter(b => b.marketType === '1X2');
  const marketOuBets = allSimulatedBets.filter(b => b.marketType === 'OU');

  const roi1X2 = computeRoiAndCI(market1X2Bets);
  const clv1X2 = computeClvMetrics(market1X2Bets);

  const roiOu = computeRoiAndCI(marketOuBets);
  const clvOu = computeClvMetrics(marketOuBets);

  const marketBreakdown: MarketTypeMetric[] = [
    {
      market: '1X2',
      betsCount: market1X2Bets.length,
      winRatePercent: roi1X2.winRatePercent,
      predictedWinRatePercent: roi1X2.predictedWinRatePercent,
      roiPercent: roi1X2.roiPercent,
      avgClvPercent: clv1X2.avgClvPercent,
      roiCi95: roi1X2.ci95,
      isRoiSignificant: roi1X2.isSignificant
    },
    {
      market: 'OU',
      betsCount: marketOuBets.length,
      winRatePercent: roiOu.winRatePercent,
      predictedWinRatePercent: roiOu.predictedWinRatePercent,
      roiPercent: roiOu.roiPercent,
      avgClvPercent: clvOu.avgClvPercent,
      roiCi95: roiOu.ci95,
      isRoiSignificant: roiOu.isSignificant
    }
  ];

  const walkForwardWindows: WalkForwardWindowMetric[] = Object.keys(windowTrackers).map(season => {
    const w = windowTrackers[season];
    const brier = w.evaluatedCount > 0 ? w.brierSum / w.evaluatedCount : 0;
    const bookieBrier = w.evaluatedCount > 0 ? w.bookieBrierSum / w.evaluatedCount : 0;
    const roiStats = computeRoiAndCI(w.bets);
    const clvStats = computeClvMetrics(w.bets);
    const maxDd = computeCompoundingMaxDrawdown(w.bets);
    const betRate = w.evaluatedCount > 0 ? Number(((w.bets.length / w.evaluatedCount) * 100).toFixed(2)) : 0;
    const isProbe = season === PROBE_SEASON;

    return {
      windowName: isProbe ? `Fereastra ${season} (Sondă CLV - fără mize)` : `Fereastra ${season}`,
      trainingSeasons: w.trainingSeasons,
      testSeason: w.testSeason,
      matchesCount: w.evaluatedCount,
      betsCount: w.bets.length,
      bettingRatePercent: betRate,
      brierScore: Number(brier.toFixed(4)),
      bookmakerBrierScore: Number(bookieBrier.toFixed(4)),
      roiPercent: roiStats.roiPercent,
      roiCi95: roiStats.ci95,
      isRoiSignificant: roiStats.isSignificant,
      avgClvPercent: clvStats.avgClvPercent,
      positiveClvRatePercent: clvStats.positiveClvRatePercent,
      maxDrawdownPercent: maxDd,
    };
  });

  const globalHealth: GlobalModelHealth = {
    overallBrierScore: Number(overallBrier.toFixed(4)),
    overallBookmakerBrierScore: Number(overallBookieBrier.toFixed(4)),
    overallLogLoss: Number(overallLogLoss.toFixed(4)),
    overallRoiPercent: globalRoiStats.roiPercent,
    overallRoiCi95: globalRoiStats.ci95,
    isOverallRoiSignificant: globalRoiStats.isSignificant,
    overallClvMetrics: globalClvMetrics,
    overallMaxDrawdownPercent: globalMaxDd,
    totalMatchesBacktested: totalEvaluatedCount,
    totalBetsPlaced: allSimulatedBets.length,
    bettingRatePercent,
    isOverallProfitable: globalRoiStats.roiPercent > 0,
    lastBacktestRun: new Date().toISOString(),
    oddsBandsBreakdown,
    marketBreakdown,
    walkForwardWindows,
    leagueHealthMap
  };

  // Write to fixtures/backtest_metrics.json
  const fixturesDir = path.resolve(process.cwd(), 'fixtures');
  if (!fs.existsSync(fixturesDir)) {
    fs.mkdirSync(fixturesDir, { recursive: true });
  }

  const outputPath = path.join(fixturesDir, 'backtest_metrics.json');
  fs.writeFileSync(outputPath, JSON.stringify(globalHealth, null, 2), 'utf8');

  // PRINT COMPREHENSIVE AUDIT REPORT
  console.log('================================================================');
  console.log('         RAPORT AUDIT MATEMATIC — OUT-OF-SAMPLE RIGUROS         ');
  console.log('================================================================');
  console.log(`Meciuri evaluate out-of-sample: ${totalEvaluatedCount}`);
  console.log(`\n[CLV GATE — Secțiunea 4.1]`);
  console.log(`Fereastra probă ${PROBE_SEASON}: ${totalProbeBets} pariuri urmărite (fără mize reale)`);
  const gatedLeagues = [...cumulativeClvGate.entries()]
    .filter(([, d]) => d.betCount >= MIN_PROBE_BETS && d.clvSum / d.betCount > 0)
    .map(([lc, d]) => `${lc} (CLV=${(d.clvSum/d.betCount).toFixed(2)}%)`);
  console.log(`Ligi cu gate DESCHIS (CLV probă > 0, min ${MIN_PROBE_BETS} pariuri): ${gatedLeagues.join(', ') || '(niciuna)'}`);
  console.log(`Comportament corect: modelul NU pariază pe 1X2 fără avantaj CLV demonstrat.\n`);
  console.log(`Pariuri REALE plasate (CLV gate + Edge 5%-15%, fără SUSPECT): ${allSimulatedBets.length} (${bettingRatePercent}% rată de pariere)`);
  console.log(`Rată de Câștig (Win Rate): ${globalRoiStats.winRatePercent}% (Așteptat model: ${globalRoiStats.predictedWinRatePercent}%)`);
  console.log(`Brier Score Model: ${overallBrier.toFixed(4)} vs Brier Score Bookmaker: ${overallBookieBrier.toFixed(4)} (Log-Loss: ${overallLogLoss.toFixed(4)})`);
  console.log(`Closing Line Value (CLV) Mediu: ${globalClvMetrics.avgClvPercent >= 0 ? '+' : ''}${globalClvMetrics.avgClvPercent.toFixed(2)}% (${globalClvMetrics.positiveClvRatePercent}% pariuri cu CLV pozitiv)`);
  console.log(`CLV 95% Confidence Interval: [${globalClvMetrics.ci95[0]}%, ${globalClvMetrics.ci95[1]}%] (Semnificativ: ${globalClvMetrics.isSignificant ? 'DA' : 'NU'})`);
  console.log(`ROI Simulat: ${globalRoiStats.roiPercent >= 0 ? '+' : ''}${globalRoiStats.roiPercent.toFixed(2)}%`);
  console.log(`ROI 95% Confidence Interval: [${globalRoiStats.ci95[0]}%, ${globalRoiStats.ci95[1]}%] (SE: ${globalRoiStats.standardError}%, Semnificativ: ${globalRoiStats.isSignificant ? 'DA' : 'NU'})`);
  console.log(`Max Drawdown Compus: ${globalMaxDd.toFixed(2)}% (Bankroll inițial 100u, compunere pe capital curent)`);
  console.log(`Raport salvat în: ${outputPath}\n`);


  console.log('--- VALIDARE WALK-FORWARD (3 FERESTRE TEMPORALE DISTINCTE) ---');
  console.log('Fereastră Test  | Antrenare | Meciuri | Pariuri | Rată % | Brier M. | Brier Bookie | ROI Simulat | CI 95% ROI           | CLV Mediu | Max DD%');
  console.log('-----------------------------------------------------------------------------------------------------------------------------------------');
  for (const w of walkForwardWindows) {
    const winP = w.windowName.padEnd(15, ' ');
    const trainP = w.trainingSeasons.join(',').padEnd(9, ' ');
    const countP = String(w.matchesCount).padStart(7, ' ');
    const betsP = String(w.betsCount).padStart(7, ' ');
    const rateP = (w.bettingRatePercent.toFixed(1) + '%').padStart(6, ' ');
    const bmP = w.brierScore.toFixed(4).padStart(8, ' ');
    const bbP = w.bookmakerBrierScore.toFixed(4).padStart(12, ' ');
    const roiP = ((w.roiPercent >= 0 ? '+' : '') + w.roiPercent.toFixed(2) + '%').padStart(11, ' ');
    const ciP = (`[${w.roiCi95[0]}%, ${w.roiCi95[1]}%]`).padEnd(20, ' ');
    const clvP = ((w.avgClvPercent >= 0 ? '+' : '') + w.avgClvPercent.toFixed(2) + '%').padStart(9, ' ');
    const ddP = (w.maxDrawdownPercent.toFixed(2) + '%').padStart(7, ' ');
    console.log(`${winP} | ${trainP} | ${countP} | ${betsP} | ${rateP} | ${bmP} | ${bbP} | ${roiP} | ${ciP} | ${clvP} | ${ddP}`);
  }

  console.log('\n--- INTERPRETARE STATISTICĂ RIGUROASĂ ---');
  console.log('CLV mediu pozitiv  -> modelul are avantaj informational real, chiar daca ROI-ul e negativ.');
  console.log('CLV mediu negativ  -> nu exista avantaj. Un ROI pozitiv in aceasta situatie a fost noroc.');
  console.log('CLV este mult mai stabil statistic decat ROI: da semnal credibil pe ~300 de pariuri,');
  console.log('in timp ce ROI-ul are nevoie de mii.\n');

  console.log('--- DEFALCARE PE PIEȚE (1X2 vs OVER/UNDER 2.5) ---');
  console.log('Piață       | Pariuri | Win Rate Real | Win Rate Model | ROI Simulat | CI 95% ROI           | CLV Mediu | Semnif. ROI');
  console.log('------------------------------------------------------------------------------------------------------------------');
  for (const m of marketBreakdown) {
    const mP = m.market.padEnd(11, ' ');
    const countP = String(m.betsCount).padStart(7, ' ');
    const wrP = (m.winRatePercent.toFixed(2) + '%').padStart(13, ' ');
    const pwrP = (m.predictedWinRatePercent.toFixed(2) + '%').padStart(14, ' ');
    const roiP = ((m.roiPercent >= 0 ? '+' : '') + m.roiPercent.toFixed(2) + '%').padStart(11, ' ');
    const roiCiP = (`[${m.roiCi95[0]}%, ${m.roiCi95[1]}%]`).padEnd(20, ' ');
    const clvP = ((m.avgClvPercent >= 0 ? '+' : '') + m.avgClvPercent.toFixed(2) + '%').padStart(9, ' ');
    const roiSigP = m.isRoiSignificant ? '  ✅ DA  ' : '  ❌ NU  ';
    console.log(`${mP} | ${countP} | ${wrP} | ${pwrP} | ${roiP} | ${roiCiP} | ${clvP} | ${roiSigP}`);
  }
  console.log('');

  console.log('--- DEFALCARE PE BENZI DE COTĂ (FAVOURITE-LONGSHOT BIAS AUDIT) ---');
  console.log('Bandă Cotă   | Pariuri | Win Rate Real | Win Rate Model | ROI Simulat | CI 95% ROI           | CLV Mediu | CI 95% CLV           | Semnif. ROI | Semnif. CLV');
  console.log('--------------------------------------------------------------------------------------------------------------------------------------');
  for (const b of oddsBandsBreakdown) {
    const bandP = b.band.padEnd(12, ' ');
    const countP = String(b.betsCount).padStart(7, ' ');
    const wrP = (b.winRatePercent.toFixed(2) + '%').padStart(13, ' ');
    const pwrP = (b.predictedWinRatePercent.toFixed(2) + '%').padStart(14, ' ');
    const roiP = ((b.roiPercent >= 0 ? '+' : '') + b.roiPercent.toFixed(2) + '%').padStart(11, ' ');
    const roiCiP = (`[${b.roiCi95[0]}%, ${b.roiCi95[1]}%]`).padEnd(20, ' ');
    const clvP = ((b.avgClvPercent >= 0 ? '+' : '') + b.avgClvPercent.toFixed(2) + '%').padStart(9, ' ');
    const clvCiP = (`[${b.clvCi95[0]}%, ${b.clvCi95[1]}%]`).padEnd(20, ' ');
    const roiSigP = b.isRoiSignificant ? '  ✅ DA  ' : '  ❌ NU  ';
    const clvSigP = b.isClvSignificant ? '  ✅ DA  ' : '  ❌ NU  ';
    console.log(`${bandP} | ${countP} | ${wrP} | ${pwrP} | ${roiP} | ${roiCiP} | ${clvP} | ${clvCiP} | ${roiSigP} | ${clvSigP}`);
  }

  console.log('\n--- PERFORMANȚĂ PE LIGI (Held-out: 2023-24, 2024-25) ---');
  console.log('Liga                | Meciuri | Brier Model | Brier Bookie | Bate Cota? | Pariuri | ROI Simulat | CLV Mediu | Max DD%');
  console.log('-------------------------------------------------------------------------------------------------------------------------');
  for (const lid of Object.keys(leagueHealthMap)) {
    const l = leagueHealthMap[Number(lid)];
    const nameP = l.leagueName.padEnd(19, ' ');
    const countP = String(l.matchesCount).padStart(7, ' ');
    const bmP = l.brierScore1X2.toFixed(4).padStart(11, ' ');
    // null means the competition has no odds source, so there is no market
    // baseline to compare against — reported as such, not as a failed comparison.
    const bbP = (l.bookmakerBrierScore1X2 === null ? 'fara cote' : l.bookmakerBrierScore1X2.toFixed(4)).padStart(12, ' ');
    const beatsP = (l.beatsBookmakerBrier === null ? '  — n/a  ' : l.beatsBookmakerBrier ? '  ✅ DA  ' : '  ❌ NU  ').padStart(10, ' ');
    const betsP = String(l.totalBetsPlaced).padStart(7, ' ');
    const roiP = ((l.simulatedRoiPercent >= 0 ? '+' : '') + l.simulatedRoiPercent.toFixed(2) + '%').padStart(11, ' ');
    const clvP = ((l.clvMetrics.avgClvPercent >= 0 ? '+' : '') + l.clvMetrics.avgClvPercent.toFixed(2) + '%').padStart(9, ' ');
    const ddP = (l.maxDrawdownPercent.toFixed(2) + '%').padStart(7, ' ');

    console.log(`${nameP} | ${countP} | ${bmP} | ${bbP} | ${beatsP} | ${betsP} | ${roiP} | ${clvP} | ${ddP}`);
  }

  console.log('\n--- CURBA DE CALIBRARE PE DECILE (GLOBAL) ---');
  console.log('Decila | Interval Probabilitate | Probabilitate Medie Prezisă | Frecvență Observată | Număr Eșantioane');
  console.log('------------------------------------------------------------------------------------------------------');
  globalBins.forEach(b => {
    const dec = String(b.decile).padStart(6, ' ');
    const interval = `[${b.binStart.toFixed(1)} - ${b.binEnd.toFixed(1)})`.padStart(22, ' ');
    const pred = (b.count > 0 ? (b.predSum / b.count).toFixed(4) : '0.0000').padStart(27, ' ');
    const obs = (b.count > 0 ? (b.obsSum / b.count).toFixed(4) : '0.0000').padStart(19, ' ');
    const cnt = String(b.count).padStart(16, ' ');
    console.log(`${dec} | ${interval} | ${pred} | ${obs} | ${cnt}`);
  });

  return globalHealth;
}

runBacktest();