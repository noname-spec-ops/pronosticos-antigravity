import { describe, it, expect } from 'vitest';
import { generateWeeklyReport } from '../weeklyReport';
import type { PaperBet } from '../paperTrading';

describe('Automated Weekly Performance Report Engine', () => {
  it('generates multi-period audit summary with market verdicts', () => {
    const mockBets: PaperBet[] = [
      {
        id: 'w-1',
        fixtureId: 1,
        matchName: 'Team A vs Team B',
        leagueName: 'Bundesliga',
        marketType: 'OU',
        pick: 'Over 2.5',
        placedOdds: 1.90,
        closingOdds: 1.80,
        modelProb: 0.60,
        edgePercent: 14.0,
        clvPercent: 5.56,
        stakeUnits: 2.5,
        placedAt: new Date().toISOString(),
        settledAt: new Date().toISOString(),
        status: 'WON',
        pnlUnits: 2.25,
        category: 'SNIPER',
        isSharpBeating: true,
      },
      {
        id: 'w-2',
        fixtureId: 2,
        matchName: 'Team C vs Team D',
        leagueName: 'Bundesliga',
        marketType: 'OU',
        pick: 'Over 2.5',
        placedOdds: 1.95,
        closingOdds: 1.85,
        modelProb: 0.58,
        edgePercent: 13.1,
        clvPercent: 5.41,
        stakeUnits: 2.5,
        placedAt: new Date().toISOString(),
        settledAt: new Date().toISOString(),
        status: 'WON',
        pnlUnits: 2.375,
        category: 'SNIPER',
        isSharpBeating: true,
      },
    ];

    const report = generateWeeklyReport(mockBets);

    expect(report).toBeDefined();
    expect(report.sevenDays).toBeDefined();
    expect(report.thirtyDays).toBeDefined();
    expect(report.allTime).toBeDefined();
    expect(report.executiveSummary).toContain('Audit săptămânal finalizat');
    expect(report.leagueVerdicts.length).toBeGreaterThan(0);
  });
});