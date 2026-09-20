/**
 * FlashStat — Multi-Provider API Health Monitor & Redundancy Tracker (services/apiMonitor.ts)
 * 
 * Inspired by Qwen Production Plan:
 * - Actively tracks latency, availability, and error counts across all data providers.
 * - Provides immediate failover telemetry and health-check summaries.
 */

import { fetchWithTimeout } from '../lib/fetchWithTimeout';

export interface ProviderHealth {
  name: string;
  tier: number;
  type: 'free_unlimited' | 'free_key' | 'paid_premium' | 'scraper';
  status: 'ONLINE' | 'DEGRADED' | 'OFFLINE' | 'UNCONFIGURED';
  latencyMs: number;
  lastChecked: string;
  errorMessage?: string;
}

export class ApiMonitorService {
  private static failureCounts: Record<string, number> = {};

  public static async checkAllProviders(): Promise<{
    providers: ProviderHealth[];
    overallStatus: 'OPTIMAL' | 'DEGRADED' | 'CRITICAL';
    activeProvidersCount: number;
    timestamp: string;
  }> {
    const results: ProviderHealth[] = [];

    // 1. Open-Meteo Weather API (100% Free, Unlimited, No Key)
    results.push(await this.pingOpenMeteo());

    // 2. TheSportsDB Open API (Tier 4 - Free Global)
    results.push(await this.pingTheSportsDb());

    // 3. OpenLigaDB (Free European/German)
    results.push(await this.pingOpenLigaDb());

    // 4. Football-Data.org
    results.push(await this.pingFootballDataOrg());

    // 5. The Odds API
    results.push(await this.pingOddsApi());

    // 6. Understat xG Engine
    results.push(await this.pingUnderstat());

    // 7. API-Football (RapidAPI)
    results.push(await this.pingApiFootball());

    // 8. ESPN Fallback (Tier 2 Free Unlimited)
    results.push(await this.pingEspn());

    const activeCount = results.filter(r => r.status === 'ONLINE').length;
    const tier1 = results.find(r => r.name.includes('API-Football'));
    const isTier1Online = tier1?.status === 'ONLINE';

    let overallStatus: 'OPTIMAL' | 'DEGRADED' | 'CRITICAL' = 'OPTIMAL';

    if (!isTier1Online) {
      overallStatus = activeCount >= 2 ? 'DEGRADED' : 'CRITICAL';
    } else {
      if (activeCount >= 4) {
        overallStatus = 'OPTIMAL';
      } else if (activeCount >= 2) {
        overallStatus = 'DEGRADED';
      } else {
        overallStatus = 'CRITICAL';
      }
    }

    return {
      providers: results,
      overallStatus,
      activeProvidersCount: activeCount,
      timestamp: new Date().toISOString(),
    };
  }

