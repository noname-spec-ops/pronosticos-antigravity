/**
 * FlashStat — Extra-league & European competition ingestion
 * (scripts/ingestExtraLeagues.ts)
 *
 * The main football-data.co.uk series (mmz4281) covers 22 Western European
 * divisions and nothing else. That left several competitions the app displays
 * every day with no historical data at all — most visibly Romania's SuperLiga,
 * which the README advertises, and the UEFA club competitions. Teams in those
 * competitions fell back to a generic 1500-ELO profile.
 *
 * Two additional sources are pulled here:
 *
 *  1. football-data.co.uk "extra" series (https://www.football-data.co.uk/new/<CC>.csv)
 *     One file per country, all seasons, 25 columns. Results plus CLOSING odds
 *     only — no shots, corners, cards, referee, and no opening line.
 *
 *  2. football-data.org v4 for the UEFA Champions League, which is included on
 *     the free tier (FOOTBALL_DATA_KEY). Results only, no odds.
 *
 * Records are emitted in the same HistoricalMatch shape as the main ingestion
 * and merged into data/historical_matches.json. Fields these sources do not
 * provide stay null rather than being filled with plausible-looking values.
 */

import fs from 'fs';
import path from 'path';
import type { HistoricalMatch } from '../types/football';
import { matchTeamName, MIN_RELIABLE_MATCH_CONFIDENCE } from '../lib/teamMapping';

/** Seasons to keep, matching the main ingestion window. */
const SEASON_LABELS = ['2021-22', '2022-23', '2023-24', '2024-25', '2025-26', '2026-27'];

interface ExtraLeagueSpec {
  /** football-data.co.uk country file, e.g. ROU -> /new/ROU.csv */
  countryFile: string;
  /** Value of the CSV "League" column to keep (files can hold several divisions). */
  csvLeagueName: string;
  /** Our internal league code, matching LEAGUE_ID_TO_CODE in the API routes. */
  code: string;
  name: string;
  country: string;
}

const EXTRA_LEAGUES: ExtraLeagueSpec[] = [
  { countryFile: 'ROU', csvLeagueName: 'Superliga', code: 'RO1', name: 'SuperLiga', country: 'Romania' },
  { countryFile: 'POL', csvLeagueName: 'Ekstraklasa', code: 'PL1', name: 'Ekstraklasa', country: 'Poland' },
  { countryFile: 'AUT', csvLeagueName: 'Bundesliga', code: 'AUT1', name: 'Bundesliga', country: 'Austria' },
  { countryFile: 'SWZ', csvLeagueName: 'Super League', code: 'SUI1', name: 'Super League', country: 'Switzerland' },
  { countryFile: 'DNK', csvLeagueName: 'Superliga', code: 'DEN1', name: 'Superliga', country: 'Denmark' },
  { countryFile: 'SWE', csvLeagueName: 'Allsvenskan', code: 'SWE1', name: 'Allsvenskan', country: 'Sweden' },
  { countryFile: 'NOR', csvLeagueName: 'Eliteserien', code: 'NOR1', name: 'Eliteserien', country: 'Norway' },
  { countryFile: 'IRL', csvLeagueName: 'Premier Division', code: 'IRL1', name: 'Premier Division', country: 'Ireland' },
  { countryFile: 'FIN', csvLeagueName: 'Veikkausliiga', code: 'FIN1', name: 'Veikkausliiga', country: 'Finland' },
  { countryFile: 'JPN', csvLeagueName: 'J1 League', code: 'JPN1', name: 'J1 League', country: 'Japan' },
  { countryFile: 'MEX', csvLeagueName: 'Liga MX', code: 'MEX1', name: 'Liga MX', country: 'Mexico' },
  { countryFile: 'BRA', csvLeagueName: 'Serie A', code: 'BRA1', name: 'Serie A', country: 'Brazil' },
  { countryFile: 'ARG', csvLeagueName: 'Liga Profesional', code: 'ARG1', name: 'Liga Profesional', country: 'Argentina' },
  { countryFile: 'USA', csvLeagueName: 'MLS', code: 'USA', name: 'MLS', country: 'USA' },
];

