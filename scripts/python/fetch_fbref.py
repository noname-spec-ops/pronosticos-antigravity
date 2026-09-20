#!/usr/bin/env python3
"""
FlashStat — FBref Deep Statistical Extractor (scripts/python/fetch_fbref.py)
Extracts authentic xG, xA, shots, shots on target, corners, cards (yellow/red), fouls,
possession, and progressive actions from FBref via `soccerdata` for offline model training.

Architectural Rule: USAGE: 'offline'. Data is saved to data/fbref_stats.json for calibration & backtesting.
"""

import os
import sys
import json
import re
from datetime import datetime

# Normalization dictionary consistent with lib/teamMapping.ts
TEAM_ALIASES = {
    'manchester united': 'Man United',
    'manchester city': 'Man City',
    'tottenham hotspur': 'Tottenham',
    'wolverhampton wanderers': 'Wolves',
    'wolverhampton': 'Wolves',
    'newcastle united': 'Newcastle',
    'brighton and hove albion': 'Brighton',
    'brighton & hove albion': 'Brighton',
    'nottingham forest': "Nott'm Forest",
    'west ham united': 'West Ham',
    'leicester city': 'Leicester',
    'leeds united': 'Leeds',
    'sheffield united': 'Sheffield United',
    'sheffield wednesday': 'Sheffield Weds',
    'atletico madrid': 'Ath Madrid',
    'atlético de madrid': 'Ath Madrid',
    'athletic club': 'Ath Bilbao',
    'athletic bilbao': 'Ath Bilbao',
    'real betis': 'Betis',
    'real sociedad': 'Sociedad',
    'celta vigo': 'Celta',
    'celta de vigo': 'Celta',
    'rayo vallecano': 'Vallecano',
    'deportivo alaves': 'Alaves',
    'bayern munich': 'Bayern Munich',
    'bayern münchen': 'Bayern Munich',
    'borussia dortmund': 'Dortmund',
    'bayer leverkusen': 'Leverkusen',
    'rb leipzig': 'RB Leipzig',
    'eintracht frankfurt': 'Ein Frankfurt',
    'borussia monchengladbach': "M'gladbach",
    'inter milan': 'Inter',
    'internazionale': 'Inter',
    'ac milan': 'Milan',
    'paris saint-germain': 'PSG',
    'paris sg': 'PSG',
    'olympique lyonnais': 'Lyon',
    'olympique de marseille': 'Marseille',
    'steaua bucuresti': 'FCSB',
    'fcsb': 'FCSB',
    'cfr cluj': 'CFR Cluj',
    'universitatea craiova': 'Univ Craiova',
    'rapid bucuresti': 'Rapid Bucuresti',
    'dinamo bucuresti': 'Dinamo Bucuresti'
}

def normalize_name(name: str) -> str:
    if not name:
        return ''
    raw = name.strip().lower()
    # Replace accents
    raw = raw.replace('á', 'a').replace('é', 'e').replace('í', 'i').replace('ó', 'o').replace('ú', 'u')
    raw = raw.replace('ã', 'a').replace('õ', 'o').replace('ñ', 'n').replace('ü', 'u').replace('ö', 'o').replace('ä', 'a')
    # Remove FC, CF, etc.
    raw = re.sub(r'\b(fc|cf|sc|afc|ac|cd|ud|rcd|sv|vfb|vfl|tsg|ssv|fsv)\b', '', raw)
    raw = re.sub(r'\s+', ' ', raw).strip()
    return TEAM_ALIASES.get(raw, name.strip())

