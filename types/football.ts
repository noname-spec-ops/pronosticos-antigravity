/**
 * FlashStat — Football Scores & AI Betting Radar
 * Global TypeScript definitions for statistical modeling, fixtures, odds, and UI
 */

export type MatchStatus =
  | 'NS'   // Not Started
  | '1H'   // First Half
  | 'HT'   // Half Time
  | '2H'   // Second Half
  | 'ET'   // Extra Time
  | 'P'    // Penalty In Progress
  | 'FT'   // Match Finished
  | 'AET'  // Finished After Extra Time
  | 'PEN'  // Finished After Penalty
  | 'PST'  // Postponed
  | 'CANC' // Cancelled
  | 'ABD'; // Abandoned

export interface Team {
  id: number;
  name: string;
  logo: string;
  shortCode?: string;
}

export interface League {
  id: number;
  name: string;
  country: string;
  countryCode?: string;
  flag?: string;
  logo?: string;
  season: number;
  round?: string;
}

export interface Score {
  halftime: { home: number | null; away: number | null };
  fulltime: { home: number | null; away: number | null };
  extratime?: { home: number | null; away: number | null };
  penalty?: { home: number | null; away: number | null };
  current: { home: number | null; away: number | null };
}

export interface MatchStats {
  possession: { home: number; away: number }; // percentages 0-100
  shotsOnTarget: { home: number; away: number };
  shotsTotal: { home: number; away: number };
  corners: { home: number; away: number };
  fouls: { home: number; away: number };
  yellowCards: { home: number; away: number };
  redCards: { home: number; away: number };
  expectedGoals?: { home: number; away: number }; // xG
}

export interface PlayerStats {
  id: number;
  name: string;
  number: number;
  position: 'G' | 'D' | 'M' | 'F';
  isStarter: boolean;
  minutesPlayed: number;
  yellowCards: number;
  redCards: number;
  foulsCommitted: number;
  foulsDrawn: number;
  cardAggressionIndex?: number;
}

export interface Lineup {
  formation: string;
  isConfirmed?: boolean;
  startingXI: PlayerStats[];
  substitutes: PlayerStats[];
}

export interface InjurySuspension {
  playerId: number;
  playerName: string;
  teamId: number;
  type: 'injury' | 'suspension' | 'doubtful';
  reason: string;
}

export interface Referee {
  id: number;
  name: string;
  country?: string;
  matchesCount: number;
  avgYellowCardsPerMatch: number;
  avgRedCardsPerMatch: number;
  avgFoulsPerMatch: number;
  severityIndex: number; // Normalized to league average
}

export interface Raw1X2Odds {
  home: number;
  draw: number;
  away: number;
}

export interface OverUnderMarket {
  line: number; // 0.5, 1.5, 2.5, 3.5, 4.5
  over: number;
  under: number;
}

export interface BothTeamsToScoreMarket {
  yes: number;
  no: number;
}

export interface MarketOdds {
  bookmaker: string;
  timestamp: string;
  /** Best takeable price per outcome — the basis for edge and staking. */
  match1X2: Raw1X2Odds;
  /**
   * Median price per outcome across bookmakers: the market's opinion rather than
   * the best available deal. Used for the devigged market prior, which must not
   * be derived from the best-of-all line — that biases it toward the favourite
   * and is wide open to a single bad quote.
   */
  consensus1X2?: Raw1X2Odds;
  overUnder: OverUnderMarket[];
  /** Absent when no bookmaker quote is available. Never fabricate a placeholder. */
  btts?: BothTeamsToScoreMarket;
  asianHandicap?: Array<{ line: number; home: number; away: number }>;
  opening1X2?: Raw1X2Odds;
  openingOverUnder?: OverUnderMarket[];
  openingBtts?: BothTeamsToScoreMarket;
  closing1X2?: Raw1X2Odds;
  overround: number; // House margin in decimal (e.g. 1.05 = 5% overround)
}

export interface DeviggedProbabilities {
  home: number;
  draw: number;
  away: number;
  overround: number;
  marginPercent: number;
  method: 'multiplicative' | 'shin' | 'power';
}

