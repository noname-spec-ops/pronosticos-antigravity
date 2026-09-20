/**
 * FlashStat — Central Referee Severity & Card Statistics Store (lib/refereeStore.ts)
 * 
 * Computes authentic referee card tendencies and severity indices directly from
 * the 24,000+ historical matches dataset.
 * 
 * Principle:
 * - Real card averages (Yellow, Red, Fouls).
 * - Normalized severity index against league average.
 * - Bayesian shrinkage towards 1.0 for referees with <10 matches.
 * - Robust name matching between full names (Anthony Taylor) and initial format (A Taylor).
 */

import fs from 'fs';
import path from 'path';
import type { HistoricalMatch, Referee } from '../types/football';

interface RawRefereeStats {
  name: string;
  lastName: string;
  initial: string;
  leagueCode: string;
  matchesCount: number;
  totalYellows: number;
  totalReds: number;
  totalFouls: number;
}

export class RefereeStore {
  private static instance: RefereeStore;
  private isInitialized = false;

  private refereeMap = new Map<string, Referee>();
  private refereeProfilesList: Array<Referee & { lastName: string; initial: string }> = [];
  private leagueYellowAvg = new Map<string, number>();
  private globalYellowAvg = 4.10;

  private constructor() {}

  public static getInstance(): RefereeStore {
    if (!RefereeStore.instance) {
      RefereeStore.instance = new RefereeStore();
      RefereeStore.instance.initialize();
    }
    return RefereeStore.instance;
  }

  public parseNameParts(rawName: string): { lastName: string; initial: string } {
    const clean = rawName.trim().replace(/[.,`']/g, '');
    const tokens = clean.split(/\s+/).filter(Boolean);
    if (tokens.length === 1) {
      return { lastName: tokens[0].toLowerCase(), initial: tokens[0][0].toLowerCase() };
    }
    const initial = tokens[0][0].toLowerCase();
    const lastName = tokens[tokens.length - 1].toLowerCase();
    return { lastName, initial };
  }

  public normalizeRefereeName(name: string): string {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[\s\-_.,'`]+/g, '')
      .trim();
  }

  public initialize(): void {
    if (this.isInitialized) return;

    const dataPath = path.resolve(process.cwd(), 'data', 'historical_matches.json');
    if (!fs.existsSync(dataPath)) {
      return;
    }

    try {
      const matches: HistoricalMatch[] = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
      const statsMap = new Map<string, RawRefereeStats>();
      const leagueTotals = new Map<string, { matches: number; yellows: number }>();

      for (const m of matches) {
        if (!m.referee) continue;

        const yellows = (m.homeYellowCards ?? 0) + (m.awayYellowCards ?? 0);
        const reds = (m.homeRedCards ?? 0) + (m.awayRedCards ?? 0);
        const fouls = (m.homeFouls ?? 0) + (m.awayFouls ?? 0);

        // Track League Totals
        if (!leagueTotals.has(m.leagueCode)) {
          leagueTotals.set(m.leagueCode, { matches: 0, yellows: 0 });
        }
        const lt = leagueTotals.get(m.leagueCode)!;
        lt.matches++;
        lt.yellows += yellows;

        // Track Referee Totals
        const { lastName, initial } = this.parseNameParts(m.referee);
        const key = `${initial}_${lastName}`;

        if (!statsMap.has(key)) {
          statsMap.set(key, {
            name: m.referee.trim(),
            lastName,
            initial,
            leagueCode: m.leagueCode,
            matchesCount: 0,
            totalYellows: 0,
            totalReds: 0,
            totalFouls: 0,
          });
        }

        const refStats = statsMap.get(key)!;
        refStats.matchesCount++;
        refStats.totalYellows += yellows;
        refStats.totalReds += reds;
        refStats.totalFouls += fouls;
      }

      // Compute League Averages
      let totalGlobalYellows = 0;
      let totalGlobalMatches = 0;
      for (const [code, t] of leagueTotals.entries()) {
        const avg = t.matches > 0 ? t.yellows / t.matches : 4.0;
        this.leagueYellowAvg.set(code, avg);
        totalGlobalYellows += t.yellows;
        totalGlobalMatches += t.matches;
      }

      if (totalGlobalMatches > 0) {
        this.globalYellowAvg = totalGlobalYellows / totalGlobalMatches;
      }

      // Calculate final Referee Profiles
      let nextId = 1;
      for (const [key, r] of statsMap.entries()) {
        const avgYellow = r.matchesCount > 0 ? r.totalYellows / r.matchesCount : this.globalYellowAvg;
        const avgRed = r.matchesCount > 0 ? r.totalReds / r.matchesCount : 0.15;
        const avgFouls = r.matchesCount > 0 ? r.totalFouls / r.matchesCount : 22.0;

        const leagueAvg = this.leagueYellowAvg.get(r.leagueCode) || this.globalYellowAvg;
        const rawSeverity = avgYellow / (leagueAvg || 4.0);

        // Bayesian shrinkage towards 1.0 if matches < 10
        let severityIndex = rawSeverity;
        if (r.matchesCount < 10) {
          const weight = r.matchesCount / (r.matchesCount + 5);
          severityIndex = weight * rawSeverity + (1 - weight) * 1.0;
        }

        const refereeProfile: Referee = {
          id: nextId++,
          name: r.name,
          matchesCount: r.matchesCount,
          avgYellowCardsPerMatch: Number(avgYellow.toFixed(2)),
          avgRedCardsPerMatch: Number(avgRed.toFixed(2)),
          avgFoulsPerMatch: Number(avgFouls.toFixed(1)),
          severityIndex: Number(severityIndex.toFixed(2)),
        };

        this.refereeMap.set(key, refereeProfile);
        this.refereeMap.set(r.lastName, refereeProfile);
        this.refereeProfilesList.push({
          ...refereeProfile,
          lastName: r.lastName,
          initial: r.initial
        });
      }

      this.isInitialized = true;
      console.log(`[RefereeStore] Initialized: ${this.refereeProfilesList.length} authentic referees indexed.`);
    } catch (err: any) {
      console.error('[RefereeStore] Initialization warning:', err.message);
    }
  }

  public getRefereeProfile(rawName: string | undefined, leagueCode?: string): Referee | null {
    if (!rawName) return null;
    if (!this.isInitialized) this.initialize();

    const { lastName, initial } = this.parseNameParts(rawName);

    // 1. Exact initial + last name match (e.g. 'm_oliver')
    const key = `${initial}_${lastName}`;
    if (this.refereeMap.has(key)) {
      const match = this.refereeMap.get(key)!;
      return { ...match, name: rawName };
    }

    // 2. Last name unique match
    const byLastName = this.refereeProfilesList.filter(r => r.lastName === lastName);
    if (byLastName.length === 1) {
      return { ...byLastName[0], name: rawName };
    } else if (byLastName.length > 1) {
      const initialMatch = byLastName.find(r => r.initial === initial);
      if (initialMatch) return { ...initialMatch, name: rawName };
      return { ...byLastName[0], name: rawName };
    }

    // 3. Fallback neutral profile with shrinkage for unknown referees
    const leagueAvg = (leagueCode && this.leagueYellowAvg.get(leagueCode)) || this.globalYellowAvg;
    return {
      id: 0,
      name: rawName.trim(),
      matchesCount: 0,
      avgYellowCardsPerMatch: Number(leagueAvg.toFixed(2)),
      avgRedCardsPerMatch: 0.15,
      avgFoulsPerMatch: 22.0,
      severityIndex: 1.0,
    };
  }
}

export const refereeStore = RefereeStore.getInstance();