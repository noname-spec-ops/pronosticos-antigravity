import { describe, it, expect } from 'vitest';
import { LiveOddsProvider } from '../../services/oddsProvider';
import { devigMultiplicative } from '../devig';
import { blendWithMarketPrior } from '../marketBlending';

/**
 * Guards the odds path against two distinct failure modes found by audit:
 *
 *  1. Deriving the market prior from the best-of-all-books line biases it toward
 *     the favourite by about 1 percentage point even on clean data, because the
 *     spread between bookmakers is far wider on the longshot than on the
 *     favourite. That prior carries 65% of the displayed probability.
 *
 *  2. A single erroneous quote moved the devigged prior by up to 13 percentage
 *     points and the displayed probability by 5. The SUSPECT grade caught the
 *     resulting BET, but the displayed probability goes through
 *     blendWithMarketPrior, a different path entirely, and was unprotected.
 */

/** Eight books quoting a fixture whose true probabilities are 0.50 / 0.27 / 0.23. */
const CLEAN_QUOTES: Array<[number, number, number]> = [
  [1.95, 3.6, 4.2],
  [1.91, 3.5, 4.33],
  [1.93, 3.55, 4.1],
  [1.96, 3.45, 4.5],
  [1.9, 3.6, 4.2],
  [1.92, 3.7, 4.0],
  [1.94, 3.4, 4.6],
  [1.97, 3.65, 4.4],
];

const TRUE_PROBS = { home: 0.5, draw: 0.27, away: 0.23 };

function buildEvent(quotes: Array<[number, number, number]>) {
  return {
    id: 'ev',
    commence_time: '2026-09-19T19:00:00Z',
    home_team: 'Home FC',
    away_team: 'Away FC',
    bookmakers: quotes.map(([h, d, a], i) => ({
      key: `book${i}`,
      title: `Book ${i}`,
      markets: [
        {
          key: 'h2h',
          outcomes: [
            { name: 'Home FC', price: h },
            { name: 'Away FC', price: a },
            { name: 'Draw', price: d },
          ],
        },
      ],
    })),
  };
}

/** buildMarketOdds is private; these tests exercise it deliberately. */
function build(quotes: Array<[number, number, number]>) {
  const provider = new LiveOddsProvider() as any;
  return provider.buildMarketOdds(buildEvent(quotes));
}

function maxAbsErrorVsTruth(p: { home: number; draw: number; away: number }): number {
  return Math.max(
    Math.abs(p.home - TRUE_PROBS.home),
    Math.abs(p.draw - TRUE_PROBS.draw),
    Math.abs(p.away - TRUE_PROBS.away)
  );
}

describe('odds construction separates the takeable price from the market consensus', () => {
  it('reports the best price for betting and the median for the prior', () => {
    const odds = build(CLEAN_QUOTES)!;
    expect(odds.match1X2.home).toBe(1.97); // best available
    expect(odds.consensus1X2).toBeDefined();
    expect(odds.consensus1X2!.home).toBeCloseTo(1.935, 3); // median
    // They must not be the same number — that was the bug.
    expect(odds.consensus1X2!.away).toBeLessThan(odds.match1X2.away);
  });

  it('gives a markedly more accurate prior than the best-of-all line', () => {
    const odds = build(CLEAN_QUOTES)!;
    const fromConsensus = devigMultiplicative(odds.consensus1X2!);
    const fromBestPrice = devigMultiplicative(odds.match1X2);

    expect(maxAbsErrorVsTruth(fromConsensus)).toBeLessThan(0.005);
    expect(maxAbsErrorVsTruth(fromBestPrice)).toBeGreaterThan(0.01);
    expect(maxAbsErrorVsTruth(fromConsensus)).toBeLessThan(maxAbsErrorVsTruth(fromBestPrice));
  });

  it('keeps the synthetic best-of-all book from being a standing arbitrage', () => {
    const odds = build(CLEAN_QUOTES)!;
    const consensusOverround =
      1 / odds.consensus1X2!.home + 1 / odds.consensus1X2!.draw + 1 / odds.consensus1X2!.away;
    // The consensus is a real book and must carry a real margin.
    expect(consensusOverround).toBeGreaterThan(1);
  });
});

describe('odds construction is robust to a bad quote', () => {
  /** One book fat-fingers the away price. */
  const withOutlier = CLEAN_QUOTES.map((q, i) => (i === 7 ? [q[0], q[1], 12.0] : q)) as Array<
    [number, number, number]
  >;

  it('does not let an outlier become the headline price', () => {
    const odds = build(withOutlier)!;
    expect(odds.match1X2.away).toBe(4.6); // the real best, not 12.0
  });

  it('leaves the market prior unchanged', () => {
    const clean = devigMultiplicative(build(CLEAN_QUOTES)!.consensus1X2!);
    const dirty = devigMultiplicative(build(withOutlier)!.consensus1X2!);
    expect(dirty.home).toBeCloseTo(clean.home, 4);
    expect(dirty.away).toBeCloseTo(clean.away, 4);
  });

  it('leaves the displayed probability unchanged', () => {
    const model = { home: 0.44, draw: 0.28, away: 0.28 };
    const shown = (quotes: typeof CLEAN_QUOTES) =>
      blendWithMarketPrior(model, devigMultiplicative(build(quotes)!.consensus1X2!), 0.35)
        .probabilities1X2;

    const clean = shown(CLEAN_QUOTES);
    const dirty = shown(withOutlier);
    // Before the fix this moved by 5.2 percentage points.
    expect(Math.abs(dirty.home - clean.home)).toBeLessThan(0.002);
  });

  it('keeps the best price when too few books agree to identify an outlier', () => {
    // With three books there is no consensus to measure against, so nothing is
    // discarded — silently dropping the highest of three would lose real value.
    const threeBooks: Array<[number, number, number]> = [
      [1.95, 3.6, 4.2],
      [1.91, 3.5, 4.33],
      [1.93, 3.55, 5.9],
    ];
    const odds = build(threeBooks)!;
    expect(odds.match1X2.away).toBe(5.9);
  });
});

describe('implausible books are discarded rather than published', () => {
  it('rejects a set of quotes that cannot be a coherent book', () => {
    // Every book wildly mispriced in the same direction: outlier removal cannot
    // help, because there is no sane majority to compare against.
    const broken: Array<[number, number, number]> = [
      [8.0, 9.0, 40.0],
      [8.2, 9.1, 41.0],
      [8.1, 8.9, 39.0],
      [8.3, 9.2, 42.0],
    ];
    expect(build(broken)).toBeNull();
  });

  it('accepts an ordinary book', () => {
    expect(build(CLEAN_QUOTES)).not.toBeNull();
  });

  it('returns null when an outcome is not quoted at all', () => {
    const provider = new LiveOddsProvider() as any;
    const ev = buildEvent(CLEAN_QUOTES);
    ev.bookmakers.forEach((b: any) => {
      b.markets[0].outcomes = b.markets[0].outcomes.filter((o: any) => o.name !== 'Draw');
    });
    expect(provider.buildMarketOdds(ev)).toBeNull();
  });
});
