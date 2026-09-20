/**
 * FlashStat — Wikidata Stadium & Geographical Coordinates Fetcher (scripts/fetchStadiums.ts)
 * 
 * Architectural Rule: USAGE: 'public'
 * Uses Wikidata SPARQL API to query football stadiums, GPS coordinates, capacities,
 * and saves into data/stadiums.json for away travel distance & fatigue calculation.
 */

import fs from 'fs';
import path from 'path';

interface StadiumEntry {
  team: string;
  city: string;
  stadium: string;
  lat: number;
  lon: number;
  capacity?: number;
}

const WIKIDATA_SPARQL_URL = 'https://query.wikidata.org/sparql';

// SPARQL query to get association football clubs in Europe with their home venue & coordinates
const QUERY = `
SELECT DISTINCT ?clubLabel ?stadiumLabel ?cityLabel ?coords ?capacity WHERE {
  ?club wdt:P31 wd:Q476028;              # instance of football club
        wdt:P115 ?stadium.                # home venue
  ?stadium wdt:P625 ?coords.              # coordinate location
  OPTIONAL { ?stadium wdt:P131 ?city. }   # administrative area / city
  OPTIONAL { ?stadium wdt:P1083 ?capacity. } # capacity
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,ro,es,it,de,fr". }
}
LIMIT 3000
`;

function normalizeTeamKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(fc|cf|sc|ac|as|ca|afc|ssc|rcd|ud|fotbal club|clubul sportiv|fk|sk)\b/gi, '')
    .replace(/[^\w\s]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

export async function fetchStadiumsFromWikidata() {
  console.log('=' * 70);
  console.log('[fetchStadiums] Querying Wikidata SPARQL endpoint...');
  console.log('=' * 70);

  const dataDir = path.resolve(process.cwd(), 'data');
  const outputFile = path.join(dataDir, 'stadiums.json');

  let existingData: Record<string, StadiumEntry> = {};
  if (fs.existsSync(outputFile)) {
    try {
      existingData = JSON.parse(fs.readFileSync(outputFile, 'utf-8'));
    } catch {}
  }

  try {
    const url = `${WIKIDATA_SPARQL_URL}?query=${encodeURIComponent(QUERY)}&format=json`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'FlashStatFootballRadar/1.0 (contact: admin@flashstat.local)',
        'Accept': 'application/sparql-results+json',
      },
    });

    if (!res.ok) {
      console.error(`[fetchStadiums] Wikidata HTTP ${res.status}: ${res.statusText}`);
      return;
    }

    const json = await res.json();
    const bindings = json.results?.bindings || [];
    console.log(`[fetchStadiums] Received ${bindings.length} raw results from Wikidata.`);

    let enrichedCount = 0;

    for (const b of bindings) {
      const clubName = b.clubLabel?.value;
      const stadiumName = b.stadiumLabel?.value;
      const cityName = b.cityLabel?.value || 'Unknown';
      const coordsStr = b.coords?.value; // format: "Point(lon lat)"
      const capacity = b.capacity?.value ? parseInt(b.capacity.value, 10) : undefined;

      if (!clubName || !coordsStr) continue;

      const pointMatch = coordsStr.match(/Point\(([-\d.]+)\s+([-\d.]+)\)/i);
      if (!pointMatch) continue;

      const lon = parseFloat(pointMatch[1]);
      const lat = parseFloat(pointMatch[2]);

      const key = normalizeTeamKey(clubName);
      if (!key) continue;

      existingData[key] = {
        team: clubName,
        city: cityName,
        stadium: stadiumName || `${clubName} Stadium`,
        lat,
        lon,
        ...(capacity ? { capacity } : {}),
      };
      enrichedCount++;
    }

    fs.writeFileSync(outputFile, JSON.stringify(existingData, null, 2), 'utf-8');
    console.log(`[fetchStadiums] Successfully updated ${outputFile} with ${Object.keys(existingData).length} total clubs (${enrichedCount} from Wikidata).`);
  } catch (err: any) {
    console.error(`[fetchStadiums] Error during SPARQL query: ${err.message}`);
  }
}

if (process.argv[1]?.includes('fetchStadiums.ts')) {
  fetchStadiumsFromWikidata();
}
