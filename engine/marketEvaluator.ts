/**
 * FlashStat — Football Scores & AI Betting Radar
 * Multi-Market Evaluator & Highest-Probability Selector (engine/marketEvaluator.ts)
 * 
 * Computes, compares, and ranks ALL prediction market types:
 * - 1X2 (1, X, 2)
 * - Double Chance (1X, X2, 12)
 * - Over/Under (Peste/Sub 0.5, 1.5, 2.5, 3.5, 4.5)
 * - Both Teams To Score (GG, NG)
 * - Draw No Bet (1 DNB, 2 DNB)
 * - Exact Scores (Scor Exact 1-0, 2-0, 2-1, 1-1, 0-0, 3-1, 0-2, etc.)
 * - Combos (1 & Peste 1.5, 2 & Peste 1.5, GG & Peste 2.5, 1X & Peste 1.5, X2 & Peste 1.5)
 */

import type { Fixture, ExactScoreProb } from '../types/football';

export type MarketCategory =
  | '1x2'
  | 'dc'
  | 'ou_15'
  | 'ou_25'
  | 'ou_35'
  | 'ou_other'
  | 'btts'
  | 'dnb'
  | 'exact_score'
  | 'combo'
  | 'sniper';

export interface MarketCandidate {
  id: string;
  fixtureId: number;
  marketKey: string;
  category: MarketCategory;
  label: string;
  shortLabel: string;
  probability: number;
  probPercent: number;
  odd: number;
  isRealOdd: boolean;
  edgePercent: number;
  isSniper: boolean;
  stakeUnits: string;
  description: string;
}

/**
 * Calculates joint probability from 2D score matrix for arbitrary conditions.
 */
function sumMatrix(matrix: number[][], predicate: (h: number, a: number) => boolean): number {
  let sum = 0;
  const size = matrix.length;
  for (let h = 0; h < size; h++) {
    for (let a = 0; a < size; a++) {
      if (predicate(h, a)) {
        sum += matrix[h][a];
      }
    }
  }
  return sum;
}

/**
 * Extracts and prices all prediction markets for a given fixture.
 */