/** Splits a CSV line, honouring quoted fields. */
function parseCSVLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

/** "14/09/2026" -> "2026-09-14". Returns null for anything unparseable. */
function parseDate(raw: string): string | null {
  const s = (raw || '').trim();
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s);
  if (!m) return null;
  const day = m[1].padStart(2, '0');
  const month = m[2].padStart(2, '0');
  let year = m[3];
  if (year.length === 2) year = parseInt(year, 10) > 50 ? `19${year}` : `20${year}`;
  const iso = `${year}-${month}-${day}`;
  return Number.isNaN(new Date(iso).getTime()) ? null : iso;
}

/**
 * Normalises a season label to the main ingestion's "YYYY-YY" form.
 *
 * Two shapes occur in this series:
 *   - "2026/2027" for autumn-to-spring competitions;
 *   - "2026"      for calendar-year ones (Scandinavia, Ireland, Brazil,
 *                 Argentina, MLS, Japan until recently), which run spring to
 *                 autumn inside a single year.
 * A calendar-year season maps to the label of the campaign it belongs to, so
 * Allsvenskan 2026 becomes "2026-27" — it is played in the same window as the
 * first half of a 2026/2027 European season.
 */
function normalizeSeason(raw: string): string | null {
  const t = (raw || '').trim();

  const split = /^(\d{4})\/(\d{4})$/.exec(t);
  if (split) return `${split[1]}-${split[2].slice(2)}`;

  const single = /^(\d{4})$/.exec(t);
  if (single) {
    const y = parseInt(single[1], 10);
    return `${y}-${String(y + 1).slice(2)}`;
  }

  return null;
}

/**
 * Rejects implied books outside the range a real bookmaker can post.
 * Below 1.0 is a standing arbitrage; above 1.5 is a 50% margin.
 */
function isPlausibleBook(o: { home: number; draw: number; away: number }): boolean {
  if (!(o.home > 1) || !(o.draw > 1) || !(o.away > 1)) return false;
  const overround = 1 / o.home + 1 / o.draw + 1 / o.away;
  return overround >= 1.0 && overround <= 1.5;
}

