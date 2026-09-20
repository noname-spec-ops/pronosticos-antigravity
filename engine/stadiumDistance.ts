/**
 * FlashStat — Geographic Travel Distance & Stadium Locator Engine
 * Calculates Haversine distances between clubs and quantifies away travel fatigue.
 */

import fs from 'fs';
import path from 'path';

export interface StadiumInfo {
  team: string;
  city: string;
  stadium: string;
  lat: number;
  lon: number;
}

export type StadiumDatabase = Record<string, StadiumInfo>;

let cachedStadiums: StadiumDatabase | null = null;

export function getStadiumDatabase(): StadiumDatabase {
  if (cachedStadiums) return cachedStadiums;
  const filePath = path.resolve(process.cwd(), 'data', 'stadiums.json');
  if (fs.existsSync(filePath)) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '');
      cachedStadiums = JSON.parse(content);
      return cachedStadiums!;
    } catch {}
  }
  return {};
}

function normalizeTeamKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(fc|cf|sc|ac|as|ca|afc|ssc|rcd|ud|fotbal club|clubul sportiv)\b/gi, '')
    .replace(/[^\w\s]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

function findStadium(db: StadiumDatabase, teamName: string): StadiumInfo | undefined {
  const norm = normalizeTeamKey(teamName);
  if (db[norm]) return db[norm];

  // Specific alias mappings
  if (norm.includes('newcastle')) return db['newcastle'];
  if (norm.includes('tottenham')) return db['tottenham'];
  if (norm.includes('manchester city') || norm.includes('man city')) return db['manchester city'];
  if (norm.includes('manchester united') || norm.includes('man utd') || norm.includes('man united')) return db['manchester united'];
  if (norm.includes('paris') || norm.includes('psg')) return db['paris saint germain'];
  if (norm.includes('leverkusen')) return db['bayer leverkusen'];
  if (norm.includes('dortmund')) return db['borussia dortmund'];
  if (norm.includes('bayern')) return db['bayern munich'];
  if (norm.includes('atletico')) return db['atletico madrid'];
  if (norm.includes('real madrid')) return db['real madrid'];

  // Check prefix or partial matches
  for (const [key, value] of Object.entries(db)) {
    if (norm === key || norm.startsWith(key) || key.startsWith(norm)) {
      return value;
    }
  }

  return undefined;
}

/**
 * Calculates Haversine distance in kilometers between two GPS coordinates.
 */
export function calculateHaversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(1));
}

/**
 * Resolves the distance in km between a home and away team.
 */
export function getMatchTravelDistanceKm(
  homeTeamName: string,
  awayTeamName: string
): { distanceKm: number; isCrossCountry: boolean; isInternational: boolean; travelFatigueFactor: number } {
  const db = getStadiumDatabase();
  const home = findStadium(db, homeTeamName);
  const away = findStadium(db, awayTeamName);

  if (!home || !away) {
    return {
      distanceKm: 0,
      isCrossCountry: false,
      isInternational: false,
      travelFatigueFactor: 1.0,
    };
  }

  const distanceKm = calculateHaversineDistanceKm(home.lat, home.lon, away.lat, away.lon);
  const isCrossCountry = distanceKm > 600;
  const isInternational = distanceKm > 1200;

  // Away team offensive/defensive modifier based on long travel
  let travelFatigueFactor = 1.0;
  if (distanceKm > 1500) {
    travelFatigueFactor = 0.94; // Severe transcontinental travel
  } else if (distanceKm > 800) {
    travelFatigueFactor = 0.97; // Significant domestic travel
  } else if (distanceKm > 350) {
    travelFatigueFactor = 0.985; // Moderate domestic travel (e.g. London to Newcastle)
  }

  return {
    distanceKm,
    isCrossCountry,
    isInternational,
    travelFatigueFactor,
  };
}
