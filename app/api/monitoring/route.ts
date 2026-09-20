import { NextResponse } from 'next/server';
import { ApiMonitorService } from '@/services/apiMonitor';
import { evaluateModelDrift } from '@/engine/driftMonitor';
import { getPersistentPaperBets, calculatePaperTradingSummary } from '@/engine/paperTrading';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const report = await ApiMonitorService.checkAllProviders();

    // Model Drift & Live Performance Monitoring
    const bets = getPersistentPaperBets();
    const paperSummary = calculatePaperTradingSummary(bets);

    const evaluations = bets
      .filter((b) => b.status === 'WON' || b.status === 'LOST')
      .map((b) => ({
        modelProb: b.modelProb,
        actualOutcome: b.status === 'WON' ? 1 : 0,
        clvPercent: b.clvPercent,
      }));

    const drift = evaluateModelDrift(evaluations);

    return NextResponse.json({
      ...report,
      modelDrift: drift,
      paperTradingHealth: {
        totalBets: paperSummary.totalBets,
        roiPercent: paperSummary.roiPercent,
        maxDrawdownPercent: paperSummary.maxDrawdownPercent,
        killSwitch: paperSummary.killSwitch,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Monitoring service unavailable', message: error.message },
      { status: 500 }
    );
  }
}
