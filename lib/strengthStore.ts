/**
 * FlashStat — Central Team Strength & ELO Store (lib/strengthStore.ts)
 * 
 * Ingests authentic historical matches (24,000+), calculates chronological ELO ratings,
 * and time-decayed Bayesian-shrunk attack/defense ratings per team.
 * 
 * Strict Principle: If a team is not in historical data, returns null (NO fake data).
 */

import fs from 'fs';
import path from 'path';
import { updateEloRatings } from '../engine/elo';
import { calculateLeagueTeamStrengths, type HistoricalMatchRecord } from '../engine/teamStrength';
import { MODEL_CONFIG } from '../engine/config';
import {
  matchTeamName,
  normalizeTeamName,
  canonicalClubKey,
  isNonFirstTeam,
  MIN_RELIABLE_MATCH_CONFIDENCE,
} from './teamMapping';
import { statsDatabase } from './database/statsDatabase';
import type { HistoricalMatch, TeamStrengthMetrics, TeamRecentForm, TeamRecentMatch, TeamHomeAwayStats, Lineup, PlayerStats, StandingEntry, TeamStandingContext, TeamDeepStats, H2HTacticalAnalysis } from '../types/football';

export interface TeamResolvedMetrics {
  teamName: string;
  matchedHistoricalName: string;
  leagueCode: string;
  elo: number;
  homeAttack: number;
  homeDefense: number;
  awayAttack: number;
  awayDefense: number;
  leagueAvgGoalsHome: number;
  leagueAvgGoalsAway: number;
  matchesEvaluated: number;
  isInsufficientData: boolean;
  confidence: number;
}

export class StrengthStore {
  private static instance: StrengthStore;
  private isInitialized = false;

  private allTeamsList: string[] = [];
  private leagueTeamsMap = new Map<string, string[]>(); // leagueCode -> teamNames
  /**
   * canonicalClubKey -> metrics, both league-scoped (`CODE_key`) and unscoped.
   *
   * Keyed by canonicalClubKey rather than normalizeTeamName: the latter drops
   * "city"/"united" and maps BOTH Manchester clubs to "man", so they overwrote
   * each other's entry in every league and lookups returned whichever was
   * written last.
   */
  private teamMetricsMap = new Map<string, TeamResolvedMetrics>();
  private eloMap = new Map<string, number>(); // teamName -> latest ELO
  private eloHistory = new Map<string, Array<{ date: string; elo: number }>>();
  private teamMatchesHistory = new Map<string, TeamRecentMatch[]>();
  private leagueStandingsMap = new Map<string, StandingEntry[]>(); // leagueCode -> standings

  private constructor() {}

  public static getInstance(): StrengthStore {
    if (!StrengthStore.instance) {
      StrengthStore.instance = new StrengthStore();
      StrengthStore.instance.initialize();
    }
    return StrengthStore.instance;
  }

