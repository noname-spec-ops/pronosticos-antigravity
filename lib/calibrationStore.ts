/**
 * FlashStat — Calibration Artifact Store (lib/calibrationStore.ts)
 *
 * Loads the artifacts produced by `npm run calibrate` so the LIVE prediction
 * pipeline uses the same parameters and the same isotonic calibration maps as
 * `scripts/backtest.ts`.
 *
 * Why this exists: those artifacts were read only by the backtest and the
 * Telegram bot. The website ran the raw, uncalibrated model with a hardcoded
 * rho, which means the published ROI/Brier figures did not describe what the
 * site actually produced.
 */

import fs from 'fs';
import path from 'path';
import type { LeagueCalibrationMaps, OutcomeCalibrationMap } from '../engine/calibration';

export interface LeagueModelParams {
  leagueCode: string;
  leagueName?: string;
  rho: number;
  lambda3: number;
  drawInflationDelta: number;
  poissonWeight: number;
  eloWeight: number;
  sampleSize: number;
}

export interface CalibratedParamsBundle {
  calibratedAt: string;
  globalHalfLifeDays: number;
  globalRho: number;
  globalLambda3: number;
  globalDrawInflationDelta: number;
  globalPoissonWeight: number;
  globalEloWeight: number;
  leagueParams: Record<string, LeagueModelParams>;
}

class CalibrationStore {
  private mapsLoaded = false;
  private paramsLoaded = false;
  private maps: LeagueCalibrationMaps | null = null;
  private params: CalibratedParamsBundle | null = null;

  private readJson<T>(fileName: string): T | null {
    try {
      const p = path.resolve(process.cwd(), 'data', fileName);
      if (!fs.existsSync(p)) return null;
      return JSON.parse(fs.readFileSync(p, 'utf-8')) as T;
    } catch (err) {
      console.warn(`[CalibrationStore] Failed to read data/${fileName}:`, (err as Error).message);
      return null;
    }
  }

  /** Isotonic (PAVA) calibration maps, or null when none have been fitted. */
  public getMaps(): LeagueCalibrationMaps | null {
    if (!this.mapsLoaded) {
      this.maps = this.readJson<LeagueCalibrationMaps>('calibration_maps.json');
      this.mapsLoaded = true;
      console.info(
        this.maps
          ? `[CalibrationStore] Loaded PAVA calibration maps (${Object.keys(this.maps).length} profiles).`
          : '[CalibrationStore] No calibration maps found — predictions will be uncalibrated. Run "npm run calibrate".'
      );
    }
    return this.maps;
  }

  /** MLE-calibrated model parameters, or null when none have been fitted. */
  public getParams(): CalibratedParamsBundle | null {
    if (!this.paramsLoaded) {
      this.params = this.readJson<CalibratedParamsBundle>('calibrated_params.json');
      this.paramsLoaded = true;
      if (this.params) {
        console.info(`[CalibrationStore] Loaded MLE parameter bundle (calibrated ${this.params.calibratedAt}).`);
      }
    }
    return this.params;
  }

  /**
   * Calibration map for a league, falling back to the global profile.
   * Returns null when nothing has been fitted, so callers can tell "uncalibrated"
   * apart from "calibrated with the global curve".
   */
  public getMapForLeague(leagueCode?: string): OutcomeCalibrationMap | null {
    const maps = this.getMaps();
    if (!maps) return null;
    if (leagueCode && maps[leagueCode]) return maps[leagueCode];
    return maps.global ?? null;
  }

  /** True when a league has its own fitted curve rather than only the global one. */
  public hasLeagueSpecificMap(leagueCode?: string): boolean {
    const maps = this.getMaps();
    return !!(maps && leagueCode && maps[leagueCode]);
  }

  /** Model parameters for a league, falling back to the global values. */
  public getParamsForLeague(leagueCode?: string): {
    rho: number;
    lambda3: number;
    drawInflationDelta: number;
    poissonWeight: number;
    eloWeight: number;
    sampleSize: number;
    isLeagueSpecific: boolean;
  } | null {
    const bundle = this.getParams();
    if (!bundle) return null;

    const lp = leagueCode ? bundle.leagueParams?.[leagueCode] : undefined;
    if (lp) {
      return {
        rho: lp.rho,
        lambda3: lp.lambda3,
        drawInflationDelta: lp.drawInflationDelta,
        poissonWeight: lp.poissonWeight,
        eloWeight: lp.eloWeight,
        sampleSize: lp.sampleSize,
        isLeagueSpecific: true,
      };
    }

    return {
      rho: bundle.globalRho,
      lambda3: bundle.globalLambda3,
      drawInflationDelta: bundle.globalDrawInflationDelta,
      poissonWeight: bundle.globalPoissonWeight,
      eloWeight: bundle.globalEloWeight,
      sampleSize: 0,
      isLeagueSpecific: false,
    };
  }

  /** Test hook: forget cached artifacts. */
  public reset(): void {
    this.mapsLoaded = false;
    this.paramsLoaded = false;
    this.maps = null;
    this.params = null;
  }
}

export const calibrationStore = new CalibrationStore();
