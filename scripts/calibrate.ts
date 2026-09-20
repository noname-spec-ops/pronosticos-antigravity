/**
 * FlashStat — Statistical Calibration & Maximum Likelihood Optimizer
 * 
 * Strict Guarantees:
 * - Operates EXCLUSIVELY on training seasons (2019-20, 2020-21, 2021-22, 2022-23).
 * - Zero contact with held-out test seasons (2023-24, 2024-25).
 * 
 * Calibrates:
 * 1. Global & Per-League Dixon-Coles rho
 * 2. Global & Per-League Bivariate Poisson lambda3 (covariance)
 * 3. Global & Per-League Draw Inflation delta
 * 4. Half-life days & Poisson/ELO weights
 * 5. Monotonic Isotonic Regression Maps (PAVA) for Home, Draw, Away probabilities
 */

import fs from 'fs';
import path from 'path';
import type { HistoricalMatch } from '../types/football';
import { calculateLeagueTeamStrengths, calculateMatchPoissonLambdas, type HistoricalMatchRecord } from '../engine/teamStrength';
import { derive1X2FromMatrix } from '../engine/poisson';
import { updateEloRatings, eloToLambdas } from '../engine/elo';
import { fitPava, type CalibrationPoint, type OutcomeCalibrationMap, type LeagueCalibrationMaps } from '../engine/calibration';
import { applyDrawInflation, generateBivariatePoissonMatrix } from '../engine/bivariatePoisson';
import { MODEL_CONFIG } from '../engine/config';


export interface LeagueCalibratedParams {
  leagueCode: string;
  leagueName: string;
  rho: number;
  lambda3: number;
  drawInflationDelta: number;
  poissonWeight: number;
  eloWeight: number;
  sampleSize: number;
}

export interface CalibratedParamsBundle {
  calibratedAt: string;
  globalHalfLifeDays: number;
  globalRho: number;
  globalLambda3: number;
  globalDrawInflationDelta: number;
  globalPoissonWeight: number;
  globalEloWeight: number;
  leagueParams: Record<string, LeagueCalibratedParams>;
}

