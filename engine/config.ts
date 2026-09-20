/**
 * FlashStat — Football Scores & AI Betting Radar
 * Central Engine Configuration Constants
 */

export const MODEL_CONFIG = {
  // 1. Grid & Matrix Bounds
  MATRIX: {
    // 0 to 16 goals (17x17 grid).
    //
    // An 8-goal ceiling discarded real probability mass, and renormalisation
    // pushed it back into the low-score cells, inflating them. The pipeline clamps
    // lambda at 5.5, and joint mass discarded at that lambda measures:
    //   maxGoals  8 -> 20.01%   (the old grid)
    //   maxGoals 12 ->  0.89%
    //   maxGoals 16 ->  0.013%
    // 17x17 is 289 cells evaluated once per fixture, so the cost is negligible.
    MAX_GOALS: 16,
    GRID_SIZE: 17,
  },

  // 2. Dixon-Coles Parameters
  DIXON_COLES: {
    DEFAULT_RHO: -0.13, // Standard Dixon-Coles low scoring correlation parameter
    MIN_RHO: -0.25,
    MAX_RHO: 0.0,
  },

  // 3. ELO Parameters
  ELO: {
    INITIAL_RATING: 1500,
    K_FACTOR: 24,
    HOME_ADVANTAGE_PTS: 75,
    // Goal difference multiplier: mult = ln(|GD| + 1)
    GD_MULTIPLIER_BASE: Math.E,
    // ELO difference to expected goal lambda regression coefficients:
    // lambda_home = base_home * 10^(elo_diff / scale)
    REGRESSION_SCALE: 400,
  },

  // 4. Team Strength & Poisson
  TEAM_STRENGTH: {
    HALF_LIFE_DAYS: 120, // Default half-life for exponential time-decay
    HALF_LIFE_DAYS_GOALS: 120, // Goals fluctuate faster (60-250 days)
    HALF_LIFE_DAYS_CORNERS: 300, // Team corner pressuring styles are more persistent (150-450 days)
    HALF_LIFE_DAYS_CARDS: 300, // Disciplinary and fouling styles are stable (150-450 days)
    TIME_DECAY_RATE: Math.LN2 / 120,
    MIN_MATCHES_THRESHOLD: 15, // Bayesian shrinkage threshold for newly promoted / few match teams
    SHRINKAGE_WEIGHT: 0.5, // Pull towards 1.0 (league average) when below threshold
    DEFAULT_LEAGUE_AVG_HOME_GOALS: 1.55,
    DEFAULT_LEAGUE_AVG_AWAY_GOALS: 1.20,
  },

  // 5. Model Blending
  BLEND: {
    POISSON_WEIGHT: 0.60, // 60% Poisson / Dixon-Coles
    ELO_WEIGHT: 0.40,     // 40% ELO regression
  },

  // 6. Value Betting & Kelly Criterion
  VALUE_BETTING: {
    MIN_EDGE_PERCENT: 5.0,        // Minimum edge to qualify as a value bet (5%)
    SUSPECT_EDGE_PERCENT: 15.0,   // Flagged as SUSPECT if edge exceeds 15% (likely bad data/stale odds)
    KELLY_FRACTION: 0.25,         // Fractional Kelly multiplier (0.25 = quarter Kelly)
    MAX_BANKROLL_STAKE_CAP: 0.02, // 2% maximum bankroll risk per bet
    GRADES: {
      B: { min: 5.0, max: 8.0, label: 'Grade B (5-8%)' },
      A: { min: 8.0, max: 12.0, label: 'Grade A (8-12%)' },
      A_PLUS: { min: 12.0, max: 15.0, label: 'Grade A+ (12-15%)' },
      SUSPECT: { min: 15.0, label: 'SUSPECT (>15% — Re-check data)' },
    },
  },

  // 7. Cards & Referee Engine
  CARDS: {
    NEGATIVE_BINOMIAL_DISPERSION_R: 3.8, // Overdispersion parameter r for cards count
    DEFAULT_LEAGUE_AVG_CARDS: 4.2,
    DEFAULT_LEAGUE_AVG_FOULS: 24.0,
    MAX_CARDS_GRID: 12,
    DEFAULT_RIVALRY_FACTOR: 1.0,
    DERBY_RIVALRY_FACTOR: 1.25,
  },

  // 8. Schedule Fatigue & Congestion
  SCHEDULE: {
    BASELINE_REST_DAYS: 6,
    SHORT_REST_THRESHOLD: 4, // Matches with <= 3 rest days receive fatigue adjustment
    REST_PENALTY_PER_DAY: 0.035, // -3.5% lambda per missing rest day
    CONGESTION_14D_LIMIT: 3, // More than 3 matches in 14 days causes congestion penalty
    CONGESTION_PENALTY: 0.03, // -3.0% lambda per excess match
  },

  // 9. xG & Shots on Target Proxy
  XG_PROXY: {
    GOALS_WEIGHT: 0.60,
    SHOTS_ON_TARGET_WEIGHT: 0.40,
    SOT_CONVERSION_FACTOR: 0.31, // Empirical European average goals per shot on target
  },

  // 10. Market Prior Blending
  MARKET_PRIOR: {
    MODEL_WEIGHT: 0.35,  // 35% fundamental statistical model
    MARKET_WEIGHT: 0.65, // 65% devigged closing/opening market prior
  },

  // 11. Cache TTLs (in seconds)
  CACHE_TTL: {
    LIVE_MATCHES: 60,       // 60 seconds
    DAILY_FIXTURES: 900,    // 15 minutes (900s)
    ODDS: 300,              // 5 minutes (300s)
    HISTORICAL_DATA: 86400, // 24 hours (86400s)
  },
} as const;

export type ModelConfig = typeof MODEL_CONFIG;
