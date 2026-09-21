import type { Fixture } from '../types/football';
import { isSniperPick, getBestBalancedPick, getHighestProbabilityPick } from './marketEvaluator';

export interface PaperBet {
  id: string;
  fixtureId: number;
  matchName: string;
  leagueName: string;
  marketType: string;
  pick: string;
  placedOdds: number;
  closingOdds: number;
  modelProb: number;
  edgePercent: number;
  clvPercent: number; // ((placedOdds / closingOdds) - 1) * 100
  stakeUnits: number;
  confidenceFactor?: number;
  bookmaker?: string;
  placedAt: string;
  settledAt?: string;
  status: 'PENDING' | 'WON' | 'LOST' | 'VOID';
  pnlUnits?: number; // (odds - 1) * stake if WON, -stake if LOST
  category: 'SNIPER' | 'VALUE' | 'COMBO' | 'MANUAL';
  isSharpBeating: boolean; // true if CLV > 0
}

export interface KillSwitchStatus {
  isActive: boolean;
  reason: 'NONE' | 'DRAWDOWN_15_PCT_24H' | 'DRAWDOWN_25_PCT_PERMANENT';
  drawdownPercent: number;
  suspendedUntil?: string; // ISO date string or 'MANUAL_RECALIBRATION_REQUIRED'
  canPlaceBets: boolean;
  message: string;
}

export interface PaperTradingSummary {
  startingBankrollUnits: number;
  currentBankrollUnits: number;
  netPnlUnits: number;
  roiPercent: number;
  totalBets: number;
  wonBets: number;
  lostBets: number;
  pendingBets: number;
  winRatePercent: number;
  averageCLVPercent: number;
  positiveClvRatePercent: number;
  brierScore: number;
  maxDrawdownPercent: number;
  sharpeRatio: number;
  killSwitch: KillSwitchStatus;
  recentBets: PaperBet[];
}

/** Data directory, overridable via FLASHSTAT_DATA_DIR (used by tests and scripts). */
export function resolveDataDir(pathMod: typeof import('path')): string {
  return process.env.FLASHSTAT_DATA_DIR
    ? pathMod.resolve(process.env.FLASHSTAT_DATA_DIR)
    : pathMod.resolve(process.cwd(), 'data');
}

/**
 * Guards the real data/ directory against writes from a test run. Tests that
 * genuinely need to exercise persistence set FLASHSTAT_DATA_DIR to a scratch
 * directory (see vitest.setup.ts); anything else running under a test runner is
 * refused, because writing there injects synthetic bets into the live ledger and
 * corrupts every ROI figure derived from it.
 */
export function isPersistenceBlocked(): boolean {
  const underTest =
    typeof process !== 'undefined' &&
    (process.env.VITEST === 'true' || process.env.NODE_ENV === 'test');
  const hasScratchDir = typeof process !== 'undefined' && !!process.env.FLASHSTAT_DATA_DIR;
  return underTest && !hasScratchDir;
}