export interface DeviggedMarketProbabilities {
  match1X2: DeviggedProbabilities;
  overUnder: Array<{
    line: number;
    over: number;
    under: number;
    marginPercent: number;
  }>;
  btts: {
    yes: number;
    no: number;
    marginPercent: number;
  };
  asianHandicap?: Array<{
    line: number;
    homeProb: number;
    awayProb: number;
    marginPercent: number;
  }>;
}

export interface ExactScoreProb {
  homeGoals: number;
  awayGoals: number;
  probability: number;
  fairOdds: number;
}

export interface AsianHandicapProb {
  line: number; // e.g. -2.5 ... +2.5 in 0.25 steps
  homeWinProb: number;
  awayWinProb: number;
  pushProb?: number;
  fairOddsHome?: number;
  fairOddsAway?: number;
}

export type ValueGrade = 'B' | 'A' | 'A+' | 'SUSPECT';

export interface ValueBet {
  id: string;
  fixtureId: number;
  matchName: string;
  leagueName: string;
  marketType: '1X2' | 'OU' | 'BTTS' | 'AH';
  selection: string; // e.g. 'Home (1)', 'Over 2.5', 'BTTS Yes', 'AH Home -0.25'
  bookmakerOdds: number;
  fairOdds: number;
  modelProb: number;
  marketDeviggedProb: number;
  edgePercent: number; // ((modelProb * bookmakerOdds) - 1) * 100
  kellyFraction: number; // 0.25 fractional Kelly
  suggestedStakePercent: number; // Capped at max bankroll limit (e.g. 2%)
  grade: ValueGrade;
  isCalibratedLeague: boolean;
  sharpConsensusProb?: number;
  softBookDeviationPercent?: number;
  marketDisagreementPercent?: number;
  bestBookmaker?: string;
  confidenceFactor?: number; // 0.1 to 1.0 model uncertainty discount
  isActionable?: boolean;
  warningNote?: string;
}

export interface TeamStrengthMetrics {
  teamId: number;
  teamName: string;
  matchesEvaluated: number;
  homeAttack: number;
  homeDefense: number;
  awayAttack: number;
  awayDefense: number;
  leagueAvgGoalsHome: number;
  leagueAvgGoalsAway: number;
  isShrinkageApplied: boolean;
  /** Per-team home advantage index: ratio of home scoring rate to league home average (shrinkage-adjusted).
   *  1.0 = average; >1.0 = stronger-than-average home advantage; <1.0 = weaker.
   *  Derived from home matches only, with Bayesian shrinkage toward 1.0. */
  homeAdvantageIndex: number;
}


export interface EloRating {
  teamId: number;
  teamName: string;
  rating: number;
  matchesPlayed: number;
  lastUpdated: string;
}

export interface PlayerCardRisk {
  id: number;
  name: string;
  teamName: string;
  position: string;
  riskScore: number;
  riskLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  cardProbability: number;
  fairOdds: number;
  foulsAvg: number;
}

export interface TemporalCardBreakdown {
  period0_30Prob: number;
  period31_60Prob: number;
  period61_90Prob: number;
  criticalMinuteWindow: string;
  secondHalfOver1_5Prob: number;
  postGoalFrustrationRisk: 'LOW' | 'MODERATE' | 'HIGH';
}

export interface CardsPrediction {
  expectedHomeCards: number;
  expectedAwayCards: number;
  expectedTotalCards: number;
  overUnderCards: Array<{ line: number; overProb: number; underProb: number }>;
  refereeImpactFactor: number;
  h2hRivalryFactor: number;
  distributionType: 'negative_binomial';
  highRiskPlayers?: PlayerCardRisk[];
  temporalBreakdown?: TemporalCardBreakdown;
  derbyIntensityScore?: number;
}

export interface CornerMarketLineProb {
  line: number;
  overProb: number;
  underProb: number;
  fairOverOdds: number;
  fairUnderOdds: number;
}

