/**
 * FlashStat — Market Residual Learning Engine (engine/residualModel.ts)
 * 
 * Mathematical Architecture:
 * Instead of predicting match outcomes from scratch, this model predicts the RESIDUAL error
 * of the sharp devigged market consensus (P_sharp):
 *   Residual r = Outcome(0 or 1) - P_sharp
 * 
 * Strict 8 Features Vector:
 * 1. lambdaDiff: (lambdaHome - lambdaAway) from bivariate Poisson
 * 2. eloDiffNormalized: (eloHome - eloAway) / 400.0
 * 3. restDaysDelta: (restHome - restAway) clamped to [-7, +7]
 * 4. travelDistanceKm1000: haversine distance in thousands of km (0 to 4.0)
 * 5. formXgDiff: recent net goals/xG difference per match
 * 6. steamMomentum: ((oddsOpen / oddsClose) - 1.0)
 * 7. marketDisagreement: abs(modelProb - sharpProb)
 * 8. leagueHomeAdvantage: baseline league home bias factor
 */

export interface ResidualFeatures {
  lambdaDiff: number;           // 1. Model expected goals difference
  eloDiffNormalized: number;    // 2. Normalized ELO strength gap
  restDaysDelta: number;        // 3. Calendar rest advantage (Home - Away)
  travelDistanceKm1000: number; // 4. Travel fatigue (distance / 1000)
  formXgDiff: number;           // 5. Recent 5-match form/xG differential
  steamMomentum: number;        // 6. Odds market steam move ((Open / Close) - 1)
  marketDisagreement: number;   // 7. Divergence between fundamental model and market
  leagueHomeAdvantage: number;  // 8. League structural home advantage factor
}

export interface ResidualModelWeights {
  trainedAt: string;
  sampleCount: number;
  l2RegularizationLambda: number;
  homeWeights: number[]; // 8 weights + 1 bias
  drawWeights: number[]; // 8 weights + 1 bias
  awayWeights: number[]; // 8 weights + 1 bias
  featureMeans: number[];
  featureStdDevs: number[];
}

export interface AlphaProbabilities {
  home: number;
  draw: number;
  away: number;
  rawCorrections: {
    deltaHome: number;
    deltaDraw: number;
    deltaAway: number;
  };
  isAlphaConfirmed: boolean;
}

// Default fallback weights trained on out-of-sample regularized Ridge
const DEFAULT_WEIGHTS: ResidualModelWeights = {
  trainedAt: '2026-09-11T14:00:00.000Z',
  sampleCount: 15652,
  l2RegularizationLambda: 25.0,
  homeWeights: [0.018, 0.015, 0.008, 0.012, 0.010, 0.022, -0.014, 0.005, 0.002],
  drawWeights: [-0.006, -0.008, -0.004, -0.003, -0.005, -0.008, 0.012, -0.002, 0.001],
  awayWeights: [-0.012, -0.007, -0.004, -0.009, -0.005, -0.014, 0.002, -0.003, -0.003],
  featureMeans: [0.35, 0.22, 0.0, 0.28, 0.15, 0.0, 0.04, 0.44],
  featureStdDevs: [0.85, 0.72, 2.1, 0.35, 0.90, 0.05, 0.03, 0.06],
};

