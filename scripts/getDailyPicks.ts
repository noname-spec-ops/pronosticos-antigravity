/**
 * FlashStat — Daily Predictions & AI Ticket Generator (scripts/getDailyPicks.ts)
 * 
 * Computes all market types (Over/Under 1.5 & 2.5, 1X2, Double Chance, BTTS, Exact Score)
 * and selects the highest-probability and highest-value predictions.
 * 
 * Usage:
 *   npm run picks
 *   npm run picks -- --date 2026-09-21
 */

import fs from 'fs';
import path from 'path';
import { apiFootballService } from '../services/apiFootball';
import { oddsProvider } from '../services/oddsProvider';
import { strengthStore } from '../lib/strengthStore';
import { LEAGUE_ID_TO_CODE } from '../lib/leagueCodes';
import { runMatchPredictionPipeline } from '../engine';
import {
  getAllMarketCandidates,
  getHighestProbabilityPick,
  getBestBalancedPick,
  getTopExactScoresForFixture,
  type MarketCandidate,
} from '../engine/marketEvaluator';
import { syncFixturesToPaperBets, getPersistentPaperBets } from '../engine/paperTrading';
import { sortFixturesByPriority } from '../lib/leaguePriority';
import { todayLocalISO } from '../lib/localDate';
import type { Fixture } from '../types/football';

interface PickItem {
  time: string;
  league: string;
  match: string;
  pick: string;
  odd: number;
  probPercent: number;
  edgePercent: number;
  stake: string;
  isSniper: boolean;
  score?: string;
  status?: string;
  exactScorePred?: string;
  safestPick?: string;
  safestProb?: number;
  safestOdd?: number;
}

function parseArgs(): { date: string } {
  const args = process.argv.slice(2);
  let date = todayLocalISO();
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--date' && args[i + 1]) {
      date = args[i + 1];
    }
  }
  return { date };
}