export interface CornersPrediction {
  expectedHomeCorners: number;
  expectedAwayCorners: number;
  expectedTotalCorners: number;
  overUnderCorners: CornerMarketLineProb[];
  homeTeamOverUnder: Array<{ line: number; overProb: number; underProb: number }>;
  awayTeamOverUnder: Array<{ line: number; overProb: number; underProb: number }>;
  mostLikelyCornerRange: string;
  distributionType: 'bivariate_poisson';
  liveProjectedTotalCorners?: number;
}

export interface ModelPrediction {
  fixtureId: number;
  calculatedAt: string;
  lambdaHome: number;
  lambdaAway: number;
  poissonLambdaHome: number;
  poissonLambdaAway: number;
  eloExpectedHomeWin: number;
  eloExpectedAwayWin: number;
  scoreMatrix: number[][]; // 9x9 matrix (0 to 8 goals)
  probabilities1X2: {
    home: number;
    draw: number;
    away: number;
  };
  overUnderProbabilities: Array<{
    line: number;
    over: number;
    under: number;
  }>;
  bttsProbabilities: {
    yes: number;
    no: number;
  };
  topExactScores: ExactScoreProb[];
  asianHandicap: AsianHandicapProb[];
  cardsPrediction: CardsPrediction;
  cornersPrediction?: CornersPrediction;
  valueBets: ValueBet[];
  dixonColesRhoUsed: number;
  isLeagueCalibrated: boolean;
  scheduleFatigueHome?: { restDays: number; matchesLast14Days: number; fatigueFactor: number };
  scheduleFatigueAway?: { restDays: number; matchesLast14Days: number; fatigueFactor: number };
  lineupImpactHome?: { attackFactor: number; defenseFactor: number; missingCount: number; status?: 'confirmed' | 'probable' | 'unannounced'; impactSummary?: string; keyAbsences?: string[] };
  lineupImpactAway?: { attackFactor: number; defenseFactor: number; missingCount: number; status?: 'confirmed' | 'probable' | 'unannounced'; impactSummary?: string; keyAbsences?: string[] };
  motivationAnalysis?: MatchMotivationAnalysis;
  droppingOddsAnalysis?: DroppingOddsAnalysis;
  inPlayMomentum?: InPlayMomentumResult;
  devigged1X2?: DeviggedProbabilities;
  tacticalTracking?: TacticalTrackingAnalysis;
  modelHealthNote?: string;
}

export interface TacticalTrackingTeam {
  defensiveLineHeightMeters: number; // e.g. 52.4m from goal
  packBreakingPassesAvg: number; // e.g. 15.2 / match
  spaceCreationIndex: number; // 0-100 score
  pressingIntensityProximity: number; // players within 5m upon ball loss (e.g. 3.2)
  expectedThreat_xT: number; // e.g. 1.85
  xGChain: number; // e.g. 2.40
  xGBuildup: number; // e.g. 1.15
  fieldTiltPercent: number; // e.g. 62% in final third
  setPieceEfficiency: {
    cornerConversionPercent: number;
    setPieceXgPerMatch: number;
    concededSetPieceXg: number;
  };
  turnoverVulnerability: {
    defensiveThirdLosses: number;
    counterAttackConcededAvg: number;
  };
}

export interface TacticalTrackingAnalysis {
  home: TacticalTrackingTeam;
  away: TacticalTrackingTeam;
  tacticalAdvantageSummary: string;
  counterAttackRiskLevel: 'HIGH' | 'MODERATE' | 'LOW';
  environmentalExhaustionHome: { restDays: number; flightKm: number; heatHumidityImpact: string };
  environmentalExhaustionAway: { restDays: number; flightKm: number; heatHumidityImpact: string };
}

export interface DroppingOddsAlert {
  id: string;
  market: '1X2' | 'OU' | 'BTTS';
  selection: string; // e.g. '1 (Arsenal)', 'Over 2.5'
  openingOdd: number;
  currentOdd: number;
  changePercent: number; // e.g. -14.2%
  dropAbsolute: number; // e.g. -0.35
  severity: 'extreme' | 'high' | 'moderate' | 'drift';
  signalType: 'sharp_steam' | 'market_correction' | 'public_drift';
  description: string;
}

