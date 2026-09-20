/**
 * FlashStat — Authentic Bookmaker Odds Service (services/oddsProvider.ts)
 *
 * Strict principles:
 * - NO fabricated odds anywhere. If a market is not quoted, it is absent.
 * - Every quote is matched to a specific fixture by team names AND kickoff time.
 *   (The previous implementation returned `data[0]` — the first match of the first
 *   league — as the odds for whatever fixture was requested.)
 * - Bulk, per-league fetching with caching, so quota is spent per league per
 *   cache window instead of per fixture.
 * - Prices are the BEST available across bookmakers, which is what a value bettor
 *   can actually take.
 */

import { serverCache } from '../lib/cache';
import { apiFootballRateLimiter } from '../lib/rateLimiter';
import { MODEL_CONFIG } from '../engine/config';
import { normalizeTeamName } from '../lib/teamMapping';
import { fetchWithTimeout } from '../lib/fetchWithTimeout';
import type { MarketOdds, Raw1X2Odds, Fixture, OverUnderMarket } from '../types/football';

const API_FOOTBALL_BASE_URL = 'https://v3.football.api-sports.io';
const THE_ODDS_API_BASE_URL = 'https://api.the-odds-api.com/v4';

/**
 * Per-league odds cache window. The Odds API bills (markets x regions) credits per
 * request, so with ~12 leagues in a slate every refresh costs ~24 credits. A short
 * window would drain a 500-credit monthly allowance in under two hours.
 */
const ODDS_LEAGUE_CACHE_SECONDS = 900;

/**
 * Credits held back so the allowance is never driven to zero. A 401 storm mid-slate
 * is worse than simply having no prices: it looks like an outage rather than a
 * budget limit.
 */
const QUOTA_RESERVE = 10;

/**
 * A quote further above the median than this is treated as a data error.
 * 1.35 is wide enough to keep a genuinely generous book and narrow enough to
 * reject a decimal-point slip.
 */
const OUTLIER_RATIO = 1.35;

/** Plausible overround for the synthetic best-of-all book after outlier removal. */
const MIN_PLAUSIBLE_OVERROUND = 0.9;
const MAX_PLAUSIBLE_OVERROUND = 1.35;

/** Statuses for which a price can no longer be taken. */
const SETTLED_STATUSES = ['FT', 'AET', 'PEN', 'CANC', 'PST', 'ABD', 'AWD', 'WO'];

/**
 * Our internal league ids -> The Odds API sport keys.
 * Only leagues The Odds API actually covers are listed; anything else simply has
 * no odds source, which the UI reports as "Cote indisponibile".
 */
export const LEAGUE_ID_TO_ODDS_SPORT: Record<number, string> = {
  39: 'soccer_epl',
  40: 'soccer_efl_champ',
  140: 'soccer_spain_la_liga',
  141: 'soccer_spain_segunda_division',
  135: 'soccer_italy_serie_a',
  136: 'soccer_italy_serie_b',
  78: 'soccer_germany_bundesliga',
  79: 'soccer_germany_bundesliga2',
  61: 'soccer_france_ligue_one',
  62: 'soccer_france_ligue_two',
  88: 'soccer_netherlands_eredivisie',
  94: 'soccer_portugal_primeira_liga',
  144: 'soccer_belgium_first_div',
  203: 'soccer_turkey_super_league',
  197: 'soccer_greece_super_league',
  179: 'soccer_spl',
  253: 'soccer_usa_mls',
  2: 'soccer_uefa_champs_league',
  848: 'soccer_uefa_europa_conference_league',
  71: 'soccer_brazil_campeonato',
  128: 'soccer_argentina_primera_division',
  13: 'soccer_conmebol_copa_libertadores',
  262: 'soccer_mexico_ligamx',
  103: 'soccer_norway_eliteserien',
  113: 'soccer_sweden_allsvenskan',
  119: 'soccer_denmark_superliga',
  106: 'soccer_poland_ekstraklasa',
  207: 'soccer_switzerland_superleague',
  218: 'soccer_austria_bundesliga',
  357: 'soccer_league_of_ireland',
  98: 'soccer_japan_j_league',
  292: 'soccer_korea_kleague1',
};

