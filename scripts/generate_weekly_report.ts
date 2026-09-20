/**
 * FlashStat — CLI Runner for Weekly Performance & Capital Allocation Report
 */

import { generateWeeklyReport } from '../engine/weeklyReport';

console.log('================================================================');
console.log('  FlashStat — Weekly Quantitative Performance Audit Report      ');
console.log('================================================================\n');

const report = generateWeeklyReport();

console.log(`Perioadă: ${report.periodLabel}`);
console.log(`Generat la: ${report.generatedAt}`);
console.log(`Stare Kill-Switch: ${report.killSwitchStatus}\n`);

console.log('--- 7 ZILE (ROLLED) ---');
console.log(`Pariuri: ${report.sevenDays.totalBets} | ROI: ${report.sevenDays.roiPercent}% | CLV Mediu: ${report.sevenDays.avgClvPercent}% | Win Rate: ${report.sevenDays.winRatePercent}%\n`);

console.log('--- 30 ZILE (ROLLED) ---');
console.log(`Pariuri: ${report.thirtyDays.totalBets} | ROI: ${report.thirtyDays.roiPercent}% | CLV Mediu: ${report.thirtyDays.avgClvPercent}% | Win Rate: ${report.thirtyDays.winRatePercent}%\n`);

console.log('--- ALL-TIME (TOTAL) ---');
console.log(`Pariuri: ${report.allTime.totalBets} | ROI: ${report.allTime.roiPercent}% | CLV Mediu: ${report.allTime.avgClvPercent}% | Max Drawdown: ${report.allTime.maxDrawdownPercent}%\n`);

console.log('--- VERDICTE DE ALOCARE CAPITAL PER LIGĂ ---');
console.table(report.leagueVerdicts);

console.log('\n--- VERDICTE PER PIAȚĂ (1X2 / OU / BTTS / AH) ---');
console.table(report.marketVerdicts);

console.log(`\n${report.executiveSummary}`);
console.log('\nRaport salvat în: data/weekly_report.json');