export interface DroppingOddsAnalysis {
  hasDroppingOdds: boolean;
  maxDropPercent: number;
  dominantMovement: 'home_steam' | 'away_steam' | 'draw_steam' | 'over_steam' | 'under_steam' | 'neutral';
  alerts: DroppingOddsAlert[];
  steamSummary: string;
}

export type StakesType = 'title_race' | 'european_spot' | 'relegation_battle' | 'mid_table' | 'derby' | 'cup_final' | 'standard';

export interface MatchNewsItem {
  id: string;
  type: 'stakes' | 'derby' | 'morale' | 'tactical' | 'locker_room';
  title: string;
  summary: string;
  impact: string;
  tone: 'positive' | 'warning' | 'neutral' | 'urgent';
}

export interface MatchMotivationAnalysis {
  homeMotivationScore: number; // 0 - 100
  awayMotivationScore: number; // 0 - 100
  homeStakesType: StakesType;
  awayStakesType: StakesType;
  isDerby: boolean;
  derbyName?: string;
  urgencyLevelHome: 'extreme' | 'high' | 'moderate' | 'low';
  urgencyLevelAway: 'extreme' | 'high' | 'moderate' | 'low';
  homeMotivationMultiplier: number; // e.g. 0.94 - 1.08
  awayMotivationMultiplier: number; // e.g. 0.94 - 1.08
  newsItems: MatchNewsItem[];
  summary: string;
}

export interface InPlayAlert {
  id: string;
  type: 'imminent_goal' | 'extreme_pressure' | 'defensive_lock' | 'card_tension' | 'comeback_surge';
  severity: 'high' | 'medium' | 'info';
  team?: 'home' | 'away';
  title: string;
  description: string;
  suggestedMarket: string;
  confidencePercent: number;
}

export interface InPlayLiveOdds {
  homeNextGoalOdd: number;
  awayNextGoalOdd: number;
  noMoreGoalsOdd: number;
  liveOverLine: number;
  liveOverOdd: number;
  liveUnderOdd: number;
  recommendedBet: {
    selection: string;
    odd: number;
    fairOdd: number;
    marketType: string;
    reasoning: string;
    confidencePercent: number;
    edgePercent: number;
  };
}

export interface InPlayMomentumResult {
  homeMomentum: number; // 0 - 100
  awayMomentum: number; // 0 - 100
  dominantTeam: 'home' | 'away' | 'balanced';
  momentumTrend: 'home_surging' | 'away_surging' | 'neutral';
  pressureDifferential: number;
  alerts: InPlayAlert[];
  liveNextGoalProbabilities: {
    homeNextGoal: number;
    awayNextGoal: number;
    noMoreGoals: number;
    atLeastOneMoreGoal: number;
  };
  lambdaRemainingHome: number;
  lambdaRemainingAway: number;
  expectedRemainingGoals: number;
  isHighPressureState: boolean;
  liveOdds?: InPlayLiveOdds;
}

export interface H2HMatch {
  fixtureId: number;
  date: string;
  season: string;
  homeTeamName: string;
  awayTeamName: string;
  homeScore: number;
  awayScore: number;
  halfTimeHomeScore?: number;
  halfTimeAwayScore?: number;
  totalCards: number;
  totalCorners: number;
  refereeName?: string;
}

export interface TeamRecentMatch {
  date: string;
  opponent: string;
  isHome: boolean;
  scored: number;
  conceded: number;
  result: 'W' | 'D' | 'L';
}

export interface TeamRecentForm {
  teamName: string;
  formSequence: Array<'W' | 'D' | 'L'>; // e.g. ['W', 'W', 'D', 'L', 'W']
  points: number; // e.g. 10 (out of 15)
  goalsScored: number;
  goalsConceded: number;
  cleanSheets: number;
  failedToScore: number;
  over25Count: number;
  bttsCount: number;
  lastMatches: TeamRecentMatch[];
}