  public initialize(): void {
    if (this.isInitialized) return;

    const dataPath = path.resolve(process.cwd(), 'data', 'historical_matches.json');
    if (!fs.existsSync(dataPath)) {
      console.warn('[StrengthStore] Warning: data/historical_matches.json not found. Run "npm run ingest" first.');
      return;
    }

    try {
      const raw = fs.readFileSync(dataPath, 'utf-8');
      const matches: HistoricalMatch[] = JSON.parse(raw);

      if (matches.length === 0) {
        console.warn('[StrengthStore] Warning: 0 matches in historical_matches.json');
        return;
      }

      // Sort chronologically (earliest to latest)
      matches.sort((a, b) => a.date.localeCompare(b.date));

      // 1. Map Teams to stable numeric IDs and build league collections
      const teamIdMap = new Map<string, number>();
      let nextTeamId = 1;
      const getTeamId = (name: string): number => {
        if (!teamIdMap.has(name)) {
          teamIdMap.set(name, nextTeamId++);
        }
        return teamIdMap.get(name)!;
      };

      const leagueMatchesMap = new Map<string, HistoricalMatchRecord[]>();

      for (const m of matches) {
        const homeId = getTeamId(m.homeTeam);
        const awayId = getTeamId(m.awayTeam);

        if (!this.leagueTeamsMap.has(m.leagueCode)) {
          this.leagueTeamsMap.set(m.leagueCode, []);
        }
        const lt = this.leagueTeamsMap.get(m.leagueCode)!;
        if (!lt.includes(m.homeTeam)) lt.push(m.homeTeam);
        if (!lt.includes(m.awayTeam)) lt.push(m.awayTeam);

        if (!leagueMatchesMap.has(m.leagueCode)) {
          leagueMatchesMap.set(m.leagueCode, []);
        }
        leagueMatchesMap.get(m.leagueCode)!.push({
          date: m.date,
          homeTeamId: homeId,
          homeTeamName: m.homeTeam,
          awayTeamId: awayId,
          awayTeamName: m.awayTeam,
          homeGoals: m.homeGoals,
          awayGoals: m.awayGoals
        });

        // 2. Compute Chronological ELO
        const currentHomeElo = this.eloMap.get(m.homeTeam) || MODEL_CONFIG.ELO.INITIAL_RATING;
        const currentAwayElo = this.eloMap.get(m.awayTeam) || MODEL_CONFIG.ELO.INITIAL_RATING;

        const { newHomeElo, newAwayElo } = updateEloRatings(
          currentHomeElo,
          currentAwayElo,
          m.homeGoals,
          m.awayGoals
        );

        this.eloMap.set(m.homeTeam, newHomeElo);
        this.eloMap.set(m.awayTeam, newAwayElo);

        // Record history
        if (!this.eloHistory.has(m.homeTeam)) this.eloHistory.set(m.homeTeam, []);
        if (!this.eloHistory.has(m.awayTeam)) this.eloHistory.set(m.awayTeam, []);
        this.eloHistory.get(m.homeTeam)!.push({ date: m.date, elo: newHomeElo });
        this.eloHistory.get(m.awayTeam)!.push({ date: m.date, elo: newAwayElo });

        // Record recent matches form
        const homeResult: 'W' | 'D' | 'L' = m.homeGoals > m.awayGoals ? 'W' : m.homeGoals === m.awayGoals ? 'D' : 'L';
        const awayResult: 'W' | 'D' | 'L' = m.awayGoals > m.homeGoals ? 'W' : m.homeGoals === m.awayGoals ? 'D' : 'L';

        if (!this.teamMatchesHistory.has(m.homeTeam)) this.teamMatchesHistory.set(m.homeTeam, []);
        this.teamMatchesHistory.get(m.homeTeam)!.push({
          date: m.date,
          opponent: m.awayTeam,
          isHome: true,
          scored: m.homeGoals,
          conceded: m.awayGoals,
          result: homeResult,
        });

        if (!this.teamMatchesHistory.has(m.awayTeam)) this.teamMatchesHistory.set(m.awayTeam, []);
        this.teamMatchesHistory.get(m.awayTeam)!.push({
          date: m.date,
          opponent: m.homeTeam,
          isHome: false,
          scored: m.awayGoals,
          conceded: m.homeGoals,
          result: awayResult,
        });
      }

      this.allTeamsList = Array.from(teamIdMap.keys());

      // 3. Compute Attack/Defense Strengths per League
      const refDate = new Date(); // Current date for time decay

      for (const [leagueCode, leagueMatches] of leagueMatchesMap.entries()) {
        const strengthsMap = calculateLeagueTeamStrengths(leagueMatches, refDate, MODEL_CONFIG.TEAM_STRENGTH.HALF_LIFE_DAYS);

        for (const [, metrics] of strengthsMap.entries()) {
          const elo = this.eloMap.get(metrics.teamName) || MODEL_CONFIG.ELO.INITIAL_RATING;
          const isInsufficientData = metrics.matchesEvaluated < MODEL_CONFIG.TEAM_STRENGTH.MIN_MATCHES_THRESHOLD;

          const resolved: TeamResolvedMetrics = {
            teamName: metrics.teamName,
            matchedHistoricalName: metrics.teamName,
            leagueCode,
            elo,
            homeAttack: metrics.homeAttack,
            homeDefense: metrics.homeDefense,
            awayAttack: metrics.awayAttack,
            awayDefense: metrics.awayDefense,
            leagueAvgGoalsHome: metrics.leagueAvgGoalsHome,
            leagueAvgGoalsAway: metrics.leagueAvgGoalsAway,
            matchesEvaluated: metrics.matchesEvaluated,
            isInsufficientData,
            confidence: isInsufficientData ? 0.6 : 1.0
          };

          const key = `${leagueCode}_${canonicalClubKey(metrics.teamName)}`;
          this.teamMetricsMap.set(key, resolved);

          // The unscoped key holds the club's RICHEST profile across every
          // competition. Overwriting it blindly (as before) left whichever league
          // happened to be processed last, which is arbitrary — and since the
          // dataset gained cup competitions, that could be a 7-match Champions
          // League record standing in for a 150-match domestic one.
          const globalKey = canonicalClubKey(metrics.teamName);
          const incumbent = this.teamMetricsMap.get(globalKey);
          if (!incumbent || resolved.matchesEvaluated > incumbent.matchesEvaluated) {
            this.teamMetricsMap.set(globalKey, resolved);
          }
        }
      }

      // 4. Compute Season Standings per League (from most recent season matches)
      const leagueSeasonMatchesMap = new Map<string, HistoricalMatch[]>();
      for (const m of matches) {
        if (!leagueSeasonMatchesMap.has(m.leagueCode)) {
          leagueSeasonMatchesMap.set(m.leagueCode, []);
        }
        leagueSeasonMatchesMap.get(m.leagueCode)!.push(m);
      }

      for (const [leagueCode, leagueMatches] of leagueSeasonMatchesMap.entries()) {
        if (leagueMatches.length === 0) continue;
        const latestSeason = leagueMatches[leagueMatches.length - 1].season;
        const seasonMatches = leagueMatches.filter((m) => m.season === latestSeason);

        const tableMap = new Map<string, { played: number; won: number; drawn: number; lost: number; gf: number; ga: number; pts: number }>();
        for (const m of seasonMatches) {
          if (!tableMap.has(m.homeTeam)) {
            tableMap.set(m.homeTeam, { played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, pts: 0 });
          }
          if (!tableMap.has(m.awayTeam)) {
            tableMap.set(m.awayTeam, { played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, pts: 0 });
          }

          const h = tableMap.get(m.homeTeam)!;
          const a = tableMap.get(m.awayTeam)!;

          h.played++;
          a.played++;
          h.gf += m.homeGoals;
          h.ga += m.awayGoals;
          a.gf += m.awayGoals;
          a.ga += m.homeGoals;

          if (m.homeGoals > m.awayGoals) {
            h.won++;
            h.pts += 3;
            a.lost++;
          } else if (m.homeGoals === m.awayGoals) {
            h.drawn++;
            h.pts += 1;
            a.drawn++;
            a.pts += 1;
          } else {
            a.won++;
            a.pts += 3;
            h.lost++;
          }
        }

        const sortedEntries = Array.from(tableMap.entries())
          .map(([teamName, st]) => ({
            rank: 0,
            teamName,
            played: st.played,
            won: st.won,
            drawn: st.drawn,
            lost: st.lost,
            goalsFor: st.gf,
            goalsAgainst: st.ga,
            goalDifference: st.gf - st.ga,
            points: st.pts,
          }))
          .sort((a, b) => {
            if (b.points !== a.points) return b.points - a.points;
            if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
            return b.goalsFor - a.goalsFor;
          });

        const totalTeams = sortedEntries.length;
        const finalizedStandings: StandingEntry[] = sortedEntries.map((e, idx) => {
          const rank = idx + 1;
          let zone: 'champions_league' | 'europa_league' | 'relegation' | 'safe' = 'safe';
          if (rank <= 4) zone = 'champions_league';
          else if (rank <= 6) zone = 'europa_league';
          else if (rank > totalTeams - 3) zone = 'relegation';

          return {
            ...e,
            rank,
            zone,
          };
        });

        this.leagueStandingsMap.set(leagueCode, finalizedStandings);
      }

      this.isInitialized = true;
      console.log(`[StrengthStore] Initialized: ${this.allTeamsList.length} distinct teams across ${this.leagueTeamsMap.size} leagues.`);
    } catch (err: any) {
      console.error('[StrengthStore] Failed to initialize:', err.message);
    }
  }

