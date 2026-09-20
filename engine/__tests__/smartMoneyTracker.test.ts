import { describe, it, expect } from 'vitest';
import { analyzeSmartMoneyFlow } from '../smartMoneyTracker';

describe('Smart Money & Syndicate Tracker (engine/smartMoneyTracker.ts)', () => {
  it('identifies strong syndicate consensus when sharp books drop and model agrees', () => {
    const res = analyzeSmartMoneyFlow({
      matchName: 'Portsmouth vs Leeds',
      homeTeam: 'Portsmouth',
      awayTeam: 'Leeds',
      softOdds1X2: { home: 4.20, draw: 3.60, away: 1.95 },
      sharpOdds1X2: { home: 4.50, draw: 3.70, away: 1.82 }, // Sharp market dropped away team to 1.82
      modelProbabilities: { home: 0.20, draw: 0.25, away: 0.55 },
    });

    const awayMetrics = res.find((r) => r.selection.includes('Leeds'))!;
    expect(awayMetrics).toBeDefined();
    expect(awayMetrics.sharpMoneyInflowPct).toBeGreaterThan(60);
    expect(awayMetrics.signalType).toBe('STRONG_SYNDICATE_BUY');
    expect(awayMetrics.isSyndicateConsensus).toBe(true);
  });

  it('detects public traps on over-hyped retail favorites', () => {
    const res = analyzeSmartMoneyFlow({
      matchName: 'Heavy Favorite vs Underdog',
      homeTeam: 'Heavy Favorite',
      awayTeam: 'Underdog',
      softOdds1X2: { home: 1.35, draw: 5.00, away: 9.00 }, // Retail public crushing home at 1.35
      sharpOdds1X2: { home: 1.45, draw: 4.80, away: 7.50 }, // Sharp market price is higher
      modelProbabilities: { home: 0.65, draw: 0.22, away: 0.13 },
    });

    const homeMetrics = res.find((r) => r.selection.includes('Heavy Favorite'))!;
    expect(homeMetrics.publicLiabilityPct).toBeGreaterThanOrEqual(70);
  });
});