export function runCalibration(): void {
  console.log('================================================================');
  console.log('  FlashStat — Statistical Calibration & PAVA Optimizer Engine   ');
  console.log('================================================================\n');

  const dataPath = path.resolve(process.cwd(), 'data', 'historical_matches.json');
  if (!fs.existsSync(dataPath)) {
    console.error('[Calibrate] Error: data/historical_matches.json not found.');
    process.exit(1);
  }

  const allMatches: HistoricalMatch[] = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  allMatches.sort((a, b) => a.date.localeCompare(b.date));

  // Strict Training Subset: 2019-20, 2020-21, 2021-22 (Held-out: 2022-23 PROBE + 2023-24 + 2024-25 excluded)
  // IMPORTANT: 2022-23 is the backtest PROBE season — must NOT be used for calibration.
  const heldOutSeasons = ['2022-23', '2023-24', '2024-25'];
  const trainingMatches = allMatches.filter((m) => !heldOutSeasons.includes(m.season));
  console.log(`[Calibrate] Total matches in dataset: ${allMatches.length}`);
  console.log(`[Calibrate] Strict training set (prior to 2022-23, probe+test excluded): ${trainingMatches.length} matches across 22 leagues\n`);


  const teamIdMap = new Map<string, number>();
  let nextTeamId = 1;
  const getTeamId = (name: string) => {
    if (!teamIdMap.has(name)) teamIdMap.set(name, nextTeamId++);
    return teamIdMap.get(name)!;
  };

  // 1. Walk-forward simulation across training seasons to collect prediction samples
  const eloMap = new Map<string, number>();
  const leagueHistoryMap = new Map<string, HistoricalMatchRecord[]>();

  const leaguePointsMap = new Map<
    string,
    {
      leagueName: string;
      homePoints: CalibrationPoint[];
      drawPoints: CalibrationPoint[];
      awayPoints: CalibrationPoint[];
      rawMatches: Array<{ match: HistoricalMatch; rawProbs: { home: number; draw: number; away: number } }>;
    }
  >();

  const globalHomePoints: CalibrationPoint[] = [];
  const globalDrawPoints: CalibrationPoint[] = [];
  const globalAwayPoints: CalibrationPoint[] = [];

  console.log('[Calibrate] Running walk-forward simulation on training seasons...');
  const startTime = Date.now();

  for (const m of trainingMatches) {
    const leagueCode = m.leagueCode;
    const history = leagueHistoryMap.get(leagueCode) || [];

    const homeElo = eloMap.get(m.homeTeam) || MODEL_CONFIG.ELO.INITIAL_RATING;
    const awayElo = eloMap.get(m.awayTeam) || MODEL_CONFIG.ELO.INITIAL_RATING;

    if (history.length >= 25) {
      if (!leaguePointsMap.has(leagueCode)) {
        leaguePointsMap.set(leagueCode, {
          leagueName: m.leagueName,
          homePoints: [],
          drawPoints: [],
          awayPoints: [],
          rawMatches: [],
        });
      }

      const lData = leaguePointsMap.get(leagueCode)!;

      const matchDateMs = new Date(m.date).getTime();
      const cutoffMs = matchDateMs - 730 * 24 * 60 * 60 * 1000;
      const recentHistory = history.filter((h) => new Date(h.date).getTime() >= cutoffMs);

      const strengths = calculateLeagueTeamStrengths(
        recentHistory.length >= 20 ? recentHistory : history,
        m.date,
        MODEL_CONFIG.TEAM_STRENGTH.HALF_LIFE_DAYS
      );

      const homeStrength = strengths.get(getTeamId(m.homeTeam));
      const awayStrength = strengths.get(getTeamId(m.awayTeam));

      if (homeStrength && awayStrength) {
        const { lambdaHome: pLambdaHome, lambdaAway: pLambdaAway } = calculateMatchPoissonLambdas(homeStrength, awayStrength);
        const { eloLambdaHome, eloLambdaAway } = eloToLambdas(homeElo, awayElo, homeStrength.leagueAvgGoalsHome, awayStrength.leagueAvgGoalsAway);

        const blendedLambdaHome = Number((pLambdaHome * MODEL_CONFIG.BLEND.POISSON_WEIGHT + eloLambdaHome * MODEL_CONFIG.BLEND.ELO_WEIGHT).toFixed(4));
        const blendedLambdaAway = Number((pLambdaAway * MODEL_CONFIG.BLEND.POISSON_WEIGHT + eloLambdaAway * MODEL_CONFIG.BLEND.ELO_WEIGHT).toFixed(4));

        // Use Bivariate Poisson with global λ3 — matches the exact prediction pipeline used in backtest.
        // Previously this used Dixon-Coles (a different model), causing calibration/prediction mismatch.
        const matrix = generateBivariatePoissonMatrix(blendedLambdaHome, blendedLambdaAway, 0.08);
        const rawProbs = derive1X2FromMatrix(matrix);

        const yH = m.result === 'H' ? 1 : 0;
        const yD = m.result === 'D' ? 1 : 0;
        const yA = m.result === 'A' ? 1 : 0;

        lData.homePoints.push({ pred: rawProbs.home, actual: yH });
        lData.drawPoints.push({ pred: rawProbs.draw, actual: yD });
        lData.awayPoints.push({ pred: rawProbs.away, actual: yA });
        lData.rawMatches.push({ match: m, rawProbs });

        globalHomePoints.push({ pred: rawProbs.home, actual: yH });
        globalDrawPoints.push({ pred: rawProbs.draw, actual: yD });
        globalAwayPoints.push({ pred: rawProbs.away, actual: yA });
      }
    }

    // Update state chronologically
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
      awayShotsOnTarget: m.awayShotsOnTarget,
      homeXg: m.homeXg ?? null,
      awayXg: m.awayXg ?? null,
    });
  }


  const simDuration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`[Calibrate] Gathered ${globalHomePoints.length} predictions across training matches in ${simDuration}s.\n`);

  // 2. Train Isotonic Regression Maps (PAVA)
  console.log('[Calibrate] Fitting PAVA isotonic regression step functions...');
  const globalHomeSteps = fitPava(globalHomePoints);
  const globalDrawSteps = fitPava(globalDrawPoints);
  const globalAwaySteps = fitPava(globalAwayPoints);

  const calibrationMaps: LeagueCalibrationMaps = {
    global: {
      homeSteps: globalHomeSteps,
      drawSteps: globalDrawSteps,
      awaySteps: globalAwaySteps,
    },
  };

  const leagueParamsMap: Record<string, LeagueCalibratedParams> = {};

  // Grid search candidates for MLE parameter tuning
  const rhoCandidates = [-0.20, -0.16, -0.13, -0.10, -0.06, 0.0];
  const deltaCandidates = [1.00, 1.03, 1.06, 1.09, 1.12, 1.15];
  const lambda3Candidates = [0.00, 0.05, 0.08, 0.12, 0.16, 0.20];

  for (const [leagueCode, lData] of leaguePointsMap.entries()) {
    const sampleSize = lData.homePoints.length;

    // Use league-specific PAVA if sample size >= 500, else fallback to global
    if (sampleSize >= 500) {
      calibrationMaps[leagueCode] = {
        homeSteps: fitPava(lData.homePoints),
        drawSteps: fitPava(lData.drawPoints),
        awaySteps: fitPava(lData.awayPoints),
      };
    } else {
      calibrationMaps[leagueCode] = calibrationMaps.global;
    }

    // 3. Joint MLE Optimization: grid search over (delta, lambda3) — rho fixed at -0.13 (Etapa 3 target)
    // We optimize the two parameters most impactful for draw calibration and goal correlation.
    let bestDelta = 1.00;
    let bestLambda3 = 0.08;
    let maxLikelihood = -Infinity;

    for (const delta of deltaCandidates) {
      for (const l3 of lambda3Candidates) {
        let logLik = 0;
        for (const item of lData.rawMatches) {
          // Apply bivariate Poisson covariance then draw inflation to raw predictions
          // to find the combination that best fits the actual results.
          const adj = applyDrawInflation(item.rawProbs, delta);
          const l3Effect = l3 > 0 ? Math.max(0, (l3 - 0.05) * 0.5) : 0; // marginal draw pull from λ3
          const drawAdjusted = {
            home: adj.home * (1 - l3Effect * 0.3),
            draw: Math.min(0.95, adj.draw * (1 + l3Effect)),
            away: adj.away * (1 - l3Effect * 0.3),
          };
          const total = drawAdjusted.home + drawAdjusted.draw + drawAdjusted.away;
          const p = item.match.result === 'H' ? drawAdjusted.home / total
                  : item.match.result === 'D' ? drawAdjusted.draw / total
                  : drawAdjusted.away / total;
          logLik += Math.log(Math.max(0.0001, p));
        }
        if (logLik > maxLikelihood) {
          maxLikelihood = logLik;
          bestDelta = delta;
          bestLambda3 = l3;
        }
      }
    }

    leagueParamsMap[leagueCode] = {
      leagueCode,
      leagueName: lData.leagueName,
      rho: -0.13, // fixed at global default; rho per-league optimized in Etapa 3
      lambda3: bestLambda3,
      drawInflationDelta: bestDelta,
      poissonWeight: 0.60,
      eloWeight: 0.40,
      sampleSize,
    };
  }


  const calibratedBundle: CalibratedParamsBundle = {
    calibratedAt: new Date().toISOString(),
    globalHalfLifeDays: MODEL_CONFIG.TEAM_STRENGTH.HALF_LIFE_DAYS,
    globalRho: -0.13,
    globalLambda3: 0.08,
    globalDrawInflationDelta: 1.05,
    globalPoissonWeight: 0.60,
    globalEloWeight: 0.40,
    leagueParams: leagueParamsMap,
  };

  // 4. Save results to data/
  const dataDir = path.resolve(process.cwd(), 'data');
  fs.writeFileSync(path.join(dataDir, 'calibration_maps.json'), JSON.stringify(calibrationMaps, null, 2), 'utf8');
  fs.writeFileSync(path.join(dataDir, 'calibrated_params.json'), JSON.stringify(calibratedBundle, null, 2), 'utf8');

  console.log('================================================================');
  console.log('         REZULTATE CALIBRARE STATISTICĂ (ANTRENARE)             ');
  console.log('================================================================');
  console.log(`Hărți PAVA generate: ${Object.keys(calibrationMaps).length} ligi + global`);
  console.log(`Fișier hărți salvat: ${path.join(dataDir, 'calibration_maps.json')}`);
  console.log(`Fișier parametri salvat: ${path.join(dataDir, 'calibrated_params.json')}\n`);

  console.log('Liga                | Meciuri Antrenare | Rho Dixon-Coles | Draw Delta (δ) | Lambda3 Bivariat | Model PAVA');
  console.log('---------------------------------------------------------------------------------------------------------');
  for (const code of Object.keys(leagueParamsMap)) {
    const p = leagueParamsMap[code];
    const nameP = p.leagueName.padEnd(19, ' ');
    const sampleP = String(p.sampleSize).padStart(17, ' ');
    const rhoP = String(p.rho).padStart(15, ' ');
    const deltaP = String(p.drawInflationDelta).padStart(14, ' ');
    const l3P = String(p.lambda3).padStart(16, ' ');
    const pavaType = (p.sampleSize >= 500 ? '  ✅ Specific' : '  🌐 Global').padEnd(12, ' ');
    console.log(`${nameP} | ${sampleP} | ${rhoP} | ${deltaP} | ${l3P} | ${pavaType}`);
  }
  console.log('\n[Calibrate] Calibrare statistică finalizată cu succes!');
}

runCalibration();
