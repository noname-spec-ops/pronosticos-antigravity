/**
 * FlashStat — Interactive Telegram Bot Controller (BOT/telegram_bot.ts)
 * 
 * Simulates and executes Telegram commands:
 * - /top5: Returns the top 5 value bets with fractional Kelly stakes
 * - /live: Returns live in-play momentum alerts & imminent goal projections
 * - /snipe: Returns in-play sniper inefficiencies
 * - /bilet: Generates an optimized AI combo ticket
 * - /bankroll: Returns current paper trading P&L and risk metrics
 */

import { runBotSimulation } from './bot_engine';
import { runLiveSniperBot } from './live_sniper_bot';
import { buildAndEvaluateTicket } from '../engine/comboBuilder';
import { getInitialPaperBets, calculatePaperTradingSummary } from '../engine/paperTrading';

export function handleTelegramCommand(command: string): string {
  const cmd = command.trim().toLowerCase();

  switch (cmd) {
    case '/start':
    case '/help':
      return [
        `🤖 <b>FlashStat OP GODMODE — Telegram Bot</b>`,
        ``,
        `Comenzi disponibile:`,
        `🎯 <code>/top5</code> — Top 5 Value Bets & Mize Kelly`,
        `⚡ <code>/live</code> — Meciuri LIVE & Radar Gol Iminent`,
        `🚨 <code>/snipe</code> — Vânătorul de ineficiențe Live (min 55-80)`,
        `🎟️ <code>/bilet</code> — Biletul Zilei Optimizat AI (cotă 2.50-4.00)`,
        `💰 <code>/bankroll</code> — Portofoliu Virtual & Monitor Drawdown`,
      ].join('\n');

    case '/top5': {
      const sim = runBotSimulation(5);
      const lines = [
        `📊 <b>TOP 5 VALUE BETS — FLASHSTAT QUANT</b>`,
        `Win Rate: ${sim.winRatePercent}% | ROI: +${sim.roiPercent}% | CLV Mediu: +${sim.avgClvPercent}%`,
        ``,
      ];
      sim.bets.forEach((b, i) => {
        lines.push(
          `<b>${i + 1}. ${b.homeTeam} vs ${b.awayTeam}</b> (${b.leagueCode})`,
          `👉 Pronostic: <code>${b.selection}</code>`,
          `📈 Cotă: <b>${b.placedOdds.toFixed(2)}</b> (CLV: +${b.clvPercent}%) | Miză: <b>${b.stakeUnits}u</b>`,
          `✨ Edge AI: +${b.edgePercent}% | Scor: ${b.actualScore} (${b.outcome === 'WON' ? '✅ CÂȘTIGAT' : '❌ PIERDUT'})`,
          ``
        );
      });
      return lines.join('\n');
    }

    case '/snipe':
    case '/live': {
      const scan = runLiveSniperBot();
      if (scan.snipeOpportunitiesCount === 0) {
        return `⏳ <b>RADAR LIVE:</b> Nicio oportunitate extremă de sniping detectată la această oră. Monitorizarea rulează continuu.`;
      }
      const lines = [
        `🎯 <b>LIVE IN-PLAY SNIPER — OPORTUNITĂȚI DETECTATE (${scan.snipeOpportunitiesCount})</b>`,
        ``,
      ];
      scan.opportunities.forEach((o, i) => {
        lines.push(
          `<b>${i + 1}. [${o.urgency}] ${o.matchName}</b> (min ${o.elapsedMinute}', scor ${o.currentScore})`,
          `⚡ Presiune: ${o.dominantTeam} (${o.momentumPercent}%) | xG: ${o.totalXg}`,
          `👉 <b>Pariu Recomandat:</b> <code>${o.recommendedBet}</code>`,
          `📈 Cotă Live: <b>${o.bookmakerOdd.toFixed(2)}</b> (Fair: ${o.fairOdd.toFixed(2)}) | Edge: <b>+${o.edgePercent}%</b>`,
          `💡 <i>${o.reasoning}</i>`,
          ``
        );
      });
      return lines.join('\n');
    }

    case '/bilet': {
      const ticket = buildAndEvaluateTicket([
        {
          id: '1',
          fixtureId: 1001,
          matchName: 'Man City vs Arsenal',
          leagueName: 'Premier League',
          marketType: 'over_2_5',
          marketLabel: 'Peste 2.5 Goluri',
          bookmakerOdd: 1.85,
          modelProb: 0.62,
          fairOdd: 1.61,
          edgePercent: 14.9,
        },
        {
          id: '2',
          fixtureId: 1002,
          matchName: 'Real Madrid vs Barcelona',
          leagueName: 'La Liga',
          marketType: 'home',
          marketLabel: '1 (Real Madrid)',
          bookmakerOdd: 2.15,
          modelProb: 0.54,
          fairOdd: 1.85,
          edgePercent: 16.2,
        },
      ]);
      return [
        `🎟️ <b>BILETUL ZILEI OPTIMIZAT AI</b>`,
        `• Cota Totală: <b>${ticket.totalBookmakerOdds.toFixed(2)}</b>`,
        `• Probabilitate Cumulată: <b>${(ticket.jointModelProb * 100).toFixed(1)}%</b>`,
        `• Marjă Compusă Casă: ${ticket.compoundedHouseMarginPercent.toFixed(1)}%`,
        ``,
        `1. Man City vs Arsenal 👉 <b>Peste 2.5 Goluri</b> @ 1.85`,
        `2. Real Madrid vs Barcelona 👉 <b>1 (Real Madrid)</b> @ 2.15`,
        ``,
        `💰 Miză Recomandată: <b>2.5u</b>`,
      ].join('\n');
    }

    case '/bankroll': {
      const bets = getInitialPaperBets();
      const summary = calculatePaperTradingSummary(bets);
      return [
        `💼 <b>RAPORT PORTOFOLIU & BANKROLL</b>`,
        `• Bankroll Curent: <b>${summary.currentBankrollUnits.toFixed(2)}u</b> (Start: ${summary.startingBankrollUnits}u)`,
        `• Profit Net: <b>+${summary.netPnlUnits.toFixed(2)}u</b> (ROI: <b>+${summary.roiPercent.toFixed(2)}%</b>)`,
        `• Win Rate: <b>${summary.winRatePercent.toFixed(1)}%</b> (${summary.wonBets}/${summary.totalBets} câștigate)`,
        `• Max Drawdown: <b>${summary.maxDrawdownPercent.toFixed(2)}%</b>`,
        `• Status Kill-Switch: ${summary.killSwitch.isActive ? '🔴 ACTIVAT' : '🟢 SIGUR (Normal)'}`,
      ].join('\n');
    }

    default:
      return `❌ Comandă necunoscută. Tastează <code>/help</code> pentru a vedea lista de comenzi.`;
  }
}

if (require.main === module) {
  const cmd = process.argv[2] || '/help';
  console.log(`\n[Telegram Bot CLI Executing: ${cmd}]\n`);
  const response = handleTelegramCommand(cmd);
  console.log(response.replace(/<[^>]*>/g, '')); // Strip HTML for console
  console.log('\n');
}