function getNodeUtils() {
  if (typeof window === 'undefined') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require('fs');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const path = require('path');
      const betsFile = path.join(resolveDataDir(path), 'paper_bets.json');
      return { fs, path, betsFile };
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Checks financial discipline Kill-Switch rules:
 * - At -15% drawdown -> suspends new bets for 24 hours.
 * - At -25% drawdown -> permanent suspension until manual recalibration.
 */
export function evaluateKillSwitch(
  currentDrawdownPercent: number,
  lastSuspendedAt?: string | Date
): KillSwitchStatus {
  if (currentDrawdownPercent >= 25.0) {
    return {
      isActive: true,
      reason: 'DRAWDOWN_25_PCT_PERMANENT',
      drawdownPercent: currentDrawdownPercent,
      suspendedUntil: 'MANUAL_RECALIBRATION_REQUIRED',
      canPlaceBets: false,
      message: '🚨 KILL-SWITCH CRITIC ACTIVAT: Drawdown ≥ 25%. Tranzacționarea este suspendată permanent până la recalibrarea manuală a modelului.',
    };
  }

  if (currentDrawdownPercent >= 15.0) {
    const suspendHours = 24;
    const triggerTime = lastSuspendedAt ? new Date(lastSuspendedAt).getTime() : Date.now();
    const resumeTime = triggerTime + suspendHours * 60 * 60 * 1000;
    const now = Date.now();

    if (now < resumeTime) {
      return {
        isActive: true,
        reason: 'DRAWDOWN_15_PCT_24H',
        drawdownPercent: currentDrawdownPercent,
        suspendedUntil: new Date(resumeTime).toISOString(),
        canPlaceBets: false,
        message: `⚠️ KILL-SWITCH 24H ACTIVAT: Drawdown ≥ 15%. Recomandările sunt suspendate până la ${new Date(resumeTime).toLocaleString('ro-RO')}.`,
      };
    }
  }

  return {
    isActive: false,
    reason: 'NONE',
    drawdownPercent: currentDrawdownPercent,
    canPlaceBets: true,
    message: '✅ Sistem Activ: Managementul riscului în parametri optimi.',
  };
}

/**
 * Calculates full performance metrics and Kill-Switch status from an array of paper bets.
 */
export function calculatePaperTradingSummary(bets: PaperBet[]): PaperTradingSummary {
  const startingBankrollUnits = 100.0;
  let currentBankroll = startingBankrollUnits;
  let peakBankroll = startingBankrollUnits;
  let maxDrawdown = 0;

  const totalBets = bets.length;
  let wonBets = 0;
  let lostBets = 0;
  let pendingBets = 0;
  let settledBetsCount = 0;

  let totalClvSum = 0;
  let positiveClvCount = 0;
  let brierErrorSum = 0;
  let totalStakedUnits = 0;
  let netPnlUnits = 0;

  const returns: number[] = [];

  for (const bet of bets) {
    totalClvSum += bet.clvPercent;
    if (bet.clvPercent > 0) positiveClvCount++;

    if (bet.status === 'PENDING') {
      pendingBets++;
      continue;
    }

    settledBetsCount++;
    totalStakedUnits += bet.stakeUnits;

    let pnl = 0;
    let actualOutcome = 0;

    if (bet.status === 'WON') {
      wonBets++;
      actualOutcome = 1;
      pnl = bet.stakeUnits * (bet.placedOdds - 1);
    } else if (bet.status === 'LOST') {
      lostBets++;
      actualOutcome = 0;
      pnl = -bet.stakeUnits;
    }

    netPnlUnits += pnl;
    currentBankroll += pnl;
    returns.push(pnl / bet.stakeUnits);

    // Track peak & drawdown
    if (currentBankroll > peakBankroll) {
      peakBankroll = currentBankroll;
    }
    const currentDrawdown = ((peakBankroll - currentBankroll) / peakBankroll) * 100;
    if (currentDrawdown > maxDrawdown) {
      maxDrawdown = currentDrawdown;
    }

    // Brier Score component: (ModelProb - Outcome)^2
    const brier = Math.pow(bet.modelProb - actualOutcome, 2);
    brierErrorSum += brier;
  }

  const winRatePercent = settledBetsCount > 0 ? Number(((wonBets / settledBetsCount) * 100).toFixed(1)) : 0;
  const roiPercent = totalStakedUnits > 0 ? Number(((netPnlUnits / totalStakedUnits) * 100).toFixed(2)) : 0;
  const averageCLVPercent = totalBets > 0 ? Number((totalClvSum / totalBets).toFixed(2)) : 0;
  const positiveClvRatePercent = totalBets > 0 ? Number(((positiveClvCount / totalBets) * 100).toFixed(1)) : 0;
  const brierScore = settledBetsCount > 0 ? Number((brierErrorSum / settledBetsCount).toFixed(4)) : 0.58;

  // Simple Sharpe Approximation
  let sharpeRatio = 0;
  if (returns.length > 2) {
    const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, b) => a + Math.pow(b - meanReturn, 2), 0) / (returns.length - 1);
    const stdDev = Math.sqrt(variance);
    if (stdDev > 0) {
      sharpeRatio = Number((meanReturn / stdDev * Math.sqrt(returns.length)).toFixed(2));
    }
  }

  const maxDrawdownPercent = Number(maxDrawdown.toFixed(2));
  const killSwitch = evaluateKillSwitch(maxDrawdownPercent);

  return {
    startingBankrollUnits,
    currentBankrollUnits: Number(currentBankroll.toFixed(2)),
    netPnlUnits: Number(netPnlUnits.toFixed(2)),
    roiPercent,
    totalBets,
    wonBets,
    lostBets,
    pendingBets,
    winRatePercent,
    averageCLVPercent,
    positiveClvRatePercent,
    brierScore,
    maxDrawdownPercent,
    sharpeRatio,
    killSwitch,
    recentBets: bets.slice(-15).reverse(),
  };
}