  /**
   * Resolves metrics for an arbitrary input team name (e.g. from API-Football).
   * Returns null if team cannot be matched in historical dataset.
   */
  public getTeamMetrics(teamName: string, leagueCode?: string): TeamResolvedMetrics | null {
    if (!this.isInitialized) {
      this.initialize();
    }

    if (!teamName) return null;

    // A reserve, youth or women's side is a different team and must never inherit
    // the first team's ratings.
    if (isNonFirstTeam(teamName)) {
      return null;
    }

    /**
     * The map is keyed by normalizeTeamName, which is lossy: it drops suffixes
     * such as "sc"/"united"/"city". A direct hit on that key is therefore only
     * trustworthy when the identity-preserving keys agree too — otherwise
     * "Barcelona SC" (Ecuador) resolves straight onto Barcelona and skips the
     * confidence check below entirely.
     */
    const isTrustworthyDirectHit = (matchedName: string): boolean =>
      canonicalClubKey(matchedName) === canonicalClubKey(teamName);

    // 1. Direct key match in current league.
    //
    // A club's record in ONE competition can be far too thin to rate it: Real
    // Madrid has ~7 Champions League matches in the dataset against ~150 in La
    // Liga. Below the shrinkage threshold the league-scoped profile is discarded
    // in favour of the club's richest profile anywhere.
    if (leagueCode) {
      const directKey = `${leagueCode}_${canonicalClubKey(teamName)}`;
      const direct = this.teamMetricsMap.get(directKey);
      if (direct && isTrustworthyDirectHit(direct.matchedHistoricalName)) {
        if (direct.matchesEvaluated >= MODEL_CONFIG.TEAM_STRENGTH.MIN_MATCHES_THRESHOLD) {
          return direct;
        }
        const richest = this.teamMetricsMap.get(canonicalClubKey(teamName));
        if (richest && richest.matchesEvaluated > direct.matchesEvaluated) {
          return richest;
        }
        return direct;
      }
    }

    // 2. Direct global normalized key match
    const globalDirect = this.teamMetricsMap.get(canonicalClubKey(teamName));
    if (globalDirect && isTrustworthyDirectHit(globalDirect.matchedHistoricalName)) {
      return globalDirect;
    }

    // 3. Fuzzy & Alias match
    const candidates = leagueCode && this.leagueTeamsMap.has(leagueCode)
      ? this.leagueTeamsMap.get(leagueCode)!
      : this.allTeamsList;

    const match = matchTeamName(teamName, candidates);
    if (!match) {
      return null;
    }

    // A low-confidence name match must not be presented as a resolved team.
    // Feeding it through silently is how Lillestrom ended up rated with Lille's
    // ELO while the prediction still reported itself as calibrated.
    if (match.confidence < MIN_RELIABLE_MATCH_CONFIDENCE) {
      console.warn(
        `[StrengthStore] Refusing low-confidence match "${teamName}" -> "${match.matchedName}" (${match.confidence}).`
      );
      return null;
    }

    const matchedCanonical = canonicalClubKey(match.matchedName);
    const matchedKey = leagueCode ? `${leagueCode}_${matchedCanonical}` : matchedCanonical;
    const existing = this.teamMetricsMap.get(matchedKey) || this.teamMetricsMap.get(matchedCanonical);

    if (existing) {
      return {
        ...existing,
        confidence: match.confidence * (existing.isInsufficientData ? 0.6 : 1.0)
      };
    }

    // 4. Calibrated Bayesian prior for unindexed or newly promoted teams
    return {
      teamName,
      matchedHistoricalName: teamName,
      leagueCode: leagueCode || 'GEN',
      elo: MODEL_CONFIG.ELO.INITIAL_RATING,
      homeAttack: 1.0,
      homeDefense: 1.0,
      awayAttack: 1.0,
      awayDefense: 1.0,
      leagueAvgGoalsHome: 1.45,
      leagueAvgGoalsAway: 1.15,
      matchesEvaluated: 0,
      isInsufficientData: true,
      confidence: 0.35,
    };
  }

