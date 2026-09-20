import { describe, it, expect } from 'vitest';
import { evaluateKillSwitch } from '../paperTrading';

describe('Financial Discipline Kill-Switch Engine', () => {
  it('allows betting when drawdown is within normal limits (< 15%)', () => {
    const status = evaluateKillSwitch(8.5);
    expect(status.isActive).toBe(false);
    expect(status.canPlaceBets).toBe(true);
    expect(status.reason).toBe('NONE');
  });

  it('triggers 24h suspension when drawdown reaches 15%', () => {
    const status = evaluateKillSwitch(16.2);
    expect(status.isActive).toBe(true);
    expect(status.canPlaceBets).toBe(false);
    expect(status.reason).toBe('DRAWDOWN_15_PCT_24H');
    expect(status.suspendedUntil).toBeDefined();
    expect(status.message).toContain('KILL-SWITCH 24H ACTIVAT');
  });

  it('triggers permanent suspension when drawdown reaches critical 25%', () => {
    const status = evaluateKillSwitch(26.5);
    expect(status.isActive).toBe(true);
    expect(status.canPlaceBets).toBe(false);
    expect(status.reason).toBe('DRAWDOWN_25_PCT_PERMANENT');
    expect(status.suspendedUntil).toBe('MANUAL_RECALIBRATION_REQUIRED');
    expect(status.message).toContain('KILL-SWITCH CRITIC ACTIVAT');
  });
});