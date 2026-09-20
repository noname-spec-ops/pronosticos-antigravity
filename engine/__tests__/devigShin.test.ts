import { describe, it, expect } from 'vitest';
import { devigShin, devigMultiplicative, devig2WayMarket, calculateOverround } from '../devig';

/**
 * Independent Shin (1993) solver used as an oracle. Written from the published
 * closed form rather than from the implementation under test.
 */
function shinOracle(o: { home: number; draw: number; away: number }): number[] {
  const q = [1 / o.home, 1 / o.draw, 1 / o.away];
  const S = q.reduce((a, b) => a + b, 0);
  const p = (z: number) =>
    q.map((qi) => (Math.sqrt(z * z + 4 * (1 - z) * qi * qi / S) - z) / (2 * (1 - z)));
  const f = (z: number) => p(z).reduce((a, b) => a + b, 0) - 1;
  let lo = 0;
  let hi = 0.5;
  let z = 0;
  for (let i = 0; i < 200; i++) {
    z = (lo + hi) / 2;
    if (f(z) > 0) lo = z;
    else hi = z;
  }
  return p((lo + hi) / 2);
}

const BOOKS = [
  { home: 1.5, draw: 4.5, away: 7.0 },
  { home: 1.2, draw: 7.0, away: 15.0 },
  { home: 2.9, draw: 3.3, away: 2.6 },
  { home: 1.05, draw: 15.0, away: 40.0 },
  { home: 1.9, draw: 3.6, away: 4.2 },
  { home: 6.0, draw: 4.0, away: 1.55 },
];

describe('devigShin', () => {
  it('matches an independent Shin solver to rounding precision', () => {
    for (const b of BOOKS) {
      const got = devigShin(b);
      const want = shinOracle(b);
      expect(got.home).toBeCloseTo(want[0], 3);
      expect(got.draw).toBeCloseTo(want[1], 3);
      expect(got.away).toBeCloseTo(want[2], 3);
    }
  });

  it('does NOT silently degrade into the multiplicative method', () => {
    // Regression guard: special-casing z = 0 to proportional devigging made the
    // root search never start, so Shin returned the multiplicative answer.
    const b = { home: 1.2, draw: 7.0, away: 15.0 };
    const shin = devigShin(b);
    const mult = devigMultiplicative(b);
    expect(shin.home).not.toBeCloseTo(mult.home, 3);
    expect(shin.home).toBeGreaterThan(mult.home);
  });

  it('corrects the favourite-longshot bias in the right direction', () => {
    // Shin attributes more of the margin to longshots, so the favourite's true
    // probability is HIGHER than proportional devigging suggests.
    for (const b of BOOKS) {
      const shin = devigShin(b);
      const mult = devigMultiplicative(b);
      const favShin = Math.max(shin.home, shin.draw, shin.away);
      const favMult = Math.max(mult.home, mult.draw, mult.away);
      expect(favShin).toBeGreaterThanOrEqual(favMult - 1e-9);

      const dogShin = Math.min(shin.home, shin.draw, shin.away);
      const dogMult = Math.min(mult.home, mult.draw, mult.away);
      expect(dogShin).toBeLessThanOrEqual(dogMult + 1e-9);
    }
  });

  it('stays within 3 percentage points of proportional devigging', () => {
    // Sanity bound: a correct devig moves probabilities by at most the size of
    // the margin. The broken version was off by up to 22 points.
    for (const b of BOOKS) {
      const shin = devigShin(b);
      const mult = devigMultiplicative(b);
      expect(Math.abs(shin.home - mult.home)).toBeLessThan(0.03);
      expect(Math.abs(shin.draw - mult.draw)).toBeLessThan(0.03);
      expect(Math.abs(shin.away - mult.away)).toBeLessThan(0.03);
    }
  });

  it('leaves a fair book untouched', () => {
    const fair = devigShin({ home: 3, draw: 3, away: 3 });
    expect(fair.home).toBeCloseTo(1 / 3, 3);
    expect(fair.draw).toBeCloseTo(1 / 3, 3);
    expect(fair.away).toBeCloseTo(1 / 3, 3);
  });

  it('falls back to proportional on a sub-fair (arbitrage) book', () => {
    // overround 0.75: there is no insider margin to extract.
    const arb = devigShin({ home: 4, draw: 4, away: 4 });
    expect(arb.home + arb.draw + arb.away).toBeCloseTo(1, 9);
    expect(arb.home).toBeCloseTo(1 / 3, 3);
  });
});

describe('devig probability invariants', () => {
  it('always sums to exactly 1 despite 4dp rounding', () => {
    for (const b of [...BOOKS, { home: 3, draw: 3, away: 3 }, { home: 4, draw: 4, away: 4 }]) {
      for (const fn of [devigMultiplicative, devigShin]) {
        const p = fn(b);
        expect(p.home + p.draw + p.away).toBeCloseTo(1, 9);
      }
    }
  });

  it('2-way markets sum to exactly 1', () => {
    for (const [a, b] of [[1.9, 1.9], [1.44, 2.9], [1.01, 40], [2.05, 1.85]]) {
      const r = devig2WayMarket(a, b);
      expect(r.probA + r.probB).toBeCloseTo(1, 9);
    }
  });

  it('never emits a negative or out-of-range probability', () => {
    for (const b of BOOKS) {
      for (const fn of [devigMultiplicative, devigShin]) {
        const p = fn(b);
        for (const v of [p.home, p.draw, p.away]) {
          expect(v).toBeGreaterThan(0);
          expect(v).toBeLessThan(1);
        }
      }
    }
  });
});

describe('devig input validation', () => {
  const INVALID = [
    { home: 1.0, draw: 3, away: 3 },
    { home: 0, draw: 3, away: 3 },
    { home: -2, draw: 3, away: 3 },
    { home: NaN, draw: 3, away: 3 },
    { home: Infinity, draw: 3, away: 3 },
    { home: 2, draw: 3, away: undefined as any },
  ];

  it('rejects malformed 1X2 odds instead of producing a negative probability', () => {
    for (const bad of INVALID) {
      expect(() => devigMultiplicative(bad as any)).toThrow();
      expect(() => devigShin(bad as any)).toThrow();
    }
  });

  it('rejects a missing odds object', () => {
    expect(() => devigMultiplicative(null as any)).toThrow();
    expect(() => devigShin(undefined as any)).toThrow();
  });

  it('rejects malformed 2-way odds', () => {
    expect(() => devig2WayMarket(1.0, 2.0)).toThrow();
    expect(() => devig2WayMarket(2.0, NaN)).toThrow();
    expect(() => devig2WayMarket(-1, 2)).toThrow();
  });

  it('reports NaN overround for malformed odds rather than a fair 1.0', () => {
    // Returning 1.0 made a corrupt feed look like a zero-margin book.
    expect(calculateOverround({ home: 1.0, draw: 3, away: 3 } as any)).toBeNaN();
    expect(calculateOverround({ home: 2, draw: 3, away: 6 } as any)).toBeCloseTo(1.0, 6);
  });
});
