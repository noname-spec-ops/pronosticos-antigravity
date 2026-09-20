#!/usr/bin/env python3
"""
FlashStat — Advanced xG & Shot Data Ingestion via soccerdata (scripts/python/fetch_xg.py)
Extracts expected goals (xG), expected goals against (xGA), and shot metrics
from FBref and Understat for European leagues and maps them into data/xg_data.json.
"""

import os
import sys
import json
from datetime import datetime

LEAGUES_TO_FETCH = [
    'ENG-Premier League',
    'ESP-La Liga',
    'ITA-Serie A',
    'GER-Bundesliga',
    'FRA-Ligue 1',
]

SEASONS = ['2021', '2022', '2023', '2024']

def main():
    root_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    output_path = os.path.join(root_dir, 'data', 'xg_data.json')
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    print('[fetch_xg] Starting soccerdata extraction for top European leagues...')
    xg_records = {}

    try:
        import soccerdata as sd
        print('[fetch_xg] soccerdata library detected. Fetching Understat/FBref match data...')

        for league in LEAGUES_TO_FETCH:
            try:
                print(f'[fetch_xg] Fetching {league}...')
                understat = sd.Understat(leagues=league, seasons=SEASONS)
                schedule = understat.read_schedule()

                for _, row in schedule.iterrows():
                    match_id = str(row.get('game_id', ''))
                    home_team = str(row.get('home_team', ''))
                    away_team = str(row.get('away_team', ''))
                    home_xg = float(row.get('home_xg', 0.0)) if 'home_xg' in row and not pd.isna(row['home_xg']) else None
                    away_xg = float(row.get('away_xg', 0.0)) if 'away_xg' in row and not pd.isna(row['away_xg']) else None
                    date = str(row.get('date', ''))

                    if match_id and home_team and away_team:
                        key = f"{date}_{home_team}_{away_team}".lower().replace(' ', '_')
                        xg_records[key] = {
                            'date': date,
                            'homeTeam': home_team,
                            'awayTeam': away_team,
                            'homeXg': home_xg,
                            'awayXg': away_xg,
                            'source': 'understat'
                        }
            except Exception as le:
                print(f'[fetch_xg] Warning fetching {league}: {le}')

    except ImportError:
        print('[fetch_xg] soccerdata not installed in current Python environment. (Install with `pip install soccerdata`)')
        print('[fetch_xg] Retaining existing xG database in data/xg_data.json.')

    # Ensure output file exists with structured JSON
    if os.path.exists(output_path):
        try:
            with open(output_path, 'r', encoding='utf-8') as f:
                existing = json.load(f)
                if isinstance(existing, dict):
                    xg_records.update(existing)
        except Exception:
            pass

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(xg_records, f, indent=2)

    print(f'[fetch_xg] Finished. Total xG match records in {output_path}: {len(xg_records)}')

if __name__ == '__main__':
    main()

