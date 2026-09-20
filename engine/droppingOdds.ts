/**
 * FlashStat — Dropping Odds & Smart Money Inflow Radar (engine/droppingOdds.ts)
 * Monitors real-time opening vs current bookmaker odds shifts across 1X2,
 * Over/Under 2.5, and BTTS markets to detect sharp syndicate steam moves and market corrections.
 */

import type {
  MarketOdds,
  DroppingOddsAlert,
  DroppingOddsAnalysis,
} from '@/types/football';

interface AnalyzeDroppingOddsInput {
  homeTeamName: string;
  awayTeamName: string;
  odds?: MarketOdds;
}

export function analyzeDroppingOdds(input: AnalyzeDroppingOddsInput): DroppingOddsAnalysis {
  const { homeTeamName, awayTeamName, odds } = input;

  if (!odds) {
    return {
      hasDroppingOdds: false,
      maxDropPercent: 0,
      dominantMovement: 'neutral',
      alerts: [],
      steamSummary: 'Nu există date de variație a cotelor disponibile.',
    };
  }

  const alerts: DroppingOddsAlert[] = [];
  let maxDrop = 0;
  let dominantMovement: DroppingOddsAnalysis['dominantMovement'] = 'neutral';

  // 1. Evaluate 1X2 Market Odds Shifts
  if (odds.opening1X2 && odds.match1X2) {
    // Home Win (1)
    const homeOpen = odds.opening1X2.home;
    const homeCurr = odds.match1X2.home;
    if (homeOpen > 1.0 && homeCurr > 1.0) {
      const dropPct = ((homeCurr - homeOpen) / homeOpen) * 100;
      const dropAbs = Number((homeCurr - homeOpen).toFixed(2));

      if (dropPct <= -4 || dropPct >= 10) {
        const isDrop = dropPct < 0;
        const absDrop = Math.abs(dropPct);
        if (isDrop && absDrop > maxDrop) {
          maxDrop = absDrop;
          dominantMovement = 'home_steam';
        }

        alerts.push({
          id: 'drop-1x2-home',
          market: '1X2',
          selection: `1 (${homeTeamName})`,
          openingOdd: homeOpen,
          currentOdd: homeCurr,
          changePercent: Number(dropPct.toFixed(1)),
          dropAbsolute: dropAbs,
          severity: dropPct <= -15 ? 'extreme' : dropPct <= -8 ? 'high' : dropPct <= -4 ? 'moderate' : 'drift',
          signalType: dropPct <= -8 ? 'sharp_steam' : dropPct < 0 ? 'market_correction' : 'public_drift',
          description: isDrop
            ? `Scădere de ${absDrop.toFixed(1)}% pe victoria gazdelor (de la ${homeOpen.toFixed(2)} la ${homeCurr.toFixed(2)}). Intrare de volum ascuțit.`
            : `Creștere de ${dropPct.toFixed(1)}% a cotei pe gazde (de la ${homeOpen.toFixed(2)} la ${homeCurr.toFixed(2)}). Piața se depărtează de selecție.`,
        });
      }
    }

    // Draw (X)
    const drawOpen = odds.opening1X2.draw;
    const drawCurr = odds.match1X2.draw;
    if (drawOpen > 1.0 && drawCurr > 1.0) {
      const dropPct = ((drawCurr - drawOpen) / drawOpen) * 100;
      const dropAbs = Number((drawCurr - drawOpen).toFixed(2));

      if (dropPct <= -5 || dropPct >= 12) {
        const isDrop = dropPct < 0;
        const absDrop = Math.abs(dropPct);
        if (isDrop && absDrop > maxDrop) {
          maxDrop = absDrop;
          dominantMovement = 'draw_steam';
        }

        alerts.push({
          id: 'drop-1x2-draw',
          market: '1X2',
          selection: 'X (Egal)',
          openingOdd: drawOpen,
          currentOdd: drawCurr,
          changePercent: Number(dropPct.toFixed(1)),
          dropAbsolute: dropAbs,
          severity: dropPct <= -12 ? 'extreme' : dropPct <= -6 ? 'high' : 'moderate',
          signalType: dropPct <= -6 ? 'sharp_steam' : 'market_correction',
          description: isDrop
            ? `Scădere de ${absDrop.toFixed(1)}% pe egal (de la ${drawOpen.toFixed(2)} la ${drawCurr.toFixed(2)}).`
            : `Cota pe egal a urcat cu +${dropPct.toFixed(1)}%.`,
        });
      }
    }

    // Away Win (2)
    const awayOpen = odds.opening1X2.away;
    const awayCurr = odds.match1X2.away;
    if (awayOpen > 1.0 && awayCurr > 1.0) {
      const dropPct = ((awayCurr - awayOpen) / awayOpen) * 100;
      const dropAbs = Number((awayCurr - awayOpen).toFixed(2));

      if (dropPct <= -4 || dropPct >= 10) {
        const isDrop = dropPct < 0;
        const absDrop = Math.abs(dropPct);
        if (isDrop && absDrop > maxDrop) {
          maxDrop = absDrop;
          dominantMovement = 'away_steam';
        }

        alerts.push({
          id: 'drop-1x2-away',
          market: '1X2',
          selection: `2 (${awayTeamName})`,
          openingOdd: awayOpen,
          currentOdd: awayCurr,
          changePercent: Number(dropPct.toFixed(1)),
          dropAbsolute: dropAbs,
          severity: dropPct <= -15 ? 'extreme' : dropPct <= -8 ? 'high' : dropPct <= -4 ? 'moderate' : 'drift',
          signalType: dropPct <= -8 ? 'sharp_steam' : dropPct < 0 ? 'market_correction' : 'public_drift',
          description: isDrop
            ? `Scădere de ${absDrop.toFixed(1)}% pe victoria oaspeților (de la ${awayOpen.toFixed(2)} la ${awayCurr.toFixed(2)}). Influx de capital pariat.`
            : `Cota oaspeților a urcat cu +${dropPct.toFixed(1)}% (de la ${awayOpen.toFixed(2)} la ${awayCurr.toFixed(2)}).`,
        });
      }
    }
  }

  // 2. Evaluate Over/Under Shifts (Focus on 2.5 line)
  if (odds.openingOverUnder && odds.overUnder) {
    const open25 = odds.openingOverUnder.find((o) => o.line === 2.5);
    const curr25 = odds.overUnder.find((o) => o.line === 2.5);

    if (open25 && curr25) {
      // Over 2.5
      const overDropPct = ((curr25.over - open25.over) / open25.over) * 100;
      if (overDropPct <= -4) {
        const absDrop = Math.abs(overDropPct);
        if (absDrop > maxDrop) {
          maxDrop = absDrop;
          dominantMovement = 'over_steam';
        }
        alerts.push({
          id: 'drop-ou-over25',
          market: 'OU',
          selection: 'Peste 2.5 Goluri',
          openingOdd: open25.over,
          currentOdd: curr25.over,
          changePercent: Number(overDropPct.toFixed(1)),
          dropAbsolute: Number((curr25.over - open25.over).toFixed(2)),
          severity: overDropPct <= -12 ? 'extreme' : overDropPct <= -7 ? 'high' : 'moderate',
          signalType: 'sharp_steam',
          description: `Drop pe piața de goluri: Peste 2.5 a scăzut cu ${absDrop.toFixed(1)}% (de la ${open25.over.toFixed(2)} la ${curr25.over.toFixed(2)}).`,
        });
      }

      // Under 2.5
      const underDropPct = ((curr25.under - open25.under) / open25.under) * 100;
      if (underDropPct <= -4) {
        const absDrop = Math.abs(underDropPct);
        if (absDrop > maxDrop) {
          maxDrop = absDrop;
          dominantMovement = 'under_steam';
        }
        alerts.push({
          id: 'drop-ou-under25',
          market: 'OU',
          selection: 'Sub 2.5 Goluri',
          openingOdd: open25.under,
          currentOdd: curr25.under,
          changePercent: Number(underDropPct.toFixed(1)),
          dropAbsolute: Number((curr25.under - open25.under).toFixed(2)),
          severity: underDropPct <= -12 ? 'extreme' : underDropPct <= -7 ? 'high' : 'moderate',
          signalType: 'sharp_steam',
          description: `Drop defensiv: Sub 2.5 a scăzut cu ${absDrop.toFixed(1)}% (de la ${open25.under.toFixed(2)} la ${curr25.under.toFixed(2)}).`,
        });
      }
    }
  }

  // 3. Evaluate BTTS Shifts
  if (odds.openingBtts && odds.btts) {
    const bttsDropPct = ((odds.btts.yes - odds.openingBtts.yes) / odds.openingBtts.yes) * 100;
    if (bttsDropPct <= -5) {
      const absDrop = Math.abs(bttsDropPct);
      alerts.push({
        id: 'drop-btts-yes',
        market: 'BTTS',
        selection: 'Ambele Marchează (GG)',
        openingOdd: odds.openingBtts.yes,
        currentOdd: odds.btts.yes,
        changePercent: Number(bttsDropPct.toFixed(1)),
        dropAbsolute: Number((odds.btts.yes - odds.openingBtts.yes).toFixed(2)),
        severity: bttsDropPct <= -10 ? 'high' : 'moderate',
        signalType: 'sharp_steam',
        description: `Drop pe Ambele Marchează (GG): cota a coborât cu ${absDrop.toFixed(1)}% (de la ${odds.openingBtts.yes.toFixed(2)} la ${odds.btts.yes.toFixed(2)}).`,
      });
    }
  }

  // Generate summary
  let steamSummary = '';
  if (alerts.length > 0) {
    const topAlert = alerts.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))[0];
    steamSummary = `Mișcare puternică de piață: ${topAlert.selection} a înregistrat o scădere de ${Math.abs(topAlert.changePercent)}% față de deschidere.`;
  } else {
    steamSummary = 'Cote stabile, fără mișcări abrupte de bani (Smart Money).';
  }

  return {
    hasDroppingOdds: alerts.length > 0,
    maxDropPercent: Number(maxDrop.toFixed(1)),
    dominantMovement,
    alerts,
    steamSummary,
  };
}