/** A single event as returned by The Odds API /odds endpoint. */
interface OddsApiEvent {
  id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers?: Array<{
    key: string;
    title: string;
    markets?: Array<{
      key: string;
      outcomes?: Array<{ name: string; price: number; point?: number }>;
    }>;
  }>;
}

export interface OddsProvider {
  name: string;
  getMatchOdds(fixtureId: number, fetchLiveIfMissing?: boolean): Promise<MarketOdds | null>;
  getOddsForFixtures(fixtures: Fixture[]): Promise<Map<number, MarketOdds>>;
}

function validPrices(prices: number[]): number[] {
  return prices.filter((p) => typeof p === 'number' && isFinite(p) && p > 1);
}

/** Median price across books — the market consensus, robust to a single bad quote. */
function medianPrice(prices: number[]): number | undefined {
  const valid = validPrices(prices).sort((a, b) => a - b);
  if (valid.length === 0) return undefined;
  const mid = Math.floor(valid.length / 2);
  return valid.length % 2 === 0 ? (valid[mid - 1] + valid[mid]) / 2 : valid[mid];
}

/**
 * Best takeable price, after discarding quotes too far above the consensus.
 *
 * An unguarded Math.max lets one erroneous quote become the headline price. With
 * four or more books a quote above OUTLIER_RATIO x median is treated as bad data
 * rather than as free money; below that there is not enough agreement to call
 * anything an outlier, so the max is kept as-is.
 */
function bestPrice(prices: number[]): number | undefined {
  const valid = validPrices(prices);
  if (valid.length === 0) return undefined;

  const median = medianPrice(valid)!;
  const usable = valid.length >= 4 ? valid.filter((p) => p <= median * OUTLIER_RATIO) : valid;
  return usable.length > 0 ? Math.max(...usable) : median;
}

export class LiveOddsProvider implements OddsProvider {
  public name = 'LiveOddsProvider';
  private apiFootballKey: string | undefined;
  private oddsApiKey: string | undefined;
  /** Remaining Odds API quota as last reported by the API; undefined until first call. */
  private quotaRemaining: number | undefined;
  /** Keeps the exhaustion notice to one line per process instead of one per league. */
  private quotaWarningLogged = false;

  constructor() {
    this.apiFootballKey = process.env.API_FOOTBALL_KEY;
    this.oddsApiKey = process.env.ODDS_API_KEY;
  }

  private hasOddsApi(): boolean {
    return !!this.oddsApiKey && !this.oddsApiKey.includes('your_odds_api');
  }

  /**
   * Fetches every quoted event for one league, cached for the odds TTL so a page
   * refresh does not re-spend quota. Returns [] on any failure.
   */
  private async fetchLeagueEvents(sportKey: string): Promise<OddsApiEvent[]> {
    const cacheKey = `oddsapi:events:${sportKey}`;
    const cached = serverCache.get<OddsApiEvent[]>(cacheKey);
    if (cached) return cached;

    if (!this.hasOddsApi()) return [];

    // Stop spending quota when it runs low, so the app degrades to "no odds"
    // instead of burning the remainder and then failing with 401s mid-slate.
    if (this.quotaRemaining !== undefined && this.quotaRemaining <= QUOTA_RESERVE) {
      if (!this.quotaWarningLogged) {
        console.warn(
          `[OddsProvider] Odds API quota exhausted or reserved (${this.quotaRemaining} left). ` +
            'Serving fixtures without prices until the allowance resets.'
        );
        this.quotaWarningLogged = true;
      }
      return [];
    }

    try {
      const url =
        `${THE_ODDS_API_BASE_URL}/sports/${sportKey}/odds/` +
        `?apiKey=${this.oddsApiKey}&regions=eu&markets=h2h,totals&oddsFormat=decimal`;
      const res = await fetchWithTimeout(url, {}, 8000);

      const remaining = res.headers.get('x-requests-remaining');
      if (remaining !== null) this.quotaRemaining = Number(remaining);

      if (!res.ok) {
        if (res.status === 401) {
          // Key rejected, in practice an exhausted allowance. Stop asking.
          this.quotaRemaining = 0;
          if (!this.quotaWarningLogged) {
            console.warn('[OddsProvider] Odds API returned 401 — allowance exhausted. No prices until it resets.');
            this.quotaWarningLogged = true;
          }
        } else {
          console.warn(`[OddsProvider] Odds API HTTP ${res.status} for ${sportKey}.`);
        }
        return [];
      }

      const data = await res.json();
      if (!Array.isArray(data)) return [];

      serverCache.set(cacheKey, data, ODDS_LEAGUE_CACHE_SECONDS);
      console.info(`[OddsProvider] ${sportKey}: ${data.length} events quoted (quota left: ${this.quotaRemaining ?? '?'}).`);
      return data as OddsApiEvent[];
    } catch (err: any) {
      console.warn(`[OddsProvider] Odds API error for ${sportKey}:`, err.message);
      return [];
    }
  }