export function getAllMarketCandidates(fixture: Fixture): MarketCandidate[] {
  const pred = fixture.prediction;
  if (!pred) return [];

  const odds = fixture.odds;
  const matrix = pred.scoreMatrix;
  const candidates: MarketCandidate[] = [];

  const add = (
    marketKey: string,
    category: MarketCategory,
    label: string,
    shortLabel: string,
    probability: number,
    realOdd?: number,
    description: string = ''
  ) => {
    if (probability <= 0 || isNaN(probability)) return;
    const clampedProb = Math.min(0.99, Math.max(0.01, probability));
    const isRealOdd = typeof realOdd === 'number' && realOdd > 1.0;
    const fairOdd = Number((1 / clampedProb).toFixed(2));
    const odd = isRealOdd ? Number(realOdd.toFixed(2)) : fairOdd;
    const edge = isRealOdd ? Number((((clampedProb * odd) - 1) * 100).toFixed(1)) : 0;
    const probPercent = Math.round(clampedProb * 100);

    let stakeUnits = '1.0u';
    if (edge >= 8) stakeUnits = '3.0u';
    else if (edge >= 5) stakeUnits = '2.5u';
    else if (edge > 0) stakeUnits = '2.0u';
    else if (probPercent >= 80) stakeUnits = '2.5u';
    else if (probPercent >= 70) stakeUnits = '2.0u';
    else if (probPercent >= 60) stakeUnits = '1.5u';

    const isSniper =
      category === 'ou_25' &&
      marketKey === 'over_25' &&
      [78, 88, 144, 39, 40, 179, 140, 135].includes(fixture.league.id) &&
      probPercent >= 55;

    candidates.push({
      id: `${fixture.id}_${marketKey}`,
      fixtureId: fixture.id,
      marketKey,
      category: isSniper ? 'sniper' : category,
      label: isSniper ? `🎯 ${label}` : label,
      shortLabel,
      probability: clampedProb,
      probPercent,
      odd,
      isRealOdd,
      edgePercent: edge,
      isSniper,
      stakeUnits,
      description,
    });
  };

  // 1. 1X2 Markets
  const pHome = pred.probabilities1X2.home;
  const pDraw = pred.probabilities1X2.draw;
  const pAway = pred.probabilities1X2.away;
  add('home', '1x2', `1 (${fixture.homeTeam.name})`, '1', pHome, odds?.match1X2?.home, `Victorie ${fixture.homeTeam.name}`);
  add('draw', '1x2', 'Egalitate (X)', 'X', pDraw, odds?.match1X2?.draw, 'Rezultat de egalitate');
  add('away', '1x2', `2 (${fixture.awayTeam.name})`, '2', pAway, odds?.match1X2?.away, `Victorie ${fixture.awayTeam.name}`);

  // 2. Double Chance Markets (1X, X2, 12)
  const p1X = pHome + pDraw;
  const pX2 = pAway + pDraw;
  const p12 = pHome + pAway;
  add('1x', 'dc', `1X (${fixture.homeTeam.name} sau Egal)`, '1X', p1X, undefined, `${fixture.homeTeam.name} câștigă sau remiză`);
  add('x2', 'dc', `X2 (Egal sau ${fixture.awayTeam.name})`, 'X2', pX2, undefined, `${fixture.awayTeam.name} câștigă sau remiză`);
  add('12', 'dc', '12 (Orice echipă câștigă)', '12', p12, undefined, 'Fără egal');

  // 3. Over / Under Markets (0.5, 1.5, 2.5, 3.5, 4.5)
  for (const ou of pred.overUnderProbabilities) {
    const quotedOddOver = odds?.overUnder?.find((o) => o.line === ou.line)?.over;
    const quotedOddUnder = odds?.overUnder?.find((o) => o.line === ou.line)?.under;
    const cat: MarketCategory =
      ou.line === 1.5 ? 'ou_15' :
      ou.line === 2.5 ? 'ou_25' :
      ou.line === 3.5 ? 'ou_35' : 'ou_other';

    add(`over_${ou.line}`, cat, `Peste ${ou.line} Goluri`, `+${ou.line}`, ou.over, quotedOddOver, `Total goluri în meci mai mult de ${ou.line}`);
    add(`under_${ou.line}`, cat, `Sub ${ou.line} Goluri`, `-${ou.line}`, ou.under, quotedOddUnder, `Total goluri în meci mai puțin de ${ou.line}`);
  }

  // 4. Both Teams To Score (GG / NG)
  const pBtts = pred.bttsProbabilities.yes;
  const pNg = pred.bttsProbabilities.no;
  add('btts_yes', 'btts', 'Ambele Marchează (GG)', 'GG', pBtts, odds?.btts?.yes, 'Ambele echipe înscriu cel puțin 1 gol');
  add('btts_no', 'btts', 'Nu Marchează Ambele (NG)', 'NG', pNg, odds?.btts?.no, 'Maxim o echipă înscrie sau 0-0');

  // 5. Draw No Bet (DNB)
  const pDnbHome = (pHome + pAway > 0) ? (pHome / (pHome + pAway)) : 0.5;
  const pDnbAway = (pHome + pAway > 0) ? (pAway / (pHome + pAway)) : 0.5;
  add('dnb_home', 'dnb', `1 DNB (${fixture.homeTeam.name})`, '1 DNB', pDnbHome, undefined, `Victorie ${fixture.homeTeam.name} (miza returnată la egal)`);
  add('dnb_away', 'dnb', `2 DNB (${fixture.awayTeam.name})`, '2 DNB', pDnbAway, undefined, `Victorie ${fixture.awayTeam.name} (miza returnată la egal)`);

  // 6. Exact Scores from Score Matrix
  if (matrix && matrix.length > 0) {
    const exactScores = pred.topExactScores && pred.topExactScores.length > 0
      ? pred.topExactScores
      : deriveTopScoresFromMatrix(matrix, 6);

    for (const es of exactScores.slice(0, 5)) {
      add(
        `exact_${es.homeGoals}_${es.awayGoals}`,
        'exact_score',
        `Scor Exact: ${es.homeGoals}-${es.awayGoals}`,
        `${es.homeGoals}-${es.awayGoals}`,
        es.probability,
        es.fairOdds,
        `Scor final exact ${es.homeGoals} - ${es.awayGoals}`
      );
    }

    // 7. Same Game Combos directly derived from 2D score matrix
    const pHomeAndOver15 = sumMatrix(matrix, (h, a) => h > a && h + a > 1.5);
    const pAwayAndOver15 = sumMatrix(matrix, (h, a) => a > h && h + a > 1.5);
    const p1XAndOver15 = sumMatrix(matrix, (h, a) => h >= a && h + a > 1.5);
    const pX2AndOver15 = sumMatrix(matrix, (h, a) => a >= h && h + a > 1.5);
    const pBttsAndOver25 = sumMatrix(matrix, (h, a) => h > 0 && a > 0 && h + a > 2.5);

    add('combo_1_over15', 'combo', `1 & Peste 1.5 Goluri`, '1 & +1.5', pHomeAndOver15, undefined, `${fixture.homeTeam.name} câștigă și min. 2 goluri`);
    add('combo_2_over15', 'combo', `2 & Peste 1.5 Goluri`, '2 & +1.5', pAwayAndOver15, undefined, `${fixture.awayTeam.name} câștigă și min. 2 goluri`);
    add('combo_1x_over15', 'combo', `1X & Peste 1.5 Goluri`, '1X & +1.5', p1XAndOver15, undefined, `${fixture.homeTeam.name} nu pierde și min. 2 goluri`);
    add('combo_x2_over15', 'combo', `X2 & Peste 1.5 Goluri`, 'X2 & +1.5', pX2AndOver15, undefined, `${fixture.awayTeam.name} nu pierde și min. 2 goluri`);
    add('combo_gg_over25', 'combo', `GG & Peste 2.5 Goluri`, 'GG & +2.5', pBttsAndOver25, undefined, `Ambele marchează și minim 3 goluri`);
  }

  return candidates;
}

