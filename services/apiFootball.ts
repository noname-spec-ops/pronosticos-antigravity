/**
 * FlashStat — API-Football v3 Client (services/apiFootball.ts)
 * 
 * Features:
 * - Live score feeds with SWR caching.
 * - Authentic Referee Severity calculation from historical matches (via refereeStore).
 * - Real Head-to-Head (H2H) extraction from authentic 24,000+ matches dataset and live API.
 * - Match Events (/fixtures/events) and Standings (/standings) support.
 * - Clean player lineups without fabricated statistics.
 */

import fs from 'fs';
import path from 'path';
import defaultMatchesData from '../fixtures/matches.json';
import dailyScheduleData from '../data/daily_schedule.json';
import { apiFootballRateLimiter } from '../lib/rateLimiter';
import { serverCache } from '../lib/cache';
import { refereeStore } from '../lib/refereeStore';
import { MODEL_CONFIG } from '../engine/config';
import { matchTeamName, normalizeTeamName, teamNameSimilarity, canonicalClubKey, resolvedClubKey } from '../lib/teamMapping';
import { strengthStore } from '../lib/strengthStore';
import { fetchWithTimeout } from '../lib/fetchWithTimeout';
import { todayLocalISO, shiftLocalISO } from '../lib/localDate';
import type { Fixture, H2HMatch, Lineup, MatchStats, PlayerStats, HistoricalMatch } from '../types/football';

const API_FOOTBALL_BASE_URL = 'https://v3.football.api-sports.io';

const REGEX_DIGITS = /^[0-9]+$/;
const REGEX_ET = /\bET\b/i;
const REGEX_PEN = /\bPEN\b|shootout/i;

/** A fixture plus the tier it came from (1 = richest source). */
type SourcedFixture = Fixture & { providerPriority?: number };

const LIVE_STATUSES = ['1H', 'HT', '2H', 'ET', 'P', 'LIVE'];

/**
 * Canonical identity for a football match: calendar day + both team names,
 * orientation-independent.
 *
 * Keying on the numeric `id` (as before) is wrong because each provider has its
 * own id space: the same match arrives under four different ids and is listed
 * four times, while unrelated matches whose ids happen to collide overwrite
 * each other.
 */
function fixtureKey(f: Fixture): string {
  const day = String(f.date).slice(0, 10);
  // canonicalClubKey (not normalizeTeamName) — the latter collapses
  // "Manchester City" and "Manchester United" to the same string.
  const teams = [canonicalClubKey(f.homeTeam.name), canonicalClubKey(f.awayTeam.name)].sort();
  return `${day}|${teams[0]}|${teams[1]}`;
}

/** How much usable detail a fixture carries, used to break provider ties. */
function fixtureRichness(f: Fixture): number {
  let score = 0;
  if (LIVE_STATUSES.includes(f.status)) score += 4;
  if (f.status === 'FT') score += 2;
  if (f.score?.current?.home !== null && f.score?.current?.home !== undefined) score += 2;
  if (f.elapsedMinute !== undefined && f.elapsedMinute !== null) score += 1;
  if (f.referee) score += 1;
  if (f.odds) score += 1;
  return score;
}

/**
 * Collapses multi-provider results to one fixture per real match and drops
 * anything that is not actually on the requested day. Providers report in their
 * own timezone (ESPN's scoreboard is US-centric), which previously leaked
 * next-day kickoffs into today's slate and duplicated them again tomorrow.
 */
export function dedupeFixtures(fixtures: SourcedFixture[], dateStr: string): Fixture[] {
  /** Keeps whichever of two entries for the same match carries more usable data. */
  const preferred = (a: SourcedFixture, b: SourcedFixture): SourcedFixture => {
    const pa = a.providerPriority ?? 99;
    const pb = b.providerPriority ?? 99;
    if (pa !== pb) return pa < pb ? a : b;
    return fixtureRichness(a) >= fixtureRichness(b) ? a : b;
  };

  // Pass 1: exact canonical key (day + normalised team names).
  const byKey = new Map<string, SourcedFixture>();
  for (const f of fixtures) {
    if (!f.homeTeam?.name || !f.awayTeam?.name) continue;
    if (f.homeTeam.name === 'Home' || f.awayTeam.name === 'Away') continue;
    const dStr = String(f.date);
    const isUtcMatch = dStr.startsWith(dateStr);
    let isLocalMatch = false;
    try {
      const parsed = new Date(f.date);
      if (!isNaN(parsed.getTime())) {
        const localDay = parsed.toLocaleDateString('en-CA');
        const utcDay = parsed.toISOString().slice(0, 10);
        isLocalMatch = (localDay === dateStr || utcDay === dateStr);
      }
    } catch {}

    if (!isUtcMatch && !isLocalMatch) continue;

    const key = fixtureKey(f);
    const existing = byKey.get(key);
    byKey.set(key, existing ? preferred(f, existing) : f);
  }

  // Pass 2: near-duplicates that exact keying cannot collapse, e.g.
  // "FC Bayern München" (OpenLigaDB) vs "Bayern Munich" (ESPN). Merging requires a
  // kickoff within 20 minutes AND high similarity on BOTH team names. League id is
  // deliberately not part of the test: each provider uses its own league id space,
  // so requiring equality there would leave cross-provider duplicates in place.
  // Deliberately strict. Genuine transliterations are folded exactly by
  // canonicalClubKey in pass 1, so pass 2 only needs to absorb punctuation and
  // spacing noise. A loose threshold here would merge distinct clubs:
  // "Manchester City" vs "Manchester United" scores 0.75.
  const SIMILARITY_THRESHOLD = 0.9;
  const KICKOFF_TOLERANCE_MS = 20 * 60 * 1000;
  const merged: SourcedFixture[] = [];

  for (const candidate of byKey.values()) {
    const cTime = new Date(candidate.date).getTime();
    const twinIndex = merged.findIndex((m) => {
      const mTime = new Date(m.date).getTime();
      if (!isFinite(mTime) || !isFinite(cTime)) return false;
      if (Math.abs(mTime - cTime) > KICKOFF_TOLERANCE_MS) return false;
      const homeSim = teamNameSimilarity(m.homeTeam.name, candidate.homeTeam.name);
      const awaySim = teamNameSimilarity(m.awayTeam.name, candidate.awayTeam.name);
      return homeSim >= SIMILARITY_THRESHOLD && awaySim >= SIMILARITY_THRESHOLD;
    });

    if (twinIndex === -1) merged.push(candidate);
    else merged[twinIndex] = preferred(candidate, merged[twinIndex]);
  }

  return merged.map(({ providerPriority: _drop, ...rest }) => rest as Fixture);
}