  /**
   * Converts one Odds API event into MarketOdds, taking the best price per outcome
   * across all bookmakers. Returns null if the 1X2 market is not fully quoted.
   */
  private buildMarketOdds(event: OddsApiEvent): MarketOdds | null {
    const homeH2H: number[] = [];
    const drawH2H: number[] = [];
    const awayH2H: number[] = [];
    /** line -> { over: prices[], under: prices[] } */
    const totals = new Map<number, { over: number[]; under: number[] }>();
    let bookmakerCount = 0;

    for (const bm of event.bookmakers ?? []) {
      bookmakerCount++;
      for (const market of bm.markets ?? []) {
        if (market.key === 'h2h') {
          for (const o of market.outcomes ?? []) {
            if (o.name === event.home_team) homeH2H.push(o.price);
            else if (o.name === event.away_team) awayH2H.push(o.price);
            else if (o.name === 'Draw') drawH2H.push(o.price);
          }
        } else if (market.key === 'totals') {
          for (const o of market.outcomes ?? []) {
            if (o.point === undefined) continue;
            if (!totals.has(o.point)) totals.set(o.point, { over: [], under: [] });
            const bucket = totals.get(o.point)!;
            if (o.name === 'Over') bucket.over.push(o.price);
            else if (o.name === 'Under') bucket.under.push(o.price);
          }
        }
      }
    }

    const home = bestPrice(homeH2H);
    const draw = bestPrice(drawH2H);
    const away = bestPrice(awayH2H);
    if (home === undefined || draw === undefined || away === undefined) return null;

    const match1X2: Raw1X2Odds = { home, draw, away };

    // Consensus line, kept SEPARATE from the best price.
    //
    // These serve two different purposes and must not be the same number:
    //   - match1X2 (best price) is what a bettor can actually take, so it is the
    //     right basis for edge and staking;
    //   - consensus1X2 (median) is the market's opinion, so it is the right basis
    //     for the devigged market prior that carries 65% of the displayed
    //     probability.
    // Devigging the best-of-all line instead biases the prior by about 1
    // percentage point toward the favourite even with clean data, because the
    // spread between books is far wider on the longshot than on the favourite.
    const consensusHome = medianPrice(homeH2H);
    const consensusDraw = medianPrice(drawH2H);
    const consensusAway = medianPrice(awayH2H);
    const consensus1X2: Raw1X2Odds | undefined =
      consensusHome && consensusDraw && consensusAway
        ? { home: consensusHome, draw: consensusDraw, away: consensusAway }
        : undefined;

    // Only lines with BOTH sides quoted are usable.
    const overUnder: OverUnderMarket[] = [];
    for (const [line, bucket] of totals.entries()) {
      const over = bestPrice(bucket.over);
      const under = bestPrice(bucket.under);
      if (over !== undefined && under !== undefined) overUnder.push({ line, over, under });
    }
    overUnder.sort((a, b) => a.line - b.line);

    // The best-of-all line is synthetic, so its overround sits slightly below 1.0
    // by construction. Far below that means the quotes are not a coherent book —
    // usually one bad price that survived outlier removal — and the whole fixture
    // is dropped rather than published with a distorted market prior.
    const overround = 1 / home + 1 / draw + 1 / away;
    if (overround < MIN_PLAUSIBLE_OVERROUND || overround > MAX_PLAUSIBLE_OVERROUND) {
      console.warn(
        `[OddsProvider] Implausible book for ${event.home_team} vs ${event.away_team}: ` +
          `${home}/${draw}/${away} implies overround ${overround.toFixed(4)} — discarded.`
      );
      return null;
    }

    return {
      bookmaker: bookmakerCount > 1 ? `Best of ${bookmakerCount} books` : (event.bookmakers?.[0]?.title ?? 'Unknown'),
      timestamp: new Date().toISOString(),
      match1X2,
      consensus1X2,
      overUnder,
      // btts is intentionally absent: The Odds API does not quote it on this plan
      // and a placeholder would manufacture edge out of nothing.
      overround: Number(overround.toFixed(4)),
    };
  }

