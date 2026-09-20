import { NextRequest, NextResponse } from 'next/server';
import { apiFootballService } from '@/services/apiFootball';
import { oddsProvider } from '@/services/oddsProvider';
import { strengthStore } from '@/lib/strengthStore';
import { LEAGUE_ID_TO_CODE } from '@/lib/leagueCodes';
import { runMatchPredictionPipeline } from '@/engine';
import type { TeamStrengthMetrics } from '@/types/football';

export const dynamic = 'force-dynamic';


export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ fixtureId: string }> }
) {
  try {
    const { fixtureId: rawId } = await params;
    const fixtureId = parseInt(rawId, 10);

    if (isNaN(fixtureId)) {
      return NextResponse.json({ error: 'Invalid fixture ID' }, { status: 400 });
    }

    const { fixture, isDemo } = await apiFootballService.getFixtureById(fixtureId);
    if (!fixture) {
      return NextResponse.json({ error: 'Fixture not found' }, { status: 404 });
    }

    // Fetch live odds on-demand specifically for this opened match
    const odds = fixture.odds || (await oddsProvider.getMatchOdds(fixtureId, true)) || undefined;

    // Obtain true team strengths and ELO ratings from 24,000+ match history
    const leagueCode = LEAGUE_ID_TO_CODE[fixture.league.id];
    const homeMetrics = strengthStore.getTeamMetrics(fixture.homeTeam.name, leagueCode);
    const awayMetrics = strengthStore.getTeamMetrics(fixture.awayTeam.name, leagueCode);

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
      teamId: fixture.homeTeam.id,
      teamName: fixture.homeTeam.name,
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
      teamId: fixture.awayTeam.id,
      teamName: fixture.awayTeam.name,
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

    const homePastMatches = strengthStore.getTeamMatchDates(fixture.homeTeam.name, leagueCode);
    const awayPastMatches = strengthStore.getTeamMatchDates(fixture.awayTeam.name, leagueCode);

    const formHome = strengthStore.getTeamRecentForm(fixture.homeTeam.name, leagueCode) || undefined;
    const formAway = strengthStore.getTeamRecentForm(fixture.awayTeam.name, leagueCode) || undefined;
    const homeAwayStatsHome = strengthStore.getTeamHomeAwayStats(fixture.homeTeam.name, leagueCode, true) || undefined;
    const homeAwayStatsAway = strengthStore.getTeamHomeAwayStats(fixture.awayTeam.name, leagueCode, false) || undefined;
    const standingHome = strengthStore.getTeamStanding(fixture.homeTeam.name, leagueCode) || undefined;
    const standingAway = strengthStore.getTeamStanding(fixture.awayTeam.name, leagueCode) || undefined;

    const lineupHome = fixture.lineupHome || strengthStore.getProbableLineup(fixture.homeTeam.name, leagueCode) || undefined;
    const lineupAway = fixture.lineupAway || strengthStore.getProbableLineup(fixture.awayTeam.name, leagueCode) || undefined;

    const deepStatsHome = strengthStore.getTeamDeepStats(fixture.homeTeam.name, leagueCode) || undefined;
    const deepStatsAway = strengthStore.getTeamDeepStats(fixture.awayTeam.name, leagueCode) || undefined;
    const h2hTactical = strengthStore.getH2HTacticalAnalysis(fixture.homeTeam.name, fixture.awayTeam.name) || undefined;

    const prediction = runMatchPredictionPipeline({
      fixture: {
        ...fixture,
        odds,
        deepStatsHome,
        deepStatsAway,
        lineupHome,
        lineupAway,
      },
      homeStrength,
      awayStrength,
      homeElo,
      awayElo,
      isLeagueCalibrated: isCalibrated,
      homePastMatches,
      awayPastMatches,
      leagueCode,
    });

    if (effectiveHomeMetrics.isInsufficientData || effectiveAwayMetrics.isInsufficientData) {
      prediction.valueBets = prediction.valueBets.filter(vb => vb.edgePercent <= 12);
      prediction.modelHealthNote = 'Date istorice reduse (<15 meciuri) — predicție provizorie cu shrinkage';
    }

    return NextResponse.json({
      fixtureId,
      fixture: {
        ...fixture,
        odds,
        formHome,
        formAway,
        homeAwayStatsHome,
        homeAwayStatsAway,
        standingHome,
        standingAway,
        lineupHome,
        lineupAway,
        deepStatsHome,
        deepStatsAway,
        h2hTactical,
      },
      prediction,
      isDemo,
    });
  } catch (error) {
    console.error('[API:prediction] Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate prediction', details: (error as Error).message },
      { status: 500 }
    );
  }
}