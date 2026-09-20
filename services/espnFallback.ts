/**
 * FlashStat — ESPN Public Hidden API Fallback Service (services/espnFallback.ts)
 * 
 * Architectural Rule: USAGE: 'public'
 * Provides zero-key, zero-cost fallback redundancy for fixtures and live scores
 * when API-Football daily quota (100 req/day) is exhausted or fails with 429.
 */

import { serverCache } from '../lib/cache';
import type { Fixture, MatchStatus, Team, League, Score } from '../types/football';

const ESPN_BASE_URL = 'https://site.api.espn.com/apis/site/v2/sports/soccer';

export interface ESPNLeagueConfig {
  code: string;
  id: number;
  name: string;
  country: string;
}

export const ESPN_SUPPORTED_LEAGUES: ESPNLeagueConfig[] = [
  { code: 'eng.1', id: 39, name: 'Premier League', country: 'England' },
  { code: 'esp.1', id: 140, name: 'La Liga', country: 'Spain' },
  { code: 'ita.1', id: 135, name: 'Serie A', country: 'Italy' },
  { code: 'ger.1', id: 78, name: 'Bundesliga', country: 'Germany' },
  { code: 'fra.1', id: 61, name: 'Ligue 1', country: 'France' },
  { code: 'rou.1', id: 283, name: 'SuperLiga', country: 'Romania' },
  { code: 'uefa.champions', id: 2, name: 'UEFA Champions League', country: 'World' },
  { code: 'uefa.europa', id: 3, name: 'UEFA Europa League', country: 'World' },
];

function mapESPNStatus(espnState: string, description: string, clockMinutes?: number): MatchStatus {
  const s = espnState?.toLowerCase() || '';
  const desc = description?.toLowerCase() || '';

  if (s === 'post' || desc.includes('full time') || desc.includes('final') || desc.includes('ft')) {
    return 'FT';
  }
  if (desc.includes('halftime') || desc.includes('half time') || desc.includes('ht')) {
    return 'HT';
  }
  if (s === 'in') {
    if (clockMinutes && clockMinutes > 45) return '2H';
    return '1H';
  }
  if (desc.includes('postponed') || desc.includes('canc')) {
    return 'PST';
  }
  return 'NS';
}

export class ESPNFallbackService {
  /**
   * Fetches fixtures across all supported leagues for a target date (YYYY-MM-DD or YYYYMMDD)
   */
  async getFixturesByDate(targetDate: string): Promise<{ fixtures: Fixture[]; source: string }> {
    const formattedDateParam = targetDate.replace(/-/g, '');
    const cacheKey = `espn:fixtures:${formattedDateParam}`;

    const cached = serverCache.get<Fixture[]>(cacheKey);
    if (cached) {
      return { fixtures: cached, source: 'espn_cache' };
    }

    const allFixtures: Fixture[] = [];

    await Promise.allSettled(
      ESPN_SUPPORTED_LEAGUES.map(async (leagueCfg) => {
        try {
          const url = `${ESPN_BASE_URL}/${leagueCfg.code}/scoreboard?dates=${formattedDateParam}`;
          const res = await fetch(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'application/json',
            },
            next: { revalidate: 60 },
          });

          if (!res.ok) return;
          const data = await res.json();
          if (!data.events || !Array.isArray(data.events)) return;

          for (const ev of data.events) {
            try {
              const comp = ev.competitions?.[0];
              if (!comp || !comp.competitors || comp.competitors.length < 2) continue;

              const homeComp = comp.competitors.find((c: any) => c.homeAway === 'home') || comp.competitors[0];
              const awayComp = comp.competitors.find((c: any) => c.homeAway === 'away') || comp.competitors[1];

              const homeScore = homeComp.score !== undefined ? parseInt(homeComp.score, 10) : null;
              const awayScore = awayComp.score !== undefined ? parseInt(awayComp.score, 10) : null;

              const rawState = ev.status?.type?.state || 'pre';
              const rawDesc = ev.status?.type?.description || '';
              const clockMinutes = ev.status?.clock ? Math.floor(ev.status.clock / 60) : undefined;
              const status = mapESPNStatus(rawState, rawDesc, clockMinutes);

              const homeTeam: Team = {
                id: parseInt(homeComp.id, 10) || Math.floor(Math.random() * 100000),
                name: homeComp.team?.displayName || homeComp.team?.name || 'Home Team',
                logo: homeComp.team?.logo || 'https://media.api-sports.io/football/teams/0.png',
                shortCode: homeComp.team?.abbreviation,
              };

              const awayTeam: Team = {
                id: parseInt(awayComp.id, 10) || Math.floor(Math.random() * 100000),
                name: awayComp.team?.displayName || awayComp.team?.name || 'Away Team',
                logo: awayComp.team?.logo || 'https://media.api-sports.io/football/teams/0.png',
                shortCode: awayComp.team?.abbreviation,
              };

              const league: League = {
                id: leagueCfg.id,
                name: leagueCfg.name,
                country: leagueCfg.country,
                season: new Date(ev.date || Date.now()).getFullYear(),
                round: ev.status?.type?.detail || undefined,
              };

              const score: Score = {
                current: { home: homeScore, away: awayScore },
                fulltime: status === 'FT' ? { home: homeScore, away: awayScore } : { home: null, away: null },
                halftime: { home: null, away: null },
              };

              const matchDate = ev.date || `${targetDate}T18:00:00.000Z`;
              const timestamp = Math.floor(new Date(matchDate).getTime() / 1000);

              const fixture: Fixture = {
                id: parseInt(ev.id, 10) || timestamp,
                date: matchDate,
                timestamp: timestamp,
                status: status,
                elapsedMinute: status === '1H' || status === '2H' ? (clockMinutes || 45) : undefined,
                homeTeam: homeTeam,
                awayTeam: awayTeam,
                league: league,
                score: score,
                odds: {
                  bookmaker: 'ESPN Fallback Feed',
                  timestamp: new Date().toISOString(),
                  match1X2: { home: 2.10, draw: 3.30, away: 3.50 },
                  overUnder: [
                    { line: 2.5, over: 1.85, under: 1.95 }
                  ],
                  btts: { yes: 1.80, no: 1.95 },
                  overround: 1.06,
                },
              };

              allFixtures.push(fixture);
            } catch (itemErr) {
              continue;
            }
          }
        } catch (err) {
          // Silent fallback continue
        }
      })
    );

    if (allFixtures.length > 0) {
      serverCache.set(cacheKey, allFixtures, 60); // 60 seconds TTL
    }

    return { fixtures: allFixtures, source: 'espn_hidden_api' };
  }
}

export const espnFallbackService = new ESPNFallbackService();