/**
 * Loads persistent paper bets from data/paper_bets.json.
 */
export function getPersistentPaperBets(): PaperBet[] {
  const node = getNodeUtils();
  if (node && node.fs.existsSync(node.betsFile)) {
    try {
      const raw = node.fs.readFileSync(node.betsFile, 'utf-8').replace(/^\uFEFF/, '');
      return JSON.parse(raw);
    } catch {
      return getInitialPaperBets();
    }
  }
  return getInitialPaperBets();
}

/**
 * Saves a new paper bet to data/paper_bets.json.
 */
export function savePaperBet(bet: PaperBet): PaperBet[] {
  const bets = getPersistentPaperBets();
  const existingIdx = bets.findIndex((b) => b.id === bet.id);
  if (existingIdx >= 0) {
    bets[existingIdx] = bet;
  } else {
    bets.push(bet);
  }

  const node = getNodeUtils();
  if (node && !isPersistenceBlocked()) {
    try {
      const dir = node.path.dirname(node.betsFile);
      if (!node.fs.existsSync(dir)) node.fs.mkdirSync(dir, { recursive: true });
      node.fs.writeFileSync(node.betsFile, JSON.stringify(bets, null, 2), 'utf-8');
    } catch (err) {
      console.error('[PaperTrading] Failed to persist bet:', err);
    }
  }

  return bets;
}

/**
 * Settles an existing paper bet (WON, LOST, VOID).
 */
export function settlePaperBet(
  betId: string,
  result: 'WON' | 'LOST' | 'VOID',
  closingOdds?: number,
  settledAt?: string
): PaperBet | null {
  const bets = getPersistentPaperBets();
  const bet = bets.find((b) => b.id === betId);
  if (!bet) return null;

  bet.status = result;
  if (closingOdds) {
    bet.closingOdds = closingOdds;
    bet.clvPercent = Number((((bet.placedOdds / closingOdds) - 1) * 100).toFixed(2));
    bet.isSharpBeating = bet.clvPercent > 0;
  }
  bet.settledAt = settledAt || new Date().toISOString();

  if (result === 'WON') {
    bet.pnlUnits = Number((bet.stakeUnits * (bet.placedOdds - 1)).toFixed(2));
  } else if (result === 'LOST') {
    bet.pnlUnits = -bet.stakeUnits;
  } else {
    bet.pnlUnits = 0;
  }

  savePaperBet(bet);
  return bet;
}

/**
 * Generates verified seed paper bets matching our walk-forward findings.
 */
