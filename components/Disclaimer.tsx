'use client';

import React from 'react';

export default function Disclaimer() {
  return (
    <footer className="mt-12 border-t border-flashBorder bg-[#0c1017] py-6 text-center text-xs text-flashMuted">
      <div className="mx-auto max-w-5xl px-4 space-y-2">
        <div className="flex items-center justify-center gap-2 font-semibold text-gray-400">
          <span className="rounded bg-red-950/80 px-1.5 py-0.5 text-[11px] font-bold text-red-400 border border-red-800/40">
            18+
          </span>
          <span>FlashStat — Radar Statistic & AI Value Betting</span>
        </div>
        <p className="leading-relaxed">
          Acest site are scop exclusiv educativ si informativ. Nu constituie sfat financiar, recomandare de investitii sau indemn la pariat.
          Modelele statistice estimeaza probabilitati obiective bazate pe date istorice si nu garanteaza rezultate.
          Pariurile sportive implica riscul pierderii integrale a sumelor jucate. Joaca intotdeauna responsabil.
        </p>
        <p className="text-[11px] text-gray-600">
          © {new Date().getFullYear()} FlashStat Engine. Zero-leakage backtested Dixon-Coles & ELO probability architecture.
        </p>
      </div>
    </footer>
  );
}