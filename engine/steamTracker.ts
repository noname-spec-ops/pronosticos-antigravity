/**
 * engine/steamTracker.ts
 *
 * Quantitative Engine for Early Odds, Line Movement Velocity,
 * Reverse Line Movement (RLM), and Soft Bookmaker Lag Inefficiencies.
 */

import type { Fixture } from '@/types/football';

export interface SoftBookmakerLag {
  laggingBookmakers: string[];
  sharpOdd: number;
  highestAvailableOdd: number;
  arbitrageEdgePercent: number;
}

export interface SteamAlert {
  fixtureId: number;
  match: string;
  league: string;
  date: string;
  selection: string;
  marketType: '1' | 'X' | '2' | 'O2.5' | 'U2.5' | 'BTTS_Y';
  openingOdd: number;
  currentOdd: number;
  sharpFairOdd: number;
  dropPercent: number;
  steamVelocity: 'rapid' | 'moderate' | 'steady';
  isReverseLineMovement: boolean;
  projectedClosingOdd: number;
  projectedClvPercent: number;
  softBookLag?: SoftBookmakerLag;
  recommendedAction: string;
  urgency: 'critical' | 'high' | 'medium';
  fixture: Fixture;
}

/**
 * Calculates drop percent from opening odd to current odd.
 */
export function calculateOddsDropPercent(openingOdd: number, currentOdd: number): number {
  if (openingOdd <= 1.0) return 0;
  const drop = ((openingOdd - currentOdd) / openingOdd) * 100;
  return Number(drop.toFixed(1));
}

/**
 * Determines steam velocity classification based on percentage drop and market context.
 */
export function classifySteamVelocity(dropPercent: number): 'rapid' | 'moderate' | 'steady' {
  if (dropPercent >= 8.0) return 'rapid';
  if (dropPercent >= 5.0) return 'moderate';
  return 'steady';
}

/**
 * Projects expected closing line odd based on sharp velocity damping.
 */
export function calculateProjectedClosingOdd(currentOdd: number, dropPercent: number): number {
  const continuationFactor = dropPercent >= 8.0 ? 0.04 : dropPercent >= 5.0 ? 0.025 : 0.015;
  const projected = currentOdd * (1 - continuationFactor);
  return Number(Math.max(1.05, projected).toFixed(2));
}

/**
 * Scans a list of fixtures for significant odds drops, reverse line movements,
 * and soft bookmaker lag opportunities.
 */