export class ApiFootballService {
  private apiKey: string | undefined;
  private footballDataKey: string | undefined;
  private historicalMatchesCache: HistoricalMatch[] | null = null;

  constructor() {
    this.apiKey = process.env.API_FOOTBALL_KEY || '88970cfc3554ea6629b7041c643d1da3';
    this.footballDataKey = process.env.FOOTBALL_DATA_KEY || '4b7b08b4db0b4b288281476ce3bfdaf6';
  }

  /**
   * Demo mode is active only when no keyed provider is configured.
   * Keyless providers (ESPN, TheSportsDB, OpenLigaDB) can still return authentic
   * fixtures, so this flag alone does not decide whether sample data is served —
   * see getFixturesByDate, which falls back to the bundled sample slate only when
   * every provider returned nothing.
   */
  public isDemoMode(): boolean {
    const hasApiFootball = !!this.apiKey && !this.apiKey.includes('your_api_football_key');
    const hasFootballData = !!this.footballDataKey && this.footballDataKey.trim() !== '';
    return !hasApiFootball && !hasFootballData;
  }

  private h2hIndex: Map<string, HistoricalMatch[]> | null = null;

  /** Unordered-pair index over the whole history, built lazily once per process. */
  private getH2HIndex(): Map<string, HistoricalMatch[]> {
    if (this.h2hIndex) return this.h2hIndex;

    const index = new Map<string, HistoricalMatch[]>();
    for (const m of this.getHistoricalMatches()) {
      const key = [resolvedClubKey(m.homeTeam), resolvedClubKey(m.awayTeam)].sort().join('|');
      const bucket = index.get(key);
      if (bucket) bucket.push(m);
      else index.set(key, [m]);
    }
    this.h2hIndex = index;
    console.info(`[ApiFootballService] H2H index built: ${index.size} distinct fixtures pairings.`);
    return index;
  }

  private getHistoricalMatches(): HistoricalMatch[] {
    if (this.historicalMatchesCache) return this.historicalMatchesCache;
    const dataPath = path.resolve(process.cwd(), 'data', 'historical_matches.json');
    if (fs.existsSync(dataPath)) {
      this.historicalMatchesCache = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
      return this.historicalMatchesCache!;
    }
    return [];
  }

  private getMockFixtures(targetDate?: string): Fixture[] {
    try {
      const list: Fixture[] = (defaultMatchesData as any) || [];
      return list.map(f => {
        let updatedDate = f.date;
        let updatedTimestamp = f.timestamp;
        if (targetDate) {
          const originalTime = f.date && f.date.includes('T') ? f.date.split('T')[1] : '18:45:00.000Z';
          updatedDate = `${targetDate}T${originalTime}`;
          try {
            const parsed = new Date(updatedDate).getTime();
            if (!isNaN(parsed)) {
              updatedTimestamp = Math.floor(parsed / 1000);
            }
          } catch {}
        }
        return {
          ...f,
          date: updatedDate,
          timestamp: updatedTimestamp,
          h2h: f.h2h && f.h2h.length > 0 ? f.h2h : this.findHistoricalH2H(f.homeTeam.name, f.awayTeam.name),
        };
      });
    } catch (err) {
      console.error('[ApiFootballService] Failed to load mock fixtures:', err);
    }
    return [];
  }

