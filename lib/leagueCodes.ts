/**
 * FlashStat — League id to historical dataset code (lib/leagueCodes.ts)
 *
 * Maps the numeric league ids the fixture providers emit onto the league codes
 * used inside data/historical_matches.json. The code selects a team's strength
 * profile, its ELO, its H2H history, the MLE parameters and the isotonic
 * calibration curve — so an id that is missing here silently degrades every one
 * of those to a global fallback.
 *
 * This lived duplicated (and out of sync) in the two API routes.
 */

export const LEAGUE_ID_TO_CODE: Record<number, string> = {
  // --- football-data.co.uk main series ---
  39: 'E0', // Premier League
  40: 'E1', // Championship
  41: 'E2', // League One
  42: 'E3', // League Two
  140: 'SP1', // La Liga
  141: 'SP2', // Segunda División
  135: 'I1', // Serie A
  136: 'I2', // Serie B
  78: 'D1', // Bundesliga
  79: 'D2', // 2. Bundesliga
  61: 'F1', // Ligue 1
  62: 'F2', // Ligue 2
  88: 'N1', // Eredivisie
  94: 'P1', // Primeira Liga
  144: 'B1', // Jupiler Pro League
  203: 'T1', // Süper Lig
  197: 'G1', // Super League Greece
  179: 'SC0', // Scottish Premiership
  180: 'SC1', // Scottish Championship

  // --- football-data.co.uk extra series (scripts/ingestExtraLeagues.ts) ---
  283: 'RO1', // SuperLiga (Romania)
  106: 'PL1', // Ekstraklasa (Poland)
  218: 'AUT1', // Bundesliga (Austria)
  207: 'SUI1', // Super League (Switzerland)
  119: 'DEN1', // Superliga (Denmark)
  113: 'SWE1', // Allsvenskan (Sweden)
  103: 'NOR1', // Eliteserien (Norway)
  357: 'IRL1', // Premier Division (Ireland)
  244: 'FIN1', // Veikkausliiga (Finland)
  98: 'JPN1', // J1 League (Japan)
  262: 'MEX1', // Liga MX (Mexico)
  71: 'BRA1', // Brasileirão Série A
  128: 'ARG1', // Liga Profesional (Argentina)
  253: 'USA', // MLS

  // --- football-data.org ---
  2: 'UCL', // UEFA Champions League

  // --- Divisions present in the dataset with no live-provider id of their own.
  //     Ids are synthetic but stable, so per-league health metrics get a slot
  //     each instead of colliding. ---
  43: 'EC', // National League (England)
  181: 'SC2', // Scottish League One
  182: 'SC3', // Scottish League Two
};

/**
 * Inverse map: dataset code -> numeric league id.
 *
 * scripts/backtest.ts keys its per-league health report by numeric id and used a
 * short local table with `|| 999` as the fallback. Every unlisted league — 24 of
 * the 37 in the dataset — therefore shared slot 999 and silently overwrote the
 * previous one, so only a handful ever appeared in the health report.
 */
export const LEAGUE_CODE_TO_ID: Record<string, number> = Object.fromEntries(
  Object.entries(LEAGUE_ID_TO_CODE).map(([id, code]) => [code, Number(id)])
);

/**
 * Competitions the app lists but for which no historical data source has been
 * found yet. Mapping them to a code would be worse than leaving them unmapped:
 * a code with no matches behind it makes the team lookup fall back to a global
 * search across every league, which is where cross-competition mismatches come
 * from. Listed explicitly so the gap is visible rather than implied.
 */
export const LEAGUES_WITHOUT_HISTORY: Record<number, string> = {
  3: 'UEFA Europa League',
  848: 'UEFA Conference League',
  11: 'Copa Sudamericana',
  13: 'Copa Libertadores',
  45: 'FA Cup',
  48: 'EFL Cup',
  143: 'Copa del Rey',
  137: 'Coppa Italia',
  81: 'DFB-Pokal',
  66: 'Coupe de France',
};

/** Dataset code for a provider league id, or undefined when none exists. */
export function leagueCodeFor(leagueId: number): string | undefined {
  return LEAGUE_ID_TO_CODE[leagueId];
}

/** True when we knowingly have no historical data for this competition. */
export function isKnownUncoveredLeague(leagueId: number): boolean {
  return leagueId in LEAGUES_WITHOUT_HISTORY;
}
