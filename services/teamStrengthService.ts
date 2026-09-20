/**
 * FlashStat — Football Scores & AI Betting Radar
 * Team Strength & ELO Resolution Service
 * 
 * Computes and serves real, historical time-decayed attack/defense ratings
 * and chronological ELO ratings computed from 16,700+ real matches.
 */

import fs from 'fs';
import path from 'path';
import { calculateLeagueTeamStrengths, type HistoricalMatchRecord } from '../engine/teamStrength';
import { updateEloRatings } from '../engine/elo';
import { MODEL_CONFIG } from '../engine/config';
import type { EloRating, TeamStrengthMetrics } from '../types/football';

interface StoredTeamData {
  teamName: string;
  normalizedName: string;
  elo: number;
  homeAttack: number;
  homeDefense: number;
  awayAttack: number;
  awayDefense: number;
  leagueAvgGoalsHome: number;
  leagueAvgGoalsAway: number;
  matchesEvaluated: number;
}

class TeamStrengthService {
  private teamDataMap = new Map<string, StoredTeamData>();
  private isInitialized = false;

  private normalizeName(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[\s\-_.]+/g, '')
      .replace(/fc|cf|sc|afc|ac/g, '');
  }

  public initialize(): void {
    if (this.isInitialized) return;

    const dataPath = path.resolve(process.cwd(), 'data', 'historical_matches.json');
    if (!fs.existsSync(dataPath)) {
      console.warn('[TeamStrengthService] Historical matches file not found. Skipping initialization.');
      return;
    }

    try {
      const raw = fs.readFileSync(dataPath, 'utf-8');
      const matches: Array<{
        date: string;
        leagueCode: string;
        homeTeam: string;
        awayTeam: string;
        homeGoals: number;
        awayGoals: number;
      }> = JSON.parse(raw);

      // Sort chronologically to compute true ELO progression
      matches.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      // 1. Compute Chronological ELO Ratings
      const eloMap = new Map<string, number>();
      const getElo = (team: string) => eloMap.get(team) || MODEL_CONFIG.ELO.INITIAL_RATING;

      for (const m of matches) {
        const homeElo = getElo(m.homeTeam);
        const awayElo = getElo(m.awayTeam);
        const { newHomeElo, newAwayElo } = updateEloRatings(homeElo, awayElo, m.homeGoals, m.awayGoals);
        eloMap.set(m.homeTeam, newHomeElo);
        eloMap.set(m.awayTeam, newAwayElo);
      }

      // 2. Compute Time-Decayed Attack and Defense Strengths per league
      const formattedHistory: HistoricalMatchRecord[] = matches.map((m, idx) => ({
        date: m.date,
        homeTeamId: idx * 2 + 1,
        homeTeamName: m.homeTeam,
        awayTeamId: idx * 2 + 2,
        awayTeamName: m.awayTeam,
        homeGoals: m.homeGoals,
        awayGoals: m.awayGoals,
      }));

      // Group by team and calculate overall strengths
      const strengths = calculateLeagueTeamStrengths(formattedHistory, new Date('2024-06-01'), MODEL_CONFIG.TEAM_STRENGTH.HALF_LIFE_DAYS);

      // Store in normalized map
      for (const [, s] of strengths.entries()) {
        const norm = this.normalizeName(s.teamName);
        const teamElo = eloMap.get(s.teamName) || MODEL_CONFIG.ELO.INITIAL_RATING;

        this.teamDataMap.set(norm, {
          teamName: s.teamName,
          normalizedName: norm,
          elo: teamElo,
          homeAttack: s.homeAttack,
          homeDefense: s.homeDefense,
          awayAttack: s.awayAttack,
          awayDefense: s.awayDefense,
          leagueAvgGoalsHome: s.leagueAvgGoalsHome,
          leagueAvgGoalsAway: s.leagueAvgGoalsAway,
          matchesEvaluated: s.matchesEvaluated,
        });
      }

      this.isInitialized = true;
      console.log(`[TeamStrengthService] Initialized with ${this.teamDataMap.size} distinct real team ratings.`);
    } catch (err) {
      console.error('[TeamStrengthService] Error computing team strengths:', err);
    }
  }

  public getTeamProfile(teamName: string, teamId: number): { strength: TeamStrengthMetrics; elo: number } {
    this.initialize();

    const norm = this.normalizeName(teamName);
    const stored = this.teamDataMap.get(norm);

    if (stored) {
      return {
        elo: stored.elo,
        strength: {
          teamId,
          teamName: stored.teamName,
          matchesEvaluated: stored.matchesEvaluated,
          homeAttack: stored.homeAttack,
          homeDefense: stored.homeDefense,
          awayAttack: stored.awayAttack,
          awayDefense: stored.awayDefense,
          leagueAvgGoalsHome: stored.leagueAvgGoalsHome,
          leagueAvgGoalsAway: stored.leagueAvgGoalsAway,
          isShrinkageApplied: stored.matchesEvaluated < MODEL_CONFIG.TEAM_STRENGTH.MIN_MATCHES_THRESHOLD,
          homeAdvantageIndex: (stored as { homeAdvantageIndex?: number }).homeAdvantageIndex ?? 1.0,
        },
      };
    }

    // Baseline fallback for unseen teams (e.g. newly formed / small clubs)
    return {
      elo: MODEL_CONFIG.ELO.INITIAL_RATING,
      strength: {
        teamId,
        teamName,
        matchesEvaluated: 0,
        homeAttack: 1.0,
        homeDefense: 1.0,
        awayAttack: 1.0,
        awayDefense: 1.0,
        leagueAvgGoalsHome: MODEL_CONFIG.TEAM_STRENGTH.DEFAULT_LEAGUE_AVG_HOME_GOALS,
        leagueAvgGoalsAway: MODEL_CONFIG.TEAM_STRENGTH.DEFAULT_LEAGUE_AVG_AWAY_GOALS,
        isShrinkageApplied: true,
        homeAdvantageIndex: 1.0,
      },
    };
  }
}

export const teamStrengthService = new TeamStrengthService();