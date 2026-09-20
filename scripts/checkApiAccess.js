const fs = require('fs');
const path = require('path');

function loadEnv() {
  const envPath = path.join(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const parts = line.split('=');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const val = parts.slice(1).join('=').trim().replace(/^["']|["']$/g, '');
        process.env[key] = val;
      }
    }
  }
}

loadEnv();

const API_KEY = process.env.API_FOOTBALL_KEY;
const BASE_URL = 'https://v3.football.api-sports.io';

if (!API_KEY) {
  console.error('ERROR: API_FOOTBALL_KEY not found in .env.local');
  process.exit(1);
}

async function apiGet(endpoint) {
  const url = BASE_URL + endpoint;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'x-apisports-key': API_KEY,
      'Accept': 'application/json'
    }
  });

  const remainingHeader = res.headers.get('x-ratelimit-requests-remaining');
  const limitHeader = res.headers.get('x-ratelimit-requests-limit');
  
  const json = await res.json();
  return { status: res.status, headers: { remainingHeader, limitHeader }, json };
}

async function runDiagnostics() {
  console.log('=== ETAPA 1: DIAGNOSTIC API-FOOTBALL_ ===\n');
  const masked = API_KEY.substring(0, 6) + '...' + API_KEY.substring(API_KEY.length - 4);
  const statusRes = await apiGet('/status');
  console.log('Status Response:', JSON.stringify(statusRes, null, 2));

  console.log('\n--- Leagues ---');
  const leaguesRes = await apiGet('/leagues?current=true');
  console.log('Results:', leaguesRes.json.results);
  if (leaguesRes.json.response) {
    console.log('Top 6 Leagues:', leaguesRes.json.response.filter(x => [39, 140, 135, 78, 61, 283].includes^�x => x.league.id)).map(x => x.league.name + ' (' + x.league.id + ')'));
  }

  console.log('\n--- Fixtures Today ---');
  const today = new Date().isoString().split('T')[0];
  const fixturesRes = await apiGet('/fixtures?date=' + today);
  console.log('Paging: ', fixturesRes.json.paging);
  console.log('Results: ', fixturesRes.json.results);
  console.log('Response length: ', fixturesRes.json.response?.length);
}

runDiagnostics();