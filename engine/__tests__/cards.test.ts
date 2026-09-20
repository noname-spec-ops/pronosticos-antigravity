import { describe, it, expect } from 'vitest';
import {
  calculatePlayerAggression,
  calculateLineupAggression,
  negBinomialProb,
  predictMatchCards,
} from '../cards';
import type { Lineup, PlayerStats, Referee } from '../../types/football';

describe('Cards & Referee Aggression Engine', () => {
  it('calculates player aggression based on cards, fouls and minutes', () => {
    const aggressiveDefender: PlayerStats = {
      id: 1,
      name: 'Pepe',
      number: 3,
      position: 'D',
      isStarter: true,
      minutesPlayed: 900, // 10 matches
      yellowCards: 6,
      redCards: 1, // (6 + 2) / 10 = 0.8 cards/match
      foulsCommitted: 20, // 2 fouls/match
      foulsDrawn: 5,
    };

    const aggression = calculatePlayerAggression(aggressiveDefender);
    expect(aggression).toBeGreaterThan(1.0);
  });

  it('computes squad aggression from starting lineup', () => {
    const startingXI: PlayerStats[] = Array.from({ length: 11 }, (_, i) => ({
      id: i + 1,
      name: `Player ${i + 1}`,
      number: i + 1,
      position: 'M',
      isStarter: true,
      minutesPlayed: 900,
      yellowCards: 2,
      redCards: 0,
      foulsCommitted: 10,
      foulsDrawn: 8,
    }));

    const lineup: Lineup = {
      formation: '4-3-3',
      startingXI,
      substitutes: [],
    };

    const squadAggression = calculateLineupAggression(lineup);
    expect(squadAggression).toBeGreaterThan(1.0);
    expect(squadAggression).toBeLessThan(5.0);
  });

  it('computes Negative Binomial PMF values', () => {
    const mu = 4.2;
    const r = 3.8;

    let sum = 0;
    for (let k = 0; k <= 20; k++) {
      const p = negBinomialProb(k, mu, r);
      expect(p).toBeGreaterThanOrEqual(0);
      sum += p;
    }

    // Cumulative sum up to 20 should capture nearly all probability mass (>0.99)
    expect(sum).toBeGreaterThan(0.98);
  });

  it('predicts match cards and Over/Under cards distribution', () => {
    const referee: Referee = {
      id: 10,
      name: 'Mateu Lahoz',
      matchesCount: 25,
      avgYellowCardsPerMatch: 5.4,
      avgRedCardsPerMatch: 0.3,
      avgFoulsPerMatch: 28.0,
      severityIndex: 1.25, // Strict referee
    };

    const prediction = predictMatchCards(undefined, undefined, referee, 1.1);

    expect(prediction.refereeImpactFactor).toBe(1.25);
    expect(prediction.expectedTotalCards).toBeGreaterThan(4.0);
    expect(prediction.overUnderCards.length).toBe(5);

    // Over + Under should sum close to 1.0
    for (const ou of prediction.overUnderCards) {
      expect(ou.overProb + ou.underProb).toBeCloseTo(1.0, 2);
    }
  });

  it('calculates individual high risk players for card booking bets', () => {
    const startingXI: PlayerStats[] = [
      {
        id: 101,
        name: 'Casemiro',
        number: 18,
        position: 'M',
        isStarter: true,
        minutesPlayed: 900,
        yellowCards: 7,
        redCards: 1,
        foulsCommitted: 25,
        foulsDrawn: 8,
      },
      {
        id: 102,
        name: 'Bukayo Saka',
        number: 7,
        position: 'F',
        isStarter: true,
        minutesPlayed: 900,
        yellowCards: 1,
        redCards: 0,
        foulsCommitted: 5,
        foulsDrawn: 22,
      },
    ];

    const lineup: Lineup = {
      formation: '4-3-3',
      startingXI,
      substitutes: [],
    };

    const referee: Referee = {
      id: 10,
      name: 'Anthony Taylor',
      matchesCount: 30,
      avgYellowCardsPerMatch: 4.8,
      avgRedCardsPerMatch: 0.2,
      avgFoulsPerMatch: 24.0,
      severityIndex: 1.15,
    };

    const prediction = predictMatchCards(lineup, undefined, referee, 1.3, undefined, 'Manchester United', 'Arsenal');
    expect(prediction.highRiskPlayers).toBeDefined();
    expect(prediction.highRiskPlayers!.length).toBeGreaterThan(0);

    const topRisk = prediction.highRiskPlayers![0];
    expect(topRisk.name).toBe('Casemiro');
    expect(topRisk.riskLevel).toBe('HIGH');
    expect(topRisk.cardProbability).toBeGreaterThan(0.3);
    expect(topRisk.fairOdds).toBeGreaterThan(1.5);
  });
});