/**
 * Fallback helper to get top exact scores directly from matrix if not present on prediction object.
 */
function deriveTopScoresFromMatrix(matrix: number[][], limit = 6): ExactScoreProb[] {
  const list: ExactScoreProb[] = [];
  const size = matrix.length;
  for (let h = 0; h < size; h++) {
    for (let a = 0; a < size; a++) {
      const prob = matrix[h][a];
      if (prob > 0.005) {
        list.push({
          homeGoals: h,
          awayGoals: a,
          probability: prob,
          fairOdds: Number((1 / prob).toFixed(2)),
        });
      }
    }
  }
  list.sort((a, b) => b.probability - a.probability);
  return list.slice(0, limit);
}

/**
 * Returns the candidate with the HIGHEST winning probability (maximum win rate / safest prediction).
 * Allows specifying a minimum odd threshold (e.g. 1.15) to prevent 1.01 trivial lines if desired.
 */
export function getHighestProbabilityPick(
  fixture: Fixture,
  minOdd: number = 1.15,
  preferredCategory?: MarketCategory
): MarketCandidate | null {
  const candidates = getAllMarketCandidates(fixture);
  if (candidates.length === 0) return null;

  let pool = candidates.filter((c) => c.odd >= minOdd);
  if (preferredCategory) {
    const filtered = pool.filter((c) => c.category === preferredCategory);
    if (filtered.length > 0) pool = filtered;
  }

  if (pool.length === 0) pool = candidates;

  // Rank strictly by probability descending
  pool.sort((a, b) => b.probability - a.probability);
  return pool[0] || null;
}

/**
 * Returns the best candidate balanced by probability & value edge.
 */