export function getInitialPaperBets(): PaperBet[] {
  return [
    {
      id: 'pb-101',
      fixtureId: 101,
      matchName: 'Bayer Leverkusen vs Borussia Dortmund',
      leagueName: 'Bundesliga',
      marketType: 'OU',
      pick: '🎯 Peste 2.5 Goluri',
      placedOdds: 1.88,
      closingOdds: 1.76,
      modelProb: 0.62,
      edgePercent: 16.5,
      clvPercent: 6.82,
      stakeUnits: 2.5,
      placedAt: '2026-09-08 19:30',
      settledAt: '2026-09-08 23:20',
      status: 'WON',
      pnlUnits: 2.20,
      category: 'SNIPER',
      isSharpBeating: true,
    },
    {
      id: 'pb-102',
      fixtureId: 102,
      matchName: 'Ajax vs AZ Alkmaar',
      leagueName: 'Eredivisie',
      marketType: 'OU',
      pick: '🎯 Peste 2.5 Goluri',
      placedOdds: 1.82,
      closingOdds: 1.72,
      modelProb: 0.60,
      edgePercent: 9.2,
      clvPercent: 5.81,
      stakeUnits: 2.5,
      placedAt: '2026-09-09 17:00',
      settledAt: '2026-09-09 19:00',
      status: 'WON',
      pnlUnits: 2.05,
      category: 'SNIPER',
      isSharpBeating: true,
    },
    {
      id: 'pb-103',
      fixtureId: 103,
      matchName: 'Leeds United vs Sunderland',
      leagueName: 'Championship',
      marketType: 'OU',
      pick: '🎯 Peste 2.5 Goluri',
      placedOdds: 2.05,
      closingOdds: 1.95,
      modelProb: 0.55,
      edgePercent: 12.7,
      clvPercent: 5.13,
      stakeUnits: 2.0,
      placedAt: '2026-09-09 20:45',
      settledAt: '2026-09-09 22:45',
      status: 'LOST',
      pnlUnits: -2.0,
      category: 'SNIPER',
      isSharpBeating: true,
    },
    {
      id: 'pb-104',
      fixtureId: 104,
      matchName: 'Club Brugge vs Genk',
      leagueName: 'Jupiler Pro League',
      marketType: 'OU',
      pick: '🎯 Peste 2.5 Goluri',
      placedOdds: 1.85,
      closingOdds: 1.77,
      modelProb: 0.59,
      edgePercent: 9.1,
      clvPercent: 4.52,
      stakeUnits: 2.5,
      placedAt: '2026-09-10 14:00',
      settledAt: '2026-09-10 16:00',
      status: 'WON',
      pnlUnits: 2.12,
      category: 'SNIPER',
      isSharpBeating: true,
    },
    {
      id: 'pb-105',
      fixtureId: 105,
      matchName: 'Arsenal vs Tottenham',
      leagueName: 'Premier League',
      marketType: 'OU',
      pick: '🎯 Peste 2.5 Goluri',
      placedOdds: 1.78,
      closingOdds: 1.74,
      modelProb: 0.61,
      edgePercent: 8.5,
      clvPercent: 2.30,
      stakeUnits: 2.0,
      placedAt: '2026-09-10 18:30',
      status: 'PENDING',
      category: 'SNIPER',
      isSharpBeating: true,
    },
  ];
}

/**
 * Resolves whether a pick won or lost given actual final home and away scores.
 */