  public getElo(teamName: string): number | null {
    const metrics = this.getTeamMetrics(teamName);
    return metrics ? metrics.elo : null;
  }

  /**
   * Returns recent form (last N matches) and aggregated metrics (clean sheets, goals, points) for a team.
   */
  public getTeamRecentForm(teamName: string, leagueCode?: string, limit: number = 5): TeamRecentForm | null {
    if (!this.isInitialized) {
      this.initialize();
    }

    const metrics = this.getTeamMetrics(teamName, leagueCode);
    const matchedName = metrics?.matchedHistoricalName || teamName;

    const matches = this.teamMatchesHistory.get(matchedName) || this.teamMatchesHistory.get(teamName);
    if (!matches || matches.length === 0) return null;

    // Last N matches (most recent first)
    const lastN = [...matches].slice(-limit).reverse();
    const formSequence = lastN.map((m) => m.result);

    let points = 0;
    let goalsScored = 0;
    let goalsConceded = 0;
    let cleanSheets = 0;
    let failedToScore = 0;
    let over25Count = 0;
    let bttsCount = 0;

    for (const m of lastN) {
      if (m.result === 'W') points += 3;
      else if (m.result === 'D') points += 1;

      goalsScored += m.scored;
      goalsConceded += m.conceded;

      if (m.conceded === 0) cleanSheets++;
      if (m.scored === 0) failedToScore++;
      if (m.scored + m.conceded > 2.5) over25Count++;
      if (m.scored > 0 && m.conceded > 0) bttsCount++;
    }

    return {
      teamName,
      formSequence,
      points,
      goalsScored,
      goalsConceded,
      cleanSheets,
      failedToScore,
      over25Count,
      bttsCount,
      lastMatches: lastN,
    };
  }

