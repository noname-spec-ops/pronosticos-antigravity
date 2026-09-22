import { NextRequest, NextResponse } from 'next/server';
import { apiFootballService } from '@/services/apiFootball';
import { oddsProvider } from '@/services/oddsProvider';
import { strengthStore } from '@/lib/strengthStore';
import { LEAGUE_ID_TO_CODE } from '@/lib/leagueCodes';
import { serverCache } from '@/lib/cache';
import { runMatchPredictionPipeline } from '@/engine';
import { sortFixturesByPriority } from '@/lib/leaguePriority';
import { todayLocalISO } from '@/lib/localDate';
import { MODEL_CONFIG } from '@/engine/config';
import type { TeamStrengthMetrics } from '@/types/football';

export const dynamic = 'force-dynamic';


const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Accepts only a real calendar day in YYYY-MM-DD form. */
function isValidDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  // Rejects overflow such as 2026-13-45, which Date would silently roll over.
  return parsed.toISOString().slice(0, 10) === value;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date') || todayLocalISO();
    const filter = searchParams.get('filter') || 'all'; // all | live | value

    if (!isValidDate(date)) {
      return NextResponse.json(
        { error: 'Parametru "date" invalid. Format acceptat: YYYY-MM-DD.' },
        { status: 400 }
      );
    }

    const cacheKey = `enriched_fixtures_v14_${date}_${filter}`;
    const cached = serverCache.get<any>(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    // 1. Fetch raw fixtures for target date (with 15-min cache)
    const { fixtures, isDemo, isStale } = await apiFootballService.getFixturesByDate(date);

    // 2. Sort by league priority (Top European leagues & Champions League first)
    const prioritizedFixtures = sortFixturesByPriority(fixtures);

    // 2b. Resolve REAL bookmaker odds for the whole slate, one request per league
    //     per cache window. Without this step the value-bet radar can only ever
    //     price fixtures that happen to ship with embedded odds.
    let oddsBySlate = new Map<number, Awaited<ReturnType<typeof oddsProvider.getMatchOdds>>>();
    try {
      oddsBySlate = await oddsProvider.getOddsForFixtures(prioritizedFixtures);
    } catch (err) {
      console.warn('[API:fixtures] Odds resolution failed:', (err as Error).message);
    }

    // 3. Fast in-memory quantitative enrichment (<10ms for hundreds of matches)
    const enrichedFixtures = prioritizedFixtures.map((f) => {
      try {
        const odds = f.odds || oddsBySlate.get(f.id) || undefined;
        const leagueCode = LEAGUE_ID_TO_CODE[f.league.id];
        const homeMetrics = strengthStore.getTeamMetrics(f.homeTeam.name, leagueCode);
        const awayMetrics = strengthStore.getTeamMetrics(f.awayTeam.name, leagueCode);

        const effectiveHomeMetrics = homeMetrics || {
          elo: 1500,
          homeAttack: 1.18,
          homeDefense: 1.05,
          awayAttack: 0.95,
          awayDefense: 1.15,
          leagueAvgGoalsHome: 1.45,
          leagueAvgGoalsAway: 1.15,
          matchesEvaluated: 6,
          isInsufficientData: true,
        };

        const effectiveAwayMetrics = awayMetrics || {
          elo: 1500,
          homeAttack: 1.18,
          homeDefense: 1.05,
          awayAttack: 0.95,
          awayDefense: 1.15,
          leagueAvgGoalsHome: 1.45,
          leagueAvgGoalsAway: 1.15,
          matchesEvaluated: 6,
          isInsufficientData: true,
        };

        let homeElo = effectiveHomeMetrics.elo;
        let awayElo = effectiveAwayMetrics.elo;
        let homeAtt = effectiveHomeMetrics.homeAttack;
        let awayAtt = effectiveAwayMetrics.awayAttack;

        if (odds?.match1X2) {
          const pHomeEst = 1 / Math.max(1.05, odds.match1X2.home);
          const pAwayEst = 1 / Math.max(1.05, odds.match1X2.away);
          const eloDiff = Math.log(pHomeEst / Math.max(0.05, pAwayEst)) * 200;
          homeElo = Math.round(1500 + eloDiff / 2);
          awayElo = Math.round(1500 - eloDiff / 2);
          if (pHomeEst > 0.55) homeAtt = 1.35;
          if (pAwayEst > 0.55) awayAtt = 1.35;
        }

        const homeStrength: TeamStrengthMetrics = {
          teamId: f.homeTeam.id,
          teamName: f.homeTeam.name,
          matchesEvaluated: effectiveHomeMetrics.matchesEvaluated,
          homeAttack: homeAtt,
          homeDefense: effectiveHomeMetrics.homeDefense,
          awayAttack: effectiveHomeMetrics.awayAttack,
          awayDefense: effectiveHomeMetrics.awayDefense,
          leagueAvgGoalsHome: effectiveHomeMetrics.leagueAvgGoalsHome,
          leagueAvgGoalsAway: effectiveHomeMetrics.leagueAvgGoalsAway,
          isShrinkageApplied: effectiveHomeMetrics.isInsufficientData,
          homeAdvantageIndex: 1.0,
        };

        const awayStrength: TeamStrengthMetrics = {
          teamId: f.awayTeam.id,
          teamName: f.awayTeam.name,
          matchesEvaluated: effectiveAwayMetrics.matchesEvaluated,
          homeAttack: effectiveAwayMetrics.homeAttack,
          homeDefense: effectiveAwayMetrics.homeDefense,
          awayAttack: awayAtt,
          awayDefense: effectiveAwayMetrics.awayDefense,
          leagueAvgGoalsHome: effectiveAwayMetrics.leagueAvgGoalsHome,
          leagueAvgGoalsAway: effectiveAwayMetrics.leagueAvgGoalsAway,
          isShrinkageApplied: effectiveAwayMetrics.isInsufficientData,
          homeAdvantageIndex: 1.0,
        };

        const isCalibrated = !effectiveHomeMetrics.isInsufficientData && !effectiveAwayMetrics.isInsufficientData;

        const prediction = runMatchPredictionPipeline({
          fixture: { ...f, odds },
          homeStrength,
          awayStrength,
          homeElo,
          awayElo,
          isLeagueCalibrated: isCalibrated,
          homePastMatches: [],
          awayPastMatches: [],
          leagueCode,
        });

        if (effectiveHomeMetrics.isInsufficientData || effectiveAwayMetrics.isInsufficientData) {
          prediction.valueBets = prediction.valueBets.filter((vb) => vb.edgePercent <= 12);
        }

        return {
          ...f,
          odds,
          prediction,
        };
      } catch {
        return f;
      }
    });

    let filtered = enrichedFixtures;
    if (filter === 'live') {
      filtered = enrichedFixtures.filter((f) => ['1H', 'HT', '2H', 'ET', 'P', 'LIVE'].includes(f.status));
    } else if (filter === 'value') {
      filtered = enrichedFixtures.filter((f) => f.prediction && f.prediction.valueBets.length > 0);
    }

    const hasLiveMatches = enrichedFixtures.some((f) => ['1H', 'HT', '2H', 'ET', 'P', 'LIVE'].includes(f.status));
    const cacheTtl = (filter === 'live' || hasLiveMatches)
      ? MODEL_CONFIG.CACHE_TTL.LIVE_MATCHES
      : MODEL_CONFIG.CACHE_TTL.DAILY_FIXTURES;

    const responsePayload = {
      fixtures: filtered,
      count: filtered.length,
      isDemo,
      isStale,
      date,
    };

    serverCache.set(cacheKey, responsePayload, cacheTtl);

    return NextResponse.json(responsePayload);
  } catch (error) {
    console.error('[API:fixtures] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch fixtures', details: (error as Error).message },
      { status: 500 }
    );
  }
}