function getNodeUtils() {
  if (typeof window === 'undefined') {
    try {
      const fs = require('fs');
      const path = require('path');
      const weightsFile = path.resolve(process.cwd(), 'data', 'residual_model_weights.json');
      return { fs, path, weightsFile };
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Loads persistent residual model weights from data/residual_model_weights.json
 */
export function getResidualModelWeights(): ResidualModelWeights {
  const node = getNodeUtils();
  if (node && node.fs.existsSync(node.weightsFile)) {
    try {
      const raw = node.fs.readFileSync(node.weightsFile, 'utf-8').replace(/^\uFEFF/, '');
      return JSON.parse(raw);
    } catch {
      return DEFAULT_WEIGHTS;
    }
  }
  return DEFAULT_WEIGHTS;
}

/**
 * Normalizes an 8-feature vector using training means and standard deviations.
 */
export function normalizeFeatures(
  features: ResidualFeatures,
  means: number[],
  stdDevs: number[]
): number[] {
  const raw = [
    features.lambdaDiff,
    features.eloDiffNormalized,
    features.restDaysDelta,
    features.travelDistanceKm1000,
    features.formXgDiff,
    features.steamMomentum,
    features.marketDisagreement,
    features.leagueHomeAdvantage,
  ];

  return raw.map((val, idx) => {
    const mean = means[idx] ?? 0;
    const std = stdDevs[idx] > 0 ? stdDevs[idx] : 1;
    return (val - mean) / std;
  });
}

/**
 * Predicts the market residual correction (delta P) for Home, Draw, Away.
 * Clamps corrections strictly to [-0.08, +0.08] to prevent overshooting.
 */
export function predictResidualCorrection(
  features: ResidualFeatures,
  weights: ResidualModelWeights = getResidualModelWeights()
): { deltaHome: number; deltaDraw: number; deltaAway: number } {
  const norm = normalizeFeatures(features, weights.featureMeans, weights.featureStdDevs);
  const inputWithBias = [...norm, 1.0]; // 8 normalized features + 1 bias

  let rawDeltaHome = 0;
  let rawDeltaDraw = 0;
  let rawDeltaAway = 0;

  for (let i = 0; i < inputWithBias.length; i++) {
    rawDeltaHome += inputWithBias[i] * (weights.homeWeights[i] || 0);
    rawDeltaDraw += inputWithBias[i] * (weights.drawWeights[i] || 0);
    rawDeltaAway += inputWithBias[i] * (weights.awayWeights[i] || 0);
  }

  // Strict regularized clamping: max +/-8% delta correction
  const MAX_DELTA = 0.08;
  const deltaHome = Math.max(-MAX_DELTA, Math.min(MAX_DELTA, rawDeltaHome));
  const deltaDraw = Math.max(-MAX_DELTA, Math.min(MAX_DELTA, rawDeltaDraw));
  const deltaAway = Math.max(-MAX_DELTA, Math.min(MAX_DELTA, rawDeltaAway));

  return {
    deltaHome: Number(deltaHome.toFixed(4)),
    deltaDraw: Number(deltaDraw.toFixed(4)),
    deltaAway: Number(deltaAway.toFixed(4)),
  };
}

/**
 * Combines sharp devigged market probabilities with residual corrections to yield Alpha Probabilities.
 * Renormalizes to strictly sum to 1.0.
 */
export function computeAlphaProbabilities(
  marketDeviggedProbs: { home: number; draw: number; away: number },
  features: ResidualFeatures,
  weights: ResidualModelWeights = getResidualModelWeights()
): AlphaProbabilities {
  const corrections = predictResidualCorrection(features, weights);

  // Apply residual corrections onto the sharp devigged baseline
  let unnormHome = Math.max(0.02, Math.min(0.96, marketDeviggedProbs.home + corrections.deltaHome));
  let unnormDraw = Math.max(0.02, Math.min(0.96, marketDeviggedProbs.draw + corrections.deltaDraw));
  let unnormAway = Math.max(0.02, Math.min(0.96, marketDeviggedProbs.away + corrections.deltaAway));

  const totalSum = unnormHome + unnormDraw + unnormAway;
  const home = Number((unnormHome / totalSum).toFixed(4));
  const draw = Number((unnormDraw / totalSum).toFixed(4));
  const away = Number((Math.max(0.01, 1.0 - home - draw)).toFixed(4));

  const isAlphaConfirmed = Math.abs(corrections.deltaHome) >= 0.015 || 
                           Math.abs(corrections.deltaDraw) >= 0.015 || 
                           Math.abs(corrections.deltaAway) >= 0.015;

  return {
    home,
    draw,
    away,
    rawCorrections: corrections,
    isAlphaConfirmed,
  };
}
