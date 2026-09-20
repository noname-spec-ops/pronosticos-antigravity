import fs from 'fs';
import path from 'path';
import { HistoricalMatch } from '../types/football';
export type { HistoricalMatch, HistoricalMatch as IngestedMatch };

const LEAGUES: Array<{ code: string; name: string; country: string }> = [
  { code: 'E0', name: 'Premier League', country: 'England' },
  { code: 'E1', name: 'Championship', country: 'England' },
  { code: 'E2', name: 'League 1', country: 'England' },
  { code: 'E3', name: 'League 2', country: 'England' },
  { code: 'EC', name: 'National League', country: 'England' },
  { code: 'SP1', name: 'La Liga', country: 'Spain' },
  { code: 'SP2', name: 'La Liga 2', country: 'Spain' },
  { code: 'I1', name: 'Serie A', country: 'Italy' },
  { code: 'I2', name: 'Serie B', country: 'Italy' },
  { code: 'D1', name: 'Bundesliga', country: 'Germany' },
  { code: 'D2', name: '2. Bundesliga', country: 'Germany' },
  { code: 'F1', name: 'Ligue 1', country: 'France' },
  { code: 'F2', name: 'Ligue 2', country: 'France' },
  { code: 'N1', name: 'Eredivisie', country: 'Netherlands' },
  { code: 'P1', name: 'Primeira Liga', country: 'Portugal' },
  { code: 'B1', name: 'Jupiler Pro League', country: 'Belgium' },
  { code: 'T1', name: 'Super Lig', country: 'Turkey' },
  { code: 'G1', name: 'Super League', country: 'Greece' },
  { code: 'SC0', name: 'Premiership', country: 'Scotland' },
  { code: 'SC1', name: 'Championship', country: 'Scotland' },
  { code: 'SC2', name: 'League 1', country: 'Scotland' },
  { code: 'SC3', name: 'League 2', country: 'Scotland' }
];

const SEASONS: Array<{ code: string; label: string }> = [
  { code: '2122', label: '2021-22' },
  { code: '2223', label: '2022-23' },
  { code: '2324', label: '2023-24' },
  { code: '2425', label: '2024-25' },
  { code: '2526', label: '2025-26' },
  { code: '2627', label: '2026-27' }
];

function parseDate(rawDate: string): string | null {
  if (!rawDate) return null;
  const str = rawDate.trim();
  
  if (str.includes('/')) {
    const parts = str.split('/');
    if (parts.length === 3) {
      let day = parts[0].padStart(2, '0');
      let month = parts[1].padStart(2, '0');
      let year = parts[2];
      if (year.length === 2) {
        year = parseInt(year, 10) > 50 ? `19${year}` : `20${year}`;
      }
      return `${year}-${month}-${day}`;
    }
  }

  if (str.includes('-')) {
    const parts = str.split('-');
    if (parts.length === 3 && parts[0].length === 4) {
      return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    }
  }

  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split('T')[0];
  }

  return null;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

async function fetchWithRetry(url: string, retries = 3, delayMs = 1000): Promise<string> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      if (res.status === 200) {
        return await res.text();
      }
      if (res.status === 404) {
        throw new Error(`HTTP 404 Not Found at ${url}`);
      }
      lastError = new Error(`HTTP ${res.status} from ${url}`);
    } catch (err: any) {
      lastError = err;
    }
    if (attempt < retries) {
      await new Promise(r => setTimeout(r, delayMs * Math.pow(2, attempt - 1)));
    }
  }
  throw lastError || new Error(`Failed to fetch ${url} after ${retries} attempts`);
}

async function fetchLeagueSeasonCSV(leagueCode: string, seasonCode: string): Promise<string> {
  const directUrl = `https://www.football-data.co.uk/mmz4281/${seasonCode}/${leagueCode}.csv`;
  const mirrorUrl = `https://raw.githubusercontent.com/Char2mant/futbol-veri-aynasi/main/data/fd/${seasonCode}/${leagueCode}.csv`;

  try {
    return await fetchWithRetry(directUrl, 2, 500);
  } catch {
    try {
      return await fetchWithRetry(mirrorUrl, 2, 800);
    } catch (mirrorErr: any) {
      throw new Error(`CRITICAL INGEST ERROR: Failed both direct (${directUrl}) and mirror (${mirrorUrl}): ${mirrorErr.message}`);
    }
  }
}

function parseNumber(val: string | undefined): number | null {
  if (!val || val.trim() === '') return null;
  const num = parseFloat(val.trim());
  return isNaN(num) ? null : num;
}

