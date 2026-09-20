import { NextResponse } from 'next/server';
import { apiFootballService } from '@/services/apiFootball';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { fixtures, isDemo, isStale } = await apiFootballService.getLiveFixtures();

    return NextResponse.json({
      fixtures,
      count: fixtures.length,
      isDemo,
      isStale,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[API:live] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch live matches', details: (error as Error).message },
      { status: 500 }
    );
  }
}
