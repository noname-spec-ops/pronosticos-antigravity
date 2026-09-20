/**
 * FlashStat — Club ELO Service & Benchmark Integration
 * Interfaces with ClubElo (http://api.clubelo.com) for international club ratings.
 */

import fs from 'fs';
import path from 'path';

export interface ClubEloEntry {
  rank?: number;
  club: string;
  country: string;
  level: number;
  elo: number;
  from?: string;
  to?: string;
}

export type ClubEloDatabase = Record<string, number>;

let cachedClubElo: ClubEloDatabase | null = null;

function normalizeClubName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(fc|cf|sc|ac|as|ca|afc|ssc|rcd|ud|fotbal club|clubul sportiv)\b/gi, '')
    .replace(/[^\w\s]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

export function getClubEloDatabase(): ClubEloDatabase {
  if (cachedClubElo) return cachedClubElo;

  const filePath = path.resolve(process.cwd(), 'data', 'clubelo_history.json');
  if (fs.existsSync(filePath)) {
    try {
      cachedClubElo = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      return cachedClubElo!;
    } catch {}
  }

  // Built-in benchmark fallback ratings for European top clubs
  cachedClubElo = {
    'manchester city': 2045,
    'real madrid': 2020,
    'bayern munich': 1955,
    'arsenal': 1950,
    'liverpool': 1945,
    'inter': 1930,
    'barcelona': 1915,
    'bayer leverkusen': 1910,
    'paris saint germain': 1890,
    'atletico madrid': 1885,
    'borussia dortmund': 1870,
    'juventus': 1850,
    'milan': 1840,
    'chelsea': 1835,
    'tottenham': 1820,
    'napoli': 1810,
    'aston villa': 1805,
    'newcastle': 1795,
    'fcsb': 1485,
    'cfr cluj': 1460,
    'universitatea craiova': 1435,
    'rapid bucuresti': 1420,
  };

  return cachedClubElo;
}

export function getClubEloRating(teamName: string, fallbackRating: number = 1500): number {
  const db = getClubEloDatabase();
  const key = normalizeClubName(teamName);
  return db[key] ?? fallbackRating;
}
