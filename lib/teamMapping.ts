/**
 * FlashStat — Team Name Normalization & Alias Mapping
 * Bridges API-Football names and football-data.co.uk names with alias dictionary and fuzzy Levenshtein match.
 */

// Common aliases mapping: [API-Football name or variation, football-data.co.uk standardized name]
const TEAM_ALIASES: Record<string, string> = {
  // Premier League & Championship
  'manchester united': 'Man United',
  'manchester city': 'Man City',
  'tottenham hotspur': 'Tottenham',
  'tottenham': 'Tottenham',
  'wolverhampton wanderers': 'Wolves',
  'wolverhampton': 'Wolves',
  'newcastle united': 'Newcastle',
  'newcastle': 'Newcastle',
  'brighton and hove albion': 'Brighton',
  'brighton & hove albion': 'Brighton',
  'brighton': 'Brighton',
  'nottingham forest': "Nott'm Forest",
  'nottingham': "Nott'm Forest",
  'west ham united': 'West Ham',
  'west ham': 'West Ham',
  'leicester city': 'Leicester',
  'leicester': 'Leicester',
  'leeds united': 'Leeds',
  'leeds': 'Leeds',
  'sheffield united': 'Sheffield United',
  'sheffield wednesday': 'Sheffield Weds',
  'norwich city': 'Norwich',
  'norwich': 'Norwich',
  'luton town': 'Luton',
  'luton': 'Luton',
  'ipswich town': 'Ipswich',
  'ipswich': 'Ipswich',
  'preston north end': 'Preston',
  'preston': 'Preston',
  'blackburn rovers': 'Blackburn',
  'blackburn': 'Blackburn',
  'queens park rangers': 'QPR',
  'qpr': 'QPR',
  'west bromwich albion': 'West Brom',
  'west brom': 'West Brom',
  'coventry city': 'Coventry',
  'coventry': 'Coventry',
  'hull city': 'Hull',
  'hull': 'Hull',
  'stoke city': 'Stoke',
  'stoke': 'Stoke',
  'swansea city': 'Swansea',
  'swansea': 'Swansea',
  'cardiff city': 'Cardiff',
  'cardiff': 'Cardiff',
  'bristol city': 'Bristol City',
  'bristol rovers': 'Bristol Rvs',
  'bristol rvs': 'Bristol Rvs',
  'plymouth argyle': 'Plymouth',
  'oxford united': 'Oxford',

  // League 1, League 2 & National League
  'birmingham city': 'Birmingham',
  'birmingham': 'Birmingham',
  'lincoln city': 'Lincoln',
  'lincoln': 'Lincoln',
  'burton albion': 'Burton',
  'burton': 'Burton',
  'mansfield town': 'Mansfield',
  'mansfield': 'Mansfield',
  'huddersfield town': 'Huddersfield',
  'huddersfield': 'Huddersfield',
  'bradford city': 'Bradford',
  'bradford': 'Bradford',
  'cambridge united': 'Cambridge',
  'cambridge': 'Cambridge',
  'doncaster rovers': 'Doncaster',
  'doncaster': 'Doncaster',
  'wycombe wanderers': 'Wycombe',
  'wycombe': 'Wycombe',
  'york city': 'York',
  'york': 'York',
  'colchester united': 'Colchester',
  'colchester': 'Colchester',
  'cheltenham town': 'Cheltenham',
  'cheltenham': 'Cheltenham',
  'shrewsbury town': 'Shrewsbury',
  'shrewsbury': 'Shrewsbury',
  'exeter city': 'Exeter',
  'exeter': 'Exeter',
  'tranmere rovers': 'Tranmere',
  'tranmere': 'Tranmere',
  'grimsby town': 'Grimsby',
  'grimsby': 'Grimsby',
  'northampton town': 'Northampton',
  'northampton': 'Northampton',
  'rotherham united': 'Rotherham',
  'rotherham': 'Rotherham',
  'salford city': 'Salford',
  'salford': 'Salford',
  'swindon town': 'Swindon',
  'swindon': 'Swindon',

  // La Liga
  'atletico madrid': 'Ath Madrid',
  'atlético de madrid': 'Ath Madrid',
  'atlético madrid': 'Ath Madrid',
  'athletic club': 'Ath Bilbao',
  'athletic bilbao': 'Ath Bilbao',
  'real betis': 'Betis',
  'celta vigo': 'Celta',
  'rc celta': 'Celta',
  'rayo vallecano': 'Vallecano',
  'deportivo alaves': 'Alaves',
  'deportivo alavés': 'Alaves',
  'alaves': 'Alaves',
  'real sociedad': 'Sociedad',
  'espanyol': 'Espanol',
  'rcd espanyol de barcelona': 'Espanol',
  'las palmas': 'Las Palmas',
  'ud las palmas': 'Las Palmas',
  'leganes': 'Leganes',
  'cd leganes': 'Leganes',
  'valladolid': 'Valladolid',
  'real valladolid': 'Valladolid',

  // Serie A
  'internazionale': 'Inter',
  'inter milan': 'Inter',
  'ac milan': 'Milan',
  'as roma': 'Roma',
  'ss lazio': 'Lazio',
  'juventus': 'Juventus',
  'napoli': 'Napoli',
  'atalanta': 'Atalanta',
  'fiorentina': 'Fiorentina',
  'torino': 'Torino',
  'bologna': 'Bologna',
  'hellas verona': 'Verona',
  'verona': 'Verona',
  'udinese': 'Udinese',
  'empoli': 'Empoli',
  'parma': 'Parma',
  'monza': 'Monza',
  'venezia': 'Venezia',
  'como 1907': 'Como',
  'como': 'Como',
  'cagliari': 'Cagliari',
  'lecce': 'Lecce',
  'genoa': 'Genoa',

  // Bundesliga
  'bayern munich': 'Bayern Munich',
  'fc bayern münchen': 'Bayern Munich',
  'bayern münchen': 'Bayern Munich',
  'borussia dortmund': 'Dortmund',
  'bayer leverkusen': 'Leverkusen',
  'bayer 04 leverkusen': 'Leverkusen',
  'rb leipzig': 'RB Leipzig',
  'rasenballsport leipzig': 'RB Leipzig',
  'eintracht frankfurt': 'Ein Frankfurt',
  'frankfurt': 'Ein Frankfurt',
  'vfb stuttgart': 'Stuttgart',
  'stuttgart': 'Stuttgart',
  'borussia monchengladbach': "M'gladbach",
  'borussia mönchengladbach': "M'gladbach",
  'mönchengladbach': "M'gladbach",
  'sc freiburg': 'Freiburg',
  'freiburg': 'Freiburg',
  'vfl wolfsburg': 'Wolfsburg',
  'wolfsburg': 'Wolfsburg',
  'tsg 1899 hoffenheim': 'Hoffenheim',
  'hoffenheim': 'Hoffenheim',
  '1. fsv mainz 05': 'Mainz',
  'mainz 05': 'Mainz',
  'mainz': 'Mainz',
  'fc augsburg': 'Augsburg',
  'augsburg': 'Augsburg',
  'sv werder bremen': 'Werder Bremen',
  'werder bremen': 'Werder Bremen',
  '1. fc heidenheim 1846': 'Heidenheim',
  'heidenheim': 'Heidenheim',
  '1. fc union berlin': 'Union Berlin',
  'union berlin': 'Union Berlin',
  'fc st. pauli': 'St Pauli',
  'st. pauli': 'St Pauli',
  'holstein kiel': 'Holstein Kiel',
  'vfl bochum': 'Bochum',
  'bochum': 'Bochum',

  // Ligue 1
  'paris saint germain': 'Paris SG',
  'paris saint-germain': 'Paris SG',
  'psg': 'Paris SG',
  'olympique de marseille': 'Marseille',
  'olympique marseille': 'Marseille',
  'marseille': 'Marseille',
  'as monaco': 'Monaco',
  'monaco': 'Monaco',
  'olympique lyonnais': 'Lyon',
  'lyon': 'Lyon',
  'lille osc': 'Lille',
  'lille': 'Lille',
  'rc lens': 'Lens',
  'lens': 'Lens',
  'stade rennais fc': 'Rennes',
  'rennes': 'Rennes',
  'ogc nice': 'Nice',
  'nice': 'Nice',
  'stade brestois 29': 'Brest',
  'brest': 'Brest',
  'stade de reims': 'Reims',
  'reims': 'Reims',
  'rc strasbourg alsace': 'Strasbourg',
  'strasbourg': 'Strasbourg',
  'toulouse fc': 'Toulouse',
  'toulouse': 'Toulouse',
  'montpellier hsc': 'Montpellier',
  'montpellier': 'Montpellier',
  'fc nantes': 'Nantes',
  'nantes': 'Nantes',
  'angers sco': 'Angers',
  'angers': 'Angers',
  'aj auxerre': 'Auxerre',
  'auxerre': 'Auxerre',
  'as saint-etienne': 'St Etienne',
  'saint-etienne': 'St Etienne',
  'le havre ac': 'Le Havre',
  'le havre': 'Le Havre',

  // Spellings emitted by the live providers (ESPN, TheSportsDB, OpenLigaDB).
  // These are matched via the canonical key, so spacing, punctuation and
  // diacritics do not need separate entries.
  'celta de vigo': 'Celta',
  'deportivo de la coruna': 'La Coruna',
  'real sporting': 'Sporting Gijon',
  'sporting de gijon': 'Sporting Gijon',
  'athletic club bilbao': 'Ath Bilbao',
  'real betis balompie': 'Betis',
  'rayo vallecano de madrid': 'Vallecano',
  'ud almeria': 'Almeria',
  'girona fc': 'Girona',
  'rcd mallorca': 'Mallorca',
  'real oviedo': 'Oviedo',
  'cd tenerife': 'Tenerife',
  'sd huesca': 'Huesca',
  'sd eibar': 'Eibar',
  'racing de santander': 'Santander',
  'burgos cf': 'Burgos',
  'tsg hoffenheim': 'Hoffenheim',
  'borussia m gladbach': "M'gladbach",
  'fc koln': 'FC Koln',
  '1 fc koln': 'FC Koln',
  'hamburger sv': 'Hamburg',
  'hamburgo': 'Hamburg',
  'internazionale milano': 'Inter',
  'fc internazionale': 'Inter',
  'ac monza': 'Monza',
  'us sassuolo': 'Sassuolo',
  'olympique lyon': 'Lyon',
  'paris fc': 'Paris FC',

  // --- Competitions added by scripts/ingestExtraLeagues.ts ---
  // The live providers and football-data.co.uk spell several of these
  // differently; without an entry the club falls back to a generic profile.
  'universitatea craiova': 'Univ. Craiova',
  'u craiova 1948': 'U Craiova 1948',
  'fcsb': 'FCSB',
  'rapid bucuresti': 'FC Rapid Bucuresti',
  'fc rapid': 'FC Rapid Bucuresti',
  'dinamo bucuresti': 'Dinamo Bucuresti',
  'sepsi osk': 'Sepsi',
  'rb salzburg': 'Salzburg',
  'red bull salzburg': 'Salzburg',
  'fc red bull salzburg': 'Salzburg',
  'sk sturm graz': 'Sturm Graz',
  'bsc young boys': 'Young Boys',
  'fc basel 1893': 'Basel',
  'fc zurich': 'Zurich',
  'fc midtjylland': 'Midtjylland',
  'fc kobenhavn': 'FC Copenhagen',
  'copenhagen': 'FC Copenhagen',
  'malmo ff': 'Malmo FF',
  'djurgardens if': 'Djurgarden',
  'bodo/glimt': 'Bodo/Glimt',
  'fk bodo glimt': 'Bodo/Glimt',
  'molde fk': 'Molde',
  'lillestrom sk': 'Lillestrom',
  'rosenborg bk': 'Rosenborg',
  'shamrock rovers': 'Shamrock Rovers',
  'flamengo': 'Flamengo RJ',
  'flamengo rj': 'Flamengo RJ',
  'botafogo rj': 'Botafogo RJ',
  'atletico mineiro': 'Atletico-MG',
  'new york city fc': 'New York City',
  'new york red bulls': 'New York Red Bulls',
  'red bull new york': 'New York Red Bulls',
  'inter miami cf': 'Inter Miami',
  'la galaxy': 'Los Angeles Galaxy',
  'lafc': 'Los Angeles FC',
  'club america': 'Club America',
  'cf america': 'Club America',
  'cd guadalajara': 'Guadalajara Chivas',
  'guadalajara': 'Guadalajara Chivas',

  // --- UEFA competition spellings (football-data.org) ---
  'psv': 'PSV Eindhoven',
  'feyenoord rotterdam': 'Feyenoord',
  'sporting clube de portugal': 'Sp Lisbon',
  'sporting cp': 'Sp Lisbon',
  'sporting clube de braga': 'Sp Braga',
  'sport lisboa e benfica': 'Benfica',
  'real sociedad de futbol': 'Sociedad',
  'royale union saint-gilloise': 'St. Gilloise',
  'royal antwerp': 'Antwerp',
  'club brugge kv': 'Club Brugge',
  'racing club de lens': 'Lens',
  'fk bodo/glimt': 'Bodo/Glimt',
  'lask linz': 'LASK',
  'fk crvena zvezda': 'Crvena Zvezda',
  'fk shakhtar donetsk': 'Shakhtar',
  'gnk dinamo zagreb': 'Dinamo Zagreb',
  'ac sparta praha': 'Sparta Prague',
  'sk slavia praha': 'Slavia Prague',
  'sk slovan bratislava': 'Slovan Bratislava',
  'viking fk': 'Viking',
  'pae olympiakos sfp': 'Olympiakos',
  'pae aek': 'AEK'
};

