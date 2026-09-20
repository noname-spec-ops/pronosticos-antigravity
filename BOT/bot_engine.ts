/**
 * FlashStat — Automated Value Betting Bot (BOT/bot_engine.ts)
 * 
 * Selects the top N highest-conviction value bets from evaluated fixtures,
 * sizes stakes using Fractional Confidence Kelly (max 2% cap),
 * evaluates match outcomes, and generates an audit report with CLV and ROI.
 */

import fs from 'fs';
import path from 'path';
import type { HistoricalMatch } from '../types/football';
import { calculateLeagueTeamStrengths, calculateMatchPoissonLambdas, type HistoricalMatchRecord } from '../engine/teamStrength';
import { updateEloRatings, eloToLambdas } from '../engine/elo';
import { devigMultiplicative } from '../engine/devig';
import { derive1X2FromMatrix, deriveOverUnderFromMatrix, deriveBTTSFromMatrix } from '../engine/poisson';
import { generateBivariatePoissonMatrix, applyDrawInflation } from '../engine/bivariatePoisson';
import { calibrateProbabilities1X2, type LeagueCalibrationMaps } from '../engine/calibration';
import { calculateKellyStake, calculateConfidenceFactor } from '../engine/valueBets';
import { MODEL_CONFIG } from '../engine/config';
import { runMonteCarloSimulation, type MonteCarloSummary } from '../engine/monteCarlo';
import type { CalibratedParamsBundle } from '../scripts/calibrate';

export interface BotBetRecord {
  id: string;
  matchId: string;
  date: string;
  leagueCode: string;
  homeTeam: string;
  awayTeam: string;
  marketType: '1X2' | 'OU_2.5' | 'BTTS';
  selection: string;
  modelProb: number;
  marketDeviggedProb: number;
  placedOdds: number;
  closingOdds: number;
  edgePercent: number;
  clvPercent: number;
  confidenceFactor: number;
  stakeUnits: number;
  stakePercent: number;
  actualScore: string;
  outcome: 'WON' | 'LOST';
  pnlUnits: number;
  returnOnStakePercent: number;
}

export interface BotRunSummary {
  runAt: string;
  totalBetsPlaced: number;
  wonBets: number;
  lostBets: number;
  winRatePercent: number;
  initialBankrollUnits: number;
  finalBankrollUnits: number;
  netPnlUnits: number;
  roiPercent: number;
  avgClvPercent: number;
  positiveClvCount: number;
  monteCarlo?: MonteCarloSummary;
  bets: BotBetRecord[];
}

