/**
 * FlashStat — Football Scores & AI Betting Radar
 * Master Engine Pipeline Orchestrator (engine/index.ts)
 */

import { MODEL_CONFIG } from './config';
import { generateDixonColesMatrix } from './dixonColes';
import {
  derive1X2FromMatrix,
  deriveOverUnderFromMatrix,
  deriveBTTSFromMatrix,
  deriveTopExactScores,
  deriveAsianHandicap,
} from './poisson';
import { eloToLambdas, calculateEloExpectation } from './elo';
import { calculateMatchPoissonLambdas } from './teamStrength';
import { devigMultiplicative, devig2WayMarket } from './devig';
import { evaluateValueBet } from './valueBets';
import { predictMatchCards } from './cards';
import { predictMatchCorners, projectLiveCorners } from './corners';
import { calculateScheduleFatigue, type TeamScheduleMetrics } from './scheduleFatigue';
import { getMatchTravelDistanceKm } from './stadiumDistance';
import { evaluateLineupImpact, type LineupImpact } from './lineupAdjuster';
import { calculateMatchMotivation } from './motivationEngine';
import { analyzeDroppingOdds } from './droppingOdds';
import { blendWithMarketPrior } from './marketBlending';
import { calculateInPlayMomentum, type InPlayMomentumResult } from './inPlayMomentum';
import { computeTacticalTracking } from './tacticalTracking';
import { calibrateProbabilities1X2 } from './calibration';
import { calibrationStore } from '../lib/calibrationStore';
import { leagueHealthStore } from '../lib/leagueHealthStore';
import { predictResidualCorrection, computeAlphaProbabilities } from './residualModel';

import type {
  Fixture,
  ModelPrediction,
  TeamStrengthMetrics,
  ValueBet,
} from '../types/football';

export * from './config';
export * from './poisson';
export * from './dixonColes';
export * from './elo';
export * from './teamStrength';
export * from './devig';
export * from './residualModel';
export * from './valueBets';
export * from './cards';
export * from './corners';
export * from './scheduleFatigue';
export * from './stadiumDistance';
export * from './lineupAdjuster';
export * from './motivationEngine';
export * from './droppingOdds';
export * from './marketBlending';
export * from './inPlayMomentum';
export * from './tacticalTracking';
export * from './comboBuilder';
export * from './paperTrading';
export * from './calibration';
export * from './bivariatePoisson';
export * from './driftMonitor';
export * from './weeklyReport';
export * from './marketEvaluator';

export interface PredictionEngineInput {
  fixture: Fixture;
  homeStrength: TeamStrengthMetrics;
  awayStrength: TeamStrengthMetrics;
  homeElo?: number;
  awayElo?: number;
  rho?: number;
  isLeagueCalibrated?: boolean;
  homePastMatches?: Array<{ date: string }>;
  awayPastMatches?: Array<{ date: string }>;
  /**
   * football-data league code (E0, SP1, ...). Selects the MLE parameters and the
   * isotonic calibration curve fitted for that competition. Without it the model
   * falls back to the global profile.
   */
  leagueCode?: string;
}

/**
 * Runs the full statistical prediction pipeline for a single fixture.
 */
