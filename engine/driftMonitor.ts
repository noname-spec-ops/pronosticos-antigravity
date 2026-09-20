/**
 * FlashStat — Statistical Model Drift & Performance Degradation Monitor (engine/driftMonitor.ts)
 * 
 * Monitors model decay in production by comparing rolling out-of-sample Brier Scores
 * and CLV metrics against the calibrated baseline.
 */

export interface DriftMetricSnapshot {
  calculatedAt: string;
  rollingSampleCount: number;
  rollingBrierScore: number;
  baselineBrierScore: number;
  brierDegradationPercent: number; // ((rolling - baseline) / baseline) * 100
  rollingCLVPercent: number;
  isDriftDetected: boolean;
  driftSeverity: 'normal' | 'moderate' | 'critical';
  recommendedAction: 'NONE' | 'MONITOR' | 'RECALIBRATE_LEAGUE' | 'FULL_RECALIBRATION';
  alertMessage: string;
}

export function evaluateModelDrift(
  recentEvaluations: Array<{ modelProb: number; actualOutcome: number; clvPercent?: number }>,
  baselineBrierScore: number = 0.5960
): DriftMetricSnapshot {
  const calculatedAt = new Date().toISOString();
  const n = recentEvaluations.length;

  if (n < 20) {
    return {
      calculatedAt,
      rollingSampleCount: n,
      rollingBrierScore: baselineBrierScore,
      baselineBrierScore,
      brierDegradationPercent: 0,
      rollingCLVPercent: 0,
      isDriftDetected: false,
      driftSeverity: 'normal',
      recommendedAction: 'NONE',
      alertMessage: `Eșantion insuficient (${n}/20) pentru evaluarea sigură a driftului statistic.`,
    };
  }

  let sumBrier = 0;
  let sumClv = 0;

  for (const item of recentEvaluations) {
    sumBrier += Math.pow(item.modelProb - item.actualOutcome, 2);
    sumClv += item.clvPercent || 0;
  }

  const rollingBrierScore = Number((sumBrier / n).toFixed(4));
  const rollingCLVPercent = Number((sumClv / n).toFixed(2));
  const brierDegradationPercent = Number(
    (((rollingBrierScore - baselineBrierScore) / baselineBrierScore) * 100).toFixed(2)
  );

  let isDriftDetected = false;
  let driftSeverity: 'normal' | 'moderate' | 'critical' = 'normal';
  let recommendedAction: 'NONE' | 'MONITOR' | 'RECALIBRATE_LEAGUE' | 'FULL_RECALIBRATION' = 'NONE';
  let alertMessage = '✅ Model stabil: Brier score și CLV în parametri optimi de calibrare.';

  if (brierDegradationPercent >= 6.0 || rollingCLVPercent <= -2.5) {
    isDriftDetected = true;
    driftSeverity = 'critical';
    recommendedAction = 'FULL_RECALIBRATION';
    alertMessage = `🚨 DRIFT CRITIC DETECTAT: Brier degradat cu +${brierDegradationPercent}% (CLV mediu: ${rollingCLVPercent}%). Este necesară recalibrarea completă a parametrilor.`;
  } else if (brierDegradationPercent >= 3.0 || rollingCLVPercent <= -1.2) {
    isDriftDetected = true;
    driftSeverity = 'moderate';
    recommendedAction = 'RECALIBRATE_LEAGUE';
    alertMessage = `⚠️ AVERTISMENT DRIFT: Degradare Brier de +${brierDegradationPercent}%. Se recomandă monitorizare strânsă și recalibrare la nivel de ligă.`;
  }

  return {
    calculatedAt,
    rollingSampleCount: n,
    rollingBrierScore,
    baselineBrierScore,
    brierDegradationPercent,
    rollingCLVPercent,
    isDriftDetected,
    driftSeverity,
    recommendedAction,
    alertMessage,
  };
}