export function getBestBalancedPick(fixture: Fixture): MarketCandidate | null {
  const candidates = getAllMarketCandidates(fixture);
  if (candidates.length === 0) return null;

  // 1. If verified Value Bet exists
  if (fixture.prediction?.valueBets && fixture.prediction.valueBets.length > 0) {
    const topVb = fixture.prediction.valueBets[0];
    const matchCand = candidates.find(
      (c) => c.label.includes(topVb.selection) || topVb.selection.includes(c.shortLabel) || c.marketKey === topVb.market
    );
    if (matchCand) return matchCand;
  }

  // 2. If Sniper Over 2.5 qualifies
  const sniper = candidates.find((c) => c.isSniper);
  if (sniper) return sniper;

  // 3. Clear favorite (Home / Away win probability >= 55% at playable odd >= 1.35)
  const clearFavorite = candidates.find(
    (c) => c.category === '1x2' && (c.marketKey === 'home' || c.marketKey === 'away') && c.probability >= 0.55 && c.odd >= 1.35
  );
  if (clearFavorite) return clearFavorite;

  // 4. Over 2.5 if high-scoring match projected (prob >= 54% @ odd >= 1.55)
  const over25 = candidates.find(
    (c) => c.category === 'ou_25' && c.marketKey === 'over_2.5' && c.probability >= 0.54 && c.odd >= 1.55
  );
  if (over25) return over25;

  // 5. BTTS (GG) if both teams have high scoring rate (prob >= 54% @ odd >= 1.55)
  const bttsYes = candidates.find(
    (c) => c.category === 'btts' && c.marketKey === 'btts_yes' && c.probability >= 0.54 && c.odd >= 1.55
  );
  if (bttsYes) return bttsYes;

  // 6. Double Chance for strong lean in tight games (prob >= 68% @ odd >= 1.25)
  const strongDC = candidates.find(
    (c) => c.category === 'dc' && (c.marketKey === '1x' || c.marketKey === 'x2') && c.probability >= 0.68 && c.odd >= 1.25
  );
  if (strongDC) return strongDC;

  // 7. Under 2.5/3.5 in defensive games (prob >= 60% @ odd >= 1.40)
  const strongUnder = candidates.find(
    (c) => (c.category === 'ou_25' || c.category === 'ou_35') && c.marketKey.startsWith('under') && c.probability >= 0.60 && c.odd >= 1.40
  );
  if (strongUnder) return strongUnder;

  // 8. Ranked scoring across playable primary markets (EV weighted)
  const primaryMarkets = candidates.filter(
    (c) => ['1x2', 'ou_25', 'btts', 'dc', 'ou_15'].includes(c.category) && c.odd >= 1.22
  );
  if (primaryMarkets.length > 0) {
    primaryMarkets.sort((a, b) => {
      const scoreA = (a.probability * a.odd) + (a.category !== 'ou_15' ? 0.08 : 0);
      const scoreB = (b.probability * b.odd) + (b.category !== 'ou_15' ? 0.08 : 0);
      return scoreB - scoreA;
    });
    return primaryMarkets[0];
  }

  candidates.sort((a, b) => b.probability - a.probability);
  return candidates[0] || null;
}

/**
 * Returns top exact scores sorted by probability.
 */
export function getTopExactScoresForFixture(fixture: Fixture, limit = 5): ExactScoreProb[] {
  if (fixture.prediction?.topExactScores && fixture.prediction.topExactScores.length > 0) {
    return fixture.prediction.topExactScores.slice(0, limit);
  }
  if (fixture.prediction?.scoreMatrix) {
    return deriveTopScoresFromMatrix(fixture.prediction.scoreMatrix, limit);
  }
  return [];
}

/**
 * Checks if a fixture qualifies as an Ultra Sniper Sweet Spot pick (Over 2.5 in verified leagues @ 1.60-2.20).
 */
export function isSniperPick(f: Fixture): boolean {
  const pred = f.prediction;
  if (!pred) return false;
  const pOver = pred.overUnderProbabilities?.find((o) => o.line === 2.5)?.over;
  const oddOver = f.odds?.overUnder?.find((o) => o.line === 2.5)?.over;
  if (pOver === undefined || oddOver === undefined) return false;
  const edge = ((pOver * oddOver) - 1) * 100;

  // High-scoring leagues: Bundesliga (78), Eredivisie (88), Jupiler (144), PL (39), Champ (40), etc.
  const isTargetLeague = [78, 88, 144, 39, 40, 179, 140, 135].includes(f.league.id);
  return isTargetLeague && oddOver >= 1.60 && oddOver <= 2.20 && (pOver >= 0.54 || edge >= 3.5);
}

