import { describe, it, expect } from 'vitest';
import { generateDixonColesMatrix } from '../dixonColes';
import { deriveAsianHandicap } from '../poisson';

describe('Quarter and Half Asian Handicap Calculations', () => {
  it('generates 21 standard lines from -2.50 to +2.50 in 0.25 steps', () => {
    const matrix = generateDixonColesMatrix(1.5, 1.2, -0.05);
    const ahLines = deriveAsianHandicap(matrix);

    expect(ahLines.length).toBe(21);
    expect(ahLines[0].line).toBe(-2.5);
    expect(ahLines[ahLines.length - 1].line).toBe(2.5);
  });

  it('correctly evaluates integer push line (Line 0.0 DNB)', () => {
    const matrix = generateDixonColesMatrix(1.4, 1.4, 0);
    const ahLines = deriveAsianHandicap(matrix);
    const line0 = ahLines.find((l) => l.line === 0)!;

    expect(line0).toBeDefined();
    expect(line0.pushProb).toBeGreaterThan(0.20); // Draw prob ~26%
    expect(line0.homeWinProb).toBeCloseTo(line0.awayWinProb, 2);
    expect(line0.fairOddsHome).toBeCloseTo(2.0, 1);
  });

  it('correctly evaluates quarter-ball lines (-0.25 and +0.25)', () => {
    const matrix = generateDixonColesMatrix(1.8, 1.0, -0.05);
    const ahLines = deriveAsianHandicap(matrix);

    const lineMinus025 = ahLines.find((l) => l.line === -0.25)!;
    const linePlus025 = ahLines.find((l) => l.line === 0.25)!;

    expect(lineMinus025).toBeDefined();
    expect(linePlus025).toBeDefined();

    // Home is strong (1.8 vs 1.0) -> homeWinProb on -0.25 should be solid
    expect(lineMinus025.homeWinProb).toBeGreaterThan(0.40);
    expect(linePlus025.homeWinProb).toBeGreaterThan(lineMinus025.homeWinProb);
    expect(lineMinus025.fairOddsHome).toBeGreaterThan(1.0);
  });
});