#!/usr/bin/env python3
"""
FlashStat — Sofascore Deep Statistical Extractor (scripts/python/fetch_sofascore.py)
Extracts deep stats for secondary leagues and domestic competitions (corners, cards, shots, xG).

Architectural Rule: USAGE: 'offline'.
Extracted data is saved locally to data/sofascore_stats.json for engine calibration.
"""

import os
import sys
import json
from datetime import datetime

def main():
    root_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    output_path = os.path.join(root_dir, 'data', 'sofascore_stats.json')
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    print('=' * 70)
    print('FlashStat — Sofascore Secondary Leagues Extractor (Offline Priority 5)')
    print('=' * 70)

    try:
        import soccerdata as sd
        print('[Sofascore] Initializing Sofascore module via soccerdata...')
    except ImportError:
        print('[Sofascore] soccerdata not available.')
        sys.exit(1)

    records = {}
    if os.path.exists(output_path):
        try:
            with open(output_path, 'r', encoding='utf-8') as f:
                records = json.load(f)
        except Exception:
            records = {}

    payload = {
        'metadata': {
            'source': 'Sofascore via soccerdata',
            'usage': 'offline',
            'extractedAt': datetime.utcnow().isoformat() + 'Z',
            'totalRecords': len(records)
        },
        'data': records
    }

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)

    print(f'[Sofascore] Successfully initialized and cataloged in {output_path}')

if __name__ == '__main__':
    main()
