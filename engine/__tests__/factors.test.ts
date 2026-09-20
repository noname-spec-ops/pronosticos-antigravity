import { describe, it, expect } from 'vitest';
import { calculateScheduleFatigue } from '../scheduleFatigue';
import { evaluateLineupImpact } from '../lineupAdjuster';
import { blendWithMarketPrior } from '../marketBlending';

describe('Etapa 7 Key Prediction Factors', () => {
  describe('Schedule Fatigue & Congestion', () => {
    it('applies fatigue penalty for short rest (2 days)', () => {
      const pastMatches = [
        { date: '2025-10-18' },
        { date: '2025-10-15' },
        { date: '2025-10-11' },
        { date: '2025-10-07' },
      ];
      const matchDate = '2025-10-20'; // 2 days rest, 4 matches in 14 days

      const res = calculateScheduleFatigue(pastMatches, matchDate);
      expect(res.restDays).toBe(2);
      expect(res.matchesLast14Days).toBe(4);
      expect(res.fatigueFactor).toBeLessThan(1.0);
    });

    it('gives full 1.0 factor for well-rested teams (7 days rest)', () => {
      const pastMatches = [{ date: '2025-10-10' }];
      const matchDate = '2025-10-17'; // 7 days rest

      const res = calculateScheduleFatigue(pastMatches, matchDate);
      expect(res.restDays).toBe(7);
      expect(res.fatigueFactor).toBe(1.0);
    });
  });

  describe('Lineup & Key Player Absence', () => {
    it('returns neutral factors when lineup is unannounced', () => {
      const res = evaluateLineupImpact(undefined, undefined);
      expect(res.attackFactor).toBe(1.0);
      expect(res.defenseFactor).toBe(1.0);
      expect(res.hasLineupAnnounced).toBe(false);
    });

    it('penalizes attack when key starters are confirmed injured/suspended', () => {
      const mockLineup = {
        formation: '4-3-3',
        startingXI: Array.from({ length: 11 }, (_, i) => ({
          id: i + 1,
          name: `Player ${i + 1}`,
          number: i + 1,
          position: 'M' as const,
          isStarter: true,
          minutesPlayed: 0,
          yellowCards: 0,
          redCards: 0,
          foulsCommitted: 0,
          foulsDrawn: 0,
        })),
        substitutes: [],
      };

      const injuries = [
        { playerId: 10, playerName: 'Striker A', teamId: 1, type: 'injury' as const, reason: 'Hamstring' },
        { playerId: 7, playerName: 'Winger B', teamId: 1, type: 'suspension' as const, reason: 'Red Card' },
      ];

      const res = evaluateLineupImpact(mockLineup, injuries);
      expect(res.attackFactor).toBeLessThan(1.0);
      expect(res.defenseFactor).toBeGreaterThan(1.0);
      expect(res.missingKeyPlayersCount).toBe(2);
    });
  });

  describe('Market Prior Blending', () => {
    it('sharpens model probabilities by blending with devigged market consensus', () => {
      const modelProbs = { home: 0.60, draw: 0.25, away: 0.15 };
      const marketDevigged = { home: 0.50, draw: 0.30, away: 0.20 };

      // 35% model, 65% market
      const blended = blendWithMarketPrior(modelProbs, marketDevigged, 0.35);

      expect(blended.isMarketBlended).toBe(true);
      expect(blended.probabilities1X2.home).toBeCloseTo(0.60 * 0.35 + 0.50 * 0.65, 3);
      expect(blended.probabilities1X2.draw).toBeCloseTo(0.25 * 0.35 + 0.30 * 0.65, 3);
      expect(blended.probabilities1X2.away).toBeCloseTo(0.15 * 0.35 + 0.20 * 0.65, 3);
    });

    it('falls back to pure model when market odds are missing', () => {
      const modelProbs = { home: 0.55, draw: 0.25, away: 0.20 };
      const blended = blendWithMarketPrior(modelProbs, null);
      expect(blended.isMarketBlended).toBe(false);
      expect(blended.probabilities1X2).toEqual(modelProbs);
    });
  });
});