/**
 * FlashStat — Experiment Log
 *
 * Every backtest run appends one line to data/backtest_history.jsonl, so a
 * parameter change can be judged against the runs before it instead of from
 * memory. fixtures/backtest_metrics.json still holds the latest run in full;
 * this file is the history.
 *
 * A run records the git commit it was produced from and a hash of MODEL_CONFIG,
 * so two runs with the same configHash are comparable and a differing configHash
 * explains a metric jump.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFileSync } from 'child_process';
import { MODEL_CONFIG } from '../engine/config';
import type { GlobalModelHealth } from '../types/football';

export const HISTORY_PATH = path.resolve(process.cwd(), 'data', 'backtest_history.jsonl');

export interface ExperimentRun {
  runId: string;
  timestamp: string;
  gitSha: string | null;
  gitDirty: boolean | null;
  configHash: string;
  config: typeof MODEL_CONFIG;
  note: string | null;
  metrics: {
    brier: number;
    bookmakerBrier: number;
    beatsBookmaker: boolean;
    logLoss: number;
    roiPercent: number;
    roiCi95: [number, number] | number[];
    roiSignificant: boolean;
    avgClvPercent: number | null;
    maxDrawdownPercent: number;
    matches: number;
    bets: number;
    bettingRatePercent: number;
  };
}

function git(args: string[]): string | null {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

export function configHash(): string {
  return crypto.createHash('sha256').update(JSON.stringify(MODEL_CONFIG)).digest('hex').slice(0, 12);
}

export function appendRun(health: GlobalModelHealth, note: string | null = null): ExperimentRun {
  const sha = git(['rev-parse', '--short', 'HEAD']);
  const dirtyOut = git(['status', '--porcelain']);

  const run: ExperimentRun = {
    runId: new Date().toISOString().replace(/[:.]/g, '-'),
    timestamp: new Date().toISOString(),
    gitSha: sha,
    gitDirty: dirtyOut === null ? null : dirtyOut.length > 0,
    configHash: configHash(),
    config: MODEL_CONFIG,
    note: note ?? process.env.BACKTEST_NOTE ?? null,
    metrics: {
      brier: health.overallBrierScore,
      bookmakerBrier: health.overallBookmakerBrierScore,
      beatsBookmaker: health.overallBrierScore < health.overallBookmakerBrierScore,
      logLoss: health.overallLogLoss,
      roiPercent: health.overallRoiPercent,
      roiCi95: health.overallRoiCi95,
      roiSignificant: health.isOverallRoiSignificant,
      avgClvPercent: (health.overallClvMetrics as { avgClvPercent?: number } | undefined)?.avgClvPercent ?? null,
      maxDrawdownPercent: health.overallMaxDrawdownPercent,
      matches: health.totalMatchesBacktested,
      bets: health.totalBetsPlaced,
      bettingRatePercent: health.bettingRatePercent,
    },
  };

  fs.mkdirSync(path.dirname(HISTORY_PATH), { recursive: true });
  fs.appendFileSync(HISTORY_PATH, JSON.stringify(run) + '\n', 'utf8');
  return run;
}

export function readRuns(): ExperimentRun[] {
  if (!fs.existsSync(HISTORY_PATH)) return [];
  return fs
    .readFileSync(HISTORY_PATH, 'utf8')
    .split('\n')
    .filter(l => l.trim().length > 0)
    .map(l => JSON.parse(l) as ExperimentRun);
}
