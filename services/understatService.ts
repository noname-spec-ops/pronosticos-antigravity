/**
 * FlashStat — Understat xG & Shot Statistics Provider (services/understatService.ts)
 * 
 * Inspired by Qwen Architecture Plan:
 * - Scrapes and parses open JSON data embedded in Understat pages for advanced metrics (xG, xGA, deep completions, NPxG).
 * - Implements in-memory caching to respect rate limits.
 */

import { serverCache } from '../lib/cache';

export interface UnderstatTeamData {
  title: string;
  history: Array<{
    date: string;
    h_a: 'h' | 'a';
    xG: number;
    xGA: number;
    npxG: number;
    npxGA: number;
    deep: number;
    deep_allowed: number;
    scored: number;
    missed: number;
    result: 'w' | 'd' | 'l';
    wins: number;
    draws: number;
    loses: number;
    pts: number;
  }>;
}

export class UnderstatService {
  private static BASE_URL = 'https://understat.com';

  /**
   * Fetches advanced xG metrics for a league from Understat
   * @param league 'EPL' | 'La_liga' | 'Bundesliga' | 'Serie_A' | 'Ligue_1' | 'RFPL'
   * @param season e.g. '2025' or '2024'
   */
  public static async getLeagueData(league: string = 'EPL', season: string = '2025'): Promise<Record<string, UnderstatTeamData> | null> {
    const cacheKey = `understat:league:${league}:${season}`;
    const cached = serverCache.get<Record<string, UnderstatTeamData>>(cacheKey);
    if (cached) return cached;

    try {
      const url = `${this.BASE_URL}/league/${encodeURIComponent(league)}/${encodeURIComponent(season)}/`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
        },
        next: { revalidate: 3600 },
      });

      if (!res.ok) return null;
      const html = await res.text();

      // Locate `var teamsData = JSON.parse('...')` or `var teamsData = {...}`
      const match = html.match(/var\s+teamsData\s*=\s*JSON\.parse\('([^']+)'\)/) ||
                    html.match(/var\s+teamsData\s*=\s*(\{.+?\});\s*<\/script>/s);

      if (!match) return null;

      let teamsData: Record<string, UnderstatTeamData>;
      if (match[1].startsWith('{')) {
        teamsData = JSON.parse(match[1]);
      } else {
        const decoded = Buffer.from(match[1], 'hex').toString('utf-8');
        teamsData = JSON.parse(decoded);
      }

      // Cache for 6 hours
      serverCache.set(cacheKey, teamsData, 6 * 3600);
      return teamsData;
    } catch (err) {
      console.warn(`[UnderstatService] Could not scrape understat for ${league} ${season}:`, err);
      return null;
    }
  }

  /**
   * Helper to retrieve rolling average xG and xGA for a specific team
   */
  public static async getTeamRollingXg(teamName: string, league: string = 'EPL'): Promise<{ avgXg: number; avgXga: number } | null> {
    const data = await this.getLeagueData(league);
    if (!data) return null;

    const normalizedTarget = teamName.toLowerCase().replace(/[^a-z0-9]/g, '');
    let matchedTeam: UnderstatTeamData | undefined;

    for (const id of Object.keys(data)) {
      const team = data[id];
      const norm = team.title.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (norm.includes(normalizedTarget) || normalizedTarget.includes(norm)) {
        matchedTeam = team;
        break;
      }
    }

    if (!matchedTeam || !matchedTeam.history || matchedTeam.history.length === 0) return null;

    const last5 = matchedTeam.history.slice(-5);
    const sumXg = last5.reduce((acc, h) => acc + (parseFloat(h.xG as any) || 0), 0);
    const sumXga = last5.reduce((acc, h) => acc + (parseFloat(h.xGA as any) || 0), 0);

    return {
      avgXg: parseFloat((sumXg / last5.length).toFixed(2)),
      avgXga: parseFloat((sumXga / last5.length).toFixed(2)),
    };
  }
}