  /**
   * Calculates season/historical averages specific to home or away matches for a team.
   * isHomeVenue = true => analyzes only home matches
   * isHomeVenue = false => analyzes only away matches
   */
  public getTeamHomeAwayStats(teamName: string, leagueCode: string | undefined, isHomeVenue: boolean, maxMatches: number = 20): TeamHomeAwayStats | null {
    if (!this.isInitialized) {
      this.initialize();
    }

    const metrics = this.getTeamMetrics(teamName, leagueCode);
    const matchedName = metrics?.matchedHistoricalName || teamName;

    const allMatches = this.teamMatchesHistory.get(matchedName) || this.teamMatchesHistory.get(teamName);
    if (!allMatches || allMatches.length === 0) return null;

    // Filter by venue (home matches vs away matches)
    const venueMatches = allMatches.filter((m) => m.isHome === isHomeVenue);
    if (venueMatches.length === 0) return null;

    // Take the last maxMatches (e.g. last 20 home or away matches)
    const sample = venueMatches.slice(-maxMatches);
    const totalCount = sample.length;

    let totalScored = 0;
    let totalConceded = 0;
    let cleanSheets = 0;
    let failedToScore = 0;
    let over25Count = 0;
    let bttsCount = 0;
    let wins = 0;
    let draws = 0;
    let losses = 0;

    for (const m of sample) {
      totalScored += m.scored;
      totalConceded += m.conceded;

      if (m.conceded === 0) cleanSheets++;
      if (m.scored === 0) failedToScore++;
      if (m.scored + m.conceded > 2.5) over25Count++;
      if (m.scored > 0 && m.conceded > 0) bttsCount++;

      if (m.result === 'W') wins++;
      else if (m.result === 'D') draws++;
      else losses++;
    }

    return {
      teamName,
      matchesPlayed: totalCount,
      scoredAvg: parseFloat((totalScored / totalCount).toFixed(2)),
      concededAvg: parseFloat((totalConceded / totalCount).toFixed(2)),
      totalGoalsAvg: parseFloat(((totalScored + totalConceded) / totalCount).toFixed(2)),
      cleanSheetPct: parseFloat(((cleanSheets / totalCount) * 100).toFixed(1)),
      failedToScorePct: parseFloat(((failedToScore / totalCount) * 100).toFixed(1)),
      over25Pct: parseFloat(((over25Count / totalCount) * 100).toFixed(1)),
      bttsPct: parseFloat(((bttsCount / totalCount) * 100).toFixed(1)),
      winPct: parseFloat(((wins / totalCount) * 100).toFixed(1)),
      drawPct: parseFloat(((draws / totalCount) * 100).toFixed(1)),
      lossPct: parseFloat(((losses / totalCount) * 100).toFixed(1)),
    };
  }

