import { NextRequest, NextResponse } from 'next/server';
import { strengthStore } from '@/lib/strengthStore';
import { statsDatabase } from '@/lib/database/statsDatabase';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ teamName: string }> }
) {
  try {
    const { teamName: rawTeam } = await params;
    const teamName = decodeURIComponent(rawTeam);

    if (!teamName || teamName.trim().length === 0) {
      return NextResponse.json({ error: 'Team name is required' }, { status: 400 });
    }

    const deepStats = statsDatabase.getTeamDeepStats(teamName);
    const metrics = strengthStore.getTeamMetrics(teamName);
    const recentForm = strengthStore.getTeamRecentForm(teamName);
    const standing = strengthStore.getTeamStanding(teamName);

    if (!deepStats) {
      return NextResponse.json(
        { error: 'No historical statistics found for team', teamName },
        { status: 404 }
      );
    }

    return NextResponse.json({
      teamName,
      metrics,
      deepStats,
      recentForm,
      standing,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[API:teamStats] Error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve team stats', details: (error as Error).message },
      { status: 500 }
    );
  }
}
