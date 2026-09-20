import fs from 'fs';
import path from 'path';

function loadEnv() {
  const envPath = path.join(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const parts = line.split('=');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const val = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
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

async function apiGet(endpoint: string) {
  const url = `${BASE_URL}${endpoint}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'x-apisports-key': API_KEY!,
      'Accept': 'application/json'
    }
  });

  const remainingHeader = res.headers.get('x-ratelimit-requests-remaining');
  const limitHeader = res.headers.get('x-ratelimit-requests-limit');
  const json = await res.json();
  return { status: res.status, headers: { remainingHeader, limitHeader }, json };
}

async function runDiagnostics() {
  console.log('=== ETAPA 1: DIAGNOSTIC API-FOOTBALL ===\n');
  const masked = API_KEY ? `${API_KEY.substring(0, 6)}...${API_KEY.substring(API_KEY.length - 4)}` : 'none';
  console.log(`Using API Key: ${masked}`);

  const statusRes = await apiGet('/status');
  console.log('HTTP Status:', statusRes.status);
  console.log('Account:', statusRes.json.response?.account);
  console.log('Subscription:', statusRes.json.response?.subscription);
  console.log('Requests:', statusRes.json.response?.requests);
}

runDiagnostics();