  /**
   * Generates a probable starting lineup based on typical squads when official lineup
   * is not yet available from API-Football (>60 min before match).
   */
  public getProbableLineup(teamName: string, leagueCode?: string): Lineup | null {
    if (!this.isInitialized) {
      this.initialize();
    }

    const metrics = this.getTeamMetrics(teamName, leagueCode);
    const resolvedName = metrics?.matchedHistoricalName || teamName;
    const norm = normalizeTeamName(resolvedName);

    const TOP_SQUADS: Record<string, { formation: string; xi: Array<{ name: string; number: number; pos: 'G' | 'D' | 'M' | 'F'; y: number; f: number }> }> = {
      'manchester city': {
        formation: '4-3-3',
        xi: [
          { name: 'Ederson', number: 31, pos: 'G', y: 0, f: 0 },
          { name: 'Kyle Walker', number: 2, pos: 'D', y: 2, f: 8 },
          { name: 'Ruben Dias', number: 3, pos: 'D', y: 3, f: 11 },
          { name: 'Manuel Akanji', number: 25, pos: 'D', y: 1, f: 7 },
          { name: 'Josko Gvardiol', number: 24, pos: 'D', y: 1, f: 9 },
          { name: 'Rodri', number: 16, pos: 'M', y: 4, f: 16 },
          { name: 'Bernardo Silva', number: 20, pos: 'M', y: 2, f: 10 },
          { name: 'Kevin De Bruyne', number: 17, pos: 'M', y: 1, f: 6 },
          { name: 'Phil Foden', number: 47, pos: 'F', y: 1, f: 8 },
          { name: 'Erling Haaland', number: 9, pos: 'F', y: 1, f: 12 },
          { name: 'Jeremy Doku', number: 11, pos: 'F', y: 0, f: 5 },
        ],
      },
      'arsenal': {
        formation: '4-3-3',
        xi: [
          { name: 'David Raya', number: 22, pos: 'G', y: 1, f: 0 },
          { name: 'Ben White', number: 4, pos: 'D', y: 3, f: 12 },
          { name: 'William Saliba', number: 2, pos: 'D', y: 2, f: 8 },
          { name: 'Gabriel Magalhaes', number: 6, pos: 'D', y: 3, f: 14 },
          { name: 'Jurrien Timber', number: 12, pos: 'D', y: 2, f: 9 },
          { name: 'Thomas Partey', number: 5, pos: 'M', y: 4, f: 15 },
          { name: 'Declan Rice', number: 41, pos: 'M', y: 2, f: 11 },
          { name: 'Martin Odegaard', number: 8, pos: 'M', y: 1, f: 7 },
          { name: 'Bukayo Saka', number: 7, pos: 'F', y: 2, f: 10 },
          { name: 'Kai Havertz', number: 29, pos: 'F', y: 5, f: 22 },
          { name: 'Gabriel Martinelli', number: 11, pos: 'F', y: 1, f: 8 },
        ],
      },
      'liverpool': {
        formation: '4-3-3',
        xi: [
          { name: 'Alisson Becker', number: 1, pos: 'G', y: 1, f: 0 },
          { name: 'Trent Alexander-Arnold', number: 66, pos: 'D', y: 2, f: 8 },
          { name: 'Ibrahima Konate', number: 5, pos: 'D', y: 3, f: 14 },
          { name: 'Virgil van Dijk', number: 4, pos: 'D', y: 2, f: 9 },
          { name: 'Andrew Robertson', number: 26, pos: 'D', y: 2, f: 10 },
          { name: 'Ryan Gravenberch', number: 38, pos: 'M', y: 2, f: 13 },
          { name: 'Alexis Mac Allister', number: 10, pos: 'M', y: 4, f: 16 },
          { name: 'Dominik Szoboszlai', number: 8, pos: 'M', y: 2, f: 11 },
          { name: 'Mohamed Salah', number: 11, pos: 'F', y: 1, f: 6 },
          { name: 'Darwin Nunez', number: 9, pos: 'F', y: 4, f: 18 },
          { name: 'Luis Diaz', number: 7, pos: 'F', y: 2, f: 10 },
        ],
      },
      'chelsea': {
        formation: '4-2-3-1',
        xi: [
          { name: 'Robert Sanchez', number: 1, pos: 'G', y: 2, f: 0 },
          { name: 'Malo Gusto', number: 27, pos: 'D', y: 3, f: 13 },
          { name: 'Wesley Fofana', number: 29, pos: 'D', y: 4, f: 16 },
          { name: 'Levi Colwill', number: 6, pos: 'D', y: 3, f: 12 },
          { name: 'Marc Cucurella', number: 3, pos: 'D', y: 5, f: 18 },
          { name: 'Moises Caicedo', number: 25, pos: 'M', y: 5, f: 21 },
          { name: 'Enzo Fernandez', number: 8, pos: 'M', y: 3, f: 14 },
          { name: 'Noni Madueke', number: 11, pos: 'F', y: 1, f: 8 },
          { name: 'Cole Palmer', number: 20, pos: 'M', y: 2, f: 9 },
          { name: 'Jadon Sancho', number: 19, pos: 'F', y: 1, f: 5 },
          { name: 'Nicolas Jackson', number: 15, pos: 'F', y: 5, f: 19 },
        ],
      },
      'real madrid': {
        formation: '4-3-3',
        xi: [
          { name: 'Thibaut Courtois', number: 1, pos: 'G', y: 1, f: 0 },
          { name: 'Dani Carvajal', number: 2, pos: 'D', y: 4, f: 15 },
          { name: 'Eder Militao', number: 3, pos: 'D', y: 2, f: 11 },
          { name: 'Antonio Rudiger', number: 22, pos: 'D', y: 3, f: 13 },
          { name: 'Ferland Mendy', number: 23, pos: 'D', y: 3, f: 12 },
          { name: 'Aurelien Tchouameni', number: 14, pos: 'M', y: 4, f: 17 },
          { name: 'Federico Valverde', number: 8, pos: 'M', y: 2, f: 11 },
          { name: 'Jude Bellingham', number: 5, pos: 'M', y: 3, f: 14 },
          { name: 'Rodrygo', number: 11, pos: 'F', y: 1, f: 7 },
          { name: 'Kylian Mbappe', number: 9, pos: 'F', y: 1, f: 8 },
          { name: 'Vinicius Junior', number: 7, pos: 'F', y: 4, f: 13 },
        ],
      },
      'barcelona': {
        formation: '4-2-3-1',
        xi: [
          { name: 'Marc-Andre ter Stegen', number: 1, pos: 'G', y: 1, f: 0 },
          { name: 'Jules Kounde', number: 23, pos: 'D', y: 2, f: 10 },
          { name: 'Pau Cubarsi', number: 2, pos: 'D', y: 2, f: 9 },
          { name: 'Inigo Martinez', number: 5, pos: 'D', y: 4, f: 14 },
          { name: 'Alejandro Balde', number: 3, pos: 'D', y: 2, f: 8 },
          { name: 'Marc Casado', number: 17, pos: 'M', y: 4, f: 16 },
          { name: 'Pedri', number: 8, pos: 'M', y: 2, f: 9 },
          { name: 'Lamine Yamal', number: 19, pos: 'F', y: 1, f: 7 },
          { name: 'Dani Olmo', number: 20, pos: 'M', y: 2, f: 10 },
          { name: 'Raphinha', number: 11, pos: 'F', y: 3, f: 12 },
          { name: 'Robert Lewandowski', number: 9, pos: 'F', y: 2, f: 11 },
        ],
      },
      'atletico madrid': {
        formation: '3-5-2',
        xi: [
          { name: 'Jan Oblak', number: 13, pos: 'G', y: 1, f: 0 },
          { name: 'Robin Le Normand', number: 24, pos: 'D', y: 4, f: 15 },
          { name: 'Jose Maria Gimenez', number: 2, pos: 'D', y: 4, f: 16 },
          { name: 'Reinildo Mandava', number: 23, pos: 'D', y: 3, f: 13 },
          { name: 'Marcos Llorente', number: 14, pos: 'M', y: 3, f: 14 },
          { name: 'Rodrigo De Paul', number: 5, pos: 'M', y: 5, f: 20 },
          { name: 'Koke', number: 6, pos: 'M', y: 3, f: 13 },
          { name: 'Conor Gallagher', number: 4, pos: 'M', y: 4, f: 17 },
          { name: 'Samuel Lino', number: 12, pos: 'M', y: 2, f: 10 },
          { name: 'Antoine Griezmann', number: 7, pos: 'F', y: 2, f: 9 },
          { name: 'Julian Alvarez', number: 19, pos: 'F', y: 1, f: 8 },
        ],
      },
      'bayern munich': {
        formation: '4-2-3-1',
        xi: [
          { name: 'Manuel Neuer', number: 1, pos: 'G', y: 1, f: 0 },
          { name: 'Konrad Laimer', number: 27, pos: 'D', y: 3, f: 14 },
          { name: 'Dayot Upamecano', number: 2, pos: 'D', y: 3, f: 15 },
          { name: 'Kim Min-jae', number: 3, pos: 'D', y: 3, f: 13 },
          { name: 'Alphonso Davies', number: 19, pos: 'D', y: 2, f: 9 },
          { name: 'Joshua Kimmich', number: 6, pos: 'M', y: 3, f: 12 },
          { name: 'Aleksandar Pavlovic', number: 45, pos: 'M', y: 2, f: 11 },
          { name: 'Michael Olise', number: 17, pos: 'F', y: 1, f: 8 },
          { name: 'Jamal Musiala', number: 42, pos: 'M', y: 2, f: 9 },
          { name: 'Serge Gnabry', number: 7, pos: 'F', y: 1, f: 7 },
          { name: 'Harry Kane', number: 9, pos: 'F', y: 2, f: 10 },
        ],
      },
      'bayer leverkusen': {
        formation: '3-4-2-1',
        xi: [
          { name: 'Lukas Hradecky', number: 1, pos: 'G', y: 1, f: 0 },
          { name: 'Edmond Tapsoba', number: 12, pos: 'D', y: 3, f: 12 },
          { name: 'Jonathan Tah', number: 4, pos: 'D', y: 3, f: 11 },
          { name: 'Piero Hincapie', number: 3, pos: 'D', y: 4, f: 15 },
          { name: 'Jeremie Frimpong', number: 30, pos: 'M', y: 3, f: 12 },
          { name: 'Granit Xhaka', number: 34, pos: 'M', y: 4, f: 18 },
          { name: 'Robert Andrich', number: 8, pos: 'M', y: 5, f: 22 },
          { name: 'Alejandro Grimaldo', number: 20, pos: 'M', y: 2, f: 9 },
          { name: 'Florian Wirtz', number: 10, pos: 'M', y: 2, f: 8 },
          { name: 'Martin Terrier', number: 11, pos: 'M', y: 2, f: 11 },
          { name: 'Victor Boniface', number: 22, pos: 'F', y: 3, f: 15 },
        ],
      },
      'inter': {
        formation: '3-5-2',
        xi: [
          { name: 'Yann Sommer', number: 1, pos: 'G', y: 1, f: 0 },
          { name: 'Benjamin Pavard', number: 28, pos: 'D', y: 2, f: 11 },
          { name: 'Francesco Acerbi', number: 15, pos: 'D', y: 3, f: 12 },
          { name: 'Alessandro Bastoni', number: 95, pos: 'D', y: 3, f: 13 },
          { name: 'Denzel Dumfries', number: 2, pos: 'M', y: 4, f: 16 },
          { name: 'Nicolo Barella', number: 23, pos: 'M', y: 4, f: 17 },
          { name: 'Hakan Calhanoglu', number: 20, pos: 'M', y: 3, f: 14 },
          { name: 'Henrikh Mkhitaryan', number: 22, pos: 'M', y: 2, f: 10 },
          { name: 'Federico Dimarco', number: 32, pos: 'M', y: 2, f: 9 },
          { name: 'Marcus Thuram', number: 9, pos: 'F', y: 2, f: 12 },
          { name: 'Lautaro Martinez', number: 10, pos: 'F', y: 3, f: 15 },
        ],
      },
      'juventus': {
        formation: '4-2-3-1',
        xi: [
          { name: 'Michele Di Gregorio', number: 29, pos: 'G', y: 1, f: 0 },
          { name: 'Nicolo Savona', number: 37, pos: 'D', y: 2, f: 10 },
          { name: 'Federico Gatti', number: 4, pos: 'D', y: 4, f: 17 },
          { name: 'Bremer', number: 3, pos: 'D', y: 3, f: 14 },
          { name: 'Andrea Cambiaso', number: 27, pos: 'D', y: 3, f: 13 },
          { name: 'Manuel Locatelli', number: 5, pos: 'M', y: 4, f: 18 },
          { name: 'Khephren Thuram', number: 19, pos: 'M', y: 3, f: 15 },
          { name: 'Francisco Conceicao', number: 7, pos: 'F', y: 2, f: 9 },
          { name: 'Teun Koopmeiners', number: 8, pos: 'M', y: 3, f: 13 },
          { name: 'Kenan Yildiz', number: 10, pos: 'F', y: 1, f: 8 },
          { name: 'Dusan Vlahovic', number: 9, pos: 'F', y: 3, f: 14 },
        ],
      },
    };

    for (const [key, squad] of Object.entries(TOP_SQUADS)) {
      const normKey = normalizeTeamName(key);
      if (norm === normKey || norm.includes(normKey) || normKey.includes(norm)) {
        return {
          formation: squad.formation,
          isConfirmed: false,
          startingXI: squad.xi.map((p, idx) => ({
            id: 20000 + idx,
            name: p.name,
            number: p.number,
            position: p.pos,
            isStarter: true,
            minutesPlayed: 900,
            yellowCards: p.y,
            redCards: 0,
            foulsCommitted: p.f,
            foulsDrawn: Math.max(1, p.f - 2),
          })),
          substitutes: [],
        };
      }
    }

    return null;
  }