export interface TeamHomeAwayStats {
  teamName: string;
  matchesPlayed: number;
  scoredAvg: number;
  concededAvg: number;
  totalGoalsAvg: number;
  cleanSheetPct: number;
  failedToScorePct: number;
  over25Pct: number;
  bttsPct: number;
  winPct: number;
  drawPct: number;
  lossPct: number;
}

export interface StandingEntry {
  rank: number;
  teamName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  zone?: 'champions_league' | 'europa_league' | 'relegation' | 'safe';
}

export interface TeamStandingContext {
  rank: number;
  totalTeams: number;
  points: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalDifference: number;
  zone?: 'champions_league' | 'europa_league' | 'relegation' | 'safe';
}

export interface Fixture {
  id: number;
  date: string; // ISO 8601
  timestamp: number;
  status: MatchStatus;
  elapsedMinute?: number;
  league: League;
  homeTeam: Team;
  awayTeam: Team;
  score: Score;
  stats?: MatchStats;
  lineupHome?: Lineup;
  lineupAway?: Lineup;
  injuries?: InjurySuspension[];
  referee?: Referee;
  odds?: MarketOdds;
  prediction?: ModelPrediction;
  h2h?: H2HMatch[];
  formHome?: TeamRecentForm;
  formAway?: TeamRecentForm;
  homeAwayStatsHome?: TeamHomeAwayStats;
  homeAwayStatsAway?: TeamHomeAwayStats;
  standingHome?: TeamStandingContext;
  standingAway?: TeamStandingContext;
  inPlayMomentum?: InPlayMomentumResult;
  deepStatsHome?: TeamDeepStats;
  deepStatsAway?: TeamDeepStats;
  h2hTactical?: H2HTacticalAnalysis;
  motivationAnalysis?: MatchMotivationAnalysis;
  droppingOddsAnalysis?: DroppingOddsAnalysis;
}

export interface TeamDeepStats {
  teamName: string;
  leagueCode: string;
  totalMatches: number;
  homeStats: TeamHomeAwayStats;
  awayStats: TeamHomeAwayStats;
  overallStats: TeamHomeAwayStats;
  halfTimeBreakdown: {
    goalsScored1H: number;
    goalsScored2H: number;
    goalsConceded1H: number;
    goalsConceded2H: number;
    pctGoalsScored1H: number;
    pctGoalsScored2H: number;
    pctGoalsConceded1H: number;
    pctGoalsConceded2H: number;
    cleanSheet1HPct: number;
  };
  cornerStats: {
    cornersWonAvg: number;
    cornersConcededAvg: number;
    matchTotalCornersAvg: number;
    homeCornersWonAvg?: number;
    homeCornersConcededAvg?: number;
    awayCornersWonAvg?: number;
    awayCornersConcededAvg?: number;
    over85CornersPct: number;
    over95CornersPct: number;
    over105CornersPct: number;
  };
  cardStats: {
    yellowCardsAvg: number;
    redCardsTotal: number;
    opponentCardsAvg: number;
    over35CardsPct: number;
    over45CardsPct: number;
  };
  shotEfficiency: {
    shotsAvg: number;
    shotsOnTargetAvg: number;
    conversionRatePct: number;
  };
  streaks: {
    unbeatenStreak: number;
    winStreak: number;
    scoringStreak: number;
    cleanSheetStreak: number;
  };
}

export interface H2HTacticalAnalysis {
  matchesCount: number;
  homeWins: number;
  draws: number;
  awayWins: number;
  avgGoals: number;
  bttsPct: number;
  over25Pct: number;
  avgCards: number;
  avgCorners: number;
  recentMeetings: H2HMatch[];
  tacticalInsights: string[];
}

export interface OddsBandMetric {
  band: string; // '1.01-1.50' | '1.50-2.00' | '2.00-3.00' | '3.00-5.00' | '5.00+'
  betsCount: number;
  winRatePercent: number;
  predictedWinRatePercent: number;
  roiPercent: number;
  avgClvPercent: number;
  roiCi95: [number, number];
  isRoiSignificant: boolean;
  clvCi95: [number, number];       // 95% CI for CLV within this band
  isClvSignificant: boolean;       // true if CI excludes zero
}

