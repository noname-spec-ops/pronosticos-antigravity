/**
 * FlashStat — Club ELO Ingestion & Benchmark Script
 * Fetches latest Club ELO ratings from http://api.clubelo.com
 * and benchmarks correlation against internal FlashStat ratings.
 */

import fs from 'fs';
import path from 'path';

export async function fetchClubEloData(): Promise<Record<string, number>> {
  console.log('[ClubELO] Fetching latest club ratings from http://api.clubelo.com/ ...');
  const result: Record<string, number> = {};

  try {
    const today = new Date().toISOString().split('T')[0];
    const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };
    const url = `http://api.clubelo.com/${today}`;
    let res = await fetch(url, { headers });
    if (!res.ok) {
      console.warn(`[ClubELO] API returned status ${res.status}. Trying historical snapshot...`);
      res = await fetch('http://api.clubelo.com/2024-05-01', { headers });
    }
    if (!res.ok) {
      console.warn('[ClubELO] Fallback request failed. Preserving local clubelo cache.');
      return result;
    }
    const text = await res.text();
    parseClubEloCsv(text, result);


    const count = Object.keys(result).length;
    if (count > 0) {
      const outPath = path.resolve(process.cwd(), 'data', 'clubelo_history.json');
      fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf8');
      console.log(`[ClubELO] Successfully saved ${count} club ELO ratings to data/clubelo_history.json`);
    }
  } catch (err: any) {
    console.error('[ClubELO] Network fetch error:', err.message);
  }

  return result;
}

function parseClubEloCsv(csvText: string, targetMap: Record<string, number>): void {
  const lines = csvText.split('\n');
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const parts = line.split(',');
    if (parts.length >= 5) {
      const clubName = parts[1]?.trim().toLowerCase();
      const elo = parseFloat(parts[4]?.trim());
      if (clubName && !isNaN(elo)) {
        targetMap[clubName] = Math.round(elo);
      }
    }
  }
}

fetchClubEloData();

