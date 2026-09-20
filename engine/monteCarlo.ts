/**
 * FlashStat - Monte Carlo Simulation & Risk Management Engine (engine/monteCarlo.ts)
 * 
 * Simulates thousands of bankroll trajectories based on calibrated edge, odds,
 * and fractional Kelly sizing to compute exact risk metrics:
 * - Expected Bankroll Growth & Confidence Intervals (5%, 50%, 95%)
 * - Maximum Expected Drawdown at 95% Confidence (MDD 95%)
 * - Probability of triggering -15% / -25% Drawdown
 * - Risk of Ruin (Capital Halving / Depletion Probability)
 * - Multi-Bet Concurrent Kelly Allocator
 */

export interface MonteCarloBetConfig {
  winProb: number;
  odds: number;
  stakeFraction: number; // e.g. 0.02 (2%)
}

export interface MonteCarloInput {
  initialBankroll: number;
  bets: MonteCarloBetConfig[];
  numSimulations?: number; // default: 10,000
  ruinThresholdFraction?: number; // default: 0.50 (50% loss of initial bankroll)
}

export interface MonteCarloSummary {
  simulationsCount: number;
  betsPerSimulation: number;
  initialBankroll: number;
  medianFinalBankroll: number;
  percentile5thBankroll: number;
  percentile95thBankroll: number;
  expectedRoiPercent: number;
  maxDrawdownMedian: number;
  maxDrawdown95thPercentile: number;
  probDrawdownOver15Pct: number;
  probDrawdownOver25Pct: number;
  riskOfRuinPercent: number;
  trajectorySamples: number[][]; // sample trajectories for UI charts
}

/**
 * Runs a 10,000-iteration Monte Carlo simulation of betting trajectories
 */
export function runMonteCarloSimulation(input: MonteCarloInput): MonteCarloSummary {
  const numSims = input.numSimulations ?? 10000;
  const initialBankroll = input.initialBankroll > 0 ? input.initialBankroll : 100;
  const ruinThreshold = initialBankroll * (input.ruinThresholdFraction ?? 0.50);
  const bets = input.bets;

  if (!bets || bets.length === 0) {
    return {
      simulationsCount: 0,
      betsPerSimulation: 0,
      initialBankroll,
      medianFinalBankroll: initialBankroll,
      percentile5thBankroll: initialBankroll,
      percentile95thBankroll: initialBankroll,
      expectedRoiPercent: 0,
      maxDrawdownMedian: 0,
      maxDrawdown95thPercentile: 0,
      probDrawdownOver15Pct: 0,
      probDrawdownOver25Pct: 0,
      riskOfRuinPercent: 0,
      trajectorySamples: [],
    };
  }

  const finalBankrolls: number[] = new Array(numSims);
  const maxDrawdowns: number[] = new Array(numSims);
  let ruinedCount = 0;
  let dd15Count = 0;
  let dd25Count = 0;

  const trajectorySamples: number[][] = [];
  const numSamplesToKeep = Math.min(5, numSims);

  for (let s = 0; s < numSims; s++) {
    let currentBankroll = initialBankroll;
    let peakBankroll = initialBankroll;
    let maxDd = 0;
    let ruined = false;

    const trajectory: number[] = [currentBankroll];

    for (let b = 0; b < bets.length; b++) {
      const bet = bets[b];
      const stake = Math.max(0.1, currentBankroll * bet.stakeFraction);

      const isWin = Math.random() < bet.winProb;
      if (isWin) {
        currentBankroll += stake * (bet.odds - 1);
      } else {
        currentBankroll -= stake;
      }

      if (currentBankroll > peakBankroll) {
        peakBankroll = currentBankroll;
      }

      const currentDd = peakBankroll > 0 ? (peakBankroll - currentBankroll) / peakBankroll : 0;
      if (currentDd > maxDd) {
        maxDd = currentDd;
      }

      if (currentBankroll <= ruinThreshold && !ruined) {
        ruined = true;
      }

      if (s < numSamplesToKeep) {
        trajectory.push(Number(currentBankroll.toFixed(2)));
      }
    }

    finalBankrolls[s] = currentBankroll;
    maxDrawdowns[s] = maxDd;

    if (ruined) ruinedCount++;
    if (maxDd >= 0.15) dd15Count++;
    if (maxDd >= 0.25) dd25Count++;

    if (s < numSamplesToKeep) {
      trajectorySamples.push(trajectory);
    }
  }

  finalBankrolls.sort((a, b) => a - b);
  maxDrawdowns.sort((a, b) => a - b);

  const p5Index = Math.floor(numSims * 0.05);
  const p50Index = Math.floor(numSims * 0.50);
  const p95Index = Math.floor(numSims * 0.95);

  const medianFinal = finalBankrolls[p50Index];
  const p5Final = finalBankrolls[p5Index];
  const p95Final = finalBankrolls[p95Index];

  const medianDd = maxDrawdowns[p50Index];
  const p95Dd = maxDrawdowns[p95Index];

  const totalInvestedUnits = bets.reduce((acc, bet) => acc + (initialBankroll * bet.stakeFraction), 0);
  const expectedProfit = medianFinal - initialBankroll;
  const expectedRoi = totalInvestedUnits > 0 ? (expectedProfit / totalInvestedUnits) * 100 : 0;

  return {
    simulationsCount: numSims,
    betsPerSimulation: bets.length,
    initialBankroll,
    medianFinalBankroll: Number(medianFinal.toFixed(2)),
    percentile5thBankroll: Number(p5Final.toFixed(2)),
    percentile95thBankroll: Number(p95Final.toFixed(2)),
    expectedRoiPercent: Number(expectedRoi.toFixed(2)),
    maxDrawdownMedian: Number((medianDd * 100).toFixed(2)),
    maxDrawdown95thPercentile: Number((p95Dd * 100).toFixed(2)),
    probDrawdownOver15Pct: Number(((dd15Count / numSims) * 100).toFixed(2)),
    probDrawdownOver25Pct: Number(((dd25Count / numSims) * 100).toFixed(2)),
    riskOfRuinPercent: Number(((ruinedCount / numSims) * 100).toFixed(2)),
    trajectorySamples,
  };
}

/**
 * Optimizes concurrent Kelly stakes across multiple simultaneous bets
 * to prevent cumulative daily over-exposure.
 */
export function optimizeConcurrentKellyStakes(
  rawStakes: { id: string | number; kellyFraction: number }[],
  maxTotalDailyExposure: number = 0.08 // default max 8% bankroll in play simultaneously
): { id: string | number; optimizedFraction: number }[] {
  const sumRaw = rawStakes.reduce((sum, s) => sum + s.kellyFraction, 0);

  if (sumRaw <= maxTotalDailyExposure || sumRaw === 0) {
    return rawStakes.map(s => ({
      id: s.id,
      optimizedFraction: Number(s.kellyFraction.toFixed(4)),
    }));
  }

  const scalingFactor = maxTotalDailyExposure / sumRaw;

  return rawStakes.map(s => ({
    id: s.id,
    optimizedFraction: Number((s.kellyFraction * scalingFactor).toFixed(4)),
  }));
}
