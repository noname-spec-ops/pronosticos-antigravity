import { describe, it, expect, beforeEach } from 'vitest';
import { LiveOddsProvider, LEAGUE_ID_TO_ODDS_SPORT } from '../../services/oddsProvider';
import { serverCache } from '../../lib/cache';
import type { Fixture } from '../../types/football';

/**
 * These tests pin the behaviour that was previously broken: the provider used to
 * return `data[0]` — the first match of the first soccer league — as the odds for
 * whatever fixture was asked about, and filled missing markets with hardcoded
 * prices (3.30 draw, 1.95/1.85 over-under, 1.85/1.95 BTTS).
 */

function fixture(over: { id: number; home: string; away: string; date: string; leagueId: number; status?: string }): Fixture {
  return {
    id: over.id,
    date: over.date,
    timestamp: Math.floor(new Date(over.date).getTime() / 1000),
    status: (over.status ?? 'NS') as Fixture['status'],
    league: { id: over.leagueId, name: 'L', country: 'C', season: 2026 },
    homeTeam: { id: 1, name: over.home, logo: '' },
    awayTeam: { id: 2, name: over.away, logo: '' },
    score: {
      halftime: { home: null, away: null },
      fulltime: { home: null, away: null },
      current: { home: null, away: null },
    },
  } as Fixture;
}

function oddsEvent(home: string, away: string, commence: string) {
  return {
    id: `ev-${home}-${away}`,
    commence_time: commence,
    home_team: home,
    away_team: away,
    bookmakers: [
      {
        key: 'book_a',
        title: 'Book A',
        markets: [
          {
            key: 'h2h',
            outcomes: [
              { name: home, price: 2.0 },
              { name: away, price: 4.0 },
              { name: 'Draw', price: 3.4 },
            ],
          },
          {
            key: 'totals',
            outcomes: [
              { name: 'Over', price: 1.9, point: 2.5 },
              { name: 'Under', price: 1.95, point: 2.5 },
            ],
          },
        ],
      },
      {
        key: 'book_b',
        title: 'Book B',
        markets: [
          {
            key: 'h2h',
            outcomes: [
              { name: home, price: 2.15 }, // better home price
              { name: away, price: 3.8 },
              { name: 'Draw', price: 3.5 }, // better draw price
            ],
          },
        ],
      },
    ],
  };
}

describe('odds fixture matching', () => {
  let provider: any;

  beforeEach(() => {
    serverCache.clear();
    process.env.ODDS_API_KEY = 'test-key-not-used';
    provider = new LiveOddsProvider();
  });

  it('maps our league ids onto real Odds API sport keys', () => {
    expect(LEAGUE_ID_TO_ODDS_SPORT[39]).toBe('soccer_epl');
    expect(LEAGUE_ID_TO_ODDS_SPORT[140]).toBe('soccer_spain_la_liga');
    // Europa League is not offered by the provider; it must be absent rather
    // than silently pointed at some other competition.
    expect(LEAGUE_ID_TO_ODDS_SPORT[3]).toBeUndefined();
  });

  it('attaches a quote to the fixture it actually belongs to', () => {
    const events = [
      oddsEvent('Arsenal', 'Tottenham', '2026-09-18T19:00:00Z'),
      oddsEvent('Brentford', 'Chelsea', '2026-09-18T20:00:00Z'),
    ];
    const target = fixture({ id: 7, home: 'Brentford', away: 'Chelsea', date: '2026-09-18T20:00:00Z', leagueId: 39 });

    const found = provider.findEventForFixture(target, events);
    expect(found?.home_team).toBe('Brentford');
  });

  it('returns nothing rather than another match when the fixture is not quoted', () => {
    const events = [oddsEvent('Arsenal', 'Tottenham', '2026-09-18T19:00:00Z')];
    const target = fixture({ id: 8, home: 'Monza', away: 'Sassuolo', date: '2026-09-18T20:45:00Z', leagueId: 135 });

    expect(provider.findEventForFixture(target, events)).toBeNull();
  });

  it('refuses a name match whose kickoff is a different fixture entirely', () => {
    // Same pairing, but a month later — a different match.
    const events = [oddsEvent('Brentford', 'Chelsea', '2026-10-18T20:00:00Z')];
    const target = fixture({ id: 9, home: 'Brentford', away: 'Chelsea', date: '2026-09-18T20:00:00Z', leagueId: 39 });

    expect(provider.findEventForFixture(target, events)).toBeNull();
  });

  it('takes the best available price across bookmakers', () => {
    const odds = provider.buildMarketOdds(oddsEvent('Brentford', 'Chelsea', '2026-09-18T20:00:00Z'));
    expect(odds).not.toBeNull();
    expect(odds!.match1X2.home).toBe(2.15); // Book B beats Book A
    expect(odds!.match1X2.draw).toBe(3.5);
    expect(odds!.match1X2.away).toBe(4.0); // Book A beats Book B
  });

  it('omits BTTS entirely instead of inventing 1.85/1.95', () => {
    const odds = provider.buildMarketOdds(oddsEvent('Brentford', 'Chelsea', '2026-09-18T20:00:00Z'));
    expect(odds!.btts).toBeUndefined();
  });

  it('keeps only over/under lines quoted on both sides', () => {
    const ev = oddsEvent('Brentford', 'Chelsea', '2026-09-18T20:00:00Z');
    // A line with only the Over side quoted must not appear.
    ev.bookmakers[0].markets[1].outcomes.push({ name: 'Over', price: 2.5, point: 3.5 });

    const odds = provider.buildMarketOdds(ev);
    expect(odds!.overUnder.map((m: any) => m.line)).toEqual([2.5]);
  });

  it('returns null when the 1X2 market is incomplete', () => {
    const ev = oddsEvent('Brentford', 'Chelsea', '2026-09-18T20:00:00Z');
    ev.bookmakers.forEach((bm: any) => {
      bm.markets = bm.markets.filter((m: any) => m.key !== 'h2h');
    });
    expect(provider.buildMarketOdds(ev)).toBeNull();
  });

  it('serves a cached quote for a single fixture without any network call', async () => {
    const odds = provider.buildMarketOdds(oddsEvent('Brentford', 'Chelsea', '2026-09-18T20:00:00Z'));
    serverCache.set('odds:fixture:42', odds, 300);
    await expect(provider.getMatchOdds(42, false)).resolves.toEqual(odds);
  });

  it('returns null, never a placeholder, for an unquoted fixture id', async () => {
    await expect(provider.getMatchOdds(999999, false)).resolves.toBeNull();
  });
});