/**
 * Tokens that mark a DIFFERENT entity sharing a first team's name: reserve,
 * youth and feeder sides. Without this guard, containment matching rated
 * "Bayern Munich II" with Bayern's first-team ELO.
 */
const RESERVE_TEAM_MARKERS: RegExp[] = [
  // Word boundaries matter: an unanchored /ii+/ would also flag "Viitorul".
  /\bi{2,}\b/i,
  /\b(b|c)\s*team\b/i,
  /\bu\s?-?\s?(15|16|17|18|19|20|21|23)\b/i,
  /\bsub\s?-?\s?(17|19|20|21|23)\b/i,
  /\breserves?\b/i,
  /\bamateure?\b/i,
  /\bacademy\b/i,
  /\bcastilla\b/i,
  /\byouth\b/i,
  /\bjuniors?\b/i,
  /\bwomen('s)?\b/i,
  /\bf(e|é)m(e|i)nin/i,   // femenino (ES), féminin (FR)
  /\bfrauen\b/i,
  /\s(b|c)$/i,
];

/** True when the name denotes a reserve/youth/women's side rather than a first team. */
export function isNonFirstTeam(name: string): boolean {
  return RESERVE_TEAM_MARKERS.some((re) => re.test(name || ''));
}

/** Alias table indexed by canonical key, built once at module load. */
const ALIAS_BY_CANONICAL_KEY = new Map<string, string>();

export function normalizeTeamName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacritics
    .replace(/^(fc|cf|sc|afc|ac|rc|rcd|ogc|vfb|vfl|sv|tsg|fsv|cd|ud|sd|as|ss|us)\s+/i, '')
    .replace(/\s+(fc|cf|sc|afc|ac|osc|hsc|sco|hove albion|hotspur|wanderers|rovers|albion|town|city|united)$/i, '')
    .replace(/[\s\-_.'`’&]+/g, '')
    .trim();
}

export function levenshteinDistance(a: string, b: string): number {
  const an = a ? a.length : 0;
  const bn = b ? b.length : 0;
  if (an === 0) return bn;
  if (bn === 0) return an;
  
  const matrix = Array.from({ length: bn + 1 }, (_, i) => [i]);
  for (let j = 0; j <= an; j++) matrix[0][j] = j;

  for (let i = 1; i <= bn; i++) {
    for (let j = 1; j <= an; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  return matrix[bn][an];
}

/**
 * Minimum confidence at which a fuzzy match may be treated as the same club.
 * Callers that feed the statistical model should require at least this.
 */
export const MIN_RELIABLE_MATCH_CONFIDENCE = 0.92;

/**
 * Resolves an incoming team name against a list of known names.
 *
 * Returns null rather than a low-confidence guess. Silent wrong matches are the
 * worst failure mode here: the model happily rates Lillestrøm (Norway) with
 * Lille's (Ligue 1) ELO and reports the prediction as fully calibrated.
 */
export function matchTeamName(
  inputName: string,
  candidateNames: string[]
): { matchedName: string; confidence: number } | null {
  if (!inputName || candidateNames.length === 0) return null;

  const rawLower = inputName.toLowerCase().trim();

  // 0. A reserve, youth or women's side is a different team. Resolving it to the
  //    first team would silently attach the wrong ratings and H2H history.
  if (isNonFirstTeam(inputName)) return null;

  // 1. Alias check, both literally and through the canonical key so that
  //    spacing, punctuation and diacritics do not each need their own entry.
  const aliasTarget = TEAM_ALIASES[rawLower] ?? ALIAS_BY_CANONICAL_KEY.get(canonicalClubKey(inputName));
  if (aliasTarget) {
    const candidate = candidateNames.find((c) => c.toLowerCase() === aliasTarget.toLowerCase())
      ?? candidateNames.find((c) => canonicalClubKey(c) === canonicalClubKey(aliasTarget));
    if (candidate) return { matchedName: candidate, confidence: 1.0 };
  }

  // 2. Exact match (case-insensitive)
  const exact = candidateNames.find((c) => c.toLowerCase() === rawLower);
  if (exact) return { matchedName: exact, confidence: 1.0 };

  // 3. Identity-preserving key equality (folds diacritics, club prefixes and
  //    place-name transliterations, but NOT distinguishing suffixes).
  const canonInput = canonicalClubKey(inputName);
  const canonExact = candidateNames.find((c) => canonicalClubKey(c) === canonInput);
  if (canonExact) return { matchedName: canonExact, confidence: 0.98 };

  // 4. Lossy normalisation equality. normalizeTeamName drops suffixes such as
  //    "united"/"city", so it can conflate distinct clubs ("Man United" and
  //    "Man City" both become "man"). Accepted only when it is unambiguous.
  const normInput = normalizeTeamName(inputName);
  const normMatches = candidateNames.filter((c) => normalizeTeamName(c) === normInput);
  if (normMatches.length === 1) {
    // If the two names are equal only AFTER dropping a suffix, they may well be
    // different clubs ("Barcelona SC" of Ecuador vs Barcelona). Report that as
    // below the reliable threshold so callers can refuse to use it.
    const reliedOnSuffixStripping = canonicalClubKey(normMatches[0]) !== canonicalClubKey(inputName);
    return { matchedName: normMatches[0], confidence: reliedOnSuffixStripping ? 0.8 : 0.95 };
  }
  if (normMatches.length > 1) {
    // Ambiguous: e.g. input normalising to "man" against both Manchester clubs.
    // Guessing here is how a favourite gets rated as a relegation candidate.
    return null;
  }

  // 5. Containment, but only when the two names are of comparable length.
  //    The unguarded version matched any candidate that was a substring of the
  //    input, so "Lillestrom" -> "Lille", "Le Mans" -> "Man United",
  //    "Inter Miami" -> "Inter" and "Barcelona SC" -> "Barcelona".
  const MIN_LENGTH_RATIO = 0.85;
  let containmentBest: { name: string; ratio: number } | null = null;
  for (const candidate of candidateNames) {
    const canonCand = canonicalClubKey(candidate);
    if (canonInput.length < 4 || canonCand.length < 4) continue;
    if (!canonCand.includes(canonInput) && !canonInput.includes(canonCand)) continue;

    const ratio = Math.min(canonInput.length, canonCand.length) / Math.max(canonInput.length, canonCand.length);
    if (ratio < MIN_LENGTH_RATIO) continue;
    if (!containmentBest || ratio > containmentBest.ratio) {
      containmentBest = { name: candidate, ratio };
    }
  }
  if (containmentBest) return { matchedName: containmentBest.name, confidence: 0.93 };

  // 6. Fuzzy match on the identity-preserving key, requiring a clear winner.
  let best: { name: string; score: number } | null = null;
  let runnerUpScore = 0;
  for (const candidate of candidateNames) {
    const score = teamNameSimilarity(inputName, candidate);
    if (!best || score > best.score) {
      runnerUpScore = best ? best.score : runnerUpScore;
      best = { name: candidate, score };
    } else if (score > runnerUpScore) {
      runnerUpScore = score;
    }
  }

  // A near-tie means the name does not identify one club, so refuse.
  const MIN_FUZZY_SCORE = 0.9;
  const MIN_MARGIN_OVER_RUNNER_UP = 0.05;
  if (best && best.score >= MIN_FUZZY_SCORE && best.score - runnerUpScore >= MIN_MARGIN_OVER_RUNNER_UP) {
    return { matchedName: best.name, confidence: Number(best.score.toFixed(2)) };
  }

  return null;
}

/**
 * Identity-preserving club key for duplicate detection.
 *
 * Unlike normalizeTeamName, this does NOT strip distinguishing suffixes:
 * normalizeTeamName maps both "Manchester City" and "Manchester United" to
 * "manchester", which is fine for looking a club up in a historical dataset but
 * catastrophic for deciding whether two fixtures are the same match.
 */
/**
 * Place-name spellings that different providers use for the same club, e.g.
 * OpenLigaDB's "FC Bayern München" vs ESPN's "Bayern Munich".
 *
 * These are transliterations of one identical token, so folding them is exact
 * rather than fuzzy. That matters: global string similarity cannot separate
 * "Bayern München"/"Bayern Munich" (0.77) from "Manchester City"/"Manchester
 * United" (0.75), which are two different clubs.
 */
const PLACE_NAME_VARIANTS: Array<[RegExp, string]> = [
  [/munchen/g, 'munich'],
  [/koln/g, 'cologne'],
  [/nurnberg/g, 'nuremberg'],
  [/milano/g, 'milan'],
  [/genova/g, 'genoa'],
  [/praha/g, 'prague'],
  [/wien/g, 'vienna'],
  [/lisboa/g, 'lisbon'],
  [/moskva/g, 'moscow'],
  [/beograd/g, 'belgrade'],
  [/warszawa/g, 'warsaw'],
  [/bucuresti/g, 'bucharest'],
  [/athina/g, 'athens'],
  [/kobenhavn/g, 'copenhagen'],
];

/**
 * Club-type tokens that carry no identity. Dropped when they appear as a whole
 * word at the start or end of a name.
 *
 * "united", "city", "town", "rovers", "wanderers" and "albion" are deliberately
 * NOT here: they distinguish clubs that share a city.
 */
/**
 * Letters that have no combining-mark decomposition, so NFD normalisation leaves
 * them intact and the alphanumeric filter then deletes them outright:
 * "FC København" would become "kbenhavn" and never match "FC Copenhagen".
 * Mostly Nordic, which matters now that the dataset covers Scandinavia.
 */
const NON_DECOMPOSING_LETTERS: Array<[RegExp, string]> = [
  [/ø/g, 'o'],
  [/æ/g, 'ae'],
  [/œ/g, 'oe'],
  [/ß/g, 'ss'],
  [/đ/g, 'd'],
  [/ł/g, 'l'],
  [/ı/g, 'i'],
  [/þ/g, 'th'],
  [/ð/g, 'd'],
];

const CLUB_TYPE_TOKENS = new Set([
  'fc', 'cf', 'afc', 'ac', 'rc', 'rcd', 'cd', 'ud', 'sd', 'as', 'ss', 'ssc', 'us',
  'ogc', 'vfb', 'vfl', 'sv', 'tsg', 'fsv', 'bsc', 'bc', 'sk', 'fk', 'bk', 'kv', 'gnk',
  'nk', 'hnk', 'pae', 'club', 'clube', 'calcio', 'spa',
]);

/**
 * Club-type tokens that are safe to drop only at the START of a name.
 * "SC Freiburg" and "SC Braga" carry no identity in the "SC", but "Barcelona SC"
 * (Ecuador) is a different club from FC Barcelona, so a trailing "SC" must stay.
 */
const PREFIX_ONLY_CLUB_TOKENS = new Set(['sc']);

/** Connector particles that vary between sources ("Club Atletico de Madrid"). */
const CONNECTOR_TOKENS = new Set(['de', 'del', 'della', 'di', 'do', 'da', 'du', 'des', 'of', 'the', 'el', 'la', 'le', 'e']);

/**
 * Identity-preserving club key.
 *
 * Works on whitespace-delimited TOKENS rather than the concatenated string.
 * Operating on the concatenation is subtly wrong: an end-anchored alternation
 * such as /(fc|cf|afc)$/ applied to "sevillafc" matches "afc" from the leftmost
 * possible position and yields "sevill".
 *
 * Unlike normalizeTeamName this does NOT strip distinguishing suffixes:
 * normalizeTeamName maps both "Manchester City" and "Manchester United" to
 * "manchester", which is fine for a fuzzy dataset lookup but catastrophic for
 * deciding whether two records describe the same club.
 */
export function canonicalClubKey(name: string): string {
  let normalised = (name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // strip combining diacritical marks

  // Letters with no combining form survive NFD untouched and would then be
  // deleted outright by the alphanumeric filter below.
  for (const [pattern, replacement] of NON_DECOMPOSING_LETTERS) {
    normalised = normalised.replace(pattern, replacement);
  }

  let tokens = normalised
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (tokens.length === 0) return '';

  // Leading club-type tokens and founding years ("1. FC Koln", "SSC Napoli").
  while (
    tokens.length > 1 &&
    (CLUB_TYPE_TOKENS.has(tokens[0]) || PREFIX_ONLY_CLUB_TOKENS.has(tokens[0]) || /^\d+$/.test(tokens[0]))
  ) {
    tokens = tokens.slice(1);
  }

  // Trailing club-type tokens and founding years ("Sevilla FC", "Bologna FC 1909").
  while (tokens.length > 1 && (CLUB_TYPE_TOKENS.has(tokens[tokens.length - 1]) || /^\d+$/.test(tokens[tokens.length - 1]))) {
    tokens = tokens.slice(0, -1);
  }

  // Connector particles anywhere in the remainder.
  const meaningful = tokens.filter((t) => !CONNECTOR_TOKENS.has(t));
  if (meaningful.length > 0) tokens = meaningful;

  let key = tokens.join('');
  for (const [pattern, replacement] of PLACE_NAME_VARIANTS) {
    key = key.replace(pattern, replacement);
  }
  return key;
}

for (const [variant, target] of Object.entries(TEAM_ALIASES)) {
  ALIAS_BY_CANONICAL_KEY.set(canonicalClubKey(variant), target);
}

/**
 * Canonical key AFTER alias resolution.
 *
 * Needed when comparing records from two different sources directly (H2H
 * lookup): football-data.org writes "Paris Saint-Germain FC" while
 * football-data.co.uk writes "Paris SG", and no amount of string normalisation
 * bridges that — only the alias table does.
 */
const resolvedKeyCache = new Map<string, string>();

export function resolvedClubKey(name: string): string {
  // Memoised: callers run this over the whole 62k-match dataset, and the input
  // alphabet is only ~850 distinct club names. Without the cache each H2H lookup
  // recomputed 125k tokenisations.
  const cached = resolvedKeyCache.get(name);
  if (cached !== undefined) return cached;

  const raw = (name || '').toLowerCase().trim();
  const target = TEAM_ALIASES[raw] ?? ALIAS_BY_CANONICAL_KEY.get(canonicalClubKey(name));
  const key = canonicalClubKey(target ?? name);
  resolvedKeyCache.set(name, key);
  return key;
}

/**
 * Similarity in [0,1] between two club names, preserving suffixes.
 * Used for duplicate detection across providers, where the same club arrives as
 * e.g. "FC Bayern München" and "Bayern Munich".
 */
export function teamNameSimilarity(a: string, b: string): number {
  const na = canonicalClubKey(a);
  const nb = canonicalClubKey(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const maxLen = Math.max(na.length, nb.length);
  return 1 - levenshteinDistance(na, nb) / maxLen;
}