function toNumber(v: string | undefined): number | null {
  if (v === undefined) return null;
  const t = v.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

async function fetchText(url: string, timeoutMs = 30000): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      console.warn(`    HTTP ${res.status} for ${url}`);
      return null;
    }
    return await res.text();
  } catch (err: any) {
    console.warn(`    fetch failed for ${url}: ${err.message}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Parses one country file into HistoricalMatch records for a single division. */
function parseExtraLeagueCsv(csv: string, spec: ExtraLeagueSpec): HistoricalMatch[] {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]).map((h) => h.trim());
  const idx: Record<string, number> = {};
  headers.forEach((h, i) => {
    idx[h] = i;
  });

  const col = (row: string[], name: string): string | undefined => {
    const i = idx[name];
    return i === undefined ? undefined : row[i];
  };

  const out: HistoricalMatch[] = [];

  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i]);
    if (row.length < 10) continue;

    if ((col(row, 'League') || '').trim() !== spec.csvLeagueName) continue;

    const season = normalizeSeason(col(row, 'Season') || '');
    if (!season || !SEASON_LABELS.includes(season)) continue;

    const date = parseDate(col(row, 'Date') || '');
    const home = (col(row, 'Home') || '').trim();
    const away = (col(row, 'Away') || '').trim();
    const hg = toNumber(col(row, 'HG'));
    const ag = toNumber(col(row, 'AG'));
    const res = (col(row, 'Res') || '').trim().toUpperCase();

    // Unplayed or malformed rows are skipped entirely — never defaulted to 0-0.
    if (!date || !home || !away || hg === null || ag === null) continue;
    if (res !== 'H' && res !== 'D' && res !== 'A') continue;

    // This series carries CLOSING prices only, and no opening line, so
    // closingOdds1X2 stays null and the backtest will not compute a
    // (meaningless) open-to-close CLV for these competitions.
    //
    // AvgC* (market consensus) is used rather than MaxC* (best price across all
    // books). MaxC* is a synthetic line whose overround is below 1.0, so betting
    // into it would make these leagues look profitable purely because of better
    // pricing than the single-bookmaker quotes used everywhere else in the
    // dataset. A homogeneous, harder benchmark is the point of a backtest.
    const avgH = toNumber(col(row, 'AvgCH'));
    const avgD = toNumber(col(row, 'AvgCD'));
    const avgA = toNumber(col(row, 'AvgCA'));
    const b365H = toNumber(col(row, 'B365CH'));
    const b365D = toNumber(col(row, 'B365CD'));
    const b365A = toNumber(col(row, 'B365CA'));

    const candidatePrice =
      avgH && avgD && avgA
        ? { home: avgH, draw: avgD, away: avgA }
        : b365H && b365D && b365A
          ? { home: b365H, draw: b365D, away: b365A }
          : null;

    // A handful of source rows are corrupt (column shifts, partial records) and
    // imply an overround well below 1.0 — an impossible book that the value
    // engine would read as a huge arbitrage. Keep the RESULT, drop the price.
    const price = candidatePrice && isPlausibleBook(candidatePrice) ? candidatePrice : null;

    out.push({
      id: `${spec.code}_${season}_${date}_${home.replace(/\s+/g, '')}_${away.replace(/\s+/g, '')}`,
      leagueCode: spec.code,
      leagueName: spec.name,
      season,
      date,
      homeTeam: home,
      awayTeam: away,
      homeGoals: hg,
      awayGoals: ag,
      halfTimeHomeGoals: null,
      halfTimeAwayGoals: null,
      result: res as 'H' | 'D' | 'A',
      referee: null,
      homeShots: null,
      awayShots: null,
      homeShotsOnTarget: null,
      awayShotsOnTarget: null,
      homeFouls: null,
      awayFouls: null,
      homeCorners: null,
      awayCorners: null,
      homeYellowCards: null,
      awayYellowCards: null,
      homeRedCards: null,
      awayRedCards: null,
      odds1X2: price,
      closingOdds1X2: null,
    } as HistoricalMatch);
  }

  return out;
}

/** Reads FOOTBALL_DATA_KEY from .env.local / .env without extra dependencies. */
function loadFootballDataKey(): string | undefined {
  for (const file of ['.env.local', '.env']) {
    const p = path.resolve(process.cwd(), file);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf-8').split(/\r?\n/)) {
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      if (line.slice(0, eq).trim() === 'FOOTBALL_DATA_KEY') {
        const v = line.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
        if (v) return v;
      }
    }
  }
  return undefined;
}

/**
 * UEFA Champions League from football-data.org. Free-tier history starts at the
 * 2023-24 season; earlier seasons return 403 and are skipped rather than faked.
 * No odds are available from this source, so odds1X2 stays null and these
 * matches contribute to team strength, ELO and H2H but never to backtest ROI.
 */
async function fetchChampionsLeague(): Promise<HistoricalMatch[]> {
  const key = loadFootballDataKey();
  if (!key) {
    console.warn('  [UCL] FOOTBALL_DATA_KEY not set — skipping Champions League.');
    return [];
  }

  const out: HistoricalMatch[] = [];
  const seasonYears = [2021, 2022, 2023, 2024, 2025, 2026];

  for (const year of seasonYears) {
    const url = `https://api.football-data.org/v4/competitions/CL/matches?season=${year}`;
    let json: any = null;
    try {
      const res = await fetch(url, { headers: { 'X-Auth-Token': key } });
      if (res.status === 403) {
        console.log(`  [UCL] season ${year} ... not on this plan (403), skipped`);
        await new Promise((r) => setTimeout(r, 6500));
        continue;
      }
      if (!res.ok) {
        console.warn(`  [UCL] season ${year} ... HTTP ${res.status}`);
        await new Promise((r) => setTimeout(r, 6500));
        continue;
      }
      json = await res.json();
    } catch (err: any) {
      console.warn(`  [UCL] season ${year} ... ${err.message}`);
      await new Promise((r) => setTimeout(r, 6500));
      continue;
    }

    let kept = 0;
    for (const m of json.matches ?? []) {
      if (m.status !== 'FINISHED') continue;
      const hg = m.score?.fullTime?.home;
      const ag = m.score?.fullTime?.away;
      const home = m.homeTeam?.name;
      const away = m.awayTeam?.name;
      if (typeof hg !== 'number' || typeof ag !== 'number' || !home || !away) continue;

      const date = String(m.utcDate).slice(0, 10);
      const season = `${year}-${String(year + 1).slice(2)}`;
      if (!SEASON_LABELS.includes(season)) continue;

      out.push({
        id: `UCL_${season}_${date}_${home.replace(/\s+/g, '')}_${away.replace(/\s+/g, '')}`,
        leagueCode: 'UCL',
        leagueName: 'UEFA Champions League',
        season,
        date,
        homeTeam: home,
        awayTeam: away,
        homeGoals: hg,
        awayGoals: ag,
        halfTimeHomeGoals: m.score?.halfTime?.home ?? null,
        halfTimeAwayGoals: m.score?.halfTime?.away ?? null,
        result: hg > ag ? 'H' : hg === ag ? 'D' : 'A',
        referee: m.referees?.[0]?.name ?? null,
        homeShots: null,
        awayShots: null,
        homeShotsOnTarget: null,
        awayShotsOnTarget: null,
        homeFouls: null,
        awayFouls: null,
        homeCorners: null,
        awayCorners: null,
        homeYellowCards: null,
        awayYellowCards: null,
        homeRedCards: null,
        awayRedCards: null,
        odds1X2: null,
        closingOdds1X2: null,
      } as HistoricalMatch);
      kept++;
    }
    console.log(`  [UCL] season ${year} ... OK (${kept} finished matches)`);
    // football-data.org free tier allows 10 requests/minute.
    await new Promise((r) => setTimeout(r, 6500));
  }

  return out;
}

