/**
 * Configuration & Catalog of Data Sources (config/dataSources.ts)
 * 
 * Strict Architectural Principle:
 * - 'public': Can be served to frontend clients, has clear licensing or official API. (Located in `services/`)
 * - 'offline': Internal engine training, calibration, backtesting. Data NOT served directly on public endpoints. (Located in `scripts/python/` / `scripts/`)
 */

export interface DataSourceConfig {
  id: string;
  name: string;
  usage: 'offline' | 'public';
  category: 'fixtures' | 'stats' | 'odds' | 'metadata' | 'weather' | 'ratings';
  url: string;
  authRequired: boolean;
  rateLimit: string;
  description: string;
}

export const DATA_SOURCES: Record<string, DataSourceConfig> = {
  // --- Public Sources (services/) ---
  apiFootball: {
    id: 'apiFootball',
    name: 'API-Football (API-Sports)',
    usage: 'public',
    category: 'fixtures',
    url: 'https://v3.football.api-sports.io',
    authRequired: true,
    rateLimit: '100 req/day (Free tier)',
    description: 'Primary feed for live scores, fixtures, lineups, standings, events',
  },
  espn: {
    id: 'espn',
    name: 'ESPN Scoreboard Hidden API',
    usage: 'public',
    category: 'fixtures',
    url: 'https://site.api.espn.com/apis/site/v2/sports/soccer',
    authRequired: false,
    rateLimit: 'Unlimited / Standard HTTP',
    description: 'Zero-key automatic fallback for match schedules and live scores across top leagues and Liga 1 Romania',
  },
  theOddsApi: {
    id: 'theOddsApi',
    name: 'The Odds API',
    usage: 'public',
    category: 'odds',
    url: 'https://api.the-odds-api.com/v4',
    authRequired: true,
    rateLimit: '500 req/month (Free tier)',
    description: 'Bookmaker betting odds provider (1X2, Over/Under, BTTS)',
  },
  betfairPublic: {
    id: 'betfairPublic',
    name: 'Betfair Exchange API',
    usage: 'public',
    category: 'odds',
    url: 'https://developer.betfair.com',
    authRequired: true,
    rateLimit: 'Standard Exchange API tier',
    description: 'Market exchange true probabilities without bookmaker margin',
  },
  footballDataOrg: {
    id: 'footballDataOrg',
    name: 'Football-Data.org',
    usage: 'public',
    category: 'fixtures',
    url: 'https://api.football-data.org/v4',
    authRequired: true,
    rateLimit: '10 req/min (Free tier)',
    description: 'Top European leagues fixtures and standings',
  },
  footballDataCoUk: {
    id: 'footballDataCoUk',
    name: 'Football-Data.co.uk',
    usage: 'public',
    category: 'stats',
    url: 'https://www.football-data.co.uk',
    authRequired: false,
    rateLimit: 'Public CSV archive',
    description: 'Historical match datasets (45,000+ matches across 22 European leagues)',
  },
  wikidata: {
    id: 'wikidata',
    name: 'Wikidata SPARQL',
    usage: 'public',
    category: 'metadata',
    url: 'https://query.wikidata.org/sparql',
    authRequired: false,
    rateLimit: 'Custom User-Agent header',
    description: 'Stadium coordinates, capacities, elevations, travel distance calculations',
  },
  openfootball: {
    id: 'openfootball',
    name: 'openfootball Data',
    usage: 'public',
    category: 'metadata',
    url: 'https://github.com/openfootball',
    authRequired: false,
    rateLimit: 'GitHub Raw Content',
    description: 'Public domain schedules, teams, and tournament metadata',
  },
  clubElo: {
    id: 'clubElo',
    name: 'ClubElo API',
    usage: 'public',
    category: 'ratings',
    url: 'http://api.clubelo.com',
    authRequired: false,
    rateLimit: 'Public CSV feed',
    description: 'European club Elo strength ratings',
  },
  openMeteo: {
    id: 'openMeteo',
    name: 'Open-Meteo Weather API',
    usage: 'public',
    category: 'weather',
    url: 'https://api.open-meteo.com',
    authRequired: false,
    rateLimit: '10,000 req/day (Free tier, no key)',
    description: 'Stadium weather conditions (rain, wind, temperature)',
  },
  sportmonks: {
    id: 'sportmonks',
    name: 'Sportmonks Free Plan',
    usage: 'public',
    category: 'stats',
    url: 'https://www.sportmonks.com',
    authRequired: true,
    rateLimit: 'Free tier (Danish Superliga & Scottish Premiership)',
    description: 'Detailed match event testing and ball-coordinate telemetry',
  },

  // --- Offline Sources (scripts/python/ & scripts/) ---
  fbref: {
    id: 'fbref',
    name: 'FBref (via soccerdata)',
    usage: 'offline',
    category: 'stats',
    url: 'https://fbref.com',
    authRequired: false,
    rateLimit: '~1 req / 3 sec (managed by soccerdata)',
    description: 'Deep xG, xA, corners, cards, fouls, progressive passes for model training & calibration',
  },
  sofascore: {
    id: 'sofascore',
    name: 'Sofascore (via soccerdata / offline scripts)',
    usage: 'offline',
    category: 'stats',
    url: 'https://sofascore.com',
    authRequired: false,
    rateLimit: 'Managed by scraper',
    description: 'Lower leagues & secondary division deep statistics',
  },
  statsbomb: {
    id: 'statsbomb',
    name: 'StatsBomb Open Data',
    usage: 'offline',
    category: 'stats',
    url: 'https://github.com/statsbomb/open-data',
    authRequired: false,
    rateLimit: 'GitHub Raw / Git clone',
    description: 'Ground truth event-level data for validating custom xG calculations',
  },
  transfermarkt: {
    id: 'transfermarkt',
    name: 'Transfermarkt',
    usage: 'offline',
    category: 'ratings',
    url: 'https://transfermarkt.com',
    authRequired: false,
    rateLimit: 'Managed by scraper',
    description: 'Squad market valuations, early-season strength priors, injury/suspension tracking',
  },
  betfairHistorical: {
    id: 'betfairHistorical',
    name: 'Betfair Historical Price Archive',
    usage: 'offline',
    category: 'odds',
    url: 'https://historicdata.betfair.com',
    authRequired: true,
    rateLimit: 'Batch file downloads',
    description: 'Full tick-by-tick closing line archive for rigorous CLV backtesting',
  },
};