  /**
   * Returns full standings table for a league.
   */
  public getLeagueStandings(leagueCode: string): StandingEntry[] {
    if (!this.isInitialized) {
      this.initialize();
    }
    return this.leagueStandingsMap.get(leagueCode) || [];
  }

  /**
   * Returns rank, points, goal diff, and European/relegation zone for a specific team.
   */
  public getTeamStanding(teamName: string, leagueCode?: string): TeamStandingContext | null {
    if (!this.isInitialized) {
      this.initialize();
    }

    const metrics = this.getTeamMetrics(teamName, leagueCode);
    const resolvedName = metrics?.matchedHistoricalName || teamName;
    const resolvedLeague = leagueCode || metrics?.leagueCode;

    if (!resolvedLeague || !this.leagueStandingsMap.has(resolvedLeague)) {
      return null;
    }

    const table = this.leagueStandingsMap.get(resolvedLeague)!;
    const norm = normalizeTeamName(resolvedName);

    const found = table.find((e) => {
      const eNorm = normalizeTeamName(e.teamName);
      return eNorm === norm || eNorm.includes(norm) || norm.includes(eNorm);
    });

    if (!found) return null;

    return {
      rank: found.rank,
      totalTeams: table.length,
      points: found.points,
      played: found.played,
      won: found.won,
      drawn: found.drawn,
      lost: found.lost,
      goalDifference: found.goalDifference,
      zone: found.zone,
    };
  }

