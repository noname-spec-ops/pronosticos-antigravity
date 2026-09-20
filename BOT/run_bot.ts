/**
 * FlashStat — CLI Runner for the Value Betting Bot
 * 
 * Usage:
 *   npx tsx BOT/run_bot.ts
 */

import { runBotSimulation } from './bot_engine';

try {
  runBotSimulation(5);
} catch (err: any) {
  console.error('[BOT ERROR]:', err.message);
  process.exit(1);
}