/**
 * Domestic and European records are returned separately because they must be
 * canonicalised in order: the European ones need to see the domestic spellings
 * ingested in the same run (see main()).
 */
export async function ingestExtraLeagues(): Promise<{
  domestic: HistoricalMatch[];
  european: HistoricalMatch[];
}> {
  const domestic: HistoricalMatch[] = [];

  console.log('--- football-data.co.uk extra series ---');
  for (const spec of EXTRA_LEAGUES) {
    const csv = await fetchText(`https://www.football-data.co.uk/new/${spec.countryFile}.csv`);
    if (!csv) {
      console.log(`  [${spec.code}] ${spec.name} ... FAILED`);
      continue;
    }
    const rows = parseExtraLeagueCsv(csv, spec);
    domestic.push(...rows);
    console.log(`  [${spec.code}] ${spec.name} (${spec.country}) ... OK (${rows.length} matches)`);
  }

  console.log('\n--- UEFA Champions League (football-data.org) ---');
  const european = await fetchChampionsLeague();

  return { domestic, european };
}

/**
 * Rewrites team names in freshly ingested records onto the spelling already used
 * by the existing dataset.
 *
 * Without this, one club ends up with several identities: football-data.org
 * writes "Manchester City FC" and "FC Bayern München" while football-data.co.uk
 * writes "Man City" and "Bayern Munich", so the same club accumulates two
 * separate ELO tracks and two separate strength profiles, each built from half
 * the evidence. 70 of the 71 Champions League clubs were affected.
 *
 * Only high-confidence matches are rewritten; a genuinely new club keeps its own
 * name and becomes a new identity.
 */
