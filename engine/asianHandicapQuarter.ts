/**
 * FlashStat - Quarter Asian Handicap & Draw No Bet Settlement Engine (engine/asianHandicapQuarter.ts)
 * 
 * Provides institutional settlement logic and mathematical EV calculations
 * for split lines (+/-0.25, +/-0.75) and integer push lines (0.0 / DNB).
 */

export type AhOutcome = 'WIN' | 'HALF_WIN' | 'PUSH' | 'HALF_LOSS' | 'LOSS';

export interface AhSettlementResult {
  outcome: AhOutcome;
  payoutMultiplier: number; // e.g. 1.85 on full win with 1.85 odds, 1.425 on half-win, 0.5 on half-loss, 0 on full loss, 1.0 on push
  netProfitMultiplier: number; // profit relative to 1 unit stake
}

/**
 * Calculates exact settlement payout for Asian Handicap bets
 * @param homeScore Full-time home goals
 * @param awayScore Full-time away goals
 * @param line Asian Handicap line applied to Home (e.g. -0.25, +0.25, -0.75, +0.75, 0.0)
 * @param side Selected side ('HOME' | 'AWAY')
 * @param odds Decimal bookmaker odds taken (e.g. 1.95)
 */
export function settleAsianHandicap(
  homeScore: number,
  awayScore: number,
  line: number,
  side: 'HOME' | 'AWAY',
  odds: number
): AhSettlementResult {
  // Effective goal difference for Home is (homeScore + line) - awayScore
  // For Away, the opposite handicap (-line) applies
  const effectiveDiff = side === 'HOME' 
    ? (homeScore + line) - awayScore 
    : (awayScore - line) - homeScore;

  if (effectiveDiff > 0.25) {
    // Clear win (e.g. diff >= 0.5)
    return {
      outcome: 'WIN',
      payoutMultiplier: odds,
      netProfitMultiplier: odds - 1,
    };
  } else if (Math.abs(effectiveDiff - 0.25) < 1e-4) {
    // Half win: half stake wins at full odds, half stake is refunded (push)
    // payout = 0.5 * odds + 0.5 * 1.0 = 1 + (odds - 1)/2
    const netProfit = (odds - 1) / 2;
    return {
      outcome: 'HALF_WIN',
      payoutMultiplier: 1 + netProfit,
      netProfitMultiplier: netProfit,
    };
  } else if (Math.abs(effectiveDiff) < 1e-4) {
    // Exact push (line 0.0, -1.0, +1.0)
    return {
      outcome: 'PUSH',
      payoutMultiplier: 1.0,
      netProfitMultiplier: 0.0,
    };
  } else if (Math.abs(effectiveDiff + 0.25) < 1e-4) {
    // Half loss: half stake lost, half stake refunded
    return {
      outcome: 'HALF_LOSS',
      payoutMultiplier: 0.5,
      netProfitMultiplier: -0.5,
    };
  } else {
    // Clear loss (effectiveDiff <= -0.5)
    return {
      outcome: 'LOSS',
      payoutMultiplier: 0.0,
      netProfitMultiplier: -1.0,
    };
  }
}

/**
 * Calculates Draw No Bet (DNB) conditional probabilities and fair odds from full 1X2 probabilities
 */
export function calculateDnbProbabilities(pHome: number, pDraw: number, pAway: number): {
  pHomeDnb: number;
  pAwayDnb: number;
  fairOddsHomeDnb: number;
  fairOddsAwayDnb: number;
} {
  const decisiveProb = pHome + pAway;
  if (decisiveProb <= 0) {
    return { pHomeDnb: 0.5, pAwayDnb: 0.5, fairOddsHomeDnb: 2.0, fairOddsAwayDnb: 2.0 };
  }

  const pHomeDnb = pHome / decisiveProb;
  const pAwayDnb = pAway / decisiveProb;

  return {
    pHomeDnb: Number(pHomeDnb.toFixed(4)),
    pAwayDnb: Number(pAwayDnb.toFixed(4)),
    fairOddsHomeDnb: Number((1 / pHomeDnb).toFixed(3)),
    fairOddsAwayDnb: Number((1 / pAwayDnb).toFixed(3)),
  };
}
