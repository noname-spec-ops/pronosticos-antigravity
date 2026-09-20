import { describe, it, expect } from 'vitest';
import {
  matchTeamName,
  isNonFirstTeam,
  canonicalClubKey,
  teamNameSimilarity,
  MIN_RELIABLE_MATCH_CONFIDENCE,
} from '../../lib/teamMapping';
import { strengthStore } from '../../lib/strengthStore';
import fs from 'fs';
import path from 'path';

/**
 * Read at runtime rather than imported.
 *
 * `import historical from '.../historical_matches.json'` makes TypeScript infer a
 * literal type for every one of the 62k records; at ~55 MB that exhausts the
 * compiler's heap and `tsc --noEmit` dies with an allocation failure.
 */
const CANDIDATES = (() => {
  const raw = fs.readFileSync(path.resolve(process.cwd(), 'data', 'historical_matches.json'), 'utf-8');
  const historical = JSON.parse(raw) as Array<{ homeTeam: string; awayTeam: string }>;
  const names = new Set<string>();
  historical.forEach((m) => {
    names.add(m.homeTeam);
    names.add(m.awayTeam);
  });
  return [...names];
})();

/** Resolves only if the match clears the reliability bar, as production callers do. */
function resolveReliably(name: string): string | null {
  const r = matchTeamName(name, CANDIDATES);
  if (!r || r.confidence < MIN_RELIABLE_MATCH_CONFIDENCE) return null;
  return r.matchedName;
}

describe('canonicalClubKey', () => {
  it('keeps suffixes that distinguish different clubs', () => {
    expect(canonicalClubKey('Manchester City')).not.toBe(canonicalClubKey('Manchester United'));
    expect(canonicalClubKey('Dundee')).not.toBe(canonicalClubKey('Dundee United'));
    expect(canonicalClubKey('Oxford')).not.toBe(canonicalClubKey('Oxford City'));
  });

  it('folds diacritics, club prefixes and place-name transliterations', () => {
    expect(canonicalClubKey('FC Bayern München')).toBe(canonicalClubKey('Bayern Munich'));
    expect(canonicalClubKey('1. FC Köln')).toBe(canonicalClubKey('FC Cologne'));
    expect(canonicalClubKey('Atlético Madrid')).toBe(canonicalClubKey('Atletico Madrid'));
  });
});

describe('isNonFirstTeam', () => {
  it('flags reserve, youth and women sides', () => {
    for (const n of [
      'Bayern Munich II',
      'Real Madrid Castilla',
      'Arsenal U21',
      'Barcelona Sub-19',
      'Ajax Reserves',
      'Bayern Munich Women',
      'Real Madrid Femenino',
      'Bayern Frauen',
      'Villarreal B',
    ]) {
      expect(isNonFirstTeam(n), n).toBe(true);
    }
  });

  it('does not flag first teams whose names merely contain those letters', () => {
    for (const n of ['Viitorul', 'Brentford', 'Cambuur', 'Botosani', 'Juventus', 'Ipswich Town']) {
      expect(isNonFirstTeam(n), n).toBe(false);
    }
  });
});

describe('matchTeamName — must not produce silent wrong matches', () => {
  // Every one of these resolved to a completely different club before the rewrite,
  // at a reported confidence of 0.85, and the wrong ELO then fed the model.
  const TRAPS: Array<[string, string]> = [
    ['Newcastle Jets', 'Newcastle'],
    ['Birmingham Legion', 'Birmingham'],
    ['Real Madrid Castilla', 'Real Madrid'],
    ['FC Porto B', 'Porto'],
    ['Sevilla Atletico', 'Sevilla'],
    ['Bayern Munich II', 'Bayern Munich'],
    ['Barcelona SC', 'Barcelona'],
  ];

  it.each(TRAPS)('refuses %s (previously matched %s)', (input) => {
    expect(resolveReliably(input)).toBeNull();
  });

  /**
   * These used to be traps for the same reason, but their domestic leagues are
   * now in the dataset (Eliteserien, MLS), so the correct answer is the club
   * itself. What must never come back is the club it used to be confused with.
   */
  const NOW_COVERED: Array<[string, string, string]> = [
    ['Lillestrom', 'Lillestrom', 'Lille'],
    ['Inter Miami', 'Inter Miami', 'Inter'],
    ['Manchester City FC', 'Man City', 'Man United'],
  ];

  it.each(NOW_COVERED)('resolves %s to %s and never to %s', (input, correct, wrong) => {
    const got = resolveReliably(input);
    expect(got).not.toBe(wrong);
    expect(got === null || got === correct).toBe(true);
  });

  it('resolves Le Mans to Le Mans, never to Man United', () => {
    // "lemans" contains "man", which is what normalizeTeamName reduces both
    // Manchester clubs to. Le Mans is now genuinely in the dataset (Ligue 2
    // 2025-26, promoted to Ligue 1 for 2026-27), so the correct answer is itself.
    const got = resolveReliably('Le Mans');
    expect(got === null || got === 'Le Mans').toBe(true);
    expect(got).not.toBe('Man United');
    expect(got).not.toBe('Man City');
  });

  it('never resolves an ambiguous name to one of several equally plausible clubs', () => {
    // normalizeTeamName maps both Manchester clubs to "man".
    expect(resolveReliably('Man')).toBeNull();
  });
});

