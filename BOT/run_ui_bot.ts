/**
 * FlashStat — CLI Runner for the UI Button Verification Bot
 * 
 * Usage:
 *   npx tsx BOT/run_ui_bot.ts
 */

import { runUiVerificationAudit } from './ui_tester';

try {
  const report = runUiVerificationAudit();
  if (!report.allInteractiveButtonsWorking) {
    process.exit(1);
  }
} catch (err: any) {
  console.error('[UI BOT ERROR]:', err.message);
  process.exit(1);
}
