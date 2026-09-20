/**
 * FlashStat — Top Leagues & Important Match Prioritization (lib/leaguePriority.ts)
 */

import type { Fixture } from '../types/football';

export const TOP_LEAGUE_IDS = new Set([
  2,   // UEFA Champions League
  3,   // UEFA Europa League
  848, // UEFA Europa Conference League
  39,  // Premier League (England)
  140, // La Liga (Spain)
  135, // Serie A (Italy)
  78,  // Bundesliga (Germany)
  61,  // Ligue 1 (France)
  88,  // Eredivisie (Netherlands)
  94,  // Primeira Liga (Portugal)
  203, // Super Lig (Turkey)
  283, // SuperLiga (Romania)
  144, // Jupiler Pro League (Belgium)
  179, // Scottish Premiership
  40,  // Championship (England)
  71,  // Serie A (Brazil)
  128, // Liga Profesional (Argentina)
  253, // MLS (USA)
  13,  // Copa Libertadores
  11,  // Copa Sudamericana
]);

export const TOP_CLUBS_KEYWORDS = [
  'real madrid', 'barcelona', 'atletico madrid', 'manchester city', 'manchester united', 'liverpool',
  'arsenal', 'chelsea', 'tottenham', 'bayern', 'dortmund', 'leverkusen',
  'inter', 'milan', 'juventus', 'napoli', 'roma', 'lazio', 'atalanta',
  'paris saint germain', 'psg', 'monaco', 'marseille', 'lyon', 'ajax', 'psv', 'feyenoord',
  'benfica', 'porto', 'sporting', 'galatasaray', 'fenerbahce', 'besiktas',
  'celtic', 'rangers'
];

/**
 * Checks if a fixture qualifies as a Top / Important Match.
 */
export function isTopMatch(f: Fixture): boolean {
  if (TOP_LEAGUE_IDS.has(f.league.id)) return true;

  const h = f.homeTeam.name.toLowerCase();
  const a = f.awayTeam.name.toLowerCase();
  if (TOP_CLUBS_KEYWORDS.some((k) => h.includes(k) || a.includes(k))) return true;

  const lName = f.league.name.toLowerCase();
  if (
    lName.includes('champions') ||
    lName.includes('premier') ||
    lName.includes('serie a') ||
    lName.includes('la liga') ||
    lName.includes('bundesliga') ||
    lName.includes('ligue 1')
  ) {
    return true;
  }

  return false;
}

/**
 * Returns numeric sorting priority (lower number = higher importance).
 */
export function getLeagueSortOrder(league: { id: number; name: string; country?: string }): number {
  if (league.id === 2 || league.name.includes('Champions League')) return 1;
  if (league.id === 3 || league.name.includes('Europa League')) return 2;
  if (league.id === 848 || league.name.includes('Conference League')) return 3;
  if (league.id === 39 || league.name === 'Premier League') return 4;
  if (league.id === 140 || league.name === 'La Liga') return 5;
  if (league.id === 135 || league.name === 'Serie A') return 6;
  if (league.id === 78 || league.name === 'Bundesliga') return 7;
  if (league.id === 61 || league.name === 'Ligue 1') return 8;
  if (league.id === 88 || league.name === 'Eredivisie') return 9;
  if (league.id === 94 || league.name === 'Primeira Liga') return 10;
  if (league.id === 203 || league.name === 'Super Lig') return 11;
  if (league.id === 144 || league.name === 'Jupiler Pro League') return 12;
  if (league.id === 179 || league.name.includes('Premiership')) return 13;
  if (league.id === 40 || league.name === 'Championship') return 14;
  if (
    league.name.includes('Segunda') ||
    league.name.includes('Serie B') ||
    league.name.includes('2. Bundesliga') ||
    league.name.includes('Ligue 2')
  ) {
    return 20;
  }
  if (league.id === 283 || league.name.includes('SuperLiga') || league.name.includes('Liga 1')) return 15;
  if (league.id === 253 || league.name.includes('MLS')) return 25;
  return 50;
}

export function sortFixturesByPriority(fixtures: Fixture[]): Fixture[] {
  return [...fixtures].sort((a, b) => {
    // 1. Live status first
    const isLiveA = ['1H', 'HT', '2H', 'ET', 'P', 'LIVE'].includes(a.status) ? 0 : 1;
    const isLiveB = ['1H', 'HT', '2H', 'ET', 'P', 'LIVE'].includes(b.status) ? 0 : 1;
    if (isLiveA !== isLiveB) return isLiveA - isLiveB;

    // 2. League priority
    const orderA = getLeagueSortOrder(a.league);
    const orderB = getLeagueSortOrder(b.league);
    if (orderA !== orderB) return orderA - orderB;

    // 3. Time
    return a.date.localeCompare(b.date);
  });
}

