/**
 * FlashStat — Football Scores & AI Betting Radar
 * Combo / Acca Builder Engine (engine/comboBuilder.ts)
 * 
 * Mathematical Formulation:
 * 1. Multi-Match Accumulators (Accas):
 *    - Cross-match selections are statistically independent.
 *    - True Joint Probability: P(Acca) = ∏ P(selection_i)
 *    - Fair Multiplier Odds: O_fair = 1 / P(Acca)
 *    - Bookmaker Total Odds: O_book = ∏ O_book_i
 *    - True Edge %: ((P(Acca) * O_book) - 1) * 100
 * 
 * 2. Same-Game Parlays (SGP / Bet Builder):
 *    - Intra-match selections are correlated (e.g. Home Win & Over 2.5, BTTS & Over 2.5).
 *    - Independent multiplication produces severe mathematical errors (under/over-estimating true odds).
 *    - Instead, we compute the JOINT PROBABILITY directly from the 2D Dixon-Coles score matrix:
 *      P(A ∩ B) = ∑_{(h, a) ∈ (A ∩ B)} Matrix[h][a]
 * 
 * 3. Fractional Kelly Staking for Combos:
 *    - f* = max(0, (b*p - q) / b) * fraction
 */

export type ComboMarketType =
  | 'home'
  | 'draw'
  | 'away'
  | 'over_1_5'
  | 'over_2_5'
  | 'over_3_5'
  | 'under_2_5'
  | 'under_3_5'
  | 'btts_yes'
  | 'btts_no'
  | '1x'
  | 'x2'
  | '12'
  | 'home_and_over_1_5'
  | 'home_and_over_2_5'
  | 'away_and_over_1_5'
  | 'away_and_over_2_5'
  | 'btts_and_over_2_5'
  | 'home_and_btts';

export interface ComboSelectionItem {
  id: string;
  fixtureId: number;
  matchName: string;
  leagueName: string;
  marketType: ComboMarketType;
  marketLabel: string;
  bookmakerOdd: number;
  modelProb: number;
  fairOdd: number;
  edgePercent: number;
  isSniper?: boolean;
}

export interface ComboTicketResult {
  selections: ComboSelectionItem[];
  totalBookmakerOdds: number;
  jointModelProb: number;
  fairTotalOdds: number;
  overallEdgePercent: number;
  evPercent: number;
  compoundedHouseMarginPercent: number;
  transparencyWarning: string;
  suggestedStakeKellyUnits: number; // e.g., 2.5u
  rating: 'GODMODE' | 'VALUE_PLUS' | 'NEUTRAL' | 'NEGATIVE_EV';
  isSameGameParlay: boolean;
  explanation: string;
}

/**
 * Checks if a specific score (h, a) satisfies the condition for a market type.
 */
export function scoreSatisfiesMarket(h: number, a: number, market: ComboMarketType): boolean {
  switch (market) {
    case 'home':
      return h > a;
    case 'draw':
      return h === a;
    case 'away':
      return a > h;
    case '1x':
      return h >= a;
    case 'x2':
      return a >= h;
    case '12':
      return h !== a;
    case 'over_1_5':
      return h + a > 1.5;
    case 'over_2_5':
      return h + a > 2.5;
    case 'over_3_5':
      return h + a > 3.5;
    case 'under_2_5':
      return h + a < 2.5;
    case 'under_3_5':
      return h + a < 3.5;
    case 'btts_yes':
      return h > 0 && a > 0;
    case 'btts_no':
      return h === 0 || a === 0;
    case 'home_and_over_1_5':
      return h > a && h + a > 1.5;
    case 'home_and_over_2_5':
      return h > a && h + a > 2.5;
    case 'away_and_over_1_5':
      return a > h && h + a > 1.5;
    case 'away_and_over_2_5':
      return a > h && h + a > 2.5;
    case 'btts_and_over_2_5':
      return h > 0 && a > 0 && h + a > 2.5;
    case 'home_and_btts':
      return h > a && h > 0 && a > 0;
    default:
      return false;
  }
}

/**
 * Calculates exact joint probability for intra-match selections using Dixon-Coles score matrix.
 */
export function calculateSameGameJointProbability(
  matrix: number[][],
  markets: ComboMarketType[]
): number {
  if (!matrix || matrix.length === 0) return 0;
  const size = matrix.length;
  let jointProb = 0;

  for (let h = 0; h < size; h++) {
    for (let a = 0; a < size; a++) {
      // Check if (h, a) satisfies ALL intra-match criteria simultaneously
      const satisfiesAll = markets.every((m) => scoreSatisfiesMarket(h, a, m));
      if (satisfiesAll) {
        jointProb += matrix[h][a];
      }
    }
  }

  return Number(jointProb.toFixed(4));
}

/**
 * Builds and evaluates a complete betting combo ticket (Acca or SGP).
 */