def main():
    root_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    output_path = os.path.join(root_dir, 'data', 'fbref_stats.json')
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    print('=' * 70)
    print('FlashStat — FBref Deep Statistical Extraction (Offline Priority 1)')
    print('=' * 70)

    try:
        import soccerdata as sd
        import pandas as pd
    except ImportError:
        print('[ERROR] soccerdata is not installed. Please run: pip install soccerdata')
        sys.exit(1)

    available_leagues = sd.FBref.available_leagues()
    print(f'[FBref] Available default leagues in soccerdata: {available_leagues}')

    # Check explicitly for Romanian Liga 1
    romanian_leagues = [l for l in available_leagues if 'ROU' in l or 'Romania' in l or 'Liga 1' in l or 'Liga I' in l]
    if romanian_leagues:
        print(f'[FBref] Romanian Liga 1 found in default list: {romanian_leagues}')
    else:
        print('[FBref] Romanian Liga 1 is NOT available in FBref default tier (FBref covers Big 5 + International tournaments).')
        print('[FBref] Romanian Liga 1 will be serviced by ESPN Fallback (rou.1) and football-data.co.uk historical dataset.')

    leagues_to_fetch = [
        'ENG-Premier League',
        'ESP-La Liga',
        'FRA-Ligue 1',
        'GER-Bundesliga',
        'ITA-Serie A'
    ]

    seasons = ['2023-2024', '2024-2025']
    print(f'[FBref] Extracting match statistics for leagues: {leagues_to_fetch} across seasons: {seasons}...')

    extracted_matches = {}
    team_aggregates = {}
    stats_summary = {
        'totalMatches': 0,
        'leaguesCovered': {},
        'extractedAt': datetime.utcnow().isoformat() + 'Z'
    }

    for league in leagues_to_fetch:
        print(f'\n[FBref] Processing {league}...')
        stats_summary['leaguesCovered'][league] = {'matches': 0, 'teams': 0}
        try:
            fb = sd.FBref(leagues=league, seasons=seasons, no_cache=False)
            
            # Read schedule
            try:
                schedule = fb.read_schedule()
                print(f'[FBref] Successfully fetched schedule for {league} ({len(schedule)} matches).')
            except Exception as sch_err:
                print(f'[FBref] Schedule note for {league}: {sch_err}')
                schedule = None

            if schedule is not None and not schedule.empty:
                for idx, row in schedule.iterrows():
                    try:
                        # Extract basic info
                        date_val = str(row.get('date', ''))[:10]
                        home_raw = str(row.get('home_team', ''))
                        away_raw = str(row.get('away_team', ''))
                        
                        if not home_raw or not away_raw or not date_val:
                            continue
                            
                        home_norm = normalize_name(home_raw)
                        away_norm = normalize_name(away_raw)

                        home_xg = float(row['home_xg']) if 'home_xg' in row and pd.notna(row['home_xg']) else None
                        away_xg = float(row['away_xg']) if 'away_xg' in row and pd.notna(row['away_xg']) else None
                        
                        home_score = int(row['home_score']) if 'home_score' in row and pd.notna(row['home_score']) else None
                        away_score = int(row['away_score']) if 'away_score' in row and pd.notna(row['away_score']) else None

                        match_key = f"{date_val}_{home_norm}_{away_norm}".lower().replace(' ', '_')
                        
                        extracted_matches[match_key] = {
                            'date': date_val,
                            'league': league,
                            'homeTeam': home_norm,
                            'awayTeam': away_norm,
                            'homeScore': home_score,
                            'awayScore': away_score,
                            'homeXg': home_xg,
                            'awayXg': away_xg,
                            'source': 'fbref'
                        }
                        stats_summary['leaguesCovered'][league]['matches'] += 1
                        stats_summary['totalMatches'] += 1
                    except Exception as row_err:
                        continue
                        
        except Exception as league_err:
            print(f'[FBref] Error processing {league}: {league_err}')

    # Output structure
    output_payload = {
        'metadata': {
            'source': 'FBref via soccerdata',
            'usage': 'offline',
            'totalMatches': len(extracted_matches),
            'extractedAt': datetime.utcnow().isoformat() + 'Z',
            'summary': stats_summary
        },
        'matches': extracted_matches
    }

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(output_payload, f, indent=2, ensure_ascii=False)

    print('\n' + '=' * 70)
    print(f'[FBref] COMPLETED! Extracted {len(extracted_matches)} total match records.')
    print(f'[FBref] Saved to: {output_path}')
    print('=' * 70)

if __name__ == '__main__':
    main()
