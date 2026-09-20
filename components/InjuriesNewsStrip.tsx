'use client';

import React from 'react';
import { Newspaper, AlertCircle, CheckCircle2, HelpCircle } from 'lucide-react';

interface TeamNewsItem {
  teamName: string;
  badge: string;
  players: Array<{
    name: string;
    status: 'out' | 'doubtful' | 'available';
    detail: string;
  }>;
}

const NOTABLE_NEWS: TeamNewsItem[] = [
  {
    teamName: 'Man City',
    badge: '🔵',
    players: [
      { name: 'De Bruyne', status: 'out', detail: 'Accidentat (out)' },
      { name: 'Foden', status: 'doubtful', detail: 'În dubiu' },
    ],
  },
  {
    teamName: 'PSG',
    badge: '🔴',
    players: [
      { name: 'Kimpembe', status: 'out', detail: 'Out' },
      { name: 'Dembélé', status: 'doubtful', detail: 'În dubiu' },
    ],
  },
  {
    teamName: 'Barcelona',
    badge: '🔵🔴',
    players: [
      { name: 'Gavi', status: 'out', detail: 'Out (accidentare)' },
      { name: 'Pedri', status: 'available', detail: 'Disponibil' },
    ],
  },
  {
    teamName: 'Dortmund',
    badge: '🟡',
    players: [
      { name: 'Haller', status: 'out', detail: 'Out' },
      { name: 'Adeyemi', status: 'available', detail: 'Disponibil' },
    ],
  },
];

export default function InjuriesNewsStrip() {
  return (
    <div className="rounded-2xl border border-flashBorder bg-[#0f141d] p-4 shadow-lg space-y-3">
      <div className="flex items-center gap-2 border-b border-flashBorder/40 pb-2">
        <Newspaper className="h-4 w-4 text-red-400" />
        <h4 className="font-bold text-xs text-gray-200 uppercase tracking-wider">
          News & Accidentări Importante
        </h4>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
        {NOTABLE_NEWS.map((item) => (
          <div
            key={item.teamName}
            className="rounded-xl bg-[#141b26] p-3 space-y-2 border border-flashBorder/30"
          >
            <div className="flex items-center gap-2 font-bold text-gray-100">
              <span>{item.badge}</span>
              <span>{item.teamName}</span>
            </div>

            <div className="space-y-1 text-[11px]">
              {item.players.map((p, idx) => (
                <div key={idx} className="flex items-center gap-1.5">
                  <span
                    className={`h-2 w-2 rounded-full shrink-0 ${
                      p.status === 'out'
                        ? 'bg-red-500'
                        : p.status === 'doubtful'
                        ? 'bg-amber-400'
                        : 'bg-emerald-400'
                    }`}
                  />
                  <span className="font-semibold text-gray-300">{p.name}</span>
                  <span className="text-flashMuted text-[10px]">— {p.detail}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
