# FlashStat — Football Scores & AI Betting Radar

[![Next.js](https://img.shields.io/badge/Next.js-15.1-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript)](https://www.typescriptlang.org/)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3.4-38B2AC?logo=tailwind_css)](https://tailwindcss.com/)
[![Vitest](https://img.shields.io/badge/Vitest-2.1-green?logo=vitest)](https://vitest.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Un clone complet și funcțional de **Flashscore**, integrat cu un motor statistic avansat de predicție fotbalistică (**Poisson cu corecție Dixon-Coles + Rating ELO + Modelare Cartonașe Binomială Negativă + Value Betting Engine validat prin backtesting out-of-sample fără data leakage**).

---

## ⚡ Caracteristici Principale

- **Interfață Modernă Flashscore (Dark Theme `#0f141c`)**:
  - Selector flexibil de date (**IERI / AZI / MÂINE** + DatePicker nativ).
  - Căutare globală în timp real (echipe, ligi, țări).
  - Filtre rapide: `[Toate]`, `[LIVE]`, `[Value Bets]`, `[Favorite]`.
  - Salvare automată a favoritelor în `localStorage`.
  - Polling live la 60 de secunde pentru meciurile în desfășurare.

- **Modal de Meci cu 4 Tab-uri**:
  1. **Sinteză & Live Stats**: Posesie, xG, șuturi pe poartă, șuturi totale, cornere, faulturi, cartonașe galbene/roșii, arbitru cu indice de severitate.
  2. **Istoric H2H**: Meciurile directe din ultimele sezoane (scoruri, cartonașe, cornere, arbitri).
  3. **Jucători & Cartonașe**: Titulari, formații, cartonașe pe sezon, faulturi/meci, estimare totală cartonașe (Poisson negativ binomial).
  4. **AI Betting Radar**: Probabilități 1X2 modelate vs piață devigged, top 10 scoruri exacte, cote corecte (fair odds), Value Bets cu Edge% și fracție Kelly.

- **Radar de Value Betting**:
  - Sortare automată descrescătoare după Edge%.
  - Clasificare transparentă: **Grad B (5-8%)**, **Grad A (8-12%)**, **Grad A+ (12-15%)**, **SUSPECT (>15% — verificare date)**.
  - Plafonare a mizei Kelly (0.25x Quarter Kelly) la maximum 2% din bankroll.
  - Zero promisiuni de câștig; raportare onestă a probabilităților reale.

- **Mod Demo Integrat**:
  - Aplicația pornește și rulează complet fără nicio cheie API (`npm run dev`), folosind dataset-ul mock din `fixtures/matches.json`.

---

## 📐 Rigoarea Matematică a Motorului (`engine/`)

### 1. Forțe de Atac și Apărare (`engine/teamStrength.ts`)
- Calcul separat pentru acasă și deplasare, normalizat la media ligii.
- **Ponderare exponențială cu time-decay**:
  $$\text{Greutate} = \exp\left(-\frac{\ln(2) \cdot \text{zile}}{180}\right) \quad (\text{half-life } 180 \text{ zile})$$
- **Bayesian Shrinkage** spre media ligii ($1.0$) pentru echipe cu sub 15 meciuri în eșantion.

### 2. Poisson + Dixon-Coles (`engine/poisson.ts`, `engine/dixonColes.ts`)
- Grilă completă $9 \times 9$ (0–8 goluri) normalizată strict la suma $1.0$.
- **Corecție Dixon-Coles ($\rho \approx -0.13$)**:
  $$\tau_{0,0} = 1 - \lambda \mu \rho, \quad \tau_{1,0} = 1 + \mu \rho, \quad \tau_{0,1} = 1 + \lambda \rho, \quad \tau_{1,1} = 1 - \rho$$

### 3. ELO & Blending (`engine/elo.ts`)
- Rating de start: $1500$, $K = 24$, avantaj de teren: $+75$ puncte ELO.
- Multiplicator logaritmic al diferenței de scor: $\text{mult} = \ln(|GD| + 1)$.
- Blend final configurabil: **60% Poisson / 40% ELO**.

### 4. Devigging — Eliminarea Marjei Casei (`engine/devig.ts`)
- **Metoda Proporțională (Multiplicativă)**: $P_i = \frac{1/O_i}{\sum 1/O}$.
- **Metoda Shin**: Corectează biasul favorită-outsider prin rezolvarea numerică a parametrului de insider trading $z$.

### 5. Cartonașe și Arbitri (`engine/cards.ts`)
- Agresivitate per jucător: $(Y + 2R) + (\text{Faulturi}/\text{meci})$.
- Indice de severitate al arbitrului raportat la media ligii.
- Distribuție **Binomială Negativă** ($r = 3.8$) pentru estimarea totalului de cartonașe și liniilor Over/Under.

---

## 🚀 Instalare și Rulare Locală

### 1. Clonare și Instalare Dependențe
```bash
# Deschide directorul proiectului
cd D:\PRONOSTICOSantigravity

# Instalează dependențele
npm install
```

### 2. Configurare Variabile de Mediu (Opțional)
Copiază fișierul `.env.example` în `.env.local`:
```bash
cp .env.example .env.local
```
> **Notă:** Dacă nu setezi nicio cheie, aplicația intră automat în **Modul Demo** cu date complete.

### 3. Rulare în Mod Dezvoltare
```bash
npm run dev
```
Aplicația va fi accesibilă la adresa: `http://localhost:3000`

---

## Tracing OpenTelemetry

Aplicația instrumentează automat cererile Next.js prin OpenTelemetry. Pentru trasare locală, pornește un colector OTLP, setează în `.env.local` și repornește serverul:
```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318/v1/traces
OTEL_SERVICE_NAME=flashstat-football-radar
```
Foundry Toolkit poate fi folosit ca viewer local pentru endpoint-ul de mai sus.

---

## 🧪 Testare Unitară (Vitest)

Toate motoarele matematice și logice din `engine/` dispun de teste unitare:
```bash
# Rulează toate testele
npm test

# Rulează testele în mod watch
npm run test:watch
```

---

## 📊 Scripturi de Date Istorice, Calibrare și Backtesting

### 1. Ingestie Date Istorice (`scripts/ingestHistorical.ts`)
Descarcă și normalizează CSV-urile de pe [football-data.co.uk](https://www.football-data.co.uk/):
```bash
npm run ingest
```
Datele sunt salvate în `data/historical_matches.json`.

### 2. Calibrare Numerică MLE (`scripts/calibrate.ts`)
Optimizează $\rho$, half-life-ul time-decay și ponderile de blend prin maximizarea Log-Likelihood:
```bash
npm run calibrate
```

### 3. Backtesting Out-of-Sample (`scripts/backtest.ts`)
Rulează validarea pe sezoane held-out cu **Zero Data Leakage**:
```bash
npm run backtest
```
Calculează și generează `fixtures/backtest_metrics.json`:
- **Brier Score 1X2** (vs Bookmaker benchmark)
- **Log-Loss**
- **Curba de Calibrare pe 10 decile**
- **ROI simulat vs cotele de închidere**
- **Drawdown maxim**

---

## 🌐 Deploy pe Vercel

Aplicația este optimizată nativ pentru deploy serverless pe **Vercel**:

1. Urcă codul într-un repository GitHub / GitLab / Bitbucket.
2. În panoul [Vercel](https://vercel.com/):
   - Apasă pe **Add New... -> Project**.
   - Selectează repository-ul creat.
   - La **Framework Preset**, alege `Next.js`.
   - Adaugă variabilele de mediu din `.env.example` (ex: `API_FOOTBALL_KEY`, `ODDS_API_KEY`) dacă dorești date live în producție.
   - Apasă pe **Deploy**.
3. Aplicația este live cu suport nativ de Route Handlers, SWR Caching și Edge Network!

---

## ⚖️ Notă Legală & Disclaimer

Acest proiect are scop exclusiv educativ, statistic și de cercetare științifică. Nu constituie consiliere financiară sau îndemn la jocuri de noroc. Pariurile sportive implică risc de pierdere. **18+**.