export function buildAndEvaluateTicket(
  selections: ComboSelectionItem[],
  fixtureMatrixMap?: Map<number, number[][]>
): ComboTicketResult {
  if (selections.length === 0) {
    return {
      selections: [],
      totalBookmakerOdds: 1.0,
      jointModelProb: 0,
      fairTotalOdds: 0,
      overallEdgePercent: 0,
      evPercent: 0,
      compoundedHouseMarginPercent: 0,
      transparencyWarning: '',
      suggestedStakeKellyUnits: 0,
      rating: 'NEUTRAL',
      isSameGameParlay: false,
      explanation: 'Nicio selecție adăugată pe bilet.',
    };
  }

  // 1. Group selections by fixture to detect Same-Game Parlays
  const fixtureGroups = new Map<number, ComboSelectionItem[]>();
  for (const sel of selections) {
    const group = fixtureGroups.get(sel.fixtureId) || [];
    group.push(sel);
    fixtureGroups.set(sel.fixtureId, group);
  }

  const isSameGameParlay = Array.from(fixtureGroups.values()).some((g) => g.length > 1);

  // 2. Compute Joint Probability across all independent match clusters
  let overallJointProb = 1.0;
  let totalBookmakerOdds = 1.0;

  for (const [fixtureId, items] of fixtureGroups.entries()) {
    // Bookmaker odds multiplier for this cluster
    const clusterOdd = items.reduce((acc, it) => acc * it.bookmakerOdd, 1.0);
    totalBookmakerOdds *= clusterOdd;

    if (items.length === 1) {
      // Single selection from this match
      overallJointProb *= items[0].modelProb;
    } else {
      // Multi-selection within same match (correlated SGP)
      const matrix = fixtureMatrixMap?.get(fixtureId);
      if (matrix) {
        const sgpProb = calculateSameGameJointProbability(
          matrix,
          items.map((it) => it.marketType)
        );
        overallJointProb *= Math.max(0.01, sgpProb);
      } else {
        // Fallback with conservative correlation discount if matrix missing
        const rawIndep = items.reduce((acc, it) => acc * it.modelProb, 1.0);
        overallJointProb *= rawIndep * 0.88; // 12% correlation penalty
      }
    }
  }

  overallJointProb = Number(overallJointProb.toFixed(4));
  totalBookmakerOdds = Number(totalBookmakerOdds.toFixed(2));

  const fairTotalOdds = overallJointProb > 0 ? Number((1 / overallJointProb).toFixed(2)) : 999;
  const ev = (overallJointProb * totalBookmakerOdds) - 1;
  const overallEdgePercent = Number((ev * 100).toFixed(1));

  // 3. Compounded House Margin & Transparency Warning (Section 4.4)
  // For N independent events with typical ~5% margin: compounded margin = (1 - (0.95)^N) * 100
  const nSelections = selections.length;
  const compoundedHouseMarginPercent = Number(((1 - Math.pow(0.95, nSelections)) * 100).toFixed(1));
  const transparencyWarning = `Avertisment transparență: Fiecare selecție adăugată multiplică marja casei. Acest bilet are un dezavantaj matematic compus estimat de ~${compoundedHouseMarginPercent}% (marjă reținută de casă).`;


  // 4. Staking (Kelly Fraction = 0.25)
  const b = Math.max(0.1, totalBookmakerOdds - 1);
  const p = overallJointProb;
  const q = 1 - p;
  const rawKelly = Math.max(0, (b * p - q) / b);
  const quarterKellyUnits = Number((rawKelly * 0.25 * 10).toFixed(1)); // on 10u max scale
  const suggestedStakeKellyUnits = overallEdgePercent > 0 ? Math.max(0.5, Math.min(5.0, quarterKellyUnits)) : 0;

  // 5. Rating & Explanation
  let rating: ComboTicketResult['rating'] = 'NEUTRAL';
  let explanation = '';

  if (overallEdgePercent >= 12 && overallJointProb >= 0.20) {
    rating = 'GODMODE';
    explanation = `🔥 OP GODMODE COMBO: Valoare matematică excepțională (+${overallEdgePercent}% edge). Probabilitate cumulată model: ${(overallJointProb * 100).toFixed(1)}% vs Cota casă: ${totalBookmakerOdds}.`;
  } else if (overallEdgePercent >= 4) {
    rating = 'VALUE_PLUS';
    explanation = `✅ Bilet Pozitiv: Margine profitabilă (+${overallEdgePercent}% edge). Cotă justă: ${fairTotalOdds} vs Cotă casă: ${totalBookmakerOdds}.`;
  } else if (overallEdgePercent > -3) {
    rating = 'NEUTRAL';
    explanation = `⚖️ Bilet Echilibrat: Marginea casei absoarbe valoarea (${overallEdgePercent}% edge). ${transparencyWarning}`;
  } else {
    rating = 'NEGATIVE_EV';
    explanation = `⚠️ Valoare Negativă (${overallEdgePercent}% edge): Multiplicarea cotelor crește marja reținută de casă la ~${compoundedHouseMarginPercent}%.`;
  }

  return {
    selections,
    totalBookmakerOdds,
    jointModelProb: overallJointProb,
    fairTotalOdds,
    overallEdgePercent,
    evPercent: overallEdgePercent,
    compoundedHouseMarginPercent,
    transparencyWarning,
    suggestedStakeKellyUnits,
    rating,
    isSameGameParlay,
    explanation,
  };
}
