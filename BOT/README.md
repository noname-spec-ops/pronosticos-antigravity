# 🤖 FlashStat — OP GODMODE Value Betting BOT

Folderul dedicat pentru rularea și auditarea botului cantitativ de pariuri.

## 🚀 Cum rulezi botul

Deschide terminalul în directorul proiectului și rulează:

```bash
npx tsx BOT/run_bot.ts
```

## 📋 Ce face Botul la fiecare rulare

1. **Scanare Fără Lookahead:**
   - Evaluează meciurile out-of-sample folosind strict datele anterioare datei meciului (zero data leakage).
2. **Filtrare Matematică Strictă:**
   - **Gating 1X2:** Permite pariuri 1X2 doar pe ligile demonstrate cu CLV pozitiv (`D2`, `SC0`, `SC3`, `I2`, `I1`).
   - **Piețe Prioritare:** Evaluează piețele de goluri (**Over/Under 2.5**, **BTTS**) cu marjă redusă de casă.
   - **Edge Minim:** $Edge \ge 5.0\%$ și $Edge < 15.0\%$ (elimină anomaliile de tip `SUSPECT`).
3. **Mize cu Confidence Kelly:**
   - Calculează fracțiunea Kelly (0.25x) scalată de factorul de încredere (maturitatea datelor, absențe) și plafonată la maxim 2.0% din bankroll.
4. **Calcul & Raportare Rezultate:**
   - Selectează top 5 cele mai valoroase oportunități.
   - Evaluează scorul real al meciului și calculează P&L, ROI și **CLV (Closing Line Value)**.
   - Salvează raportul structurat în `BOT/bot_results.json`.

## 📁 Fișiere în acest folder

- `BOT/bot_engine.ts` — Motorul de selecție, staking și evaluare al botului de pariuri.
- `BOT/run_bot.ts` — Scriptul principal de rulare CLI pentru plasarea a 5 pariuri (`npm run bot`).
- `BOT/bot_results.json` — Raportul complet al celor 5 pariuri plasate.
- `BOT/ui_tester.ts` — Motorul de simulare și testare a tuturor butoanelor și filtrelor UI.
- `BOT/run_ui_bot.ts` — Scriptul de testare UI (`npm run bot:ui`).
- `BOT/ui_audit_results.json` — Raportul de audit al stării butoanelor UI.
- `BOT/live_sniper_bot.ts` — Live In-Play Sniper Bot pentru detectarea anomaliilor de preț în min 50-84 (`npm run bot:sniper`).
- `BOT/telegram_bot.ts` — Simulator interactiv Telegram Bot Controller (`npm run bot:telegram`).

## ⚡ 1. Live In-Play Sniper Bot (`npm run bot:sniper`)

Scanează meciurile LIVE în intervalul critic **minutul 50 – 84** pentru a găsi discrepanțe masive de preț:
- **Lagging Score Sniper:** Echipă ultra-dominantă (Momentum $\ge 64\%$) blocată la egal sau condusă pe tabelă deși produce ocazii mari.
- **xG Overpressure Anomaly:** $xG \ge 1.85$ cumulat cu $\le 1$ goluri marcate (ineficiență extremă de piață pe piețele de următorul gol).
- **Target Edge:** Identifică $Edge \ge 18-35\%$ la cotele live curente.

## 📱 2. Telegram Bot Controller (`npm run bot:telegram`)

Permite interogarea și controlul sistemului direct din linia de comandă sau conectat la un webhook Telegram:
- `/top5` — Generează instant top 5 pariuri matematice cu Quarter-Kelly.
- `/live` — Scanează meciurile LIVE active și afișează indicele de momentum și piețele dinamice.
- `/snipe` — Rulează algoritmul de In-Play Sniping pe meciurile din min 50-84.
- `/bilet` — Generează un bilet optimizat matematic de 2-3 selecții cu marjă minimă.
- `/bankroll` — Afișează starea portofelului, ROI, Winrate și protecția Drawdown Kill-Switch.

## 🖥️ 3. Bot de Testare Butoane UI (`npm run bot:ui`)

Testează automat toate componentele interactive ale aplicației:
1. **Header & Taburi:** Comutare meciuri LIVE, Predicții AI, Paper Trading, Bilet Combo, Steam Scanner.
2. **Filtre de Ligă:** Premier League, La Liga, Superliga România, etc.
3. **Filtre de Categorie:** Meciuri Încheiate (Arhivă), Favorite (Star toggle).
4. **Acțiuni Meci:** Selectare meci, deschidere modal analiză completă (H2H, xG, ELO).
5. **Combo Builder:** Adăugare selecții pe bilet, calcul cote compuse și avertisment de marjă de casă.
6. **Paper Trading:** Triggering și răspuns automat Kill-Switch (-15% 24h și -25% permanent).
7. **Căutare Text:** Filtrare instantanee după numele echipelor.