  /**
   * Matches a fixture to a quoted event by BOTH team names (normalised, either
   * orientation) and a kickoff time within a 36-hour window, so a home/away pair
   * from a different matchday can never be attached to the wrong fixture.
   */
  private findEventForFixture(fixture: Fixture, events: OddsApiEvent[]): OddsApiEvent | null {
    const fHome = normalizeTeamName(fixture.homeTeam.name);
    const fAway = normalizeTeamName(fixture.awayTeam.name);
    const fTime = new Date(fixture.date).getTime();
    const WINDOW_MS = 36 * 60 * 60 * 1000;

    let best: { event: OddsApiEvent; delta: number } | null = null;

    for (const ev of events) {
      const eHome = normalizeTeamName(ev.home_team);
      const eAway = normalizeTeamName(ev.away_team);

      const exact = eHome === fHome && eAway === fAway;
      const swapped = eHome === fAway && eAway === fHome;
      if (!exact && !swapped) continue;

      const evTime = new Date(ev.commence_time).getTime();
      const delta = Math.abs(evTime - fTime);
      if (!isFinite(delta) || delta > WINDOW_MS) continue;

      if (!best || delta < best.delta) best = { event: ev, delta };
    }

    return best?.event ?? null;
  }

  /**
   * Bulk entry point: resolves odds for a whole slate with one request per league
   * per cache window. Fixtures with no quoted market are simply absent from the map.
   */
  async getOddsForFixtures(fixtures: Fixture[]): Promise<Map<number, MarketOdds>> {
    const result = new Map<number, MarketOdds>();
    if (!this.hasOddsApi() || fixtures.length === 0) return result;

    // Group fixtures by the league's odds sport key. Settled matches are excluded:
    // their price is no longer takeable, so fetching it only burns quota.
    const bySport = new Map<string, Fixture[]>();
    for (const f of fixtures) {
      const sportKey = LEAGUE_ID_TO_ODDS_SPORT[f.league.id];
      if (!sportKey) continue;
      if (SETTLED_STATUSES.includes(f.status)) continue;
      if (!bySport.has(sportKey)) bySport.set(sportKey, []);
      bySport.get(sportKey)!.push(f);
    }
    if (bySport.size === 0) return result;

    const entries = [...bySport.entries()];

    // Sequential, NOT Promise.all. The quota guard in fetchLeagueEvents reads the
    // remaining-credits header from the previous response, so under parallel
    // dispatch every league is already in flight before the first answer arrives
    // and the guard can never stop anything. Fetching in order lets one league's
    // response halt the rest. Each call is cached for 15 minutes, so the added
    // latency is paid once per window.
    const eventLists: OddsApiEvent[][] = [];
    for (const [sportKey] of entries) {
      eventLists.push(await this.fetchLeagueEvents(sportKey));
    }

    entries.forEach(([, leagueFixtures], idx) => {
      const events = eventLists[idx];
      if (events.length === 0) return;
      for (const f of leagueFixtures) {
        const ev = this.findEventForFixture(f, events);
        if (!ev) continue;
        const odds = this.buildMarketOdds(ev);
        if (odds) {
          serverCache.set(`odds:fixture:${f.id}`, odds, MODEL_CONFIG.CACHE_TTL.ODDS);
          result.set(f.id, odds);
        }
      }
    });

    console.info(`[OddsProvider] Resolved odds for ${result.size}/${fixtures.length} fixtures across ${bySport.size} leagues.`);
    return result;
  }

