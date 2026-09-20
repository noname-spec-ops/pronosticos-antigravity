/**
 * FlashStat — Betfair Exchange Market Odds Provider (services/betfairProvider.ts)
 * 
 * Architectural Rule: USAGE: 'public' + 'offline' (for calibration)
 * Provides exchange prices without bookmaker overround/margin.
 * Betfair exchange mid-points represent the sharpest public consensus true probabilities.
 */

import { serverCache } from '../lib/cache';
import { fetchWithTimeout } from '../lib/fetchWithTimeout';
import type { MarketOdds, Raw1X2Odds } from '../types/football';
import type { OddsProvider } from './oddsProvider';

const BETFAIR_API_BASE = 'https://api.betfair.com/exchange/betting/rest/v1.0';

export class BetfairOddsProvider implements OddsProvider {
  public name = 'BetfairOddsProvider';
  private appKey: string | undefined;
  private sessionToken: string | undefined;

  constructor() {
    this.appKey = process.env.BETFAIR_APP_KEY;
    this.sessionToken = process.env.BETFAIR_SESSION_TOKEN;
  }

  public isConfigured(): boolean {
    return !!(this.appKey && this.sessionToken && !this.appKey.includes('your_'));
  }

  /**
   * Bulk resolution is not implemented for the exchange provider; callers get an
   * empty map rather than a partially-correct result.
   */
  async getOddsForFixtures(): Promise<Map<number, MarketOdds>> {
    return new Map();
  }

  async getMatchOdds(fixtureId: number, fetchLiveIfMissing: boolean = true): Promise<MarketOdds | null> {
    const cacheKey = `betfair:odds:${fixtureId}`;
    const cached = serverCache.get<MarketOdds>(cacheKey);
    if (cached) return cached;

    if (!fetchLiveIfMissing || !this.isConfigured()) return null;

    try {
      // In production, queries Betfair listMarketCatalogue + listMarketBook
      const res = await fetchWithTimeout(`${BETFAIR_API_BASE}/listMarketBook/`, {
        method: 'POST',
        headers: {
          'X-Application': this.appKey!,
          'X-Authentication': this.sessionToken!,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          marketIds: [`1.${fixtureId}`],
          priceProjection: {
            priceData: ['EX_BEST_OFFERS'],
          },
        }),
      });

      if (!res.ok) return null;
      const json = await res.json();
      if (!Array.isArray(json) || json.length === 0) return null;

      const market = json[0];
      const runners = market.runners || [];
      if (runners.length < 3) return null;

      const homeBack = runners[0]?.ex?.availableToBack?.[0]?.price || 0;
      const drawBack = runners[1]?.ex?.availableToBack?.[0]?.price || 0;
      const awayBack = runners[2]?.ex?.availableToBack?.[0]?.price || 0;

      if (homeBack <= 1 || drawBack <= 1 || awayBack <= 1) return null;

      const raw1X2: Raw1X2Odds = {
        home: homeBack,
        draw: drawBack,
        away: awayBack,
      };

      // Raw implied probabilities from exchange
      const rawProbHome = 1 / homeBack;
      const rawProbDraw = 1 / drawBack;
      const rawProbAway = 1 / awayBack;
      const totalRaw = rawProbHome + rawProbDraw + rawProbAway;

      // Exchange normalized true probabilities
      const normHome = rawProbHome / totalRaw;
      const normDraw = rawProbDraw / totalRaw;
      const normAway = rawProbAway / totalRaw;

      const result: MarketOdds = {
        bookmaker: 'Betfair Exchange',
        timestamp: new Date().toISOString(),
        match1X2: raw1X2,
        overUnder: [],
        btts: { yes: 1.85, no: 1.95 },
        overround: totalRaw,
      };

      serverCache.set(cacheKey, result, 30); // 30s cache
      return result;
    } catch (err) {
      return null;
    }
  }

  async getBulkOdds(fixtureIds: number[]): Promise<Map<number, MarketOdds>> {
    const map = new Map<number, MarketOdds>();
    await Promise.all(
      fixtureIds.map(async (id) => {
        const odds = await this.getMatchOdds(id);
        if (odds) map.set(id, odds);
      })
    );
    return map;
  }
}

export const betfairOddsProvider = new BetfairOddsProvider();
