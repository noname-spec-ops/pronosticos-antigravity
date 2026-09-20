import fs from 'fs';
import path from 'path';
import type { Raw1X2Odds, MarketOdds } from '../types/football';

export interface OddsSnapshot {
  timestamp: string;
  bookmaker: string;
  match1X2: Raw1X2Odds;
  overUnder25?: { over: number; under: number };
  btts?: { yes: number; no: number };
  overround?: number;
}

export interface FixtureOddsTimeline {
  fixtureId: number;
  matchName: string;
  leagueName: string;
  matchDate: string;
  snapshots: OddsSnapshot[];
  lastUpdated: string;
}

const TIMELINE_DIR = path.resolve(process.cwd(), 'data', 'odds_timeline');

export function ensureTimelineDirectory(): void {
  if (!fs.existsSync(TIMELINE_DIR)) {
    fs.mkdirSync(TIMELINE_DIR, { recursive: true });
  }
}

export function getFixtureOddsTimeline(fixtureId: number): FixtureOddsTimeline | null {
  ensureTimelineDirectory();
  const filePath = path.join(TIMELINE_DIR, `${fixtureId}.json`);
  if (fs.existsSync(filePath)) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch {
      return null;
    }
  }
  return null;
}

export function recordOddsSnapshot(
  fixtureId: number,
  matchName: string,
  leagueName: string,
  matchDate: string,
  odds: MarketOdds
): FixtureOddsTimeline {
  ensureTimelineDirectory();
  const existing = getFixtureOddsTimeline(fixtureId) ?? {
    fixtureId,
    matchName,
    leagueName,
    matchDate,
    snapshots: [],
    lastUpdated: new Date().toISOString(),
  };

  const ou25 = odds.overUnder?.find((m) => m.line === 2.5);

  const newSnapshot: OddsSnapshot = {
    timestamp: odds.timestamp || new Date().toISOString(),
    bookmaker: odds.bookmaker,
    match1X2: { ...odds.match1X2 },
    overUnder25: ou25 ? { over: ou25.over, under: ou25.under } : undefined,
    btts: odds.btts ? { ...odds.btts } : undefined,
    overround: odds.overround,
  };

  const lastSnap = existing.snapshots[existing.snapshots.length - 1];
  const isDuplicate =
    lastSnap &&
    lastSnap.match1X2.home === newSnapshot.match1X2.home &&
    lastSnap.match1X2.draw === newSnapshot.match1X2.draw &&
    lastSnap.match1X2.away === newSnapshot.match1X2.away;

  if (!isDuplicate) {
    existing.snapshots.push(newSnapshot);
  }

  existing.lastUpdated = new Date().toISOString();

  const filePath = path.join(TIMELINE_DIR, `${fixtureId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(existing, null, 2), 'utf-8');

  return existing;
}

export function calculateTimelineMovementVelocity(timeline: FixtureOddsTimeline): {
  homeChangePct: number;
  awayChangePct: number;
  drawChangePct: number;
  timeSpanMinutes: number;
  steamDirection: 'home' | 'away' | 'draw' | 'none';
} {
  if (timeline.snapshots.length < 2) {
    return {
      homeChangePct: 0,
      awayChangePct: 0,
      drawChangePct: 0,
      timeSpanMinutes: 0,
      steamDirection: 'none',
    };
  }

  const first = timeline.snapshots[0];
  const last = timeline.snapshots[timeline.snapshots.length - 1];

  const tFirst = new Date(first.timestamp).getTime();
  const tLast = new Date(last.timestamp).getTime();
  const timeSpanMinutes = Math.max(1, Math.round((tLast - tFirst) / 60000));

  const homeChangePct = Number((((last.match1X2.home - first.match1X2.home) / first.match1X2.home) * 100).toFixed(2));
  const awayChangePct = Number((((last.match1X2.away - first.match1X2.away) / first.match1X2.away) * 100).toFixed(2));
  const drawChangePct = Number((((last.match1X2.draw - first.match1X2.draw) / first.match1X2.draw) * 100).toFixed(2));

  let steamDirection = 'none';
  if (homeChangePct <= -5.0 && homeChangePct < awayChangePct) {
    steamDirection = 'home';
  } else if (awayChangePct <= -5.0 && awayChangePct < homeChangePct) {
    steamDirection = 'away';
  } else if (drawChangePct <= -5.0) {
    steamDirection = 'draw';
  }

  return {
    homeChangePct,
    awayChangePct,
    drawChangePct,
    timeSpanMinutes,
    steamDirection: steamDirection as any,
  };
}