async function main() {
  const { date } = parseArgs();
  console.log(`\n========================================================================`);
  console.log(`   ⚡ FLASHSTAT QUANT RADAR — GENERATOR MULTI-PIEȚE & CEL MAI SIGUR ⚡`);
  console.log(`   Data selectată: ${date}`);
  console.log(`========================================================================\n`);

  console.log(`⏳ Se încarcă meciurile și se calculează matricea completă (1X2, Peste 1.5, 2.5, Șansă Dublă, GG, Scor Exact)...`);

  const { fixtures } = await apiFootballService.getFixturesByDate(date);
  if (fixtures.length === 0) {
    console.log(`⚠️ Nu au fost găsite meciuri pentru data ${date}.`);
    return;
  }

  const prioritized = sortFixturesByPriority(fixtures);

  let oddsBySlate = new Map<number, any>();
  try {
    oddsBySlate = await oddsProvider.getOddsForFixtures(prioritized);
  } catch {}

  const allPicks: PickItem[] = [];
  const safePicks: PickItem[] = [];
  const sniperPicks: PickItem[] = [];
  const exactScoreList: Array<{ time: string; league: string; match: string; scorePred: string; prob: number; fairOdd: number; actualScore: string }> = [];
  const enrichedFixtures: Fixture[] = [];

  for (const f of prioritized) {
    const odds = f.odds || oddsBySlate.get(f.id) || undefined;
    const leagueCode = LEAGUE_ID_TO_CODE[f.league.id];
    const homeMetrics = strengthStore.getTeamMetrics(f.homeTeam.name, leagueCode);
    const awayMetrics = strengthStore.getTeamMetrics(f.awayTeam.name, leagueCode);

    const effectiveHomeMetrics = homeMetrics || {
      elo: 1500,
      homeAttack: 1.18,
      homeDefense: 1.05,
      awayAttack: 0.95,
      awayDefense: 1.15,
      leagueAvgGoalsHome: 1.45,
      leagueAvgGoalsAway: 1.15,
      matchesEvaluated: 6,
      isInsufficientData: true,
    };

    const effectiveAwayMetrics = awayMetrics || {
      elo: 1500,
      homeAttack: 1.18,
      homeDefense: 1.05,
      awayAttack: 0.95,
      awayDefense: 1.15,
      leagueAvgGoalsHome: 1.45,
      leagueAvgGoalsAway: 1.15,
      matchesEvaluated: 6,
      isInsufficientData: true,
    };

    const pred = runMatchPredictionPipeline({
      fixture: { ...f, odds },
      homeStrength: effectiveHomeMetrics,
      awayStrength: effectiveAwayMetrics,
      homeElo: effectiveHomeMetrics.elo,
      awayElo: effectiveAwayMetrics.elo,
      leagueCode,
    });

    const isFinished = ['FT', 'AET', 'PEN'].includes(f.status);
    const homeScore = f.score?.fulltime?.home ?? f.score?.current?.home ?? f.homeScore;
    const awayScore = f.score?.fulltime?.away ?? f.score?.current?.away ?? f.awayScore;
    const hasScore = homeScore !== null && homeScore !== undefined && awayScore !== null && awayScore !== undefined;
    const scoreText = hasScore ? `${homeScore} - ${awayScore}` : isFinished ? 'FT' : '-';

    const fWithPred: Fixture = {
      ...f,
      odds,
      prediction: pred,
      homeScore: hasScore ? (homeScore as number) : undefined,
      awayScore: hasScore ? (awayScore as number) : undefined,
    };
    enrichedFixtures.push(fWithPred);

    const allCands = getAllMarketCandidates(fWithPred);
    const bestCand = getBestBalancedPick(fWithPred);
    const safestCand = getHighestProbabilityPick(fWithPred, 1.15);
    const topScores = getTopExactScoresForFixture(fWithPred, 3);

    const timeStr = new Date(f.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const matchName = `${f.homeTeam.name} vs ${f.awayTeam.name}`;
    const leagueName = f.league.name;

    const topExact = topScores[0];
    const exactStr = topExact ? `${topExact.homeGoals}-${topExact.awayGoals} (${Math.round(topExact.probability * 100)}%)` : '-';

    if (topExact) {
      exactScoreList.push({
        time: timeStr,
        league: leagueName,
        match: matchName,
        scorePred: `${topExact.homeGoals} - ${topExact.awayGoals}`,
        prob: Math.round(topExact.probability * 100),
        fairOdd: topExact.fairOdds,
        actualScore: scoreText,
      });
    }

    const item: PickItem = {
      time: timeStr,
      league: leagueName,
      match: matchName,
      pick: bestCand?.label || '1',
      odd: bestCand?.odd || 1.50,
      probPercent: bestCand?.probPercent || 50,
      edgePercent: bestCand?.edgePercent || 0,
      stake: bestCand?.stakeUnits || '1.0u',
      isSniper: bestCand?.isSniper || false,
      score: scoreText,
      status: f.status,
      exactScorePred: exactStr,
      safestPick: safestCand?.label,
      safestProb: safestCand?.probPercent,
      safestOdd: safestCand?.odd,
    };

    allPicks.push(item);
    if (bestCand?.isSniper) sniperPicks.push(item);
    if (safestCand && safestCand.probPercent >= 70) safePicks.push(item);
  }

  // Sortings
  safePicks.sort((a, b) => (b.safestProb || 0) - (a.safestProb || 0));
  sniperPicks.sort((a, b) => b.probPercent - a.probPercent);
  exactScoreList.sort((a, b) => b.prob - a.prob);

  // 1. Terminal Output: Top Safest Picks (Highest Win Probabilities: Over 1.5, Double Chance, etc.)
  console.log(`\n🌟 ================= TOP ȘANSE MAXIME (Pronosticuri Safe: Peste 1.5, 1X, 12) ================= 🌟`);
  if (safePicks.length > 0) {
    console.log(`Ora   | Liga            | Meci                                  | Scor  | Pronostic Safe             | Cota | Încredere`);
    console.log(`---------------------------------------------------------------------------------------------------------------------`);
    for (const p of safePicks.slice(0, 8)) {
      console.log(
        `${p.time.padEnd(5)} | ${p.league.slice(0, 15).padEnd(15)} | ${p.match.slice(0, 37).padEnd(37)} | ${(p.score || '-').padEnd(5)} | ${(p.safestPick || p.pick).slice(0, 26).padEnd(26)} | @${(p.safestOdd || p.odd).toFixed(2).padEnd(4)} | ${p.safestProb || p.probPercent}%`
      );
    }
  }

  // 2. Terminal Output: Top Sniper Picks (Over 2.5)
  console.log(`\n🎯 ================= TOP SNIPER PICKS (Peste 2.5 Goluri) ================= 🎯`);
  if (sniperPicks.length > 0) {
    console.log(`Ora   | Liga            | Meci                                  | Scor  | Pronostic   | Cota | Încredere`);
    console.log(`-------------------------------------------------------------------------------------------------`);
    for (const p of sniperPicks.slice(0, 6)) {
      console.log(
        `${p.time.padEnd(5)} | ${p.league.slice(0, 15).padEnd(15)} | ${p.match.slice(0, 37).padEnd(37)} | ${(p.score || '-').padEnd(5)} | ${p.pick.padEnd(11)} | @${p.odd.toFixed(2).padEnd(4)} | ${p.probPercent}%`
      );
    }
  }

  // 3. Terminal Output: Top Exact Scores
  console.log(`\n🔢 ================= TOP SCORURI EXACTE PROBABILE (Dixon-Coles) ================= 🔢`);
  console.log(`Ora   | Liga            | Meci                                  | Scor Final | Scor Prezis | Probabilitate | Cotă Fair`);
  console.log(`----------------------------------------------------------------------------------------------------------------`);
  for (const es of exactScoreList.slice(0, 6)) {
    console.log(
      `${es.time.padEnd(5)} | ${es.league.slice(0, 15).padEnd(15)} | ${es.match.slice(0, 37).padEnd(37)} | ${es.actualScore.padEnd(10)} | ${es.scorePred.padEnd(11)} | ${es.prob}%         | @${es.fairOdd.toFixed(2)}`
    );
  }

  // 4. Terminal Output: Biletul Zilei AI
  const ticketPool = (safePicks.length >= 3 ? safePicks : allPicks).filter(p => (p.safestProb || p.probPercent) >= 70);
  const ticketPicks = (ticketPool.length >= 3 ? ticketPool : allPicks).slice(0, 3);
  const totalOdd = ticketPicks.reduce((acc, p) => acc * (p.safestOdd || p.odd), 1);

  console.log(`\n🎫 ================= BILETUL ZILEI AI (ȘANSE MAXIME DE REUȘITĂ) ================= 🎫`);
  console.log(`Cotă Totală Recomandată: @${totalOdd.toFixed(2)} | Miză recomandată: 3.0u\n`);
  ticketPicks.forEach((p, idx) => {
    const selName = p.safestPick || p.pick;
    const selOdd = p.safestOdd || p.odd;
    const selProb = p.safestProb || p.probPercent;
    console.log(`  ${idx + 1}. [${p.time}] ${p.match}${p.score && p.score !== '-' ? ` [Scor: ${p.score}]` : ''}`);
    console.log(`     👉 Pronostic: ${selName} | Cota: @${selOdd.toFixed(2)} | Încredere: ${selProb}%\n`);
  });

  // 5. Export Markdown Report
  const outDir = path.resolve(process.cwd(), 'data');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const mdLines = [
    `# ⚡ FlashStat — Pronosticuri Multi-Piețe & Biletul Zilei (${date})\n`,
    `> Generat automat de motorul cantitativ Dixon-Coles & Evaluatorul Multi-Piețe la ${new Date().toISOString()}\n`,
    `## 🎫 Biletul Zilei AI — Șanse Maxime (Cotă Totală: @${totalOdd.toFixed(2)})\n`,
    `| # | Ora | Competiție | Meci | Scor | Pronostic Recomandat | Cotă | Încredere |`,
    `|---|---|---|---|---|---|---|---|`,
    ...ticketPicks.map(
      (p, i) =>
        `| ${i + 1} | ${p.time} | ${p.league} | **${p.match}** | \`${p.score || '-'}\` | \`${p.safestPick || p.pick}\` | **@${(p.safestOdd || p.odd).toFixed(2)}** | **${p.safestProb || p.probPercent}%** |`
    ),
    `\n## 🌟 Top Pronosticuri Safe (Peste 1.5, Șansă Dublă 1X/X2, Peste 0.5)\n`,
    `| Ora | Competiție | Meci | Scor | Cel Mai Sigur Pronostic | Cotă | Încredere |`,
    `|---|---|---|---|---|---|---|`,
    ...safePicks.slice(0, 10).map(
      (p) =>
        `| ${p.time} | ${p.league} | ${p.match} | \`${p.score || '-'}\` | \`${p.safestPick || p.pick}\` | @${(p.safestOdd || p.odd).toFixed(2)} | **${p.safestProb || p.probPercent}%** |`
    ),
    `\n## 🎯 Top Sniper Picks (Peste 2.5 Goluri)\n`,
    `| Ora | Competiție | Meci | Scor | Pronostic | Cotă | Încredere |`,
    `|---|---|---|---|---|---|---|`,
    ...sniperPicks.map(
      (p) => `| ${p.time} | ${p.league} | ${p.match} | \`${p.score || '-'}\` | \`${p.pick}\` | @${p.odd.toFixed(2)} | ${p.probPercent}% |`
    ),
    `\n## 🔢 Top Scoruri Exacte Probabile (Matricea Dixon-Coles)\n`,
    `| Ora | Competiție | Meci | Scor Final | Scor Prezis | Probabilitate | Cotă Justă |`,
    `|---|---|---|---|---|---|---|`,
    ...exactScoreList.slice(0, 10).map(
      (es) => `| ${es.time} | ${es.league} | ${es.match} | \`${es.actualScore}\` | \`${es.scorePred}\` | **${es.prob}%** | @${es.fairOdd.toFixed(2)} |`
    ),
    `\n## 📋 Toate Meciurile Zilei (${allPicks.length} Meciuri)\n`,
    `| Ora | Competiție | Meci | Scor | Pronostic Principal | Cel Mai Sigur | Scor Prezis | Cotă | Încredere |`,
    `|---|---|---|---|---|---|---|---|---|`,
    ...allPicks.map(
      (p) =>
        `| ${p.time} | ${p.league} | ${p.match} | \`${p.score || '-'}\` | \`${p.pick}\` | \`${p.safestPick || '-'}\` | \`${p.exactScorePred || '-'}\` | @${p.odd.toFixed(2)} | ${p.probPercent}% |`
    ),
    `\n---\n*Notă: Estimări bazate pe distribuții stochastice și modele matematice fără data-leakage.*`,
  ];

  const mdPath = path.join(outDir, 'daily_picks.md');
  fs.writeFileSync(mdPath, mdLines.join('\n'), 'utf-8');

  // Sync to persistent Paper Trading Ledger
  try {
    const existingBets = getPersistentPaperBets();
    const updatedBets = syncFixturesToPaperBets(enrichedFixtures, existingBets);
    const paperBetsPath = path.join(outDir, 'paper_bets.json');
    fs.writeFileSync(paperBetsPath, JSON.stringify(updatedBets, null, 2), 'utf-8');
    console.log(`📊 Paper Trading: ${updatedBets.length} pariuri sincronizate și actualizate în data/paper_bets.json`);
  } catch (err) {
    console.warn('Paper Trading sync notice:', err);
  }

  console.log(`\n💾 Raportul complet a fost salvat în fișierul: data/daily_picks.md`);
  console.log(`========================================================================\n`);
}

main().catch((err) => {
  console.error('Error generating daily picks:', err);
  process.exit(1);
});