  /**
   * Single-fixture lookup. Serves the cache populated by getOddsForFixtures, and
   * otherwise asks API-Football for that exact fixture id. It never falls back to
   * "some other match's odds".
   */
  async getMatchOdds(fixtureId: number, fetchLiveIfMissing: boolean = true): Promise<MarketOdds | null> {
    const cacheKey = `odds:fixture:${fixtureId}`;

    const cached = serverCache.get<MarketOdds>(cacheKey);
    if (cached) return cached;
    if (!fetchLiveIfMissing) return null;

    if (this.apiFootballKey && !this.apiFootballKey.includes('your_api')) {
      try {
        const liveOdds = await apiFootballRateLimiter.executeWithBackoff(async () => {
          const res = await fetchWithTimeout(
            `${API_FOOTBALL_BASE_URL}/odds?fixture=${fixtureId}`,
            { headers: { 'x-apisports-key': this.apiFootballKey!, Accept: 'application/json' } },
            8000
          );

          if (!res.ok) return null;
          const json = await res.json();
          if (json.errors && !Array.isArray(json.errors) && Object.keys(json.errors).length > 0) {
            console.warn('[OddsProvider] API-Football rejected the odds request:', JSON.stringify(json.errors));
            return null;
          }

          const bookmakers = json.response?.[0]?.bookmakers;
          if (!bookmakers || bookmakers.length === 0) return null;

          // Best price across every bookmaker returned, not just the first one.
          const homePrices: number[] = [];
          const drawPrices: number[] = [];
          const awayPrices: number[] = [];
          const totals = new Map<number, { over: number[]; under: number[] }>();
          const bttsYes: number[] = [];
          const bttsNo: number[] = [];

          for (const bm of bookmakers) {
            const winner = bm.bets?.find((b: any) => b.id === 1 || b.name === 'Match Winner');
            if (winner) {
              for (const v of winner.values ?? []) {
                const price = parseFloat(v.odd);
                if (!isFinite(price)) continue;
                if (v.value === 'Home') homePrices.push(price);
                else if (v.value === 'Draw') drawPrices.push(price);
                else if (v.value === 'Away') awayPrices.push(price);
              }
            }

            const ou = bm.bets?.find((b: any) => b.id === 5 || b.name === 'Goals Over/Under');
            for (const v of ou?.values ?? []) {
              const m = /^(Over|Under)\s+([\d.]+)$/.exec(v.value ?? '');
              const price = parseFloat(v.odd);
              if (!m || !isFinite(price)) continue;
              const line = parseFloat(m[2]);
              if (!totals.has(line)) totals.set(line, { over: [], under: [] });
              if (m[1] === 'Over') totals.get(line)!.over.push(price);
              else totals.get(line)!.under.push(price);
            }

            const btts = bm.bets?.find((b: any) => b.id === 8 || b.name === 'Both Teams Score');
            for (const v of btts?.values ?? []) {
              const price = parseFloat(v.odd);
              if (!isFinite(price)) continue;
              if (v.value === 'Yes') bttsYes.push(price);
              else if (v.value === 'No') bttsNo.push(price);
            }
          }

          const home = bestPrice(homePrices);
          const draw = bestPrice(drawPrices);
          const away = bestPrice(awayPrices);
          if (home === undefined || draw === undefined || away === undefined) return null;

          const overUnder: OverUnderMarket[] = [];
          for (const [line, bucket] of totals.entries()) {
            const over = bestPrice(bucket.over);
            const under = bestPrice(bucket.under);
            if (over !== undefined && under !== undefined) overUnder.push({ line, over, under });
          }
          overUnder.sort((a, b) => a.line - b.line);

          const yes = bestPrice(bttsYes);
          const no = bestPrice(bttsNo);

          return {
            bookmaker: bookmakers.length > 1 ? `Best of ${bookmakers.length} books` : (bookmakers[0].name ?? 'Unknown'),
            timestamp: new Date().toISOString(),
            match1X2: { home, draw, away },
            overUnder,
            // Present only when genuinely quoted.
            ...(yes !== undefined && no !== undefined ? { btts: { yes, no } } : {}),
            overround: Number((1 / home + 1 / draw + 1 / away).toFixed(4)),
          } as MarketOdds;
        });

        if (liveOdds) {
          serverCache.set(cacheKey, liveOdds, MODEL_CONFIG.CACHE_TTL.ODDS);
          return liveOdds;
        }
      } catch (err: any) {
        console.warn(`[OddsProvider] API-Football odds fetch failed for ${fixtureId}:`, err.message);
      }
    }

    // No quote available. The caller must render "Cote indisponibile".
    return null;
  }
}

export const oddsProvider: OddsProvider = new LiveOddsProvider();