export interface MarketTypeMetric {
  market: string; // '1X2' | 'OU' | 'BTTS'
  betsCount: number;
  winRatePercent: number;
  predictedWinRatePercent: number;
  roiPercent: number;
  avgClvPercent: number;
  roiCi95: [number, number];
  isRoiSignificant: boolean;
}

export interface ClvMetrics {
  avgClvPercent: number;
  positiveClvRatePercent: number;
  ci95: [number, number];
  isSignificant: boolean;
}

export interface CalibrationDecile {
  decile: number;
  binStart: number;
  binEnd: number;
  predictedAvgProb: number;
  observedFrequency: number;
  sampleCount: number;
}

export interface BacktestLeagueMetrics {
  leagueId: number;
  leagueName: string;
  matchesCount: number;
  brierScore1X2: number;
  /** null when the competition has no odds source, so no market baseline exists. */
  bookmakerBrierScore1X2: number | null;
  /** null when there is no market baseline to compare against. */
  beatsBookmakerBrier: boolean | null;
  logLoss1X2: number;
  simulatedRoiPercent: number;
  roiCi95: [number, number];
  isRoiSignificant: boolean;
  clvMetrics: ClvMetrics;
  totalBetsPlaced: number;
  winRate: number;
  maxDrawdownPercent: number;
  calibrationCurve: CalibrationDecile[];
  oddsBands?: OddsBandMetric[];
  heldOutSeasons: string[];
}

export interface WalkForwardWindowMetric {
  windowName: string;
  trainingSeasons: string[];
  testSeason: string;
  matchesCount: number;
  betsCount: number;
  bettingRatePercent: number;
  brierScore: number;
  bookmakerBrierScore: number;
  roiPercent: number;
  roiCi95: [number, number];
  isRoiSignificant: boolean;
  avgClvPercent: number;
  positiveClvRatePercent: number;
  maxDrawdownPercent: number;
}

export interface GlobalModelHealth {
  overallBrierScore: number;
  overallBookmakerBrierScore: number;
  overallLogLoss: number;
  overallRoiPercent: number;
  overallRoiCi95: [number, number];
  isOverallRoiSignificant: boolean;
  overallClvMetrics: ClvMetrics;
  overallMaxDrawdownPercent: number;
  totalMatchesBacktested: number;
  totalBetsPlaced: number;
  bettingRatePercent: number;
  isOverallProfitable: boolean;
  lastBacktestRun: string;
  oddsBandsBreakdown: OddsBandMetric[];
  marketBreakdown?: MarketTypeMetric[];
  walkForwardWindows?: WalkForwardWindowMetric[];
  leagueHealthMap: Record<number, BacktestLeagueMetrics>;
}

export interface HistoricalMatch {
  id: string;
  leagueCode: string;
  leagueName: string;
  season: string;
  date: string; // YYYY-MM-DD
  homeTeam: string;
  awayTeam: string;
  homeGoals: number;
  awayGoals: number;
  halfTimeHomeGoals?: number | null;
  halfTimeAwayGoals?: number | null;
  result: 'H' | 'D' | 'A';
  referee?: string | null;
  homeShots?: number | null;
  awayShots?: number | null;
  homeShotsOnTarget?: number | null;
  awayShotsOnTarget?: number | null;
  homeFouls?: number | null;
  awayFouls?: number | null;
  homeCorners?: number | null;
  awayCorners?: number | null;
  homeYellowCards?: number | null;
  awayYellowCards?: number | null;
  homeRedCards?: number | null;
  awayRedCards?: number | null;
  odds1X2?: {
    home: number;
    draw: number;
    away: number;
  } | null;
  closingOdds1X2?: {
    home: number;
    draw: number;
    away: number;
  } | null;
  oddsOver25?: number | null;
  oddsUnder25?: number | null;
  closingOddsOver25?: number | null;
  closingOddsUnder25?: number | null;
  homeXg?: number | null;
  awayXg?: number | null;
}
