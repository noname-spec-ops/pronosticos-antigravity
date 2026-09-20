import { describe, it, expect } from 'vitest';
import { computeTacticalTracking } from '../tacticalTracking';
import type { TeamStrengthMetrics } from '../../types/football';

describe('Tactical Tracking & xT Engine (2023-2026 Sharp Quant)', () => {
  const homeStrength: TeamStrengthMetrics = {
    teamId: 1,
    teamName: 'Arsenal',
    matchesEvaluated: 25,
    homeAttack: 1.45,
    homeDefense: 0.65,
    awayAttack: 1.25,
    awayDefense: 0.85,
    leagueAvgGoalsHome: 1.55,
    leagueAvgGoalsAway: 1.20,
    isShrinkageApplied: true,
    homeAdvantageIndex: 1.15,
  };

  const awayStrength: TeamStrengthMetrics = {
    teamId: 2,
    teamName: 'Chelsea',
    matchesEvaluated: 25,
    homeAttack: 1.10,
    homeDefense: 0.95,
    awayAttack: 1.05,
    awayDefense: 1.10,
    leagueAvgGoalsHome: 1.55,
    leagueAvgGoalsAway: 1.20,
    isShrinkageApplied: true,
    homeAdvantageIndex: 1.02,
  };

  it('computes realistic defensive line height and pack-breaking passes', () => {
    const result = computeTacticalTracking({
      homeStrength,
      awayStrength,
      homeElo: 1850,
      awayElo: 1680,
      homePossessionAvg: 61,
      awayPossessionAvg: 49,
      travelDistanceKm: 15,
    });

    expect(result.home.defensiveLineHeightMeters).toBeGreaterThan(48.0);
    expect(result.home.defensiveLineHeightMeters).toBeLessThan(57.0);
    expect(result.home.packBreakingPassesAvg).toBeGreaterThan(12.0);
    expect(result.home.expectedThreat_xT).toBeGreaterThan(1.5);
    expect(result.home.fieldTiltPercent).toBeGreaterThan(55);
    expect(result.away.fieldTiltPercent).toBeLessThan(45);
  });

  it('evaluates counter attack risk when defensive line is high', () => {
    const result = computeTacticalTracking({
      homeStrength,
      awayStrength,
      homeElo: 1900,
      awayElo: 1700,
      homePossessionAvg: 68,
      awayPossessionAvg: 42,
      travelDistanceKm: 450,
    });

    expect(['HIGH', 'MODERATE']).toContain(result.counterAttackRiskLevel);
    expect(result.environmentalExhaustionAway.flightKm).toBe(450);
  });
});