export function runMatchPredictionPipeline(input: PredictionEngineInput): ModelPrediction {
  const {
    fixture,
    homeStrength,
    awayStrength,
    homeElo = MODEL_CONFIG.ELO.INITIAL_RATING,
    awayElo = MODEL_CONFIG.ELO.INITIAL_RATING,
    isLeagueCalibrated = true,
    homePastMatches = [],
    awayPastMatches = [],
    leagueCode,
  } = input;

  // Calibration artifacts from `npm run calibrate`. These were previously read
  // only by scripts/backtest.ts, so the site served a different (uncalibrated,
  // fixed-rho) model than the one whose ROI and Brier scores were published.
  const calibratedParams = calibrationStore.getParamsForLeague(leagueCode);
  const calibrationMap = calibrationStore.getMapForLeague(leagueCode);
  const effectiveRho = input.rho ?? calibratedParams?.rho ?? MODEL_CONFIG.DIXON_COLES.DEFAULT_RHO;
  const poissonWeight = calibratedParams?.poissonWeight ?? MODEL_CONFIG.BLEND.POISSON_WEIGHT;
  const eloWeight = calibratedParams?.eloWeight ?? MODEL_CONFIG.BLEND.ELO_WEIGHT;

  // 1. Calculate Poisson lambdas from Team Strengths (includes xG proxy)
  const { lambdaHome: pLambdaHome, lambdaAway: pLambdaAway } = calculateMatchPoissonLambdas(
    homeStrength,
    awayStrength
  );

  // 2. Calculate ELO expectations & lambdas
  const { expectedHome: eloExpHome, expectedAway: eloExpAway } = calculateEloExpectation(
    homeElo,
    awayElo
  );
  const { eloLambdaHome, eloLambdaAway } = eloToLambdas(
    homeElo,
    awayElo,
    homeStrength.leagueAvgGoalsHome,
    awayStrength.leagueAvgGoalsAway
  );

  // 3. Blend Poisson and ELO lambdas (60% / 40%)
  const baseLambdaHome = Number((pLambdaHome * poissonWeight + eloLambdaHome * eloWeight).toFixed(4));
  const baseLambdaAway = Number((pLambdaAway * poissonWeight + eloLambdaAway * eloWeight).toFixed(4));

  // 4. Factor in Schedule Fatigue & Geographic Travel Distance
  const travelMetrics = getMatchTravelDistanceKm(fixture.homeTeam.name, fixture.awayTeam.name);
  const homeFatigue: TeamScheduleMetrics = calculateScheduleFatigue(homePastMatches, fixture.date);
  const awayFatigue: TeamScheduleMetrics = calculateScheduleFatigue(awayPastMatches, fixture.date, {
    travelDistanceKm: travelMetrics.distanceKm,
    travelFatigueFactor: travelMetrics.travelFatigueFactor,
  });

  // 5. Factor in Lineups & Key Absences
  const homeLineupImpact: LineupImpact = evaluateLineupImpact(fixture.lineupHome, fixture.injuries);
  const awayLineupImpact: LineupImpact = evaluateLineupImpact(fixture.lineupAway, fixture.injuries);

  // 6. Factor in Match Stakes, Derbies & Psychological Motivation
  const motivationAnalysis = calculateMatchMotivation({
    homeTeamName: fixture.homeTeam.name,
    awayTeamName: fixture.awayTeam.name,
    leagueName: fixture.league.name,
    standingHome: fixture.standingHome,
    standingAway: fixture.standingAway,
    formHome: fixture.formHome,
    formAway: fixture.formAway,
    homeElo,
    awayElo,
    fatigueFactorHome: homeFatigue.fatigueFactor,
    fatigueFactorAway: awayFatigue.fatigueFactor,
  });

  // Adjusted Lambdas with Fatigue, Lineup Impact, and Psychological Motivation
  const finalLambdaHome = Number(
    Math.max(
      0.15,
      Math.min(
        5.5,
        baseLambdaHome *
          homeFatigue.fatigueFactor *
          homeLineupImpact.attackFactor *
          awayLineupImpact.defenseFactor *
          motivationAnalysis.homeMotivationMultiplier
      )
    ).toFixed(4)
  );

  const finalLambdaAway = Number(
    Math.max(
      0.15,
      Math.min(
        5.5,
        baseLambdaAway *
          awayFatigue.fatigueFactor *
          awayLineupImpact.attackFactor *
          homeLineupImpact.defenseFactor *
          motivationAnalysis.awayMotivationMultiplier
      )
    ).toFixed(4)
  );

  // 7. Generate Dixon-Coles adjusted 9x9 matrix
  const scoreMatrix = generateDixonColesMatrix(finalLambdaHome, finalLambdaAway, effectiveRho);

  // 8. Derive fundamental market probabilities
  const rawProbabilities1X2 = derive1X2FromMatrix(scoreMatrix);
  const overUnderProbabilities = deriveOverUnderFromMatrix(scoreMatrix);
  const bttsProbabilities = deriveBTTSFromMatrix(scoreMatrix);
  const topExactScores = deriveTopExactScores(scoreMatrix, 10);
  const asianHandicap = deriveAsianHandicap(scoreMatrix);

  // 9. Market Prior Blending (if market odds available)
  let devigged1X2: import('../types/football').DeviggedProbabilities | undefined = undefined;
  if (fixture.odds) {
    try {
      // Devig the CONSENSUS line when the provider supplies one, not the best
      // price. The best-of-all line is a synthetic book assembled from different
      // bookmakers' most generous quotes; devigging it skews the market prior
      // toward the favourite and lets a single bad quote move the displayed
      // probability by several points. The best price still drives edge and
      // staking below — those are the numbers it is the right basis for.
      devigged1X2 = devigMultiplicative(fixture.odds.consensus1X2 ?? fixture.odds.match1X2);
    } catch (err) {
      // Malformed quote from a provider: drop the market rather than fabricate one.
      console.warn(`[Engine] Unusable 1X2 odds for fixture ${fixture.id}:`, (err as Error).message);
    }
  }

  // 8b. Apply Machine Learning Residual Model corrections (Ridge Regression weights)
  let correctedRaw1X2 = rawProbabilities1X2;
  try {
    const homeFormAvg = fixture.homeAwayStatsHome?.scoredAvg ?? ((fixture.formHome?.goalsScored ?? 6) / 5);
    const awayFormAvg = fixture.homeAwayStatsAway?.scoredAvg ?? ((fixture.formAway?.goalsScored ?? 5) / 5);
    const residualFeatures = {
      lambdaDiff: finalLambdaHome - finalLambdaAway,
      eloDiffNormalized: (homeElo - awayElo) / 400.0,
      restDaysDelta: Math.max(-7, Math.min(7, homeFatigue.restDays - awayFatigue.restDays)),
      travelDistanceKm1000: Math.min(4.0, travelMetrics.distanceKm / 1000),
      formXgDiff: homeFormAvg - awayFormAvg,
      steamMomentum: 0,
      marketDisagreement: devigged1X2 ? Math.abs(rawProbabilities1X2.home - devigged1X2.home) : 0,
      leagueHomeAdvantage: 0.44,
    };
    const alphaRes = computeAlphaProbabilities(rawProbabilities1X2, residualFeatures);
    if (alphaRes && alphaRes.isAlphaConfirmed) {
      correctedRaw1X2 = {
        home: alphaRes.home,
        draw: alphaRes.draw,
        away: alphaRes.away,
      };
    }
  } catch {
    // Fallback to pure Poisson-Dixon-Coles
  }

  const blendedMarket1X2 = blendWithMarketPrior(
    correctedRaw1X2,
    devigged1X2,
    MODEL_CONFIG.MARKET_PRIOR.MODEL_WEIGHT
  );

  // 9b. Isotonic (PAVA) calibration — the same step scripts/backtest.ts applies
  //     before scoring. Applied to two separate quantities:
  //       - the blended probabilities that the UI displays, and
  //       - the pure-model probabilities that price the value bets.
  //     Calibrating the staking basis matters: the backtest's own calibration
  //     curve shows the raw model running 6-13 percentage points overconfident,
  //     and Kelly sizing on an overconfident probability systematically overstakes.
  const probabilities1X2 = calibrateProbabilities1X2(blendedMarket1X2.probabilities1X2, calibrationMap);
  const calibratedModelProbs = calibrateProbabilities1X2(correctedRaw1X2, calibrationMap);
  const isProbabilityCalibrated = calibrationMap !== null;

  // 10. Predict cards using Negative Binomial (elevated rivalry factor in Derbies)
  const rivalryFactor = motivationAnalysis.isDerby
    ? 1.35
    : MODEL_CONFIG.CARDS.DEFAULT_RIVALRY_FACTOR;

  const cardsPrediction = predictMatchCards(
    fixture.lineupHome,
    fixture.lineupAway,
    fixture.referee,
    rivalryFactor,
    MODEL_CONFIG.CARDS.NEGATIVE_BINOMIAL_DISPERSION_R,
    fixture.homeTeam.name,
    fixture.awayTeam.name
  );

  // 10. Predict corners using Bivariate Poisson model
  const cornersPrediction = predictMatchCorners({
    homeTeamCornersAvg: fixture.deepStatsHome?.cornerStats?.homeCornersWonAvg ?? fixture.deepStatsHome?.cornerStats?.cornersWonAvg,
    homeTeamCornersConcededAvg: fixture.deepStatsHome?.cornerStats?.homeCornersConcededAvg ?? fixture.deepStatsHome?.cornerStats?.cornersConcededAvg,
    awayTeamCornersAvg: fixture.deepStatsAway?.cornerStats?.awayCornersWonAvg ?? fixture.deepStatsAway?.cornerStats?.cornersWonAvg,
    awayTeamCornersConcededAvg: fixture.deepStatsAway?.cornerStats?.awayCornersConcededAvg ?? fixture.deepStatsAway?.cornerStats?.cornersConcededAvg,
  });

  if (fixture.stats && (fixture.status === '1H' || fixture.status === 'HT' || fixture.status === '2H')) {
    const liveCorners = projectLiveCorners(
      fixture.stats.corners.home,
      fixture.stats.corners.away,
      fixture.elapsedMinute || (fixture.status === 'HT' ? 45 : 60),
      cornersPrediction.expectedHomeCorners,
      cornersPrediction.expectedAwayCorners
    );
    cornersPrediction.liveProjectedTotalCorners = liveCorners.projectedTotalCorners;
  }

  // 11. Value Betting Radar identification
  const valueBets: ValueBet[] = [];

  if (fixture.odds && devigged1X2) {
    const matchName = `${fixture.homeTeam.name} vs ${fixture.awayTeam.name}`;
    const leagueName = fixture.league.name;

    const leagueHealth = leagueHealthStore.getLeagueHealth(fixture.league.id);
    const isClvPositive = leagueHealth
      ? leagueHealth.clvMetrics.avgClvPercent > 0 && leagueHealth.clvMetrics.isSignificant
      : false;
    const hasRealXg = false; // Set to true only when authenticated match-level xG exists

    const histMatchesCount = Math.max(
      homePastMatches.length,
      awayPastMatches.length,
      Math.round((homeStrength.matchesEvaluated + awayStrength.matchesEvaluated) / 2)
    );
    const lineupStatusCombined =
      homeLineupImpact.status === 'confirmed' && awayLineupImpact.status === 'confirmed'
        ? 'confirmed'
        : 'probable';

    // Home Win Value Bet check
    const vbHome = evaluateValueBet({
      fixtureId: fixture.id,
      matchName,
      leagueName,
      marketType: '1X2',
      selection: `1 (${fixture.homeTeam.name})`,
      bookmakerOdds: fixture.odds.match1X2.home,
      modelProb: calibratedModelProbs.home,
      marketDeviggedProb: devigged1X2.home,
      isCalibratedLeague: isLeagueCalibrated,
      historicalMatchesCount: histMatchesCount,
      lineupStatus: lineupStatusCombined,
      hasRealXg,
      isClvPositiveLeague: isClvPositive,
    });
    if (vbHome) valueBets.push(vbHome);

    // Draw Value Bet check
    const vbDraw = evaluateValueBet({
      fixtureId: fixture.id,
      matchName,
      leagueName,
      marketType: '1X2',
      selection: 'X (Draw)',
      bookmakerOdds: fixture.odds.match1X2.draw,
      modelProb: calibratedModelProbs.draw,
      marketDeviggedProb: devigged1X2.draw,
      isCalibratedLeague: isLeagueCalibrated,
      historicalMatchesCount: histMatchesCount,
      lineupStatus: lineupStatusCombined,
      hasRealXg,
      isClvPositiveLeague: isClvPositive,
    });
    if (vbDraw) valueBets.push(vbDraw);

    // Away Win Value Bet check
    const vbAway = evaluateValueBet({
      fixtureId: fixture.id,
      matchName,
      leagueName,
      marketType: '1X2',
      selection: `2 (${fixture.awayTeam.name})`,
      bookmakerOdds: fixture.odds.match1X2.away,
      modelProb: calibratedModelProbs.away,
      marketDeviggedProb: devigged1X2.away,
      isCalibratedLeague: isLeagueCalibrated,
      historicalMatchesCount: histMatchesCount,
      lineupStatus: lineupStatusCombined,
      hasRealXg,
      isClvPositiveLeague: isClvPositive,
    });
    if (vbAway) valueBets.push(vbAway);

    // Over/Under Market Checks
    if (fixture.odds.overUnder && fixture.odds.overUnder.length > 0) {
      for (const ouMarket of fixture.odds.overUnder) {
        const modelOU = overUnderProbabilities.find((m) => m.line === ouMarket.line);
        if (modelOU) {
          let deviggedOU: ReturnType<typeof devig2WayMarket>;
          try {
            deviggedOU = devig2WayMarket(ouMarket.over, ouMarket.under);
          } catch {
            continue; // unusable line, skip it
          }

          const vbOver = evaluateValueBet({
            fixtureId: fixture.id,
            matchName,
            leagueName,
            marketType: 'OU',
            selection: `Over ${ouMarket.line}`,
            bookmakerOdds: ouMarket.over,
            modelProb: modelOU.over,
            marketDeviggedProb: deviggedOU.probA,
            isCalibratedLeague: isLeagueCalibrated,
            historicalMatchesCount: histMatchesCount,
            lineupStatus: lineupStatusCombined,
            hasRealXg,
            isClvPositiveLeague: isClvPositive,
          });
          if (vbOver) valueBets.push(vbOver);

          const vbUnder = evaluateValueBet({
            fixtureId: fixture.id,
            matchName,
            leagueName,
            marketType: 'OU',
            selection: `Under ${ouMarket.line}`,
            bookmakerOdds: ouMarket.under,
            modelProb: modelOU.under,
            marketDeviggedProb: deviggedOU.probB,
            isCalibratedLeague: isLeagueCalibrated,
            historicalMatchesCount: histMatchesCount,
            lineupStatus: lineupStatusCombined,
            hasRealXg,
            isClvPositiveLeague: isClvPositive,
          });
          if (vbUnder) valueBets.push(vbUnder);
        }
      }
    }

    // BTTS Market Check
    if (fixture.odds.btts) {
      let deviggedBTTS: ReturnType<typeof devig2WayMarket> | null = null;
      try {
        deviggedBTTS = devig2WayMarket(fixture.odds.btts.yes, fixture.odds.btts.no);
      } catch {
        deviggedBTTS = null;
      }
      if (deviggedBTTS) {

      const vbBttsYes = evaluateValueBet({
        fixtureId: fixture.id,
        matchName,
        leagueName,
        marketType: 'BTTS',
        selection: 'BTTS Yes',
        bookmakerOdds: fixture.odds.btts.yes,
        modelProb: bttsProbabilities.yes,
        marketDeviggedProb: deviggedBTTS.probA,
        isCalibratedLeague: isLeagueCalibrated,
        historicalMatchesCount: histMatchesCount,
        lineupStatus: lineupStatusCombined,
        hasRealXg,
        isClvPositiveLeague: isClvPositive,
      });
      if (vbBttsYes) valueBets.push(vbBttsYes);

      const vbBttsNo = evaluateValueBet({
        fixtureId: fixture.id,
        matchName,
        leagueName,
        marketType: 'BTTS',
        selection: 'BTTS No',
        bookmakerOdds: fixture.odds.btts.no,
        modelProb: bttsProbabilities.no,
        marketDeviggedProb: deviggedBTTS.probB,
        isCalibratedLeague: isLeagueCalibrated,
        historicalMatchesCount: histMatchesCount,
        lineupStatus: lineupStatusCombined,
        hasRealXg,
        isClvPositiveLeague: isClvPositive,
      });
      if (vbBttsNo) valueBets.push(vbBttsNo);
      }
    }

    // Asian Handicap Market Checks
    if (fixture.odds.asianHandicap && fixture.odds.asianHandicap.length > 0) {
      for (const ahMarket of fixture.odds.asianHandicap) {
        const modelAH = asianHandicap.find((m) => Math.abs(m.line - ahMarket.line) < 0.001);
        if (modelAH) {
          let deviggedAH: ReturnType<typeof devig2WayMarket>;
          try {
            deviggedAH = devig2WayMarket(ahMarket.home, ahMarket.away);
          } catch {
            continue; // unusable line, skip it
          }

          const vbAhHome = evaluateValueBet({
            fixtureId: fixture.id,
            matchName,
            leagueName,
            marketType: 'AH',
            selection: `AH ${fixture.homeTeam.name} (${ahMarket.line >= 0 ? '+' : ''}${ahMarket.line})`,
            bookmakerOdds: ahMarket.home,
            modelProb: modelAH.homeWinProb,
            marketDeviggedProb: deviggedAH.probA,
            isCalibratedLeague: isLeagueCalibrated,
            historicalMatchesCount: histMatchesCount,
            lineupStatus: lineupStatusCombined,
            hasRealXg,
            isClvPositiveLeague: isClvPositive,
          });
          if (vbAhHome) valueBets.push(vbAhHome);

          const vbAhAway = evaluateValueBet({
            fixtureId: fixture.id,
            matchName,
            leagueName,
            marketType: 'AH',
            selection: `AH ${fixture.awayTeam.name} (${-ahMarket.line >= 0 ? '+' : ''}${-ahMarket.line})`,
            bookmakerOdds: ahMarket.away,
            modelProb: modelAH.awayWinProb,
            marketDeviggedProb: deviggedAH.probB,
            isCalibratedLeague: isLeagueCalibrated,
            historicalMatchesCount: histMatchesCount,
            lineupStatus: lineupStatusCombined,
            hasRealXg,
            isClvPositiveLeague: isClvPositive,
          });
          if (vbAhAway) valueBets.push(vbAhAway);
        }
      }
    }
  }

  // Sort value bets: Actionable first, then by softBookDeviationPercent or edgePercent
  valueBets.sort((a, b) => {
    // 1. Actionable bets first
    if (a.isActionable !== b.isActionable) {
      return a.isActionable ? -1 : 1;
    }
    // 2. Sharp consensus deviation if available
    const devA = a.softBookDeviationPercent ?? -999;
    const devB = b.softBookDeviationPercent ?? -999;
    if (devA !== devB && devA !== -999 && devB !== -999) {
      return devB - devA;
    }
    // 3. Edge percentage descending
    return b.edgePercent - a.edgePercent;
  });

  // 11. In-Play Momentum & Imminent Goal Detection
  let inPlayMomentum: InPlayMomentumResult | undefined = undefined;
  const isLiveOrHasStats = fixture.stats !== undefined || ['1H', 'HT', '2H', 'ET', 'P', 'LIVE'].includes(fixture.status);
  if (isLiveOrHasStats) {
    const effectiveStats = fixture.stats || {
      possession: { home: 52, away: 48 },
      shotsOnTarget: { home: 4, away: 2 },
      shotsTotal: { home: 9, away: 6 },
      corners: { home: 5, away: 3 },
      fouls: { home: 10, away: 11 },
      yellowCards: { home: 1, away: 2 },
      redCards: { home: 0, away: 0 },
      expectedGoals: { home: (fixture.score?.current?.home ?? 0) * 0.7 + 0.5, away: (fixture.score?.current?.away ?? 0) * 0.7 + 0.3 },
    };

    inPlayMomentum = calculateInPlayMomentum({
      stats: effectiveStats,
      elapsedMinute: fixture.elapsedMinute || (fixture.status === 'HT' ? 45 : fixture.status === 'FT' ? 90 : 35),
      status: fixture.status,
      currentScore: {
        home: fixture.score?.current?.home ?? 0,
        away: fixture.score?.current?.away ?? 0,
      },
      homeTeamName: fixture.homeTeam.name,
      awayTeamName: fixture.awayTeam.name,
      prematchLambdaHome: finalLambdaHome,
      prematchLambdaAway: finalLambdaAway,
    });
  }

  // 12. Dropping Odds & Smart Money Inflow Analysis
  const droppingOddsAnalysis = analyzeDroppingOdds({
    homeTeamName: fixture.homeTeam.name,
    awayTeamName: fixture.awayTeam.name,
    odds: fixture.odds,
  });

  // 13. Tactical Tracking, xT, Positional Geometry & Environmental Engine
  const tacticalTracking = computeTacticalTracking({
    homeStrength,
    awayStrength,
    homeElo,
    awayElo,
    homePossessionAvg: fixture.stats?.possession.home ?? 52,
    awayPossessionAvg: fixture.stats?.possession.away ?? 48,
    homeRestDays: homeFatigue.restDays,
    awayRestDays: awayFatigue.restDays,
    travelDistanceKm: travelMetrics.distanceKm,
  });

  return {
    fixtureId: fixture.id,
    calculatedAt: new Date().toISOString(),
    lambdaHome: finalLambdaHome,
    lambdaAway: finalLambdaAway,
    poissonLambdaHome: pLambdaHome,
    poissonLambdaAway: pLambdaAway,
    eloExpectedHomeWin: Number(eloExpHome.toFixed(4)),
    eloExpectedAwayWin: Number(eloExpAway.toFixed(4)),
    scoreMatrix,
    probabilities1X2: {
      home: Number(probabilities1X2.home.toFixed(4)),
      draw: Number(probabilities1X2.draw.toFixed(4)),
      away: Number(probabilities1X2.away.toFixed(4)),
    },
    overUnderProbabilities: overUnderProbabilities.map((m) => ({
      line: m.line,
      over: Number(m.over.toFixed(4)),
      under: Number(m.under.toFixed(4)),
    })),
    bttsProbabilities: {
      yes: Number(bttsProbabilities.yes.toFixed(4)),
      no: Number(bttsProbabilities.no.toFixed(4)),
    },
    topExactScores,
    asianHandicap,
    cardsPrediction,
    cornersPrediction,
    valueBets,
    dixonColesRhoUsed: effectiveRho,
    isLeagueCalibrated,
    scheduleFatigueHome: homeFatigue,
    scheduleFatigueAway: awayFatigue,
    lineupImpactHome: {
      attackFactor: homeLineupImpact.attackFactor,
      defenseFactor: homeLineupImpact.defenseFactor,
      missingCount: homeLineupImpact.missingKeyPlayersCount,
      status: homeLineupImpact.status,
      impactSummary: homeLineupImpact.impactSummary,
      keyAbsences: homeLineupImpact.keyAbsences,
    },
    lineupImpactAway: {
      attackFactor: awayLineupImpact.attackFactor,
      defenseFactor: awayLineupImpact.defenseFactor,
      missingCount: awayLineupImpact.missingKeyPlayersCount,
      status: awayLineupImpact.status,
      impactSummary: awayLineupImpact.impactSummary,
      keyAbsences: awayLineupImpact.keyAbsences,
    },
    motivationAnalysis,
    droppingOddsAnalysis,
    inPlayMomentum,
    devigged1X2,
    tacticalTracking,
    modelHealthNote: isLeagueCalibrated
      ? undefined
      : 'Model nevalidat pe aceasta competitie — predictiile sunt informative, nu actionabile.',
  };
}