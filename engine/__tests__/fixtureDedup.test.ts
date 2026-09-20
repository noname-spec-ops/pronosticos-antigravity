import { describe, it, expect } from 'vitest';
import { dedupeFixtures } from '../../services/apiFootball';
import type { Fixture } from '../../types/football';

function makeFixture(
  over: Partial<Fixture> & { providerPriority?: number } & {
    home: string;
    away: string;
    date: string;
    leagueId?: number;
  }
): any {
  const { home, away, date, leagueId = 78, providerPriority, ...rest } = over;
  return {
    id: Math.floor(Math.random() * 1e9),
    date,
    timestamp: Math.floor(new Date(date).getTime() / 1000),
    status: 'NS',
    league: { id: leagueId, name: 'L', country: 'C', season: 2026 },
    homeTeam: { id: 1, name: home, logo: '' },
    awayTeam: { id: 2, name: away, logo: '' },
    score: {
      halftime: { home: null, away: null },
      fulltime: { home: null, away: null },
      current: { home: null, away: null },
    },
    providerPriority,
    ...rest,
  };
}

describe('dedupeFixtures', () => {
  const DAY = '2026-09-18';

  it('collapses the same match arriving from several providers under different ids', () => {
    const out = dedupeFixtures(
      [
        makeFixture({ home: 'Bayern Munich', away: '1. FC Union Berlin', date: `${DAY}T18:30:00Z`, providerPriority: 2 }),
        makeFixture({ home: 'Bayern Munich', away: '1. FC Union Berlin', date: `${DAY}T18:30:00Z`, providerPriority: 5 }),
      ],
      DAY
    );
    expect(out).toHaveLength(1);
  });

  it('collapses near-duplicate club spellings across providers', () => {
    const out = dedupeFixtures(
      [
        makeFixture({ home: 'FC Bayern München', away: '1. FC Union Berlin', date: `${DAY}T18:30:00Z`, providerPriority: 4 }),
        makeFixture({ home: 'Bayern Munich', away: '1. FC Union Berlin', date: `${DAY}T18:30:00Z`, providerPriority: 2 }),
      ],
      DAY
    );
    expect(out).toHaveLength(1);
    // The richer provider (lower priority number) must win.
    expect(out[0].homeTeam.name).toBe('Bayern Munich');
  });

  it('is orientation independent (home/away reported the other way round)', () => {
    const out = dedupeFixtures(
      [
        makeFixture({ home: 'Monza', away: 'Sassuolo', date: `${DAY}T20:45:00Z`, providerPriority: 2 }),
        makeFixture({ home: 'Sassuolo', away: 'Monza', date: `${DAY}T20:45:00Z`, providerPriority: 5 }),
      ],
      DAY
    );
    expect(out).toHaveLength(1);
  });

  it('drops fixtures that are not on the requested calendar day', () => {
    const out = dedupeFixtures(
      [
        makeFixture({ home: 'Brentford', away: 'Chelsea', date: `${DAY}T19:00:00Z` }),
        makeFixture({ home: 'Flamengo', away: 'Independiente', date: '2026-09-19T00:30:00Z' }),
      ],
      DAY
    );
    expect(out).toHaveLength(1);
    expect(out[0].homeTeam.name).toBe('Brentford');
  });

  it('keeps genuinely different matches apart even with similar names', () => {
    const out = dedupeFixtures(
      [
        makeFixture({ home: 'Manchester City', away: 'Arsenal', date: `${DAY}T19:00:00Z`, leagueId: 39 }),
        makeFixture({ home: 'Manchester United', away: 'Arsenal', date: `${DAY}T19:00:00Z`, leagueId: 39 }),
      ],
      DAY
    );
    expect(out).toHaveLength(2);
  });

  it('merges the same pairing reported under different league ids by two providers', () => {
    // Providers do not agree on league ids (ESPN uses ours, Football-Data.org and
    // TheSportsDB use their own), so identity is day + teams + kickoff, not league.
    // Two clubs cannot meet twice on the same day, which makes this safe.
    const out = dedupeFixtures(
      [
        makeFixture({ home: 'Brentford', away: 'Chelsea', date: `${DAY}T19:00:00Z`, leagueId: 39, providerPriority: 2 }),
        makeFixture({ home: 'Brentford', away: 'Chelsea', date: `${DAY}T19:00:00Z`, leagueId: 2021, providerPriority: 3 }),
      ],
      DAY
    );
    expect(out).toHaveLength(1);
    expect(out[0].league.id).toBe(39);
  });

  it('keeps clubs whose names differ only by suffix apart', () => {
    // normalizeTeamName maps both to "manchester"; the dedup key must not.
    const out = dedupeFixtures(
      [
        makeFixture({ home: 'Manchester City', away: 'Everton', date: `${DAY}T19:00:00Z`, leagueId: 39 }),
        makeFixture({ home: 'Manchester United', away: 'Everton', date: `${DAY}T19:00:00Z`, leagueId: 39 }),
      ],
      DAY
    );
    expect(out).toHaveLength(2);
  });

  it('prefers the entry carrying live detail when providers tie', () => {
    const out = dedupeFixtures(
      [
        makeFixture({ home: 'Monza', away: 'Sassuolo', date: `${DAY}T20:45:00Z`, providerPriority: 2, status: 'NS' }),
        makeFixture({
          home: 'Monza',
          away: 'Sassuolo',
          date: `${DAY}T20:45:00Z`,
          providerPriority: 2,
          status: '2H',
          elapsedMinute: 67,
          score: {
            halftime: { home: 1, away: 0 },
            fulltime: { home: null, away: null },
            current: { home: 1, away: 1 },
          },
        }),
      ],
      DAY
    );
    expect(out).toHaveLength(1);
    expect(out[0].status).toBe('2H');
    expect(out[0].elapsedMinute).toBe(67);
  });

  it('rejects placeholder team names produced by failed provider parses', () => {
    const out = dedupeFixtures(
      [makeFixture({ home: 'Home', away: 'Away', date: `${DAY}T19:00:00Z` })],
      DAY
    );
    expect(out).toHaveLength(0);
  });

  it('never leaks the internal providerPriority field to callers', () => {
    const out = dedupeFixtures(
      [makeFixture({ home: 'Brentford', away: 'Chelsea', date: `${DAY}T19:00:00Z`, providerPriority: 2 })],
      DAY
    );
    expect(out[0]).not.toHaveProperty('providerPriority');
  });
});
