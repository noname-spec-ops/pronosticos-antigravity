import { NextRequest, NextResponse } from 'next/server';
import { oddsProvider } from '@/services/oddsProvider';
import { devigMultiplicative, devigShin, devig2WayMarket } from '@/engine/devig';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const fixtureIdParam = searchParams.get('fixtureId');

    if (!fixtureIdParam) {
      return NextResponse.json({ error: 'Missing fixtureId parameter' }, { status: 400 });
    }

    const fixtureId = parseInt(fixtureIdParam, 10);
    const odds = await oddsProvider.getMatchOdds(fixtureId);

    if (!odds) {
      return NextResponse.json({ error: 'Odds not found for fixture' }, { status: 404 });
    }

    // Devig 1X2 market
    const deviggedMulti = devigMultiplicative(odds.match1X2);
    const deviggedShin = devigShin(odds.match1X2);

    // Devig Over/Under lines
    const deviggedOU = (odds.overUnder || []).map((ou) => {
      const dev = devig2WayMarket(ou.over, ou.under);
      return {
        line: ou.line,
        over: dev.probA,
        under: dev.probB,
        marginPercent: dev.marginPercent,
      };
    });

    // Devig BTTS
    const deviggedBTTS = odds.btts
      ? {
          yes: devig2WayMarket(odds.btts.yes, odds.btts.no).probA,
          no: devig2WayMarket(odds.btts.yes, odds.btts.no).probB,
          marginPercent: devig2WayMarket(odds.btts.yes, odds.btts.no).marginPercent,
        }
      : undefined;

    return NextResponse.json({
      fixtureId,
      rawOdds: odds,
      devigged: {
        match1X2: deviggedMulti,
        match1X2Shin: deviggedShin,
        overUnder: deviggedOU,
        btts: deviggedBTTS,
      },
    });
  } catch (error) {
    console.error('[API:odds] Error:', error);
    return NextResponse.json(
      { error: 'Failed to process odds', details: (error as Error).message },
      { status: 500 }
    );
  }
}
