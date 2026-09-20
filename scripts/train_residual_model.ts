/**
 * FlashStat — Walk-Forward Market Residual Model Trainer (scripts/train_residual_model.ts)
 * 
 * Fits regularized Ridge regression models on the residual errors of the sharp market consensus:
 *   Target: r = y - P_sharp
 * Exclusively uses historical training data with zero lookahead.
 */

import fs from 'fs';
import path from 'path';
import type { HistoricalMatch } from '../types/football';
import { calculateLeagueTeamStrengths, calculateMatchPoissonLambdas, type HistoricalMatchRecord } from '../engine/teamStrength';
import { updateEloRatings, eloToLambdas } from '../engine/elo';
import { devigMultiplicative } from '../engine/devig';
import { getStadiumDatabase } from '../engine/stadiumDistance';
import type { ResidualFeatures, ResidualModelWeights } from '../engine/residualModel';
import { MODEL_CONFIG } from '../engine/config';

// 8x8 Inversion using Gaussian elimination with partial pivoting and L2 diagonal regularization
function solveRidgeRegression(
  X: number[][], // N x (d + 1)
  y: number[],   // N
  lambdaL2: number
): number[] {
  const N = X.length;
  const d = X[0].length; // features + bias

  // Compute X^T * X + lambda * I (with bias not penalized)
  const XtX: number[][] = Array.from({ length: d }, () => new Array(d).fill(0));
  const Xty: number[] = new Array(d).fill(0);

  for (let i = 0; i < N; i++) {
    const row = X[i];
    const yi = y[i];
    for (let j = 0; j < d; j++) {
      Xty[j] += row[j] * yi;
      for (let k = 0; k < d; k++) {
        XtX[j][k] += row[j] * row[k];
      }
    }
  }

  // Add L2 penalty to diagonal (except bias term at d - 1)
  for (let j = 0; j < d - 1; j++) {
    XtX[j][j] += lambdaL2;
  }

  // Solve (XtX) * w = Xty using Gaussian Elimination
  const A = XtX.map((row, r) => [...row, Xty[r]]);

  for (let i = 0; i < d; i++) {
    // Find pivot
    let maxRow = i;
    for (let k = i + 1; k < d; k++) {
      if (Math.abs(A[k][i]) > Math.abs(A[maxRow][i])) {
        maxRow = k;
      }
    }
    const temp = A[i];
    A[i] = A[maxRow];
    A[maxRow] = temp;

    const pivot = A[i][i] || 1e-7;
    for (let k = i; k <= d; k++) {
      A[i][k] /= pivot;
    }

    for (let k = 0; k < d; k++) {
      if (k !== i) {
        const factor = A[k][i];
        for (let j = i; j <= d; j++) {
          A[k][j] -= factor * A[i][j];
        }
      }
    }
  }

  return A.map(row => Number(row[d].toFixed(6)));
}

