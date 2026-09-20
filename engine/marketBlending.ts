/**
 * FlashStat — Market Prior Blending Engine
 * 
 * Incorporates closing/opening devigged market probabilities as an informative Bayesian prior.
 * The market consensus is an exceptionally strong predictor; blending the statistical model
 * with the market prior sharpens calibration and reduces variance on noisy 3-way outcomes.
 */

import { MODEL_CONFIG } from './config';

export interface MarketBlendedProbabilities {
  probabilities1X2: {
    home: number;
    draw: number;
    away: number;
  };
  isMarketBlended: boolean;
  marketWeightUsed: number;
}

export function blendWithMarketPrior(
  modelProbs1X2: { home: number; draw: number; away: number },
  marketDevigged1X2?: { home: number; draw: number; away: number } | null,
  modelWeight: number = MODEL_CONFIG.MARKET_PRIOR.MODEL_WEIGHT
): MarketBlendedProbabilities {
  if (!marketDevigged1X2 || marketDevigged1X2.home <= 0 || marketDevigged1X2.away <= 0) {
    return {
      probabilities1X2: modelProbs1X2,
      isMarketBlended: false,
      marketWeightUsed: 0,
    };
  }

  const wModel = Math.max(0.1, Math.min(1.0, modelWeight));
  const wMarket = 1.0 - wModel;

  const rawHome = modelProbs1X2.home * wModel + marketDevigged1X2.home * wMarket;
  const rawDraw = modelProbs1X2.draw * wModel + marketDevigged1X2.draw * wMarket;
  const rawAway = modelProbs1X2.away * wModel + marketDevigged1X2.away * wMarket;

  const sum = rawHome + rawDraw + rawAway;

  return {
    probabilities1X2: {
      home: Number((rawHome / sum).toFixed(4)),
      draw: Number((rawDraw / sum).toFixed(4)),
      away: Number((rawAway / sum).toFixed(4)),
    },
    isMarketBlended: true,
    marketWeightUsed: Number(wMarket.toFixed(2)),
  };
}