/**
 * FlashStat — Team Schedule Fatigue & Calendar Congestion Engine
 * 
 * Quantifies rest advantage and schedule fatigue:
 * - Rest days since last competitive fixture.
 * - Match congestion count in rolling 14-day window.
 * - Fatigue factor lambda multiplier (e.g. 0.92 for 3-day turnaround with 4 matches in 14d).
 */

import { MODEL_CONFIG } from './config';

export interface TeamScheduleMetrics {
  restDays: number;
  matchesLast14Days: number;
  fatigueFactor: number;
  travelDistanceKm?: number;
  travelFatigueFactor?: number;
}

export interface ScheduleFatigueOptions {
  travelDistanceKm?: number;
  travelFatigueFactor?: number;
}

export function calculateScheduleFatigue(
  teamPastMatchesAscending: Array<{ date: string }>,
  currentMatchDate: string | Date,
  options?: ScheduleFatigueOptions
): TeamScheduleMetrics {
  const curMs = new Date(currentMatchDate).getTime();
  const pastMatches = teamPastMatchesAscending
    .filter((m) => new Date(m.date).getTime() < curMs)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const travelFactor = options?.travelFatigueFactor ?? 1.0;

  if (pastMatches.length === 0) {
    const rawFatigue = 1.0 * travelFactor;
    return {
      restDays: MODEL_CONFIG.SCHEDULE.BASELINE_REST_DAYS,
      matchesLast14Days: 0,
      fatigueFactor: Number(rawFatigue.toFixed(4)),
      travelDistanceKm: options?.travelDistanceKm,
      travelFatigueFactor: options?.travelFatigueFactor,
    };
  }

  const lastMatchMs = new Date(pastMatches[0].date).getTime();
  const diffDays = Math.max(1, Math.round((curMs - lastMatchMs) / (1000 * 60 * 60 * 24)));

  const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
  const matches14d = pastMatches.filter((m) => curMs - new Date(m.date).getTime() <= fourteenDaysMs).length;

  let restPenalty = 0;
  if (diffDays < MODEL_CONFIG.SCHEDULE.SHORT_REST_THRESHOLD) {
    restPenalty = (MODEL_CONFIG.SCHEDULE.SHORT_REST_THRESHOLD - diffDays) * MODEL_CONFIG.SCHEDULE.REST_PENALTY_PER_DAY;
  }

  let congestionPenalty = 0;
  if (matches14d > MODEL_CONFIG.SCHEDULE.CONGESTION_14D_LIMIT) {
    congestionPenalty =
      (matches14d - MODEL_CONFIG.SCHEDULE.CONGESTION_14D_LIMIT) * MODEL_CONFIG.SCHEDULE.CONGESTION_PENALTY;
  }

  const baseFatigue = Math.max(0.85, Math.min(1.05, 1.0 - restPenalty - congestionPenalty));
  const finalFatigue = Math.max(0.78, Math.min(1.05, baseFatigue * travelFactor));

  return {
    restDays: diffDays,
    matchesLast14Days: matches14d,
    fatigueFactor: Number(finalFatigue.toFixed(4)),
    travelDistanceKm: options?.travelDistanceKm,
    travelFatigueFactor: options?.travelFatigueFactor,
  };
}