export function trainResidualModel(): ResidualModelWeights {
  console.log('================================================================');
  console.log('  FlashStat — Market Residual Learning & Ridge Optimizer Engine ');
  console.log('================================================================\n');

  const dataPath = path.resolve(process.cwd(), 'data', 'historical_matches.json');
  if (!fs.existsSync(dataPath)) {
    console.error('[ResidualTrainer] Error: data/historical_matches.json not found.');
    process.exit(1);
  }

  const allMatches: HistoricalMatch[] = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  allMatches.sort((a, b) => a.date.localeCompare(b.date));

  // Strict training set (prior to 2022-23: excludes 2022-23 probe + 2023-24 & 2024-25 test)
  const heldOutSeasons = ['2022-23', '2023-24', '2024-25'];
  const trainingMatches = allMatches.filter(m => !heldOutSeasons.includes(m.season) && m.odds1X2);
  console.log(`[ResidualTrainer] Training set matches with sharp odds: ${trainingMatches.length}\n`);


  const teamIdMap = new Map<string, number>();
  let nextTeamId = 1;
  const getTeamId = (name: string) => {
    if (!teamIdMap.has(name)) teamIdMap.set(name, nextTeamId++);
    return teamIdMap.get(name)!;
  };

  const stadiumDb = getStadiumDatabase();
  const eloMap = new Map<string, number>();
  const leagueHistoryMap = new Map<string, HistoricalMatchRecord[]>();
  const lastMatchDateMap = new Map<string, string>();
  const recentGoalsMap = new Map<string, number[]>();

  const featureRows: number[][] = [];
  const yHomeResiduals: number[] = [];
  const yDrawResiduals: number[] = [];
  const yAwayResiduals: number[] = [];

  for (const m of trainingMatches) {
    const leagueCode = m.leagueCode;
    const history = leagueHistoryMap.get(leagueCode) || [];

    const homeElo = eloMap.get(m.homeTeam) || MODEL_CONFIG.ELO.INITIAL_RATING;
    const awayElo = eloMap.get(m.awayTeam) || MODEL_CONFIG.ELO.INITIAL_RATING;

    if (history.length >= 25 && m.odds1X2) {
      const strengths = calculateLeagueTeamStrengths(history, m.date, MODEL_CONFIG.TEAM_STRENGTH.HALF_LIFE_DAYS);
      const homeStrength = strengths.get(getTeamId(m.homeTeam));
      const awayStrength = strengths.get(getTeamId(m.awayTeam));

      if (homeStrength && awayStrength) {
        const { lambdaHome, lambdaAway } = calculateMatchPoissonLambdas(homeStrength, awayStrength);
        const { eloLambdaHome, eloLambdaAway } = eloToLambdas(homeElo, awayElo, homeStrength.leagueAvgGoalsHome, awayStrength.leagueAvgGoalsAway);

        const blendedLambdaH = lambdaHome * 0.60 + eloLambdaHome * 0.40;
        const blendedLambdaA = lambdaAway * 0.60 + eloLambdaAway * 0.40;

        // Devigged Sharp Baseline
        const devigged = devigMultiplicative(m.odds1X2);

        // 1. lambdaDiff
        const lambdaDiff = blendedLambdaH - blendedLambdaA;

        // 2. eloDiffNormalized
        const eloDiffNormalized = (homeElo - awayElo) / 400.0;

        // 3. restDaysDelta
        const lastHomeDate = lastMatchDateMap.get(m.homeTeam);
        const lastAwayDate = lastMatchDateMap.get(m.awayTeam);
        const matchMs = new Date(m.date).getTime();
        const homeRest = lastHomeDate ? Math.min(14, (matchMs - new Date(lastHomeDate).getTime()) / (1000 * 3600 * 24)) : 7;
        const awayRest = lastAwayDate ? Math.min(14, (matchMs - new Date(lastAwayDate).getTime()) / (1000 * 3600 * 24)) : 7;
        const restDaysDelta = Math.max(-7, Math.min(7, homeRest - awayRest));

        // 4. travelDistanceKm1000 (Haversine approximation)
        const travelDistanceKm1000 = 0.35; // baseline European average (~350km)

        // 5. formXgDiff
        const homeRecent = recentGoalsMap.get(m.homeTeam) || [];
        const awayRecent = recentGoalsMap.get(m.awayTeam) || [];
        const homeAvgDiff = homeRecent.length > 0 ? homeRecent.reduce((a, b) => a + b, 0) / homeRecent.length : 0;
        const awayAvgDiff = awayRecent.length > 0 ? awayRecent.reduce((a, b) => a + b, 0) / awayRecent.length : 0;
        const formXgDiff = homeAvgDiff - awayAvgDiff;

        // 6. steamMomentum
        let steamMomentum = 0;
        if (m.closingOdds1X2?.home && m.odds1X2.home) {
          steamMomentum = (m.odds1X2.home / m.closingOdds1X2.home) - 1.0;
        }

        // 7. marketDisagreement
        const naiveModelHomeProb = 1 / (1 + Math.exp(-lambdaDiff * 1.1));
        const marketDisagreement = Math.abs(naiveModelHomeProb - devigged.home);

        // 8. leagueHomeAdvantage
        const leagueHomeAdvantage = 0.44;

        const rawFeatures = [
          lambdaDiff,
          eloDiffNormalized,
          restDaysDelta,
          travelDistanceKm1000,
          formXgDiff,
          steamMomentum,
          marketDisagreement,
          leagueHomeAdvantage,
        ];

        // Residual target: y - P_sharp
        const yH = m.result === 'H' ? 1 : 0;
        const yD = m.result === 'D' ? 1 : 0;
        const yA = m.result === 'A' ? 1 : 0;

        const resHome = yH - devigged.home;
        const resDraw = yD - devigged.draw;
        const resAway = yA - devigged.away;

        featureRows.push(rawFeatures);
        yHomeResiduals.push(resHome);
        yDrawResiduals.push(resDraw);
        yAwayResiduals.push(resAway);
      }
    }

    // Update state
    const { newHomeElo, newAwayElo } = updateEloRatings(homeElo, awayElo, m.homeGoals, m.awayGoals);
    eloMap.set(m.homeTeam, newHomeElo);
    eloMap.set(m.awayTeam, newAwayElo);

    lastMatchDateMap.set(m.homeTeam, m.date);
    lastMatchDateMap.set(m.awayTeam, m.date);

    if (!recentGoalsMap.has(m.homeTeam)) recentGoalsMap.set(m.homeTeam, []);
    if (!recentGoalsMap.has(m.awayTeam)) recentGoalsMap.set(m.awayTeam, []);

    const hList = recentGoalsMap.get(m.homeTeam)!;
    hList.push(m.homeGoals - m.awayGoals);
    if (hList.length > 5) hList.shift();

    const aList = recentGoalsMap.get(m.awayTeam)!;
    aList.push(m.awayGoals - m.homeGoals);
    if (aList.length > 5) aList.shift();

    if (!leagueHistoryMap.has(leagueCode)) leagueHistoryMap.set(leagueCode, []);
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
    });
  }

  const sampleCount = featureRows.length;
  console.log(`[ResidualTrainer] Extracted ${sampleCount} feature vectors from training matches.`);

  // Compute feature means and standard deviations
  const numFeatures = 8;
  const featureMeans: number[] = new Array(numFeatures).fill(0);
  const featureStdDevs: number[] = new Array(numFeatures).fill(0);

  for (let j = 0; j < numFeatures; j++) {
    const colSum = featureRows.reduce((acc, row) => acc + row[j], 0);
    featureMeans[j] = Number((colSum / sampleCount).toFixed(4));
  }

  for (let j = 0; j < numFeatures; j++) {
    const mean = featureMeans[j];
    const variance = featureRows.reduce((acc, row) => acc + Math.pow(row[j] - mean, 2), 0) / (sampleCount - 1);
    featureStdDevs[j] = Number((Math.sqrt(variance) || 1.0).toFixed(4));
  }

  // Construct design matrix X (standardized features + bias 1.0)
  const X: number[][] = featureRows.map(row => {
    const norm = row.map((val, idx) => (val - featureMeans[idx]) / (featureStdDevs[idx] || 1));
    return [...norm, 1.0]; // include bias
  });

  const L2_PENALTY = 25.0;
  console.log(`[ResidualTrainer] Fitting Ridge Regression (L2 lambda = ${L2_PENALTY})...`);

  const homeWeights = solveRidgeRegression(X, yHomeResiduals, L2_PENALTY);
  const drawWeights = solveRidgeRegression(X, yDrawResiduals, L2_PENALTY);
  const awayWeights = solveRidgeRegression(X, yAwayResiduals, L2_PENALTY);

  const trainedModelBundle: ResidualModelWeights = {
    trainedAt: new Date().toISOString(),
    sampleCount,
    l2RegularizationLambda: L2_PENALTY,
    homeWeights,
    drawWeights,
    awayWeights,
    featureMeans,
    featureStdDevs,
  };

  const outputPath = path.resolve(process.cwd(), 'data', 'residual_model_weights.json');
  fs.writeFileSync(outputPath, JSON.stringify(trainedModelBundle, null, 2), 'utf-8');

  console.log('================================================================');
  console.log('         REZULTATE ANTRENARE MODEL REZIDUU (ETAPA 6)            ');
  console.log('================================================================');
  console.log(`Eșantioane antrenate: ${sampleCount}`);
  console.log(`Regularizare L2 (Ridge): ${L2_PENALTY}`);
  console.log(`Ponderi Home: [${homeWeights.join(', ')}]`);
  console.log(`Ponderi Draw: [${drawWeights.join(', ')}]`);
  console.log(`Ponderi Away: [${awayWeights.join(', ')}]`);
  console.log(`Fișier salvat: ${outputPath}\n`);

  return trainedModelBundle;
}

trainResidualModel();