function canonicaliseTeamNames(fresh: HistoricalMatch[], knownNames: string[]): number {
  const resolution = new Map<string, string | null>();

  const resolve = (name: string): string => {
    if (!resolution.has(name)) {
      const m = matchTeamName(name, knownNames);
      resolution.set(name, m && m.confidence >= MIN_RELIABLE_MATCH_CONFIDENCE ? m.matchedName : null);
    }
    return resolution.get(name) ?? name;
  };

  let rewritten = 0;
  for (const match of fresh) {
    const home = resolve(match.homeTeam);
    const away = resolve(match.awayTeam);
    if (home !== match.homeTeam) rewritten++;
    if (away !== match.awayTeam) rewritten++;
    match.homeTeam = home;
    match.awayTeam = away;
  }
  return rewritten;
}

/** Merges the extra competitions into data/historical_matches.json. */
async function main() {
  console.log('=== FLASHSTAT: EXTRA LEAGUES & EUROPEAN COMPETITIONS ===\n');

  const dataPath = path.resolve(process.cwd(), 'data', 'historical_matches.json');
  if (!fs.existsSync(dataPath)) {
    console.error('data/historical_matches.json not found. Run "npm run ingest" first.');
    process.exit(1);
  }

  const existing: HistoricalMatch[] = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  const extraCodes = new Set([...EXTRA_LEAGUES.map((l) => l.code), 'UCL']);

  // Drop any previous run's records for these competitions so re-running is
  // idempotent rather than duplicating.
  const base = existing.filter((m) => !extraCodes.has(m.leagueCode));
  const { domestic, european } = await ingestExtraLeagues();
  const fresh = [...domestic, ...european];

  if (fresh.length === 0) {
    console.error('\nNo extra-league matches ingested — leaving the dataset untouched.');
    process.exit(1);
  }

  // One club, one identity: fold provider-specific spellings onto the names the
  // rest of the dataset already uses.
  //
  // Order matters. The domestic extra leagues are canonicalised against the main
  // series first, then the European records against main + extras — otherwise a
  // Champions League entry for, say, Young Boys cannot find the Swiss Super
  // League spelling that was ingested moments earlier in the same run.
  const mainNames = [...new Set(base.flatMap((m) => [m.homeTeam, m.awayTeam]))];
  const rewrittenDomestic = canonicaliseTeamNames(domestic, mainNames);

  const namesWithDomestic = [...new Set([...mainNames, ...domestic.flatMap((m) => [m.homeTeam, m.awayTeam])])];
  const rewrittenEuropean = canonicaliseTeamNames(european, namesWithDomestic);

  console.log(
    `
  canonicalised ${rewrittenDomestic + rewrittenEuropean} team-name occurrences ` +
      `(${rewrittenDomestic} domestic, ${rewrittenEuropean} European) onto existing spellings`
  );

  const merged = [...base, ...fresh].sort((a, b) => a.date.localeCompare(b.date));
  fs.writeFileSync(dataPath, JSON.stringify(merged, null, 2), 'utf-8');

  const byCode: Record<string, number> = {};
  fresh.forEach((m) => {
    byCode[m.leagueCode] = (byCode[m.leagueCode] || 0) + 1;
  });

  console.log('\n--- SUMMARY ---');
  console.log(`  base (main series):   ${base.length}`);
  console.log(`  extra competitions:   ${fresh.length}`);
  Object.entries(byCode)
    .sort((a, b) => b[1] - a[1])
    .forEach(([code, n]) => console.log(`      ${code.padEnd(6)} ${n}`));
  console.log(`  total written:        ${merged.length}`);
  console.log(`\nSaved to ${dataPath}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Ingestion failed:', err);
    process.exit(1);
  });
}