  private static async pingEspn(): Promise<ProviderHealth> {
    const start = Date.now();
    try {
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const res = await fetchWithTimeout(`https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard?dates=${today}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(4000),
      });
      const latency = Date.now() - start;
      if (res.ok) {
        return { name: 'ESPN Soccer API', tier: 2, type: 'free_unlimited', status: 'ONLINE', latencyMs: latency, lastChecked: new Date().toISOString() };
      }
      return { name: 'ESPN Soccer API', tier: 2, type: 'free_unlimited', status: 'DEGRADED', latencyMs: latency, lastChecked: new Date().toISOString(), errorMessage: `HTTP ${res.status}` };
    } catch (err: any) {
      return { name: 'ESPN Soccer API', tier: 2, type: 'free_unlimited', status: 'OFFLINE', latencyMs: Date.now() - start, lastChecked: new Date().toISOString(), errorMessage: err.message };
    }
  }

  private static async pingTheSportsDb(): Promise<ProviderHealth> {
    const start = Date.now();
    try {
      const today = new Date().toISOString().slice(0, 10);
      const res = await fetchWithTimeout(`https://www.thesportsdb.com/api/v1/json/3/eventsday.php?d=${today}&s=Soccer`, {
        signal: AbortSignal.timeout(4000),
      });
      const latency = Date.now() - start;
      if (res.ok) {
        return { name: 'TheSportsDB API', tier: 4, type: 'free_unlimited', status: 'ONLINE', latencyMs: latency, lastChecked: new Date().toISOString() };
      }
      return { name: 'TheSportsDB API', tier: 4, type: 'free_unlimited', status: 'DEGRADED', latencyMs: latency, lastChecked: new Date().toISOString(), errorMessage: `HTTP ${res.status}` };
    } catch (err: any) {
      return { name: 'TheSportsDB API', tier: 4, type: 'free_unlimited', status: 'OFFLINE', latencyMs: Date.now() - start, lastChecked: new Date().toISOString(), errorMessage: err.message };
    }
  }

  private static async pingOpenLigaDb(): Promise<ProviderHealth> {
    const start = Date.now();
    try {
      const res = await fetchWithTimeout('https://api.openligadb.de/getmatchdata/bl1/2024', {
        signal: AbortSignal.timeout(4000),
      });
      const latency = Date.now() - start;
      if (res.ok) {
        return { name: 'OpenLigaDB', tier: 4, type: 'free_unlimited', status: 'ONLINE', latencyMs: latency, lastChecked: new Date().toISOString() };
      }
      return { name: 'OpenLigaDB', tier: 4, type: 'free_unlimited', status: 'DEGRADED', latencyMs: latency, lastChecked: new Date().toISOString(), errorMessage: `HTTP ${res.status}` };
    } catch (err: any) {
      return { name: 'OpenLigaDB', tier: 4, type: 'free_unlimited', status: 'OFFLINE', latencyMs: Date.now() - start, lastChecked: new Date().toISOString(), errorMessage: err.message };
    }
  }

  private static async pingFootballDataOrg(): Promise<ProviderHealth> {
    const key = process.env.FOOTBALL_DATA_KEY;
    if (!key || key.trim() === '') {
      return { name: 'Football-Data.org', tier: 3, type: 'free_key', status: 'UNCONFIGURED', latencyMs: 0, lastChecked: new Date().toISOString(), errorMessage: 'Cheia FOOTBALL_DATA_KEY nu este setată (opțional)' };
    }
    const start = Date.now();
    try {
      const res = await fetchWithTimeout('https://api.football-data.org/v4/competitions', {
        headers: { 'X-Auth-Token': key },
        signal: AbortSignal.timeout(4000),
      });
      const latency = Date.now() - start;
      if (res.ok) {
        return { name: 'Football-Data.org', tier: 3, type: 'free_key', status: 'ONLINE', latencyMs: latency, lastChecked: new Date().toISOString() };
      }
      return { name: 'Football-Data.org', tier: 3, type: 'free_key', status: 'DEGRADED', latencyMs: latency, lastChecked: new Date().toISOString(), errorMessage: `HTTP ${res.status}` };
    } catch (err: any) {
      return { name: 'Football-Data.org', tier: 3, type: 'free_key', status: 'OFFLINE', latencyMs: Date.now() - start, lastChecked: new Date().toISOString(), errorMessage: err.message };
    }
  }

  private static async pingApiFootball(): Promise<ProviderHealth> {
    const key = process.env.API_FOOTBALL_KEY;
    if (!key || key.includes('your_api')) {
      return { name: 'API-Football (RapidAPI)', tier: 1, type: 'paid_premium', status: 'UNCONFIGURED', latencyMs: 0, lastChecked: new Date().toISOString(), errorMessage: 'Cheia API_FOOTBALL_KEY este suspendată sau neconfigurată' };
    }
    const start = Date.now();
    try {
      const res = await fetchWithTimeout('https://v3.football.api-sports.io/status', {
        headers: { 'x-apisports-key': key },
        signal: AbortSignal.timeout(4000),
      });
      const latency = Date.now() - start;
      const json = await res.json().catch(() => ({}));
      if (res.ok && (!json.errors || Object.keys(json.errors).length === 0)) {
        return { name: 'API-Football (RapidAPI)', tier: 1, type: 'paid_premium', status: 'ONLINE', latencyMs: latency, lastChecked: new Date().toISOString() };
      }
      return { name: 'API-Football (RapidAPI)', tier: 1, type: 'paid_premium', status: 'DEGRADED', latencyMs: latency, lastChecked: new Date().toISOString(), errorMessage: json.errors?.access || `HTTP ${res.status}` };
    } catch (err: any) {
      return { name: 'API-Football (RapidAPI)', tier: 1, type: 'paid_premium', status: 'OFFLINE', latencyMs: Date.now() - start, lastChecked: new Date().toISOString(), errorMessage: err.message };
    }
  }

  private static async pingOddsApi(): Promise<ProviderHealth> {
    const key = process.env.ODDS_API_KEY;
    if (!key || key.trim() === '') {
      return { name: 'The Odds API', tier: 3, type: 'free_key', status: 'UNCONFIGURED', latencyMs: 0, lastChecked: new Date().toISOString(), errorMessage: 'Cheia ODDS_API_KEY nu este setată (opțional)' };
    }
    const start = Date.now();
    try {
      const res = await fetchWithTimeout(`https://api.the-odds-api.com/v4/sports?apiKey=${key}`, {
        signal: AbortSignal.timeout(4000),
      });
      const latency = Date.now() - start;
      if (res.ok) {
        return { name: 'The Odds API', tier: 3, type: 'free_key', status: 'ONLINE', latencyMs: latency, lastChecked: new Date().toISOString() };
      }
      return { name: 'The Odds API', tier: 3, type: 'free_key', status: 'DEGRADED', latencyMs: latency, lastChecked: new Date().toISOString(), errorMessage: `HTTP ${res.status}` };
    } catch (err: any) {
      return { name: 'The Odds API', tier: 3, type: 'free_key', status: 'OFFLINE', latencyMs: Date.now() - start, lastChecked: new Date().toISOString(), errorMessage: err.message };
    }
  }

  private static async pingOpenMeteo(): Promise<ProviderHealth> {
    const start = Date.now();
    try {
      const res = await fetchWithTimeout('https://api.open-meteo.com/v1/forecast?latitude=40.4168&longitude=-3.7038&current=temperature_2m', {
        headers: { 'User-Agent': 'Mozilla/5.0 FlashStat/2.0' },
        signal: AbortSignal.timeout(4000),
      });
      const latency = Date.now() - start;
      if (res.ok) {
        return { name: 'Open-Meteo Weather API', tier: 5, type: 'free_unlimited', status: 'ONLINE', latencyMs: latency, lastChecked: new Date().toISOString() };
      }
      return { name: 'Open-Meteo Weather API', tier: 5, type: 'free_unlimited', status: 'DEGRADED', latencyMs: latency, lastChecked: new Date().toISOString(), errorMessage: `HTTP ${res.status}` };
    } catch (err: any) {
      return { name: 'Open-Meteo Weather API', tier: 5, type: 'free_unlimited', status: 'OFFLINE', latencyMs: Date.now() - start, lastChecked: new Date().toISOString(), errorMessage: err.message };
    }
  }

  private static async pingUnderstat(): Promise<ProviderHealth> {
    const start = Date.now();
    try {
      const res = await fetchWithTimeout('https://understat.com/league/EPL/2024', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
        },
        signal: AbortSignal.timeout(4000),
      });
      const latency = Date.now() - start;
      if (res.ok) {
        return { name: 'Understat xG Engine', tier: 4, type: 'scraper', status: 'ONLINE', latencyMs: latency, lastChecked: new Date().toISOString() };
      }
      return { name: 'Understat xG Engine', tier: 4, type: 'scraper', status: 'DEGRADED', latencyMs: latency, lastChecked: new Date().toISOString(), errorMessage: `HTTP ${res.status}` };
    } catch (err: any) {
      return { name: 'Understat xG Engine', tier: 4, type: 'scraper', status: 'OFFLINE', latencyMs: Date.now() - start, lastChecked: new Date().toISOString(), errorMessage: err.message };
    }
  }
}