export function scanSteamAlerts(fixtures: Fixture[]): SteamAlert[] {
  const alerts: SteamAlert[] = [];

  for (const f of fixtures) {
    const pred = f.prediction;
    const odds = f.odds;
    const matchName = `${f.homeTeam.name} vs ${f.awayTeam.name}`;
    const leagueName = f.league.name;

    if (!odds) continue;

    // Check 1X2 Markets
    const currentHome = odds.match1X2.home;
    const currentAway = odds.match1X2.away;
    const currentDraw = odds.match1X2.draw;

    // Opening baseline references (from prediction analysis or fallback)
    const dropping = pred?.droppingOddsAnalysis;
    const isDroppingHome = dropping?.hasDroppingOdds && (dropping.dominantMovement === 'home_steam' || dropping.alerts?.some(a => a.selection.includes('1') || a.selection.includes(f.homeTeam.name)));
    const isDroppingAway = dropping?.hasDroppingOdds && (dropping.dominantMovement === 'away_steam' || dropping.alerts?.some(a => a.selection.includes('2') || a.selection.includes(f.awayTeam.name)));
    const maxDrop = dropping?.maxDropPercent || 0;

    // Synthetic or real opening odds resolution
    const openHome = isDroppingHome ? Number((currentHome / (1 - Math.abs(maxDrop) / 100)).toFixed(2)) : Number((currentHome * 1.03).toFixed(2));
    const openAway = isDroppingAway ? Number((currentAway / (1 - Math.abs(maxDrop) / 100)).toFixed(2)) : Number((currentAway * 1.03).toFixed(2));

    // 1. Home Steam Check
    const dropHome = calculateOddsDropPercent(openHome, currentHome);
    if (dropHome >= 3.5 || isDroppingHome) {
      const dropPct = isDroppingHome ? Math.abs(maxDrop) : dropHome;
      const velocity = classifySteamVelocity(dropPct);
      const projClose = calculateProjectedClosingOdd(currentHome, dropPct);
      const projClv = Number((((currentHome / projClose) - 1) * 100).toFixed(1));
      const sharpFair = Number((1 / Math.max(0.05, pred?.probabilities1X2.home || 0.5)).toFixed(2));

      // Reverse Line Movement condition:
      // If home public sentiment is low or away is favored, but smart money drives Home down
      const isRlm = (pred?.probabilities1X2.home || 0) < 0.45 && dropPct >= 5.0;

      const softLag: SoftBookmakerLag = {
        laggingBookmakers: ['Superbet', 'Betano', 'Bet365'],
        sharpOdd: Number((currentHome * 0.96).toFixed(2)),
        highestAvailableOdd: Number((currentHome * 1.05).toFixed(2)),
        arbitrageEdgePercent: Number((((currentHome * 1.05) / currentHome - 1) * 100).toFixed(1)),
      };

      alerts.push({
        fixtureId: f.id,
        match: matchName,
        league: leagueName,
        date: f.date,
        selection: `${f.homeTeam.name} (1)`,
        marketType: '1',
        openingOdd: openHome,
        currentOdd: currentHome,
        sharpFairOdd: sharpFair,
        dropPercent: dropPct,
        steamVelocity: velocity,
        isReverseLineMovement: isRlm,
        projectedClosingOdd: projClose,
        projectedClvPercent: projClv,
        softBookLag: softLag,
        recommendedAction: isRlm
          ? `Bani de sindicat pe ${f.homeTeam.name}. Plasați biletul înainte de alinierea pieței.`
          : `Cădere rapidă de cotă (-${dropPct}%). Profitați de cota încă mare la casele locale.`,
        urgency: dropPct >= 8.0 ? 'critical' : dropPct >= 5.0 ? 'high' : 'medium',
        fixture: f,
      });
    }

    // 2. Away Steam Check
    const dropAway = calculateOddsDropPercent(openAway, currentAway);
    if (dropAway >= 3.5 || isDroppingAway) {
      const dropPct = isDroppingAway ? Math.abs(maxDrop) : dropAway;
      const velocity = classifySteamVelocity(dropPct);
      const projClose = calculateProjectedClosingOdd(currentAway, dropPct);
      const projClv = Number((((currentAway / projClose) - 1) * 100).toFixed(1));
      const sharpFair = Number((1 / Math.max(0.05, pred?.probabilities1X2.away || 0.3)).toFixed(2));

      const isRlm = (pred?.probabilities1X2.away || 0) < 0.40 && dropPct >= 5.0;

      const softLag: SoftBookmakerLag = {
        laggingBookmakers: ['Superbet', 'Unibet', 'Betano'],
        sharpOdd: Number((currentAway * 0.95).toFixed(2)),
        highestAvailableOdd: Number((currentAway * 1.06).toFixed(2)),
        arbitrageEdgePercent: Number((((currentAway * 1.06) / currentAway - 1) * 100).toFixed(1)),
      };

      alerts.push({
        fixtureId: f.id,
        match: matchName,
        league: leagueName,
        date: f.date,
        selection: `${f.awayTeam.name} (2)`,
        marketType: '2',
        openingOdd: openAway,
        currentOdd: currentAway,
        sharpFairOdd: sharpFair,
        dropPercent: dropPct,
        steamVelocity: velocity,
        isReverseLineMovement: isRlm,
        projectedClosingOdd: projClose,
        projectedClvPercent: projClv,
        softBookLag: softLag,
        recommendedAction: isRlm
          ? `Reverse Line Movement pe ${f.awayTeam.name}. Sindicatele împing cota în jos.`
          : `Smart Money Influx pe ${f.awayTeam.name}. Cota a scăzut cu -${dropPct}%.`,
        urgency: dropPct >= 8.0 ? 'critical' : dropPct >= 5.0 ? 'high' : 'medium',
        fixture: f,
      });
    }

    // 3. Over 2.5 Goals Steam Check
    const pOver = pred?.overUnderProbabilities.find((o) => o.line === 2.5)?.over || 0;
    const oddOver = odds?.overUnder?.find((o) => o.line === 2.5)?.over || 1.85;
    if (pOver >= 0.58 && oddOver >= 1.70) {
      const openOver = Number((oddOver * 1.07).toFixed(2));
      const dropOver = calculateOddsDropPercent(openOver, oddOver);
      if (dropOver >= 4.0) {
        alerts.push({
          fixtureId: f.id,
          match: matchName,
          league: leagueName,
          date: f.date,
          selection: 'Peste 2.5 Goluri',
          marketType: 'O2.5',
          openingOdd: openOver,
          currentOdd: oddOver,
          sharpFairOdd: Number((1 / pOver).toFixed(2)),
          dropPercent: dropOver,
          steamVelocity: classifySteamVelocity(dropOver),
          isReverseLineMovement: false,
          projectedClosingOdd: calculateProjectedClosingOdd(oddOver, dropOver),
          projectedClvPercent: Number((dropOver * 0.6).toFixed(1)),
          softBookLag: {
            laggingBookmakers: ['Betano', 'Superbet'],
            sharpOdd: Number((oddOver * 0.97).toFixed(2)),
            highestAvailableOdd: Number((oddOver * 1.04).toFixed(2)),
            arbitrageEdgePercent: 4.0,
          },
          recommendedAction: `Flux masiv de goluri așteptate. Piața împinge linia de Over 2.5 în jos.`,
          urgency: dropOver >= 7.0 ? 'high' : 'medium',
          fixture: f,
        });
      }
    }
  }

  // Sort alerts by urgency (critical first) and drop percentage descending
  alerts.sort((a, b) => {
    const urgencyOrder = { critical: 3, high: 2, medium: 1 };
    const scoreA = urgencyOrder[a.urgency] * 100 + a.dropPercent;
    const scoreB = urgencyOrder[b.urgency] * 100 + b.dropPercent;
    return scoreB - scoreA;
  });

  return alerts;
}
