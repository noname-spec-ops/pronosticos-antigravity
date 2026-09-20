/**
 * FlashStat — Lineup & Key Player Absence Adjuster (engine/lineupAdjuster.ts)
 * 
 * Modulates attack/defense lambda based on confirmed starting lineup and key absences.
 * Features:
 * - Positional impact weighting (Striker/Forward -12% to -18%, Playmaker -6% to -10%, Center-Back +8%, Goalkeeper +12%).
 * - Confirmed vs Probable lineup status detection.
 * - Dynamic explanation notes for the UI.
 */

import type { Lineup, InjurySuspension } from '../types/football';

export interface LineupImpact {
  attackFactor: number;
  defenseFactor: number;
  hasLineupAnnounced: boolean;
  status: 'confirmed' | 'probable' | 'unannounced';
  missingKeyPlayersCount: number;
  impactSummary: string;
  keyAbsences: string[];
}

export function evaluateLineupImpact(
  lineup?: Lineup,
  injuries?: InjurySuspension[],
  teamId?: number
): LineupImpact {
  // Filter injuries relevant to this team if teamId is provided
  const relevantInjuries = injuries
    ? teamId
      ? injuries.filter((i) => i.teamId === teamId)
      : injuries
    : [];

  const confirmedAbsences = relevantInjuries.filter(
    (i) => i.type === 'injury' || i.type === 'suspension'
  );
  const doubtfulAbsences = relevantInjuries.filter((i) => i.type === 'doubtful');

  const keyAbsenceNames = confirmedAbsences.map((i) => `${i.playerName} (${i.reason || 'Indisponibil'})`);
  if (doubtfulAbsences.length > 0) {
    doubtfulAbsences.forEach((d) => keyAbsenceNames.push(`${d.playerName} (În dubiu)`));
  }

  const hasLineup = Boolean(lineup && lineup.startingXI && lineup.startingXI.length >= 11);
  const isConfirmed = Boolean(lineup?.isConfirmed && hasLineup);

  if (!hasLineup && confirmedAbsences.length === 0) {
    return {
      attackFactor: 1.0,
      defenseFactor: 1.0,
      hasLineupAnnounced: false,
      status: 'unannounced',
      missingKeyPlayersCount: 0,
      impactSummary: 'Formație standard anticipată',
      keyAbsences: [],
    };
  }

  // Calculate positional impact
  let attackPenalty = 0;
  let defensePenalty = 0;

  for (const abs of confirmedAbsences) {
    const pos = (abs as any).position || 'M';
    if (pos === 'F') {
      attackPenalty += 0.12; // Top forward absence: -12% attack
    } else if (pos === 'M') {
      attackPenalty += 0.06; // Midfield playmaker: -6% attack
      defensePenalty += 0.04; // Loss of midfield shielding: +4% defensive vulnerability
    } else if (pos === 'D') {
      defensePenalty += 0.08; // Center back missing: +8% goals conceded
    } else if (pos === 'G') {
      defensePenalty += 0.12; // Starting goalkeeper missing: +12% goals conceded
    } else {
      attackPenalty += 0.05;
      defensePenalty += 0.04;
    }
  }

  for (const abs of doubtfulAbsences) {
    attackPenalty += 0.03;
    defensePenalty += 0.02;
  }

  // Capped at realistic football bounds (-25% attack max, +25% defense max)
  const finalAttackPenalty = Math.min(0.25, Math.max(0, attackPenalty));
  const finalDefensePenalty = Math.min(0.25, Math.max(0, defensePenalty));

  const attackFactor = Number((1.0 - finalAttackPenalty).toFixed(4));
  const defenseFactor = Number((1.0 + finalDefensePenalty).toFixed(4));

  let summary = isConfirmed ? 'Formație 100% Confirmată' : hasLineup ? 'Echipă probabilă estimată' : 'Formație standard';
  if (finalAttackPenalty >= 0.10) {
    summary = `⚠️ Absențe ofensive majore (-${Math.round(finalAttackPenalty * 100)}% Atac)`;
  } else if (finalDefensePenalty >= 0.10) {
    summary = `🛡️ Absențe defensive (+${Math.round(finalDefensePenalty * 100)}% Vulnerabilitate)`;
  } else if (isConfirmed && confirmedAbsences.length === 0) {
    summary = '🟢 Lot complet & Confirmat';
  }

  return {
    attackFactor,
    defenseFactor,
    hasLineupAnnounced: hasLineup,
    status: isConfirmed ? 'confirmed' : hasLineup ? 'probable' : 'unannounced',
    missingKeyPlayersCount: confirmedAbsences.length + doubtfulAbsences.length,
    impactSummary: summary,
    keyAbsences: keyAbsenceNames,
  };
}