function parseCSV(content: string, league: { code: string; name: string; country: string }, seasonLabel: string): HistoricalMatch[] {
  const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]).map(h => h.trim());
  const headerIdx: Record<string, number> = {};
  headers.forEach((h, idx) => {
    headerIdx[h] = idx;
  });

  const getVal = (row: string[], colName: string): string | undefined => {
    const idx = headerIdx[colName];
    return idx !== undefined ? row[idx] : undefined;
  };

  const matches: HistoricalMatch[] = [];

  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i]);
    const rawDate = getVal(row, 'Date');
    const homeTeam = getVal(row, 'HomeTeam')?.trim();
    const awayTeam = getVal(row, 'AwayTeam')?.trim();
    const fthg = parseNumber(getVal(row, 'FTHG'));
    const ftag = parseNumber(getVal(row, 'FTAG'));
    const ftr = getVal(row, 'FTR')?.trim();

    if (!rawDate || !homeTeam || !awayTeam) continue;
    if (fthg === null || ftag === null) continue;

    const parsedDate = parseDate(rawDate);
    if (!parsedDate) continue;

    const homeGoals = Math.round(fthg);
    const awayGoals = Math.round(ftag);

    let result: 'H' | 'D' | 'A';
    if (ftr === 'H' || ftr === 'D' || ftr === 'A') {
      result = ftr;
    } else {
      result = homeGoals > awayGoals ? 'H' : homeGoals === awayGoals ? 'D' : 'A';
    }

    const b365h = parseNumber(getVal(row, 'B365H'));
    const b365d = parseNumber(getVal(row, 'B365D'));
    const b365a = parseNumber(getVal(row, 'B365A'));

    const psh = parseNumber(getVal(row, 'PSH'));
    const psd = parseNumber(getVal(row, 'PSD'));
    const psa = parseNumber(getVal(row, 'PSA'));

    const avgh = parseNumber(getVal(row, 'AvgH'));
    const avgd = parseNumber(getVal(row, 'AvgD'));
    const avga = parseNumber(getVal(row, 'AvgA'));

    let odds1X2: HistoricalMatch['odds1X2'] = null;
    if (psh && psd && psa) {
      odds1X2 = { home: psh, draw: psd, away: psa };
    } else if (b365h && b365d && b365a) {
      odds1X2 = { home: b365h, draw: b365d, away: b365a };
    } else if (avgh && avgd && avga) {
      odds1X2 = { home: avgh, draw: avgd, away: avga };
    }

    const psch = parseNumber(getVal(row, 'PSCH'));
    const pscd = parseNumber(getVal(row, 'PSCD'));
    const psca = parseNumber(getVal(row, 'PSCA'));

    const b365ch = parseNumber(getVal(row, 'B365CH'));
    const b365cd = parseNumber(getVal(row, 'B365CD'));
    const b365ca = parseNumber(getVal(row, 'B365CA'));

    const avgch = parseNumber(getVal(row, 'AvgCH'));
    const avgcd = parseNumber(getVal(row, 'AvgCD'));
    const avgca = parseNumber(getVal(row, 'AvgCA'));

    let closingOdds1X2: HistoricalMatch['closingOdds1X2'] = null;
    if (psch && pscd && psca) {
      closingOdds1X2 = { home: psch, draw: pscd, away: psca };
    } else if (b365ch && b365cd && b365ca) {
      closingOdds1X2 = { home: b365ch, draw: b365cd, away: b365ca };
    } else if (avgch && avgcd && avgca) {
      closingOdds1X2 = { home: avgch, draw: avgcd, away: avgca };
    }

    const match: HistoricalMatch = {
      id: `${league.code}_${seasonLabel}_${parsedDate}_${homeTeam.replace(/\s+/g, '')}_${awayTeam.replace(/\s+/g, '')}`,
      leagueCode: league.code,
      leagueName: league.name,
      season: seasonLabel,
      date: parsedDate,
      homeTeam,
      awayTeam,
      homeGoals,
      awayGoals,
      halfTimeHomeGoals: parseNumber(getVal(row, 'HTHG')),
      halfTimeAwayGoals: parseNumber(getVal(row, 'HTAG')),
      result,
      referee: getVal(row, 'Referee')?.trim() || null,
      homeShots: parseNumber(getVal(row, 'HS')),
      awayShots: parseNumber(getVal(row, 'AS')),
      homeShotsOnTarget: parseNumber(getVal(row, 'HST')),
      awayShotsOnTarget: parseNumber(getVal(row, 'AST')),
      homeFouls: parseNumber(getVal(row, 'HF')),
      awayFouls: parseNumber(getVal(row, 'AF')),
      homeCorners: parseNumber(getVal(row, 'HC')),
      awayCorners: parseNumber(getVal(row, 'AC')),
      homeYellowCards: parseNumber(getVal(row, 'HY')),
      awayYellowCards: parseNumber(getVal(row, 'AY')),
      homeRedCards: parseNumber(getVal(row, 'HR')),
      awayRedCards: parseNumber(getVal(row, 'AR')),
      odds1X2,
      closingOdds1X2,
      oddsOver25: parseNumber(getVal(row, 'B365>2.5')) || parseNumber(getVal(row, 'Avg>2.5')),
      oddsUnder25: parseNumber(getVal(row, 'B365<2.5')) || parseNumber(getVal(row, 'Avg<2.5')),
      closingOddsOver25: parseNumber(getVal(row, 'B365C>2.5')) || parseNumber(getVal(row, 'AvgC>2.5')),
      closingOddsUnder25: parseNumber(getVal(row, 'B365C<2.5')) || parseNumber(getVal(row, 'AvgC<2.5'))
    };

    matches.push(match);
  }

  return matches;
}

async function runIngestion() {
  console.log('=== FLASHSTAT: EXPANDED 22-LEAGUE AUTHENTIC INGESTION ===\n');

  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const outputPath = path.join(dataDir, 'historical_matches.json');
  const allMatches: HistoricalMatch[] = [];

  for (const season of SEASONS) {
    console.log(`\n--- Fetching Season ${season.label} (${season.code}) ---`);
    for (const league of LEAGUES) {
      process.stdout.write(`  [${league.code}] ${league.name} ... `);
      try {
        const csvContent = await fetchLeagueSeasonCSV(league.code, season.code);
        const parsed = parseCSV(csvContent, league, season.label);
        allMatches.push(...parsed);
        console.log(`OK (${parsed.length} matches)`);
      } catch (err: any) {
        console.warn(`WARN: ${league.code} ${season.label}: ${err.message}`);
      }
    }
  }

  // Sort chronologically by date
  allMatches.sort((a, b) => a.date.localeCompare(b.date));

  fs.writeFileSync(outputPath, JSON.stringify(allMatches, null, 2), 'utf8');
  console.log(`\n✅ Ingested ${allMatches.length} authentic matches saved to ${outputPath}`);
}

runIngestion();