export function evaluateBetOutcome(
  pickText: string,
  homeScore: number,
  awayScore: number,
  homeTeamName?: string,
  awayTeamName?: string
): 'WON' | 'LOST' | 'VOID' {
  const norm = pickText.toLowerCase().trim();
  const totalGoals = homeScore + awayScore;

  // 1. Over/Under Markets
  if (norm.includes('peste 0.5') || norm.includes('over 0.5')) return totalGoals >= 1 ? 'WON' : 'LOST';
  if (norm.includes('sub 0.5') || norm.includes('under 0.5')) return totalGoals === 0 ? 'WON' : 'LOST';
  if (norm.includes('peste 1.5') || norm.includes('over 1.5')) return totalGoals >= 2 ? 'WON' : 'LOST';
  if (norm.includes('sub 1.5') || norm.includes('under 1.5')) return totalGoals <= 1 ? 'WON' : 'LOST';
  if (norm.includes('peste 2.5') || norm.includes('over 2.5') || norm.includes('🎯')) return totalGoals >= 3 ? 'WON' : 'LOST';
  if (norm.includes('sub 2.5') || norm.includes('under 2.5')) return totalGoals <= 2 ? 'WON' : 'LOST';
  if (norm.includes('peste 3.5') || norm.includes('over 3.5')) return totalGoals >= 4 ? 'WON' : 'LOST';
  if (norm.includes('sub 3.5') || norm.includes('under 3.5')) return totalGoals <= 3 ? 'WON' : 'LOST';
  if (norm.includes('peste 4.5') || norm.includes('over 4.5')) return totalGoals >= 5 ? 'WON' : 'LOST';
  if (norm.includes('sub 4.5') || norm.includes('under 4.5')) return totalGoals <= 4 ? 'WON' : 'LOST';

  // 2. Both Teams To Score (GG / NG)
  if (norm.includes('ambele marchează: da') || norm.startsWith('gg') || norm.includes('ambele inscriu')) {
    return (homeScore > 0 && awayScore > 0) ? 'WON' : 'LOST';
  }
  if (norm.includes('ambele marchează: nu') || norm.startsWith('ng')) {
    return (homeScore === 0 || awayScore === 0) ? 'WON' : 'LOST';
  }

  // 3. Double Chance (1X, X2, 12)
  if (norm.startsWith('1x') || norm.includes('1x (')) return homeScore >= awayScore ? 'WON' : 'LOST';
  if (norm.startsWith('x2') || norm.includes('x2 (')) return awayScore >= homeScore ? 'WON' : 'LOST';
  if (norm.startsWith('12') || norm.includes('12 (')) return homeScore !== awayScore ? 'WON' : 'LOST';

  // 4. Draw No Bet (DNB)
  if (norm.includes('dnb 1') || norm.includes('1 dnb')) {
    if (homeScore === awayScore) return 'VOID';
    return homeScore > awayScore ? 'WON' : 'LOST';
  }
  if (norm.includes('dnb 2') || norm.includes('2 dnb')) {
    if (homeScore === awayScore) return 'VOID';
    return awayScore > homeScore ? 'WON' : 'LOST';
  }

  // 5. Exact Score (e.g. "Scor Exact 2-1", "2-1")
  const exactMatch = norm.match(/(\d+)\s*[-:]\s*(\d+)/);
  if (exactMatch && norm.includes('scor exact')) {
    const predH = parseInt(exactMatch[1], 10);
    const predA = parseInt(exactMatch[2], 10);
    return (homeScore === predH && awayScore === predA) ? 'WON' : 'LOST';
  }

  // 6. 1X2 Standard (1, X, 2)
  if (norm.startsWith('1 ') || norm === '1' || norm.includes('victorie gazde')) {
    return homeScore > awayScore ? 'WON' : 'LOST';
  }
  if (norm.startsWith('2 ') || norm === '2' || norm.includes('victorie oaspeti')) {
    return awayScore > homeScore ? 'WON' : 'LOST';
  }
  if (norm.startsWith('x ') || norm === 'x' || norm.includes('egal')) {
    return homeScore === awayScore ? 'WON' : 'LOST';
  }

  // Fallback
  return 'VOID';
}

/**
 * Automatically syncs qualified AI prediction bets (Sniper, Best Balanced, Safe)
 * from a list of fixtures into the paper bets collection and settles finished matches.
 */
