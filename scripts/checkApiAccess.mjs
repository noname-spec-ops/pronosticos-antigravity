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
  console.log('=== ETAPA 1: DIAGNOSTIC API-FOOTBALL ===\n');
  const masked = API_KEY.substring(0, 6) + '...' + API_KEY.substring(API_KEY.length - 4);
  console.log('Using API Key: ' + masked);

  console.log('\n--- 1. Checking /status ---');
  try {
    const statusRes = await apiGet('/status');
    console.log('HTTP Status:', statusRes.status);
    console.log('Status Response Body:\n', JSON.stringify(statusRes.json, null, 2));

    const account = statusRes.json.response?.account;
    const subscription = statusRes.json.response?.subscription;
    const requests = statusRes.json.response?.requests;

    console.log('\n[STATUS SUMMARY]');
    console.log('Account: ' + account?.firstname + ' ' + account?.lastname + ' (' + account?.email + ')');
    console.log('Plan: ' + subscription?.plan + ' (Active: ' + subscription?.active + ')');
    console.log('End Date: ' + subscription?.end_date);
    console.log('Requests Today: ' + requests?.current + ' / ' + requests?.limit_day);
    console.log('Rate Limit Headers - Limit: ' + (statusRes.headers.limitHeader || 'N/A') + ', Remaining: ' + (statusRes.headers.remainingHeader || 'N/A'));
  } catch (err) {
    console.error('Failed to query /status:', err.message);
  }

  console.log('\n--- 2. Checking /leagues?current=true ---');
  try {
    const leaguesRes = await apiGet('/leagues?current=true');
    console.log('HTTP Status:', leaguesRes.status);
    const leaguesCount = leaguesRes.json.results || leaguesRes.json.response?.length || 0;
    console.log('Total current leagues accessible: ' + leaguesCount);
    
    if (leaguesRes.json.errors && Object.keys(leaguesRes.json.errors).length > 0) {
      console.log('Errors:', leaguesRes.json.errors);
    }

    if (leaguesRes.json.response && leaguesRes.json.response.length > 0) {
      const topLeagues = [39, 140, 135, 78, 61, 283];
      const foundTop = leaguesRes.json.response.filter(item => topLeagues.includes(item.league.id));
      console.log('Top leagues found: ' + foundTop.map(item => item.league.name + ' (ID: ' + item.league.id + ', Country: ' + item.country.name + ')').join(', '));
    }
  } catch (err) {
    console.error('Failed to query /leagues:', err.message);
  }

  const today = new Date().toISOString().split('T')[0];
  console.log('\n--- 3. Checking /fixtures?date=' + today + ' ---');
  try {
    const fixturesRes = await apiGet('/fixtures?date=' + today);
    console.log('HTTP Status:', fixturesRes.status);
    console.log('Paging Object:', JSON.stringify(fixturesRes.json.paging, null, 2));
    console.log('Results Count (json.results):', fixturesRes.json.results);
    console.log('Response Array Length:', fixturesRes.json.response?.length || 0);

    if (fixturesRes.json.errors && Object.keys(fixturesRes.json.errors).length > 0) {
      console.log('Errors:', fixturesRes.json.errors);
    }
  } catch (err) {
    console.error('Failed to query /fixtures:', err.message);
  }

  console.log('\n--- 4. Checking accessible seasons for Premier League (ID 39) ---');
  try {
    const seasonsRes = await apiGet('/leagues?id=39');
    const seasons = seasonsRes.json.response?.[0]?.seasons?.map(s => s.year + ' (current: ' + s.current + ')') || [];
    console.log('Premier League Seasons count: ' + seasons.length);
    console.log('Seasons: ' + seasons.join(', '));
  } catch (err) {
    console.error('Failed to query seasons:', err.message);
  }

  console.log('\n=== DIAGNOSTIC FINISHED ===');
}

runDiagnostics();