describe('matchTeamName — must still resolve real clubs', () => {
  const EXPECTED: Array<[string, string]> = [
    ['Manchester City', 'Man City'],
    ['Manchester United', 'Man United'],
    ['Nottingham Forest', "Nott'm Forest"],
    ['Atlético de Madrid', 'Ath Madrid'],
    ['FC Bayern München', 'Bayern Munich'],
    ['Bayern Munich', 'Bayern Munich'],
    ['Real Sociedad', 'Sociedad'],
    ['Celta de Vigo', 'Celta'],
    ['Hamburgo', 'Hamburg'],
    ['Brighton & Hove Albion', 'Brighton'],
    ['Wolverhampton Wanderers', 'Wolves'],
    ['TSG Hoffenheim', 'Hoffenheim'],
    ['AC Milan', 'Milan'],
    ['Brentford', 'Brentford'],
  ];

  it.each(EXPECTED)('resolves %s to %s', (input, expected) => {
    expect(resolveReliably(input)).toBe(expected);
  });
});

describe('teamNameSimilarity', () => {
  it('separates transliterations from genuinely different clubs', () => {
    // Both score ~0.75-0.77 on the old lossy normalisation, which is why
    // similarity alone cannot be the deciding signal.
    expect(teamNameSimilarity('FC Bayern München', 'Bayern Munich')).toBe(1);
    expect(teamNameSimilarity('Manchester City', 'Manchester United')).toBeLessThan(0.8);
  });
});

describe('strengthStore end-to-end', () => {
  it('returns no metrics rather than another club’s ELO', () => {
    for (const n of ['Barcelona SC', 'Bayern Munich II', 'Newcastle Jets', 'Birmingham Legion']) {
      expect(strengthStore.getTeamMetrics(n), n).toBeNull();
    }
  });

  it('rates newly covered clubs with their OWN history, not a namesake’s', () => {
    // Lillestrom carried Lille's 1673 ELO before the matcher rewrite; it now has
    // its own Eliteserien record.
    const lillestrom = strengthStore.getTeamMetrics('Lillestrom', 'NOR1');
    expect(lillestrom).not.toBeNull();
    expect(lillestrom!.matchedHistoricalName).toBe('Lillestrom');

    const interMiami = strengthStore.getTeamMetrics('Inter Miami', 'USA');
    expect(interMiami).not.toBeNull();
    expect(interMiami!.matchedHistoricalName).toBe('Inter Miami');
    expect(interMiami!.matchedHistoricalName).not.toBe('Inter');
  });

  it('still resolves clubs that are genuinely in the dataset', () => {
    const bayern = strengthStore.getTeamMetrics('FC Bayern München', 'D1');
    expect(bayern).not.toBeNull();
    expect(bayern!.matchedHistoricalName).toBe('Bayern Munich');

    const celta = strengthStore.getTeamMetrics('Celta de Vigo');
    expect(celta).not.toBeNull();
    expect(celta!.matchedHistoricalName).toBe('Celta');
  });

  it('does not let a lossy direct key hit bypass the confidence check', () => {
    // "Barcelona SC" normalises to "barcelona" and used to hit the metrics map
    // directly, skipping matchTeamName and its confidence gate entirely.
    expect(strengthStore.getTeamMetrics('Barcelona SC')).toBeNull();
  });
});