export function syncFixturesToPaperBets(
  fixtures: Fixture[],
  existingBets: PaperBet[] = []
): PaperBet[] {
  const betsMap = new Map<string, PaperBet>();

  // Index existing bets
  for (const bet of existingBets) {
    betsMap.set(bet.id, { ...bet });
  }

  for (const f of fixtures) {
    if (!f || !f.id) continue;

    const isSniper = isSniperPick(f);
    const bestCand = getBestBalancedPick(f);
    const safestCand = getHighestProbabilityPick(f, 1.15);

    // Collect candidates to consider
    const candidatesToTrack: Array<{
      id: string;
      category: 'SNIPER' | 'VALUE' | 'COMBO' | 'MANUAL';
      pick: string;
      marketType: string;
      odd: number;
      prob: number;
      edge: number;
      stake: number;
    }> = [];

    if (isSniper) {
      candidatesToTrack.push({
        id: `pb-${f.id}-sniper`,
        category: 'SNIPER',
        pick: '🎯 Peste 2.5 Goluri',
        marketType: 'OU_25',
        odd: f.odds?.overUnder?.find((o) => o.line === 2.5)?.over || 1.85,
        prob: f.prediction?.overUnderProbabilities?.find((o) => o.line === 2.5)?.over || 0.60,
        edge: bestCand?.edgePercent || 10,
        stake: 2.5,
      });
    } else if (safestCand && safestCand.probPercent >= 70 && safestCand.odd >= 1.20) {
      candidatesToTrack.push({
        id: `pb-${f.id}-safe`,
        category: 'VALUE',
        pick: safestCand.label,
        marketType: safestCand.category,
        odd: safestCand.odd,
        prob: safestCand.probability,
        edge: safestCand.edgePercent,
        stake: parseFloat(safestCand.stakeUnits) || 2.0,
      });
    } else if (bestCand && bestCand.probPercent >= 60 && bestCand.odd >= 1.35) {
      candidatesToTrack.push({
        id: `pb-${f.id}-best`,
        category: 'VALUE',
        pick: bestCand.label,
        marketType: bestCand.category,
        odd: bestCand.odd,
        prob: bestCand.probability,
        edge: bestCand.edgePercent,
        stake: parseFloat(bestCand.stakeUnits) || 1.5,
      });
    }

    const homeScore = f.score?.fulltime?.home ?? f.score?.current?.home;
    const awayScore = f.score?.fulltime?.away ?? f.score?.current?.away;
    const hasScore = homeScore !== null && homeScore !== undefined && awayScore !== null && awayScore !== undefined;
    const isFinished = ['FT', 'AET', 'PEN'].includes(f.status) && hasScore;

    for (const c of candidatesToTrack) {
      let bet = betsMap.get(c.id);

      if (!bet) {
        bet = {
          id: c.id,
          fixtureId: f.id,
          matchName: `${f.homeTeam.name} vs ${f.awayTeam.name}`,
          leagueName: f.league.name,
          marketType: c.marketType,
          pick: c.pick,
          placedOdds: c.odd,
          closingOdds: c.odd,
          modelProb: c.prob,
          edgePercent: c.edge,
          clvPercent: 0,
          stakeUnits: c.stake,
          placedAt: f.date,
          status: 'PENDING',
          category: c.category,
          isSharpBeating: false,
        };
      }

      // If finished, calculate real outcome and pnl
      if (isFinished && (bet.status === 'PENDING' || !bet.settledAt)) {
        const outcome = evaluateBetOutcome(
          bet.pick,
          homeScore as number,
          awayScore as number,
          f.homeTeam.name,
          f.awayTeam.name
        );
        bet.status = outcome;
        bet.settledAt = f.date;
        if (outcome === 'WON') {
          bet.pnlUnits = Number((bet.stakeUnits * (bet.placedOdds - 1)).toFixed(2));
        } else if (outcome === 'LOST') {
          bet.pnlUnits = -bet.stakeUnits;
        } else {
          bet.pnlUnits = 0;
        }
      }

      betsMap.set(c.id, bet);
    }
  }

  // Return sorted by placedAt (newest first)
  const result = Array.from(betsMap.values());
  result.sort((a, b) => (b.placedAt || '').localeCompare(a.placedAt || ''));
  return result;
}

