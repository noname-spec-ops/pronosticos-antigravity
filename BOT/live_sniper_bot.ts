/**
 * FlashStat — Live In-Play Sniper Autonomous BOT (BOT/live_sniper_bot.ts)
 * 
 * Usage:
 *   npx tsx BOT/live_sniper_bot.ts
 */

import fs from 'fs';
import path from 'path';
import type { Fixture } from '../types/football';
import { scanLiveSniperOpportunities } from '../engine/liveSniper';
import { runMatchPredictionPipeline } from '../engine';
import { strengthStore } from '../lib/strengthStore';

export function runLiveSniperBot() {
  console.log('================================================================');
  console.log('    🎯 FlashStat — LIVE IN-PLAY SNIPER BOT (OP GODMODE)        ');
  console.log('================================================================\n');

  const fixturesPath = path.resolve(process.cwd(), 'fixtures', 'matches.json');
  if (!fs.existsSync(fixturesPath)) {
    throw new Error('fixtures/matches.json not found');
  }

  const rawFixtures: Fixture[] = JSON.parse(fs.readFileSync(fixturesPath, 'utf-8'));

  // Enrich fixtures with prediction pipeline so inPlayMomentum & liveOdds are calculated
  const enrichedFixtures = rawFixtures.map((f) => {
    const homeMetrics = strengthStore.getTeamMetrics(f.homeTeam.name);
    const awayMetrics = strengthStore.getTeamMetrics(f.awayTeam.name);

    const homeStrength = {
      teamId: f.homeTeam.id,
      teamName: f.homeTeam.name,
      matchesEvaluated: homeMetrics?.matchesEvaluated || 8,
      homeAttack: homeMetrics?.homeAttack || 1.25,
      homeDefense: homeMetrics?.homeDefense || 1.05,
      awayAttack: homeMetrics?.awayAttack || 1.05,
      awayDefense: homeMetrics?.awayDefense || 1.15,
      leagueAvgGoalsHome: 1.45,
      leagueAvgGoalsAway: 1.15,
      isShrinkageApplied: false,
      homeAdvantageIndex: 1.0,
    };

    const awayStrength = {
      teamId: f.awayTeam.id,
      teamName: f.awayTeam.name,
      matchesEvaluated: awayMetrics?.matchesEvaluated || 8,
      homeAttack: awayMetrics?.homeAttack || 1.25,
      homeDefense: awayMetrics?.homeDefense || 1.05,
      awayAttack: awayMetrics?.awayAttack || 1.05,
      awayDefense: awayMetrics?.awayDefense || 1.15,
      leagueAvgGoalsHome: 1.45,
      leagueAvgGoalsAway: 1.15,
      isShrinkageApplied: false,
      homeAdvantageIndex: 1.0,
    };

    const pred = runMatchPredictionPipeline({
      fixture: f,
      homeStrength,
      awayStrength,
      homeElo: homeMetrics?.elo || 1550,
      awayElo: awayMetrics?.elo || 1500,
      isLeagueCalibrated: true,
    });

    return {
      ...f,
      prediction: pred,
    };
  });

  const scanResult = scanLiveSniperOpportunities(enrichedFixtures);

  console.log(`📡 Scanare Live Finalizată la: ${scanResult.scanTimestamp}`);
  console.log(`• Meciuri Live Active Scanate: ${scanResult.liveMatchesEvaluated}`);
  console.log(`• Oportunități Ultra-Sniper Detectate: ${scanResult.snipeOpportunitiesCount} 🎯\n`);

  if (scanResult.snipeOpportunitiesCount === 0) {
    console.log('ℹ️ Nicio oportunitate extremă de sniping detectată în acest moment.');
    console.log('Sistemul continuă monitorizarea meciurilor live în fundal.\n');
    return scanResult;
  }

  console.log('================================================================');
  console.log('           OPORTUNITĂȚI DETECTATE — LIVE IN-PLAY SNIPER         ');
  console.log('================================================================\n');

  scanResult.opportunities.forEach((opp, i) => {
    const urgencyBadge = opp.urgency === 'EXTREME' ? '🚨 EXTREME' : '🔥 HIGH';
    console.log(`[SNIPE #${i + 1}] ${urgencyBadge} | ${opp.matchName} (${opp.leagueName})`);
    console.log(`• Minut: ${opp.elapsedMinute}' | Scor Live: ${opp.currentScore}`);
    console.log(`• Presiune: ${opp.dominantTeam} (${opp.momentumPercent}%) | xG Cumulat: ${opp.totalXg} | Șuturi pe Poartă: ${opp.totalShotsOnTarget}`);
    console.log(`• Pariu Recomandat: 👉 ${opp.recommendedBet}`);
    console.log(`• Cota Live: ${opp.bookmakerOdd.toFixed(2)} (Cota Corectă AI: ${opp.fairOdd.toFixed(2)}) | Edge: +${opp.edgePercent}% | Încredere: ${opp.confidenceScore}%`);
    console.log(`• Justificare Tactică: ${opp.reasoning}`);
    console.log('----------------------------------------------------------------\n');
  });

  const outPath = path.resolve(process.cwd(), 'BOT', 'live_sniper_results.json');
  fs.writeFileSync(outPath, JSON.stringify(scanResult, null, 2), 'utf-8');
  console.log(`📁 Rezultatele scanării Live Sniper au fost salvate în: BOT/live_sniper_results.json\n`);

  return scanResult;
}

if (require.main === module) {
  runLiveSniperBot();
}