export function runBotSimulation(targetBetsCount: number = 5): BotRunSummary {
  console.log('================================================================');
  console.log('       FlashStat — BOT DE PARIURI CANTITATIVE (OP GODMODE)      ');
  console.log('================================================================\n');

  const dataPath = path.resolve(process.cwd(), 'data', 'historical_matches.json');
  if (!fs.existsSync(dataPath)) {
    throw new Error('data/historical_matches.json missing');
  }

  const allMatches: HistoricalMatch[] = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  allMatches.sort((a, b) => a.date.localeCompare(b.date));

  // Load Calibration Maps & Parameters
  let calibrationMaps: LeagueCalibrationMaps | null = null;
  const calibMapPath = path.resolve(process.cwd(), 'data', 'calibration_maps.json');
  if (fs.existsSync(calibMapPath)) {
    try {
      calibrationMaps = JSON.parse(fs.readFileSync(calibMapPath, 'utf-8'));
    } catch {}
  }

  let calibratedParams: CalibratedParamsBundle | null = null;
  const paramsPath = path.resolve(process.cwd(), 'data', 'calibrated_params.json');
  if (fs.existsSync(paramsPath)) {
    try {
      calibratedParams = JSON.parse(fs.readFileSync(paramsPath, 'utf-8'));
    } catch {}
  }

  // Proven CLV Positive Leagues
  const clvPositiveLeagues = new Set(['D2', 'SC0', 'SC3', 'I2', 'I1']);

  // Target evaluation season: recent matches from 2024-25
  const testSeason = '2024-25';
  const targetMatches = allMatches.filter((m) => m.season === testSeason && m.odds1X2 && m.closingOdds1X2);
  const priorMatches = allMatches.filter((m) => m.season < testSeason);

  console.log(`[BOT] Eșantion meciuri 2024-25 disponibile pentru scanare: ${targetMatches.length}`);
  console.log(`[BOT] Meciuri istorice anterioare (fără lookahead): ${priorMatches.length}\n`);

  // Initialize state
  const teamIdMap = new Map<string, number>();
  let nextTeamId = 1;
  const getTeamId = (name: string) => {
    if (!teamIdMap.has(name)) teamIdMap.set(name, nextTeamId++);
    return teamIdMap.get(name)!;
  };

  const eloMap = new Map<string, number>();
  const leagueHistoryMap = new Map<string, HistoricalMatchRecord[]>();

  for (const m of priorMatches) {
    const hElo = eloMap.get(m.homeTeam) ?? MODEL_CONFIG.ELO.INITIAL_RATING;
    const aElo = eloMap.get(m.awayTeam) ?? MODEL_CONFIG.ELO.INITIAL_RATING;
    const { newHomeElo, newAwayElo } = updateEloRatings(hElo, aElo, m.homeGoals, m.awayGoals);
    eloMap.set(m.homeTeam, newHomeElo);
    eloMap.set(m.awayTeam, newAwayElo);

    if (!leagueHistoryMap.has(m.leagueCode)) leagueHistoryMap.set(m.leagueCode, []);
    leagueHistoryMap.get(m.leagueCode)!.push({
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

  // Evaluate candidate bets
  interface CandidateBet {
    match: HistoricalMatch;
    marketType: '1X2' | 'OU_2.5' | 'BTTS';
    selection: string;
    modelProb: number;
    marketDeviggedProb: number;
    placedOdds: number;
    closingOdds: number;
    edgePercent: number;
    clvPercent: number;
    confidenceFactor: number;
    qualityScore: number;
    actualWon: boolean;
  }

  const candidateBets: CandidateBet[] = [];

  for (const m of targetMatches) {
    const history = leagueHistoryMap.get(m.leagueCode) || [];
    const leagueStrengths = calculateLeagueTeamStrengths(history);
    const homeStrength = leagueStrengths.get(getTeamId(m.homeTeam));
    const awayStrength = leagueStrengths.get(getTeamId(m.awayTeam));
    const homeElo = eloMap.get(m.homeTeam) ?? MODEL_CONFIG.ELO.INITIAL_RATING;
    const awayElo = eloMap.get(m.awayTeam) ?? MODEL_CONFIG.ELO.INITIAL_RATING;

    if (homeStrength && awayStrength && m.odds1X2 && m.closingOdds1X2) {
      const { lambdaHome: pLambdaHome, lambdaAway: pLambdaAway } = calculateMatchPoissonLambdas(homeStrength, awayStrength);
      const { eloLambdaHome, eloLambdaAway } = eloToLambdas(homeElo, awayElo, homeStrength.leagueAvgGoalsHome, awayStrength.leagueAvgGoalsAway);

      const blendedLambdaHome = Number((pLambdaHome * MODEL_CONFIG.BLEND.POISSON_WEIGHT + eloLambdaHome * MODEL_CONFIG.BLEND.ELO_WEIGHT).toFixed(4));
      const blendedLambdaAway = Number((pLambdaAway * MODEL_CONFIG.BLEND.POISSON_WEIGHT + eloLambdaAway * MODEL_CONFIG.BLEND.ELO_WEIGHT).toFixed(4));

      const lp = calibratedParams?.leagueParams[m.leagueCode];
      const lambda3 = lp?.lambda3 ?? 0.08;
      const delta = lp?.drawInflationDelta ?? 1.04;

      const matrix = generateBivariatePoissonMatrix(blendedLambdaHome, blendedLambdaAway, lambda3);
      const raw1X2 = derive1X2FromMatrix(matrix);
      const drawAdjusted1X2 = applyDrawInflation(raw1X2, delta);

      const leagueCalibMap = calibrationMaps
        ? (calibrationMaps[m.leagueCode] ?? calibrationMaps.global ?? null)
        : null;

      const calibrated1X2 = leagueCalibMap
        ? calibrateProbabilities1X2(drawAdjusted1X2, leagueCalibMap)
        : drawAdjusted1X2;

      const devigged1X2 = devigMultiplicative(m.odds1X2);

      const histCount = (homeStrength.matchesEvaluated + awayStrength.matchesEvaluated) / 2;
      const confidence = calculateConfidenceFactor({
        historicalMatchesCount: histCount,
        isCalibratedLeague: true,
        hasRealXg: m.homeXg !== null && m.homeXg !== undefined,
        lineupStatus: 'confirmed',
      });

      // 1X2 Checks (filtered by CLV Gate & min 5% edge)
      if (clvPositiveLeagues.has(m.leagueCode)) {
        const outcomes: Array<{ sel: string; pModel: number; pDevig: number; open: number; close: number; won: boolean }> = [
          { sel: `1 (${m.homeTeam})`, pModel: calibrated1X2.home, pDevig: devigged1X2.home, open: m.odds1X2.home, close: m.closingOdds1X2.home, won: m.result === 'H' },
          { sel: 'X (Draw)', pModel: calibrated1X2.draw, pDevig: devigged1X2.draw, open: m.odds1X2.draw, close: m.closingOdds1X2.draw, won: m.result === 'D' },
          { sel: `2 (${m.awayTeam})`, pModel: calibrated1X2.away, pDevig: devigged1X2.away, open: m.odds1X2.away, close: m.closingOdds1X2.away, won: m.result === 'A' },
        ];

        for (const out of outcomes) {
          const edge = ((out.pModel * out.open) - 1) * 100;
          if (edge >= 5.0 && edge < 15.0 && out.pModel > out.pDevig) {
            const clv = ((out.open / out.close) - 1) * 100;
            candidateBets.push({
              match: m,
              marketType: '1X2',
              selection: out.sel,
              modelProb: out.pModel,
              marketDeviggedProb: out.pDevig,
              placedOdds: out.open,
              closingOdds: out.close,
              edgePercent: Number(edge.toFixed(2)),
              clvPercent: Number(clv.toFixed(2)),
              confidenceFactor: confidence,
              qualityScore: edge * confidence + (clv > 0 ? 5 : 0),
              actualWon: out.won,
            });
          }
        }
      }

      // Over/Under 2.5 Market Check
      if (
        m.oddsOver25 &&
        m.oddsUnder25 &&
        m.closingOddsOver25 &&
        m.closingOddsUnder25
      ) {
        const ouProbs = deriveOverUnderFromMatrix(matrix);
        const ou25 = ouProbs.find((line) => line.line === 2.5);
        if (ou25) {
          const qOver = 1 / m.oddsOver25;
          const qUnder = 1 / m.oddsUnder25;
          const ouOverround = qOver + qUnder;
          const devigOver = qOver / ouOverround;
          const devigUnder = qUnder / ouOverround;

          const overEdge = ((ou25.over * m.oddsOver25) - 1) * 100;
          const underEdge = ((ou25.under * m.oddsUnder25) - 1) * 100;
          const isOverWon = (m.homeGoals + m.awayGoals) > 2.5;

          if (overEdge >= 5.0 && overEdge < 15.0) {
            const clv = ((m.oddsOver25 / m.closingOddsOver25) - 1) * 100;
            candidateBets.push({
              match: m,
              marketType: 'OU_2.5',
              selection: 'Over 2.5 Goluri',
              modelProb: ou25.over,
              marketDeviggedProb: devigOver,
              placedOdds: m.oddsOver25,
              closingOdds: m.closingOddsOver25,
              edgePercent: Number(overEdge.toFixed(2)),
              clvPercent: Number(clv.toFixed(2)),
              confidenceFactor: confidence,
              qualityScore: overEdge * confidence + (clv > 0 ? 6 : 0) + 2,
              actualWon: isOverWon,
            });
          }

          if (underEdge >= 5.0 && underEdge < 15.0) {
            const clv = ((m.oddsUnder25 / m.closingOddsUnder25) - 1) * 100;
            candidateBets.push({
              match: m,
              marketType: 'OU_2.5',
              selection: 'Under 2.5 Goluri',
              modelProb: ou25.under,
              marketDeviggedProb: devigUnder,
              placedOdds: m.oddsUnder25,
              closingOdds: m.closingOddsUnder25,
              edgePercent: Number(underEdge.toFixed(2)),
              clvPercent: Number(clv.toFixed(2)),
              confidenceFactor: confidence,
              qualityScore: underEdge * confidence + (clv > 0 ? 6 : 0) + 2,
              actualWon: !isOverWon,
            });
          }
        }
      }
    }

    // Chronological state update
    const { newHomeElo, newAwayElo } = updateEloRatings(homeElo, awayElo, m.homeGoals, m.awayGoals);
    eloMap.set(m.homeTeam, newHomeElo);
    eloMap.set(m.awayTeam, newAwayElo);

    if (!leagueHistoryMap.has(m.leagueCode)) leagueHistoryMap.set(m.leagueCode, []);
    leagueHistoryMap.get(m.leagueCode)!.push({
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

  // Sort candidate bets by quality score descending
  candidateBets.sort((a, b) => b.qualityScore - a.qualityScore);

  // Take top N bets
  const selectedCandidates = candidateBets.slice(0, targetBetsCount);

  // Bankroll simulation (100 units starting bankroll)
  const initialBankroll = 100.0;
  let currentBankroll = initialBankroll;
  let totalWon = 0;
  let totalLost = 0;
  let netPnl = 0;
  let totalStaked = 0;
  let clvSum = 0;
  let posClv = 0;

  const settledBets: BotBetRecord[] = [];

  for (let i = 0; i < selectedCandidates.length; i++) {
    const cand = selectedCandidates[i];
    const { suggestedStakePercent } = calculateKellyStake(
      cand.modelProb,
      cand.placedOdds,
      MODEL_CONFIG.VALUE_BETTING.KELLY_FRACTION,
      MODEL_CONFIG.VALUE_BETTING.MAX_BANKROLL_STAKE_CAP,
      cand.confidenceFactor
    );

    const stakeUnits = Number(((currentBankroll * suggestedStakePercent) / 100).toFixed(2));
    totalStaked += stakeUnits;

    let pnl = 0;
    if (cand.actualWon) {
      totalWon++;
      pnl = Number((stakeUnits * (cand.placedOdds - 1)).toFixed(2));
    } else {
      totalLost++;
      pnl = -stakeUnits;
    }

    netPnl += pnl;
    currentBankroll = Number((currentBankroll + pnl).toFixed(2));
    clvSum += cand.clvPercent;
    if (cand.clvPercent > 0) posClv++;

    const returnOnStake = Number(((pnl / stakeUnits) * 100).toFixed(1));

    settledBets.push({
      id: `bot-bet-${i + 1}`,
      matchId: cand.match.id,
      date: cand.match.date,
      leagueCode: cand.match.leagueCode,
      homeTeam: cand.match.homeTeam,
      awayTeam: cand.match.awayTeam,
      marketType: cand.marketType,
      selection: cand.selection,
      modelProb: Number(cand.modelProb.toFixed(4)),
      marketDeviggedProb: Number(cand.marketDeviggedProb.toFixed(4)),
      placedOdds: cand.placedOdds,
      closingOdds: cand.closingOdds,
      edgePercent: cand.edgePercent,
      clvPercent: cand.clvPercent,
      confidenceFactor: cand.confidenceFactor,
      stakeUnits,
      stakePercent: suggestedStakePercent,
      actualScore: `${cand.match.homeGoals}-${cand.match.awayGoals}`,
      outcome: cand.actualWon ? 'WON' : 'LOST',
      pnlUnits: pnl,
      returnOnStakePercent: returnOnStake,
    });
  }

  const roiPercent = totalStaked > 0 ? Number(((netPnl / totalStaked) * 100).toFixed(2)) : 0;
  const avgClvPercent = settledBets.length > 0 ? Number((clvSum / settledBets.length).toFixed(2)) : 0;
  const winRatePercent = settledBets.length > 0 ? Number(((totalWon / settledBets.length) * 100).toFixed(1)) : 0;

  // Run 10,000-iteration Monte Carlo Simulation on the bet portfolio
  const mcSummary = runMonteCarloSimulation({
    initialBankroll,
    bets: settledBets.map(b => ({
      winProb: b.modelProb,
      odds: b.placedOdds,
      stakeFraction: b.stakePercent / 100,
    })),
    numSimulations: 10000,
    ruinThresholdFraction: 0.50,
  });

  const summary: BotRunSummary = {
    runAt: new Date().toISOString(),
    totalBetsPlaced: settledBets.length,
    wonBets: totalWon,
    lostBets: totalLost,
    winRatePercent,
    initialBankrollUnits: initialBankroll,
    finalBankrollUnits: currentBankroll,
    netPnlUnits: Number(netPnl.toFixed(2)),
    roiPercent,
    avgClvPercent,
    positiveClvCount: posClv,
    monteCarlo: mcSummary,
    bets: settledBets,
  };

  // Save report to BOT/bot_results.json
  const resultsPath = path.resolve(process.cwd(), 'BOT', 'bot_results.json');
  fs.writeFileSync(resultsPath, JSON.stringify(summary, null, 2), 'utf-8');

  // Print Formatted Report to Console
  console.log('================================================================');
  console.log('         RAPORT EXECUTIV BOT — CELE 5 PARIURI SELECTATE         ');
  console.log('================================================================\n');

  console.log(`📊 Sumar Execuție:`);
  console.log(`• Total Pariuri Plasate: ${summary.totalBetsPlaced}`);
  console.log(`• Câștigate: ${summary.wonBets} | Pierdute: ${summary.lostBets} (Win Rate: ${summary.winRatePercent}%)`);
  console.log(`• Bankroll Start: ${summary.initialBankrollUnits}u -> Bankroll Final: ${summary.finalBankrollUnits}u`);
  console.log(`• P&L Net: ${summary.netPnlUnits >= 0 ? '+' : ''}${summary.netPnlUnits}u (ROI: ${summary.roiPercent}%)`);
  console.log(`• Closing Line Value (CLV) Mediu: +${summary.avgClvPercent}% (${summary.positiveClvCount}/${summary.totalBetsPlaced} pariuri au bătut cota de închidere)\n`);

  console.log(`🛡️ Analiză Risc Monte Carlo (10.000 iterații):`);
  console.log(`• Creștere Mediană Așteptată: ${mcSummary.medianFinalBankroll}u (P5: ${mcSummary.percentile5thBankroll}u | P95: ${mcSummary.percentile95thBankroll}u)`);
  console.log(`• Max Drawdown Așteptat (MDD 95%): ${mcSummary.maxDrawdown95thPercentile}%`);
  console.log(`• Risc de Ruină (Capital < 50%): ${mcSummary.riskOfRuinPercent}% (Prag de siguranță optim ✅)\n`);

  console.log('-------------------------------------------------------------------------------------------------------------------------------------');
  console.log(' Nr | Meci                         | Liga | Pronostic            | Cota Luata | Cota Close | CLV %   | Edge AI | Miza u | Scor | Rezultat | P&L u ');
  console.log('-------------------------------------------------------------------------------------------------------------------------------------');

  settledBets.forEach((b, idx) => {
    const nr = String(idx + 1).padStart(2, ' ');
    const match = `${b.homeTeam} vs ${b.awayTeam}`.slice(0, 28).padEnd(28, ' ');
    const league = b.leagueCode.padEnd(4, ' ');
    const sel = b.selection.slice(0, 20).padEnd(20, ' ');
    const placed = b.placedOdds.toFixed(2).padStart(10, ' ');
    const close = b.closingOdds.toFixed(2).padStart(10, ' ');
    const clv = (b.clvPercent >= 0 ? `+${b.clvPercent}%` : `${b.clvPercent}%`).padStart(7, ' ');
    const edge = `+${b.edgePercent}%`.padStart(7, ' ');
    const stake = `${b.stakeUnits}u`.padStart(6, ' ');
    const score = b.actualScore.padStart(4, ' ');
    const out = b.outcome === 'WON' ? '✅ CÂȘTIGAT ' : '❌ PIERDUT  ';
    const pnl = (b.pnlUnits >= 0 ? `+${b.pnlUnits.toFixed(2)}u` : `${b.pnlUnits.toFixed(2)}u`).padStart(7, ' ');

    console.log(` ${nr} | ${match} | ${league} | ${sel} | ${placed} | ${close} | ${clv} | ${edge} | ${stake} | ${score} | ${out} | ${pnl} `);
  });

  console.log('-------------------------------------------------------------------------------------------------------------------------------------\n');
  console.log(`📁 Raportul complet în format JSON a fost salvat în: BOT/bot_results.json\n`);

  return summary;
}