  /**
   * Fetches authentic real-time fixtures from ESPN public soccer scoreboards (No key needed).
   */
  async getEspnFixtures(dateStr: string): Promise<Fixture[]> {
    const yyyymmdd = dateStr.replace(/-/g, '');
    const ESPN_LEAGUES = [
      { code: 'eng.1', id: 39, name: 'Premier League', country: 'Anglia', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
      { code: 'eng.2', id: 40, name: 'Championship', country: 'Anglia', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
      { code: 'esp.1', id: 140, name: 'La Liga', country: 'Spania', flag: '🇪🇸' },
      { code: 'esp.2', id: 141, name: 'Segunda División', country: 'Spania', flag: '🇪🇸' },
      { code: 'ita.1', id: 135, name: 'Serie A', country: 'Italia', flag: '🇮🇹' },
      { code: 'ger.1', id: 78, name: 'Bundesliga', country: 'Germania', flag: '🇩🇪' },
      { code: 'ger.2', id: 79, name: '2. Bundesliga', country: 'Germania', flag: '🇩🇪' },
      { code: 'fra.1', id: 61, name: 'Ligue 1', country: 'Franța', flag: '🇫🇷' },
      { code: 'rou.1', id: 283, name: 'SuperLiga', country: 'România', flag: '🇷🇴' },
      { code: 'ned.1', id: 88, name: 'Eredivisie', country: 'Olanda', flag: '🇳🇱' },
      { code: 'por.1', id: 94, name: 'Primeira Liga', country: 'Portugalia', flag: '🇵🇹' },
      { code: 'tur.1', id: 203, name: 'Süper Lig', country: 'Turcia', flag: '🇹🇷' },
      { code: 'bel.1', id: 144, name: 'Jupiler Pro League', country: 'Belgia', flag: '🇧🇪' },
      { code: 'sco.1', id: 179, name: 'Scottish Premiership', country: 'Scoția', flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿' },
      { code: 'uefa.champions', id: 2, name: 'UEFA Champions League', country: 'Europa', flag: '🏆' },
      { code: 'uefa.europa', id: 3, name: 'UEFA Europa League', country: 'Europa', flag: '🥈' },
      { code: 'uefa.europa.conf', id: 848, name: 'UEFA Conference League', country: 'Europa', flag: '🥉' },
      { code: 'usa.1', id: 253, name: 'MLS', country: 'SUA', flag: '🇺🇸' },
      { code: 'conmebol.libertadores', id: 13, name: 'Copa Libertadores', country: 'America de Sud', flag: '🌎' },
      { code: 'conmebol.sudamericana', id: 11, name: 'Copa Sudamericana', country: 'America de Sud', flag: '🌎' },
      // Extended coverage: the previous 20-league list silently excluded most of
      // world football, which is why the daily slate looked so thin.
      { code: 'ita.2', id: 136, name: 'Serie B', country: 'Italia', flag: '🇮🇹' },
      { code: 'fra.2', id: 62, name: 'Ligue 2', country: 'Franta', flag: '🇫🇷' },
      { code: 'eng.3', id: 41, name: 'League One', country: 'Anglia', flag: '🏴' },
      { code: 'eng.4', id: 42, name: 'League Two', country: 'Anglia', flag: '🏴' },
      { code: 'eng.fa', id: 45, name: 'FA Cup', country: 'Anglia', flag: '🏴' },
      { code: 'eng.league_cup', id: 48, name: 'EFL Cup', country: 'Anglia', flag: '🏴' },
      { code: 'esp.copa_del_rey', id: 143, name: 'Copa del Rey', country: 'Spania', flag: '🇪🇸' },
      { code: 'ita.coppa_italia', id: 137, name: 'Coppa Italia', country: 'Italia', flag: '🇮🇹' },
      { code: 'ger.dfb_pokal', id: 81, name: 'DFB-Pokal', country: 'Germania', flag: '🇩🇪' },
      { code: 'fra.coupe_de_france', id: 66, name: 'Coupe de France', country: 'Franta', flag: '🇫🇷' },
      { code: 'ger.3', id: 80, name: '3. Liga', country: 'Germania', flag: '🇩🇪' },
      { code: 'por.2', id: 95, name: 'Liga Portugal 2', country: 'Portugalia', flag: '🇵🇹' },
      { code: 'ned.2', id: 89, name: 'Eerste Divisie', country: 'Olanda', flag: '🇳🇱' },
      { code: 'aut.1', id: 218, name: 'Bundesliga Austria', country: 'Austria', flag: '🇦🇹' },
      { code: 'sui.1', id: 207, name: 'Super League', country: 'Elvetia', flag: '🇨🇭' },
      { code: 'gre.1', id: 197, name: 'Super League Greece', country: 'Grecia', flag: '🇬🇷' },
      { code: 'den.1', id: 119, name: 'Superliga', country: 'Danemarca', flag: '🇩🇰' },
      { code: 'nor.1', id: 103, name: 'Eliteserien', country: 'Norvegia', flag: '🇳🇴' },
      { code: 'swe.1', id: 113, name: 'Allsvenskan', country: 'Suedia', flag: '🇸🇪' },
      { code: 'pol.1', id: 106, name: 'Ekstraklasa', country: 'Polonia', flag: '🇵🇱' },
      { code: 'cze.1', id: 345, name: 'Czech Liga', country: 'Cehia', flag: '🇨🇿' },
      { code: 'ukr.1', id: 333, name: 'Premier League', country: 'Ucraina', flag: '🇺🇦' },
      { code: 'sco.2', id: 180, name: 'Championship', country: 'Scotia', flag: '🏴' },
      { code: 'irl.1', id: 357, name: 'Premier Division', country: 'Irlanda', flag: '🇮🇪' },
      { code: 'bra.1', id: 71, name: 'Brasileirao', country: 'Brazilia', flag: '🇧🇷' },
      { code: 'bra.2', id: 72, name: 'Brasileirao Serie B', country: 'Brazilia', flag: '🇧🇷' },
      { code: 'arg.1', id: 128, name: 'Liga Profesional', country: 'Argentina', flag: '🇦🇷' },
      { code: 'mex.1', id: 262, name: 'Liga MX', country: 'Mexic', flag: '🇲🇽' },
      { code: 'jpn.1', id: 98, name: 'J1 League', country: 'Japonia', flag: '🇯🇵' },
      { code: 'kor.1', id: 292, name: 'K League 1', country: 'Coreea de Sud', flag: '🇰🇷' },
      { code: 'aus.1', id: 188, name: 'A-League', country: 'Australia', flag: '🇦🇺' },
      { code: 'usa.usl.1', id: 255, name: 'USL Championship', country: 'SUA', flag: '🇺🇸' },
      { code: 'uefa.nations', id: 5, name: 'UEFA Nations League', country: 'Europa', flag: '🇪🇺' },
      { code: 'fifa.worldq.uefa', id: 32, name: 'Preliminarii CM (UEFA)', country: 'Europa', flag: '🌍' },
      { code: 'fifa.friendly', id: 10, name: 'Amicale Internationale', country: 'International', flag: '🌍' },
      { code: 'uefa.euro_u21', id: 7, name: 'UEFA U21 Championship', country: 'Europa', flag: '🇪🇺' },
      { code: 'rou.2', id: 284, name: 'Liga 2', country: 'România', flag: '🇷🇴' },
      { code: 'eng.5', id: 43, name: 'National League', country: 'Anglia', flag: '🏴' },
      { code: 'col.1', id: 239, name: 'Primera A', country: 'Columbia', flag: '🇨🇴' },
      { code: 'chi.1', id: 265, name: 'Primera División', country: 'Chile', flag: '🇨🇱' },
      { code: 'per.1', id: 281, name: 'Liga 1', country: 'Peru', flag: '🇵🇪' },
      { code: 'ecu.1', id: 242, name: 'Liga Pro', country: 'Ecuador', flag: '🇪🇨' },
      { code: 'uru.1', id: 271, name: 'Primera División', country: 'Uruguay', flag: '🇺🇾' },
      { code: 'par.1', id: 250, name: 'Primera División', country: 'Paraguay', flag: '🇵🇾' },
      { code: 'ksa.1', id: 307, name: 'Saudi Pro League', country: 'Arabia Saudită', flag: '🇸🇦' },
      { code: 'cro.1', id: 210, name: 'HNL', country: 'Croația', flag: '🇭🇷' },
      { code: 'srb.1', id: 286, name: 'SuperLiga', country: 'Serbia', flag: '🇷🇸' },
      { code: 'bul.1', id: 172, name: 'First League', country: 'Bulgaria', flag: '🇧🇬' },
      { code: 'hun.1', id: 271, name: 'NB I', country: 'Ungaria', flag: '🇭🇺' },
      { code: 'fin.1', id: 244, name: 'Veikkausliiga', country: 'Finlanda', flag: '🇫🇮' },
      { code: 'isl.1', id: 225, name: 'Besta deild', country: 'Islanda', flag: '🇮🇸' },
    ];

    const results: Fixture[] = [];

    await Promise.all(
      ESPN_LEAGUES.map(async (lg) => {
        try {
          const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${lg.code}/scoreboard?dates=${yyyymmdd}`;
          const res = await fetchWithTimeout(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
              'Accept': 'application/json, text/plain, */*',
              'Accept-Language': 'en-US,en;q=0.9',
              'Referer': 'https://www.espn.com/',
              'Origin': 'https://www.espn.com',
            },
          }, 4500);
          if (!res.ok) return;
          const data = await res.json();
          const events = data.events || [];

              for (const ev of events) {
                const comp = ev.competitions?.[0];
                if (!comp) continue;
                const homeComp = comp.competitors?.find((c: any) => c.homeAway === 'home');
                const awayComp = comp.competitors?.find((c: any) => c.homeAway === 'away');
                if (!homeComp || !awayComp) continue;

                const state = comp.status?.type?.state; // 'pre', 'in', 'post'
                const shortDetail = comp.status?.type?.shortDetail || '';
                const clock = comp.status?.clock || 0;

                let status: any = 'NS';
                let elapsedMinute: number | null = null;

                if (state === 'in') {
                  const clockMinutes = Math.round(clock / 60);
                  if (shortDetail.includes('HT') || shortDetail.includes('Half')) {
                    status = 'HT';
                    elapsedMinute = clockMinutes > 0 ? clockMinutes : 45;
                  } else {
                    if (shortDetail.includes('1H')) status = '1H';
                    else if (shortDetail.includes('2H')) status = '2H';
                    else if (REGEX_ET.test(shortDetail)) status = 'ET';
                    else if (REGEX_PEN.test(shortDetail)) status = 'P';
                    else status = 'LIVE';
                    elapsedMinute = clockMinutes;
                  }
                } else if (state === 'post') {
                  status = 'FT';
                  elapsedMinute = 90;
                } else {
                  status = 'NS';
                  elapsedMinute = null;
                }

                const homeScore = homeComp.score !== undefined ? parseInt(homeComp.score, 10) : null;
                const awayScore = awayComp.score !== undefined ? parseInt(awayComp.score, 10) : null;

                const homeTeamName = homeComp.team?.displayName || homeComp.team?.name || 'Home';
                const awayTeamName = awayComp.team?.displayName || awayComp.team?.name || 'Away';

                const espnId = parseInt(ev.id, 10);
                if (!espnId) continue;

                results.push({
                  id: espnId,
                  date: ev.date,
                  timestamp: Math.floor(new Date(ev.date).getTime() / 1000),
                  status,
                  elapsedMinute: elapsedMinute !== null ? elapsedMinute : undefined,
                  league: {
                    id: lg.id,
                    name: lg.name,
                    country: lg.country,
                    flag: lg.flag,
                    logo: ev.league?.logos?.[0]?.href || '',
                    season: 2026,
                    round: comp.round ? `Etapa ${comp.round}` : 'Meci de Campionat',
                  },
                  homeTeam: {
                    id: parseInt(homeComp.id, 10) || 1,
                    name: homeTeamName,
                    logo: homeComp.team?.logo || 'https://media.api-sports.io/football/teams/1.png',
                    shortCode: homeComp.team?.abbreviation || '',
                  },
                  awayTeam: {
                    id: parseInt(awayComp.id, 10) || 2,
                    name: awayTeamName,
                    logo: awayComp.team?.logo || 'https://media.api-sports.io/football/teams/2.png',
                    shortCode: awayComp.team?.abbreviation || '',
                  },
                  score: {
                    halftime: { home: null, away: null },
                    fulltime: { home: status === 'FT' ? homeScore : null, away: status === 'FT' ? awayScore : null },
                    current: {
                      home: ['1H', '2H', 'HT', 'FT', 'LIVE'].includes(status) ? homeScore : null,
                      away: ['1H', '2H', 'HT', 'FT', 'LIVE'].includes(status) ? awayScore : null,
                    },
                  },
                  h2h: this.findHistoricalH2H(homeTeamName, awayTeamName),
                });
              }
            } catch {}
          })
        );

    return results;
  }

  /**
   * Fetches fixtures from Football-Data.org if FOOTBALL_DATA_KEY is configured.
   */
  async getFootballDataOrgFixtures(dateStr: string): Promise<Fixture[]> {
    if (!this.footballDataKey || this.footballDataKey.trim() === '') return [];

    try {
      const res = await fetchWithTimeout(`https://api.football-data.org/v4/matches?dateFrom=${dateStr}&dateTo=${dateStr}`, {
        headers: { 'X-Auth-Token': this.footballDataKey },
      });
      if (!res.ok) return [];
      const json = await res.json();
      const matches = json.matches || [];

      return matches.map((m: any) => {
        let status: any = 'NS';
        if (m.status === 'IN_PLAY') status = 'LIVE';
        else if (m.status === 'PAUSED') status = 'HT';
        else if (m.status === 'FINISHED') status = 'FT';

        return {
          id: m.id,
          date: m.utcDate,
          timestamp: Math.floor(new Date(m.utcDate).getTime() / 1000),
          status,
          league: {
            id: m.competition?.id || 100,
            name: m.competition?.name || 'League',
            country: m.area?.name || '',
            flag: m.area?.flag || '⚽',
            logo: m.competition?.emblem || '',
            season: 2026,
            round: m.matchday ? `Etapa ${m.matchday}` : 'Regular',
          },
          homeTeam: {
            id: m.homeTeam?.id || 1,
            name: m.homeTeam?.name || 'Home',
            logo: m.homeTeam?.crest || 'https://media.api-sports.io/football/teams/1.png',
            shortCode: m.homeTeam?.tla || '',
          },
          awayTeam: {
            id: m.awayTeam?.id || 2,
            name: m.awayTeam?.name || 'Away',
            logo: m.awayTeam?.crest || 'https://media.api-sports.io/football/teams/2.png',
            shortCode: m.awayTeam?.tla || '',
          },
          score: {
            halftime: { home: m.score?.halfTime?.home ?? null, away: m.score?.halfTime?.away ?? null },
            fulltime: { home: m.score?.fullTime?.home ?? null, away: m.score?.fullTime?.away ?? null },
            current: { home: m.score?.fullTime?.home ?? null, away: m.score?.fullTime?.away ?? null },
          },
          h2h: this.findHistoricalH2H(m.homeTeam?.name || '', m.awayTeam?.name || ''),
        };
      });
    } catch {
      return [];
    }
  }

  /**
   * Fetches open fixtures from TheSportsDB.
   */
  async getTheSportsDbFixtures(dateStr: string): Promise<Fixture[]> {
    try {
      const datesToFetch = [dateStr, shiftLocalISO(dateStr, -1), shiftLocalISO(dateStr, 1)];
      const rawEvents: any[] = [];
      await Promise.all(
        datesToFetch.map(async (d) => {
          try {
            const res = await fetchWithTimeout(`https://www.thesportsdb.com/api/v1/json/3/eventsday.php?d=${d}&s=Soccer`, {}, 6000);
            if (!res.ok) return;
            const json = await res.json();
            if (Array.isArray(json.events)) {
              rawEvents.push(...json.events);
            }
          } catch {}
        })
      );

      const parseScore = (v: any): number | null => {
        if (v === null || v === undefined || v === '') return null;
        const n = parseInt(String(v), 10);
        return Number.isNaN(n) ? null : n;
      };

      const mapStatus = (raw: string): any => {
        const st = String(raw || '').toLowerCase();
        if (st.includes('finished') || st === 'ft') return 'FT';
        if (st.includes('half') || st === 'ht') return 'HT';
        if (st.includes('1h') || st.includes('first half')) return '1H';
        if (st.includes('2h') || st.includes('second half')) return '2H';
        if (st.includes('play') || st.includes('live') || REGEX_DIGITS.test(st)) return 'LIVE';
        if (st.includes('postp')) return 'PST';
        if (st.includes('cancel')) return 'CANC';
        return 'NS';
      };

      return rawEvents
        .filter((ev: any) => ev.idEvent)
        .map((ev: any) => {
          const rawDate = ev.strTimestamp || `${ev.dateEvent}T${ev.strTime || '18:00:00'}`;
          const date = rawDate.endsWith('Z') ? rawDate : `${rawDate}Z`;
          return {
            id: parseInt(ev.idEvent, 10),
            date,
            timestamp: Math.floor(new Date(date).getTime() / 1000),
            status: mapStatus(ev.strStatus),
            league: {
              id: parseInt(ev.idLeague, 10) || 500,
              name: ev.strLeague || 'Soccer',
              country: ev.strCountry || '',
              flag: '⚽',
              logo: ev.strBadge || '',
              season: 2026,
              round: ev.intRound ? `Etapa ${ev.intRound}` : 'Meci',
            },
            homeTeam: {
              id: parseInt(ev.idHomeTeam, 10) || 1,
              name: ev.strHomeTeam || 'Home',
              logo: ev.strHomeTeamBadge || 'https://media.api-sports.io/football/teams/1.png',
            },
            awayTeam: {
              id: parseInt(ev.idAwayTeam, 10) || 2,
              name: ev.strAwayTeam || 'Away',
              logo: ev.strAwayTeamBadge || 'https://media.api-sports.io/football/teams/2.png',
            },
            score: {
              halftime: { home: null, away: null },
              fulltime: { home: parseScore(ev.intHomeScore), away: parseScore(ev.intAwayScore) },
              current: { home: parseScore(ev.intHomeScore), away: parseScore(ev.intAwayScore) },
            },
            h2h: this.findHistoricalH2H(ev.strHomeTeam || '', ev.strAwayTeam || ''),
          };
        });
    } catch (err: any) {
      console.error('[ApiFootballService] TSDB error:', err);
      return [];
    }
  }

  /**
   * Fetches open German & European fixtures from OpenLigaDB (100% Free, no key needed)
   */
  async getOpenLigaDbFixtures(dateStr: string): Promise<Fixture[]> {
    try {
      const year = dateStr.slice(0, 4);
      const res = await fetchWithTimeout(`https://api.openligadb.de/getmatchdata/bl1/${year}`, {
        next: { revalidate: 3600 },
      });
      if (!res.ok) return [];
      const matches = await res.json();
      if (!Array.isArray(matches)) return [];

      const filtered = matches.filter((m: any) => m.matchDateTimeUTC && m.matchDateTimeUTC.startsWith(dateStr));
      return filtered.map((m: any) => {
        const isFinished = m.matchIsFinished;
        const homeScore = m.matchResults?.[1]?.pointsTeam1 ?? m.matchResults?.[0]?.pointsTeam1 ?? null;
        const awayScore = m.matchResults?.[1]?.pointsTeam2 ?? m.matchResults?.[0]?.pointsTeam2 ?? null;

        return {
          id: m.matchID,
          date: m.matchDateTimeUTC,
          timestamp: Math.floor(new Date(m.matchDateTimeUTC).getTime() / 1000),
          status: isFinished ? 'FT' : 'NS',
          league: {
            id: 78,
            name: m.leagueName || 'Bundesliga',
            country: 'Germania',
            flag: '🇩🇪',
            logo: m.leagueIconUrl || '',
            season: parseInt(year, 10) || 2026,
            round: m.group?.groupName || 'Etapa Bundesliga',
          },
          homeTeam: {
            id: m.team1?.teamId || 1,
            name: m.team1?.teamName || 'Team 1',
            logo: m.team1?.teamIconUrl || 'https://media.api-sports.io/football/teams/1.png',
            shortCode: m.team1?.shortName || '',
          },
          awayTeam: {
            id: m.team2?.teamId || 2,
            name: m.team2?.teamName || 'Team 2',
            logo: m.team2?.teamIconUrl || 'https://media.api-sports.io/football/teams/2.png',
            shortCode: m.team2?.shortName || '',
          },
          score: {
            halftime: { home: m.matchResults?.[0]?.pointsTeam1 ?? null, away: m.matchResults?.[0]?.pointsTeam2 ?? null },
            fulltime: { home: homeScore, away: awayScore },
            current: { home: homeScore, away: awayScore },
          },
          h2h: this.findHistoricalH2H(m.team1?.teamName || '', m.team2?.teamName || ''),
        };
      });
    } catch {
      return [];
    }
  }

  /**
   * Fetches fixtures for a given date (YYYY-MM-DD) with multi-provider SWR cascading.
   */
  async getFixturesByDate(dateStr: string): Promise<{ fixtures: Fixture[]; isDemo: boolean; isStale: boolean }> {
    const cacheKey = `fixtures:v18:${dateStr}`;

    try {
      const { data, isStale } = await serverCache.swr<{ fixtures: Fixture[]; isDemo: boolean }>(
        cacheKey,
        MODEL_CONFIG.CACHE_TTL.DAILY_FIXTURES,
        async () => {
          let allFixtures: SourcedFixture[] = [];

          // Tier 1: Try API-Football if valid key is configured
          if (this.apiKey && !this.apiKey.includes('your_api_football_key')) {
            try {
              const res = await apiFootballRateLimiter.executeWithBackoff(async () => {
                return await fetchWithTimeout(`${API_FOOTBALL_BASE_URL}/fixtures?date=${dateStr}`, {
                  headers: {
                    'x-apisports-key': this.apiKey!,
                    'Accept': 'application/json',
                  },
                });
              });

              if (res.ok) {
                const json = await res.json();
                const apiErrors = json.errors;
                const hasError = apiErrors && !Array.isArray(apiErrors) && Object.keys(apiErrors).length > 0;
                if (hasError) {
                  console.warn('[ApiFootballService] Tier 1 API-Football rejected the request:', JSON.stringify(apiErrors));
                } else {
                  const apiFixtures = this.transformApiFixtures(json.response || []);
                  allFixtures.push(...apiFixtures.map((f) => ({ ...f, providerPriority: 1 })));
                  console.info(`[ApiFootballService] Tier 1 API-Football: ${apiFixtures.length} fixtures.`);
                }
              } else {
                console.warn(`[ApiFootballService] Tier 1 API-Football HTTP ${res.status}.`);
              }
            } catch (err: any) {
              console.warn('[ApiFootballService] Tier 1 API-Football failed:', err.message);
            }
          }

          // Tier 2: Fetch real-time live matches from ESPN Soccer Scoreboard API
          try {
            const espnFixtures = await this.getEspnFixtures(dateStr);
            allFixtures.push(...espnFixtures.map((f) => ({ ...f, providerPriority: 2 })));
            console.info(`[ApiFootballService] Tier 2 ESPN: ${espnFixtures.length} fixtures.`);
          } catch (err: any) {
            console.warn('[ApiFootballService] Tier 2 ESPN failed:', err.message);
          }

          // Tier 3: Fetch from Football-Data.org if configured
          try {
            const fdFixtures = await this.getFootballDataOrgFixtures(dateStr);
            allFixtures.push(...fdFixtures.map((f) => ({ ...f, providerPriority: 3 })));
            console.info(`[ApiFootballService] Tier 3 Football-Data.org: ${fdFixtures.length} fixtures.`);
          } catch (err: any) {
            console.warn('[ApiFootballService] Tier 3 Football-Data.org failed:', err.message);
          }

          // Tier 4: Fetch from TheSportsDB Open API
          try {
            const sdbFixtures = await this.getTheSportsDbFixtures(dateStr);
            allFixtures.push(...sdbFixtures.map((f) => ({ ...f, providerPriority: 5 })));
            console.info(`[ApiFootballService] Tier 4 TheSportsDB: ${sdbFixtures.length} fixtures.`);
          } catch (err: any) {
            console.warn('[ApiFootballService] Tier 4 TheSportsDB failed:', err.message);
          }

          // Tier 5: OpenLigaDB (keyless, German leagues) — previously implemented but never called.
          try {
            const oldbFixtures = await this.getOpenLigaDbFixtures(dateStr);
            allFixtures.push(...oldbFixtures.map((f) => ({ ...f, providerPriority: 4 })));
            console.info(`[ApiFootballService] Tier 5 OpenLigaDB: ${oldbFixtures.length} fixtures.`);
          } catch (err: any) {
            console.warn('[ApiFootballService] Tier 5 OpenLigaDB failed:', err.message);
          }

          // Tier 6: Bundled authentic daily schedule (statically bundled for Vercel/serverless environments)
          try {
            if (Array.isArray(dailyScheduleData) && dailyScheduleData.length > 0) {
              allFixtures.push(...(dailyScheduleData as any[]).map((f: any) => ({ ...f, providerPriority: 6 })));
              console.info(`[ApiFootballService] Tier 6 Bundled Schedule: ${dailyScheduleData.length} fixtures.`);
            }
          } catch (err: any) {
            console.warn('[ApiFootballService] Tier 6 Bundled Schedule failed:', err.message);
          }

          const deduped = dedupeFixtures(allFixtures, dateStr);

          // Sample slate is NEVER merged into authentic fixtures. It is served only when
          // every provider returned nothing, and the response is flagged isDemo: true so
          // the UI can say so instead of passing sample scores off as real results.
          if (deduped.length === 0) {
            console.warn(`[ApiFootballService] No provider returned fixtures for ${dateStr} — serving bundled sample slate (isDemo).`);
            return { fixtures: this.getMockFixtures(dateStr), isDemo: true };
          }

          return { fixtures: deduped, isDemo: false };
        }
      );

      return { fixtures: data?.fixtures || [], isDemo: data?.isDemo ?? true, isStale };
    } catch (err: any) {
      console.warn('[ApiFootballService] Error loading fixtures, using fallback:', err.message);
      return { fixtures: this.getMockFixtures(dateStr), isDemo: true, isStale: true };
    }
  }

  /**
   * Fetches live fixtures with 60-second caching.
   */
  async getLiveFixtures(): Promise<{ fixtures: Fixture[]; isDemo: boolean; isStale: boolean }> {
    const today = todayLocalISO();
    const { fixtures } = await this.getFixturesByDate(today);
    const liveMatches = fixtures.filter((f) => ['1H', 'HT', '2H', 'ET', 'P', 'LIVE'].includes(f.status));
    return { fixtures: liveMatches, isDemo: false, isStale: false };
  }

  /**
   * Looks a fixture up in the already-built slates for yesterday/today/tomorrow.
   * This is the authoritative source: those slates are what the match list shows,
   * so anything visible in the UI is resolvable here regardless of which provider
   * supplied it.
   */
  private async findFixtureInRecentSlates(id: number): Promise<Fixture | null> {
    const dayOffsets = [0, -1, 1];
    for (const offset of dayOffsets) {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() + offset);
      const dateStr = d.toISOString().split('T')[0];
      try {
        const { fixtures } = await this.getFixturesByDate(dateStr);
        const found = fixtures.find((f) => f.id === id);
        if (found) return found;
      } catch {}
    }
    return null;
  }

  /**
   * Gets a specific fixture by ID, enriching with live statistics, lineups, and authentic H2H.
   *
   * Resolution order matters: the day slate comes FIRST. Querying API-Football by
   * id alone used to be the only path, so when that key was unavailable every
   * match detail request 404'd even though the fixture was sitting in the list.
   */
  async getFixtureById(id: number): Promise<{ fixture: Fixture | null; isDemo: boolean }> {
    const slateFixture = await this.findFixtureInRecentSlates(id);

    if (this.isDemoMode()) {
      const found = slateFixture ?? this.getMockFixtures().find((f) => f.id === id) ?? null;
      if (found) {
        found.h2h = this.findHistoricalH2H(found.homeTeam.name, found.awayTeam.name);
      }
      return { fixture: found, isDemo: true };
    }

    const cacheKey = `fixture:details:${id}`;
    try {
      const { data } = await serverCache.swr(
        cacheKey,
        180, // 3 minutes cache for detail pages
        async () => {
          return await apiFootballRateLimiter.executeWithBackoff(async () => {
            const res = await fetchWithTimeout(`${API_FOOTBALL_BASE_URL}/fixtures?id=${id}`, {
              headers: { 'x-apisports-key': this.apiKey! },
            });
            const json = await res.json();
            const transformedList = this.transformApiFixtures(json.response || []);
            // Fall back to the slate entry when API-Football has nothing for this id.
            const baseFixture = transformedList[0] || (slateFixture ? { ...slateFixture } : null);
            if (!baseFixture) return null;

            // Extract statistics if present
            if (json.response?.[0]?.statistics && json.response[0].statistics.length >= 2) {
              baseFixture.stats = this.parseApiStatistics(json.response[0].statistics);
            }

            // Extract lineups if present
            if (json.response?.[0]?.lineups && json.response[0].lineups.length >= 2) {
              baseFixture.lineupHome = this.parseApiLineup(json.response[0].lineups[0]);
              baseFixture.lineupAway = this.parseApiLineup(json.response[0].lineups[1]);
            }

            // Extract authentic H2H with fuzzy resolution
            baseFixture.h2h = this.findHistoricalH2H(baseFixture.homeTeam.name, baseFixture.awayTeam.name);

            return baseFixture;
          });
        }
      );

      if (data) return { fixture: data, isDemo: false };
      if (slateFixture) {
        slateFixture.h2h = this.findHistoricalH2H(slateFixture.homeTeam.name, slateFixture.awayTeam.name);
        return { fixture: slateFixture, isDemo: false };
      }
      return { fixture: null, isDemo: false };
    } catch (err: any) {
      console.warn(`[ApiFootballService] Detail enrichment failed for fixture ${id}:`, err.message);
      if (slateFixture) {
        slateFixture.h2h = this.findHistoricalH2H(slateFixture.homeTeam.name, slateFixture.awayTeam.name);
        return { fixture: slateFixture, isDemo: false };
      }
      // No slate entry and no API result: the id genuinely does not exist.
      // Never substitute an unrelated sample fixture here.
      return { fixture: null, isDemo: false };
    }
  }

  /**
   * Finds authentic H2H matches between two teams from the 24,000+ match history dataset.
   */
  public findHistoricalH2H(team1: string, team2: string, leagueCode?: string): H2HMatch[] {
    const allMatches = this.getHistoricalMatches();
    if (allMatches.length === 0) return [];

    // Map input team names (e.g. from API-Football) to standardized football-data names
    const metrics1 = strengthStore.getTeamMetrics(team1, leagueCode);
    const metrics2 = strengthStore.getTeamMetrics(team2, leagueCode);

    const name1 = metrics1?.matchedHistoricalName || team1;
    const name2 = metrics2?.matchedHistoricalName || team2;

    // canonicalClubKey, not normalizeTeamName: the latter drops distinguishing
    // suffixes (so "Man United" and "Man City" collide) and does not fold
    // transliterations, so UEFA records ("FC Bayern München", from
    // football-data.org) would never join up with domestic-league records
    // ("Bayern Munich", from football-data.co.uk).
    const key1 = resolvedClubKey(name1);
    const key2 = resolvedClubKey(name2);

    // Indexed by unordered club pair, built once. Scanning all 62k matches per
    // lookup cost ~10s each, which made a 140-fixture slate take minutes.
    const pairKey = [key1, key2].sort().join('|');
    const direct = this.getH2HIndex().get(pairKey) ?? [];

    // Return the latest 10 direct matches
    return direct
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 10)
      .map((m, idx) => ({
        fixtureId: idx + 1,
        date: m.date,
        season: m.season,
        homeTeamName: m.homeTeam,
        awayTeamName: m.awayTeam,
        homeScore: m.homeGoals,
        awayScore: m.awayGoals,
        halfTimeHomeScore: m.halfTimeHomeGoals ?? undefined,
        halfTimeAwayScore: m.halfTimeAwayGoals ?? undefined,
        totalCards: (m.homeYellowCards ?? 0) + (m.awayYellowCards ?? 0) + ((m.homeRedCards ?? 0) + (m.awayRedCards ?? 0)) * 2,
        totalCorners: (m.homeCorners ?? 0) + (m.awayCorners ?? 0),
        refereeName: m.referee || undefined,
      }));
  }

  private parseApiStatistics(statsArr: any[]): MatchStats {
    const getStatVal = (teamIdx: number, typeName: string): number => {
      const item = statsArr[teamIdx]?.statistics?.find((s: any) => s.type === typeName);
      if (!item || item.value === null || item.value === undefined) return 0;
      if (typeof item.value === 'string') {
        return parseFloat(item.value.replace('%', '')) || 0;
      }
      return item.value;
    };

    return {
      possession: { home: getStatVal(0, 'Ball Possession'), away: getStatVal(1, 'Ball Possession') },
      shotsOnTarget: { home: getStatVal(0, 'Shots on Goal'), away: getStatVal(1, 'Shots on Goal') },
      shotsTotal: { home: getStatVal(0, 'Total Shots'), away: getStatVal(1, 'Total Shots') },
      corners: { home: getStatVal(0, 'Corner Kicks'), away: getStatVal(1, 'Corner Kicks') },
      fouls: { home: getStatVal(0, 'Fouls'), away: getStatVal(1, 'Fouls') },
      yellowCards: { home: getStatVal(0, 'Yellow Cards'), away: getStatVal(1, 'Yellow Cards') },
      redCards: { home: getStatVal(0, 'Red Cards'), away: getStatVal(1, 'Red Cards') },
      expectedGoals: { home: getStatVal(0, 'expected_goals'), away: getStatVal(1, 'expected_goals') },
    };
  }

  private parseApiLineup(teamLineup: any): Lineup {
    const parsePlayer = (p: any, isStarter: boolean): PlayerStats => ({
      id: p.player?.id || 0,
      name: p.player?.name || 'Player',
      number: p.player?.number || 0,
      position: (p.player?.pos || 'M')[0] as 'G' | 'D' | 'M' | 'F',
      isStarter,
      minutesPlayed: p.player?.minutes || 0,
      yellowCards: p.player?.yellowCards || 0,
      redCards: p.player?.redCards || 0,
      foulsCommitted: p.player?.foulsCommitted || 0,
      foulsDrawn: p.player?.foulsDrawn || 0,
    });

    return {
      formation: teamLineup?.formation || '4-3-3',
      isConfirmed: true,
      startingXI: (teamLineup?.startXI || []).map((item: any) => parsePlayer(item, true)),
      substitutes: (teamLineup?.substitutes || []).map((item: any) => parsePlayer(item, false)),
    };
  }

  private transformApiFixtures(rawList: Array<any>): Fixture[] {
    return rawList.map((item) => {
      const rawRefereeName = item.fixture.referee ? item.fixture.referee.split(',')[0].trim() : undefined;
      const refereeProfile = rawRefereeName ? refereeStore.getRefereeProfile(rawRefereeName) || undefined : undefined;

      return {
        id: item.fixture.id,
        date: item.fixture.date,
        timestamp: item.fixture.timestamp,
        status: item.fixture.status.short,
        elapsedMinute: item.fixture.status.elapsed,
        league: {
          id: item.league.id,
          name: item.league.name,
          country: item.league.country,
          flag: item.league.flag,
          logo: item.league.logo,
          season: item.league.season,
          round: item.league.round,
        },
        homeTeam: {
          id: item.teams.home.id,
          name: item.teams.home.name,
          logo: item.teams.home.logo,
        },
        awayTeam: {
          id: item.teams.away.id,
          name: item.teams.away.name,
          logo: item.teams.away.logo,
        },
        score: {
          halftime: { home: item.score?.halftime?.home ?? null, away: item.score?.halftime?.away ?? null },
          fulltime: { home: item.score?.fulltime?.home ?? null, away: item.score?.fulltime?.away ?? null },
          current: { home: item.goals?.home ?? null, away: item.goals?.away ?? null },
        },
        referee: refereeProfile,
      };
    });
  }
}

export const apiFootballService = new ApiFootballService();