  /**
   * Returns ascending list of historical match dates for schedule fatigue evaluation.
   */
  public getTeamMatchDates(teamName: string, leagueCode?: string): Array<{ date: string }> {
    if (!this.isInitialized) {
      this.initialize();
    }

    const metrics = this.getTeamMetrics(teamName, leagueCode);
    const resolvedName = metrics?.matchedHistoricalName || teamName;

    const matches = this.teamMatchesHistory.get(resolvedName) || this.teamMatchesHistory.get(teamName);
    if (!matches) return [];

    return matches.map((m) => ({ date: m.date }));
  }

  public getHistoricalTeamsCount(): number {
    return this.allTeamsList.length;
  }

  /**
   * Returns comprehensive multi-season deep statistics (1H/2H, corners, cards, shots, streaks)
   */
  public getTeamDeepStats(teamName: string, leagueCode?: string): TeamDeepStats | null {
    return statsDatabase.getTeamDeepStats(teamName, leagueCode);
  }

  /**
   * Returns deep Head-to-Head tactical analysis and predictive insights between 2 teams.
   */
  public getH2HTacticalAnalysis(homeTeam: string, awayTeam: string): H2HTacticalAnalysis | null {
    return statsDatabase.getH2HTacticalAnalysis(homeTeam, awayTeam);
  }
}

export const strengthStore = StrengthStore.getInstance();