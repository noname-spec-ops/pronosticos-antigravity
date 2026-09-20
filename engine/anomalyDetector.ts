/**
 * FlashStat — Betting Radar & Market Anomaly Detector (engine/anomalyDetector.ts)
 * 
 * Inspired by Qwen Mathematical Anomaly Strategy:
 * - Scans matches for high mathematical edges, referee biases, derby fever, and temporal card spikes.
 */

import type { Fixture, ModelPrediction, ValueBet } from '../types/football';

export type AnomalyType = 'HIGH_EDGE' | 'REFEREE_ANOMALY' | 'DERBY_FEVER' | 'LATE_CARD_HAZARD' | 'WEATHER_FATIGUE';

export interface MatchAnomaly {
  id: string;
  fixtureId: number;
  matchTitle: string;
  leagueName: string;
  type: AnomalyType;
  severity: 'HIGH' | 'MEDIUM';
  title: string;
  description: string;
  actionableRecommendation: string;
  mathematicalEdgePercent?: number;
  timestamp: string;
}

export class AnomalyDetector {
  /**
   * Evaluates a match and its mathematical prediction for market anomalies.
   */
  public static detectMatchAnomalies(fixture: Fixture, prediction: ModelPrediction): MatchAnomaly[] {
    const anomalies: MatchAnomaly[] = [];
    const matchTitle = `${fixture.homeTeam.name} vs ${fixture.awayTeam.name}`;
    const now = new Date().toISOString();

    // 1. High Edge Anomaly (Value Bet with > 8% edge)
    const bestValueBet = prediction.valueBets?.slice().sort((a: ValueBet, b: ValueBet) => b.edgePercent - a.edgePercent)[0];
    if (bestValueBet && bestValueBet.edgePercent >= 8.0) {
      anomalies.push({
        id: `anom_edge_${fixture.id}_${bestValueBet.selection.replace(/\s+/g, '_')}`,
        fixtureId: fixture.id,
        matchTitle,
        leagueName: fixture.league.name,
        type: 'HIGH_EDGE',
        severity: bestValueBet.edgePercent >= 12.0 ? 'HIGH' : 'MEDIUM',
        title: `Oportunitate High Edge: +${bestValueBet.edgePercent.toFixed(1)}% EV`,
        description: `Modelul a identificat o discrepanță majoră pe piața ${bestValueBet.marketType} pentru ${bestValueBet.selection}. Cota corectă: ${bestValueBet.fairOdds.toFixed(2)}, Cota bookmaker: ${bestValueBet.bookmakerOdds.toFixed(2)}.`,
        actionableRecommendation: `Pariu recomandat pe ${bestValueBet.selection} (Stake sugerat: ${bestValueBet.suggestedStakePercent}%).`,
        mathematicalEdgePercent: bestValueBet.edgePercent,
        timestamp: now,
      });
    }

    // 2. Referee Anomaly (Strict / Card-heavy Referee)
    const refFactor = prediction.cardsPrediction?.refereeImpactFactor || 1.0;
    if (refFactor >= 1.20) {
      anomalies.push({
        id: `anom_ref_${fixture.id}`,
        fixtureId: fixture.id,
        matchTitle,
        leagueName: fixture.league.name,
        type: 'REFEREE_ANOMALY',
        severity: refFactor >= 1.30 ? 'HIGH' : 'MEDIUM',
        title: `Arbitru Excepțional de Sever (+${Math.round((refFactor - 1) * 100)}% Cartonașe)`,
        description: `Arbitrul delegat acordă cu ${Math.round((refFactor - 1) * 100)}% mai multe avertismente decât media europeană.`,
        actionableRecommendation: `Atenție la Over 4.5 / 5.5 Cartonașe Totale sau Cartonaș Jucător defensiv.`,
        timestamp: now,
      });
    }

    // 3. Derby Fever Anomaly (Intense rivalry score >= 7.5)
    const derbyScore = prediction.cardsPrediction?.derbyIntensityScore || 0;
    if (derbyScore >= 7.5) {
      anomalies.push({
        id: `anom_derby_${fixture.id}`,
        fixtureId: fixture.id,
        matchTitle,
        leagueName: fixture.league.name,
        type: 'DERBY_FEVER',
        severity: 'HIGH',
        title: `Tensiune Maximă de Derby (Scor Intensitate: ${derbyScore}/10)`,
        description: `Rivalitate istorică intensă detectată. Meciurile directe cumulează o medie ridicată de faulturi tactice și întreruperi.`,
        actionableRecommendation: `Favorabil pentru piețele de cartonașe, faulturi și cornere pe final de meci.`,
        timestamp: now,
      });
    }

    // 4. Late Card Hazard (High second-half card probability)
    const temporal = prediction.cardsPrediction?.temporalBreakdown;
    if (temporal && temporal.secondHalfOver1_5Prob >= 0.70) {
      anomalies.push({
        id: `anom_late_cards_${fixture.id}`,
        fixtureId: fixture.id,
        matchTitle,
        leagueName: fixture.league.name,
        type: 'LATE_CARD_HAZARD',
        severity: 'MEDIUM',
        title: `Cluster Temporal Cartonașe în Repriza a 2-a (${Math.round(temporal.secondHalfOver1_5Prob * 100)}% Probabilitate)`,
        description: `Peste 55% din cartonașele anticipate sunt concentrate în intervalul 61'-90' (fereastra critică ${temporal.criticalMinuteWindow}).`,
        actionableRecommendation: `Oportunitate pentru Over 1.5 / 2.5 Cartonașe în Repriza a 2-a.`,
        timestamp: now,
      });
    }

    return anomalies;
  }
}
