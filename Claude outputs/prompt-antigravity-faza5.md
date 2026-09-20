# PROMPT FAZA 5 — Porți de risc, securitate, infrastructură
## (pentru Antigravity — proiect `D:\PRONOSTICOSantigravity`)

> Trimite de la „CONTEXT" în jos. **O etapă pe rând**, cu oprire pentru confirmare după fiecare.
> Etapa A e obligatorie înainte de orice altceva.
>
> Regulă absolută pentru tot documentul: **nu inventa nicio valoare.** Dacă o dată
> lipsește, se afișează „indisponibil" și se propagă `null`. Fiecare `|| 1.85`,
> `?? 62`, `Math.max(3, ...)` adăugat anulează munca Etapelor 1-3.

---

## CONTEXT

FlashStat, Next.js 15 App Router + TypeScript, în `D:\PRONOSTICOSantigravity`.

Fazele 1-3 din acest ciclu sunt terminate și verificate. Starea curentă:

```
tsc --noEmit    0 erori
vitest          225/225 (47 fișiere)
next build      exit 0
dataset         62.599 meciuri, 37 ligi, 855 echipe, 2021-07-23 → 2026-09-17
validare        ✅ 62.599 meciuri autentice
```

### Backtest curent (`fixtures/backtest_metrics.json`)

```
ROI:                -10.48%    CI95 [-18.45, -2.51]   ← SEMNIFICATIV STATISTIC
pariuri:            1.305 din 35.310 meciuri = 3.7%
Brier model:        0.6078     vs casă 0.5949
CLV mediu:          -0.26%
drawdown maxim:     82.14%
ligi evaluate:      37
ligi care bat cota: 0 din 37
```

**Interpretarea corectă, care trebuie păstrată în tot ce urmează:** modelul este
*semnificativ neprofitabil* pe 1X2. Nu e zgomot, nu e „aproape acolo". Intervalul
de încredere nu mai trece prin zero. Nicio ligă din 37 nu bate scorul Brier al
casei de pariuri.

Nu construi nimic care presupune contrariul. Nu „optimiza până iese pozitiv" —
asta e overfitting pe setul de test. Etapa D tratează problema pe fond.

### Ce s-a reparat deja (NU reface)

**Faza 1 — s-a oprit dezinformarea**
- `services/apiFootball.ts` nu mai injectează `fixtures/matches.json` peste meciuri
  reale. Setul de exemplu se servește doar când toți furnizorii dau zero, și atunci
  răspunsul are `isDemo: true` + banner galben în UI.
- `app/api/fixtures/route.ts` validează `date` (400 pe format invalid).
- `components/MatchesTable.tsx`: eliminat plafonul `Math.max(3, Math.min(15, ...))`
  pe edge și clamp-ul `[48,92]` pe probabilitate. Fără cotă reală → rândul arată
  „Cote indisponibile", nu un pontaj inventat.
- ~40 de valori fabricate scoase din componente (cote, forme, metrici tactice).
- `TopKpiBar` citește din backtest, nu din constante („WIN RATE 78.4%" era hardcodat).
- Testele nu mai scriu în `data/` (`vitest.setup.ts` + `isPersistenceBlocked`).

**Faza 2 — fluxul de date**
- `services/oddsProvider.ts` rescris. Înainte returna `data[0]` — primul meci din
  prima ligă — ca fiind cotele oricărui meci cerut. Acum potrivire pe ambele echipe
  + ora de start (fereastră 36h), bulk per ligă, cel mai bun preț din toate casele.
- Dedup canonic pe `zi + ambele echipe` (era pe `id` numeric, dar fiecare furnizor
  are propriul spațiu de ID-uri).
- `/api/predictions/[fixtureId]` returna 404 pentru absolut fiecare meci. Reparat:
  caută mai întâi în slate-ul zilei.
- `lib/fetchWithTimeout.ts` — 15 apeluri limitate la 8s (niciunul nu avea timeout).
- ESPN: 20 → 56 de ligi. OpenLigaDB era implementat dar nu era apelat niciodată.
- `lib/localDate.ts` — „AZI" folosea ziua UTC, arăta ziua precedentă între 00:00-03:00.

**Faza 3 — statistica**
- `engine/devig.ts`: `devigShin` era rupt în 4 feluri, eroare de până la **22 puncte
  procentuale**. Verificat acum contra unei implementări independente, eroare 5e-5.
  Plus validare de input (arunca probabilități negative pe cote corupte).
- Grila 9×9 → **17×17**. La λ=5,5 se pierdeau 20,01% din masa comună; acum 0,013%.
- `lib/teamMapping.ts` rescris: `canonicalClubKey` pe tokeni, prag de încredere 0,92,
  gardă pentru echipe secunde/juniori/feminin. `Lillestrom` primea ELO-ul lui `Lille`.
- `lib/strengthStore.ts`: `teamMetricsMap` cheiat pe formă canonică — era pe
  `normalizeTeamName`, care colapsează „Man City" și „Man United" la `man`, deci se
  suprascriau reciproc în fiecare ligă.
- `lib/calibrationStore.ts` nou — calibrarea PAVA și parametrii MLE per-ligă sunt
  acum folosiți de site, nu doar de backtest.
- `scripts/ingestExtraLeagues.ts` nou — 15 competiții adăugate, inclusiv **SuperLiga
  României** (1.669 meciuri; avea zero) și **Champions League** (521).
- `scripts/backtest.ts`: `leagueCodeToId[code] || 999` făcea ca 24 din 37 de ligi să
  cadă pe același slot și să se suprascrie. De asta raportul arăta doar 13 ligi.

### Backup-uri

În `C:\Users\Mihai\AppData\Local\Temp\claude\D--PRONOSTICOSantigravity\...\scratchpad\`:
`historical_matches.BACKUP.json` (31.132 meciuri, starea inițială),
`hist.BACKUP2.json` (39.866), `calibration_maps.BACKUP.json`,
`calibrated_params.BACKUP.json`, `backtest_metrics.BACKUP.json`.
Copiază-le într-un loc permanent înainte să începi — directorul e temporar.

### Probleme cunoscute de mediu

1. **Quota The Odds API: 0/500 rămase.** Epuizată prin testare. Aplicația degradează
   corect („Cote indisponibile"), dar nu vei putea testa fluxul de cote până la
   resetarea lunară sau upgrade. Garda e reparată (cereri secvențiale + rezervă 10
   credite + oprire pe 401) ca să nu se repete.
2. **API-Football: cont suspendat.** `{"errors":{"access":"Your account is suspended"}}`.
   Verifică dashboard-ul. Nu e o problemă de cod.
3. **`next build` eșuează intermitent** cu `spawn UNKNOWN` (errno -4094) pe Windows,
   ~1 din 2 rulări. Preexistent, nu cauzat de modificări. Trece la reîncercare cu
   `.next` șters. Vezi Etapa C-4.
4. **`tsc` a rămas fără memorie** când un test importa direct JSON-ul de 55 MB.
   Rezolvat prin citire la runtime. Nu adăuga `import ... from '.../historical_matches.json'`.

---

# ETAPA A — Porțile de risc (PRIORITATE MAXIMĂ)

**De ce prima:** radarul recomandă în continuare pariuri marcate `isActionable: true`
pe ligi unde modelul pierde demonstrabil. Toate mecanismele de protecție există în
cod dar sunt inerte — nu au fost niciodată cablate.

### A-1. `isClvPositiveLeague` nu e setat niciodată

`engine/valueBets.ts:219`:
```ts
const isProvenLeague = candidate.isCalibratedLeague && candidate.isClvPositiveLeague !== false;
```
`isClvPositiveLeague` e declarat în interfață și citit aici, dar **nimeni nu îl
setează**. `undefined !== false` → `true`, deci poarta „1X2 e hiper-eficient, nu-l
marca acționabil" nu blochează nimic. Verifică cu:
```bash
grep -rn "isClvPositiveLeague" --include=*.ts .
```
Vei găsi exact 2 apariții, ambele în `valueBets.ts`.

**De făcut:** creează `lib/leagueHealthStore.ts` pe modelul lui
`lib/calibrationStore.ts` (citește `fixtures/backtest_metrics.json`, cache la primul
acces, expune `getLeagueHealth(leagueId)`). În `engine/index.ts`, populează pentru
fiecare candidat:
- `isClvPositiveLeague` = `leagueHealth.clvMetrics.avgClvPercent > 0 && leagueHealth.clvMetrics.isSignificant`
- `isCalibratedLeague` rămâne cum e (date istorice suficiente)

### A-2. Blochează ligile unde modelul pierde

`leagueHealthMap` din `backtest_metrics.json` e citit **doar** de
`components/ModelHealthBadge.tsx` (o insignă decorativă). Nu blochează niciun pariu.

**De făcut:** în `evaluateValueBet`, un pariu devine `isActionable: false` cu
`warningNote` explicit dacă oricare e adevărat:
- `leagueHealth.beatsBookmakerBrier !== true` (atenție: e `boolean | null`; `null`
  înseamnă „fără linie de piață", nu „a pierdut")
- `leagueHealth.totalBetsPlaced < 100` (eșantion insuficient pentru verdict)
- `leagueHealth.simulatedRoiPercent <= 0 && leagueHealth.isRoiSignificant`

**Consecința pe care trebuie s-o accepți:** cu datele de acum, **0 din 37 de ligi**
trec. Deci practic tot 1X2 devine neacționabil. Asta e rezultatul corect, nu un bug.
Radarul trebuie să afișeze predicții marcate clar ca informative. Dacă poarta lasă
să treacă ceva, verifică de două ori de ce.

### A-3. `hasRealXg: true` hardcodat de 10 ori

`engine/index.ts`, liniile ~266-418: fiecare candidat declară `hasRealXg: true`.
`data/xg_data.json` este **`{}`** (2 octeți, complet gol) și
`services/understatService.ts` nu e importat de nimeni.

**De făcut:** ori derivă din date reale (repară `understatService` + populează
`xg_data.json`), ori setează `false` până atunci. Acum gate-ul de calitate raportează
„date xG reale prezente" când sunt zero.

### A-4. `sharpConsensusProb` nu e setat niciodată

Aceeași problemă ca A-1: toată logica de confirmare sharp și penalizarea de încredere
sunt inerte în producție. `engine/__tests__/sharpConsensus.test.ts` trece pentru că
apelează funcția direct.

**De făcut:** ori populează din a doua sursă de cote (Pinnacle/Betfair), ori scoate
logica. Un mecanism mort care *pare* activ e mai rău decât absența lui.

### A-5. `driftMonitor` e cod mort

`engine/driftMonitor.ts` (`evaluateModelDrift`) e referit doar de propriul test.

**De făcut:** cablează în `/api/monitoring` sau într-un cron. Trebuie să compare
performanța recentă din `data/paper_bets.json` cu baseline-ul din backtest și să
ridice un flag la degradare.

### A-6. Kill-switch-ul nu afectează radarul

`evaluateKillSwitch` din `engine/paperTrading.ts` e folosit doar de
`components/PaperTradingModal.tsx`. La drawdown ≥15% ar trebui să suspende
recomandările peste tot, nu doar în modalul de paper trading.

### A-7. `/api/monitoring` raportează `OPTIMAL` cu providerul principal mort

Detectează corect suspendarea API-Football și o marchează `DEGRADED`, apoi calculează
`overallStatus: "OPTIMAL"`. Pierderea providerului Tier-1 trebuie să degradeze
statusul general.

**Verificare Etapa A:**
```bash
npx tsc --noEmit && npx vitest run
# teste noi obligatorii: o ligă cu beatsBookmakerBrier=false NU produce
# isActionable=true; o ligă cu beatsBookmakerBrier=null (UCL) e tratată ca
# necunoscut, nu ca eșec
```
**STOP. Cere confirmare.**

---

# ETAPA B — Securitate

### B-1. `.env` nu e în `.gitignore` — ROTEȘTE CHEILE

`.gitignore` ignoră `.env*.local` și `.env.local`, dar **nu `.env`**, care conține
3 chei API. Proiectul nu e încă repo git; la primul `git init && git add .` se
comit.

**De făcut:** adaugă `.env` în `.gitignore`. **Rotește toate cele 3 chei** —
au stat pe disc neignorate. Documentează `FOOTBALL_DATA_KEY`, `VIP_PASSWORD`,
`VIP_USERNAME` în `.env.example` (lipsesc toate trei).

### B-2. Poarta VIP e ocolibilă în trei feluri

`app/api/auth/vip/route.ts` și `components/VipAuthGate.tsx`. Demonstrat:
```bash
# 1. cookie forjat, fără login
curl -H "Cookie: flashstat_vip_auth=authenticated" localhost:3000/api/auth/vip
# → {"authenticated":true}

# 2. parolă implicită din cod
curl -X POST -d '{"username":"vip","password":"FLASHSTAT2026"}' localhost:3000/api/auth/vip
# → {"success":true}

# 3. datele, fără nicio autentificare
curl "localhost:3000/api/fixtures?date=2026-09-18"   # → 200, payload complet
```
Plus `VipAuthGate.tsx:27` acceptă `localStorage.getItem('flashstat_vip_auth') === 'true'`
— o linie în consolă deblochează tot UI-ul.

**De făcut:**
- scoate fallback-ul `|| 'FLASHSTAT2026'`; eșuează pornirea fără `VIP_PASSWORD`
- cookie semnat (JWT sau HMAC) cu expirare verificată server-side
- scoate fallback-ul din `localStorage`
- verifică poarta în `middleware.ts` pe rutele de date, nu doar în componentă

### B-3. Rate limiter: 429 nu e detectat niciodată

`lib/rateLimiter.ts:106` — `catch` verifică `err?.status === 429`, dar `fetch` **nu
aruncă** pe 429; întoarce un `Response`. `markQuotaExhausted` nu se declanșează
niciodată, circuit breaker-ul de 6 ore e cod mort.

Plus `new RateLimiter(60)` = 60 apeluri/min, dar planul free API-Football e **10/min**
(scrie chiar în `.env.example`).

Plus `checkRateLimit` e exportat și nefolosit — `middleware.ts` are o implementare
duplicată care **nu evacuează niciodată** intrările expirate (scurgere de memorie).

**STOP. Cere confirmare.**

---

# ETAPA C — Infrastructură și performanță

### C-1. `lib/cache.ts` nu e SWR și nu evacuează

- Pe expirare face `await fetcher()` — blocant. Nu e stale-while-revalidate.
- Fără coalescing → **thundering herd**: N cereri simultane după expirare declanșează
  fiecare fan-out complet.
- `this.store` nu are limită și **nu șterge niciodată** intrările expirate. Chei ca
  `odds:fixture:${id}` cresc nemărginit.

**De făcut:** returnează stale imediat + revalidare în fundal; coalescing pe cheie
(un `Map<string, Promise>` de cereri în zbor); evacuare LRU cu limită.

### C-2. Scorurile live sunt vechi de până la 15 minute

Lanțul: `app/page.tsx:86` pollează la 60s → `/api/fixtures` cachează payload-ul
îmbogățit 300s → `getFixturesByDate` are TTL **900s**. README promite „polling live
la 60 de secunde".

**De făcut:** TTL separat pentru meciuri live (60s) vs pre-meci (900s). Nu umfla
costul la providerii cu quota.

### C-3. Dataset de 55 MB parsat per instanță

`data/historical_matches.json` a crescut de la 31k la 62.599 de meciuri (~55 MB).
`strengthStore`, `statsDatabase` și `refereeStore` îl parsează integral la pornire.
Pe Vercel asta e memorie și timp de cold start per instanță.

**De făcut:** evaluează un format binar/indexat, sau pre-calculează profilele de
echipă într-un fișier mult mai mic la build time (echipele au nevoie de ELO + forțe,
nu de toate cele 62k de rânduri la runtime).

### C-4. `next build` eșuează intermitent

`spawn UNKNOWN` (errno -4094) la „Generating static pages", ~1 din 2 rulări pe
Windows. Preexistent. Investighează `experimental.workerThreads` / `cpus` în
`next.config.ts`, sau rulează build-ul în CI pe Linux.

### C-5. Cod mort — ~1.000 de linii

Servicii nefolosite de nimeni: `espnFallback.ts` (171), `teamStrengthService.ts` (160),
`betfairProvider.ts` (113), `understatService.ts` (111), `weatherService.ts` (104),
`clubEloService.ts` (76).

Module de engine referite doar de propriile teste: `alertDispatcher`, `anomalyDetector`,
`asianHandicapQuarter`, `smartMoneyTracker`, `timeDecayModel`.

`engine/residualModel.ts` + `data/residual_model_weights.json`: greutățile sunt
antrenate de `scripts/train_residual_model.ts` și **nu sunt aplicate nicăieri**.

**De făcut:** ori cablează, ori șterge. Suita de 225 de teste dă impresia unei
acoperiri largi, dar o parte testează cod care nu rulează niciodată într-o cerere.

**STOP. Cere confirmare.**

---

# ETAPA D — Modelul (cercetare, nu inginerie)

Aici e problema de fond. Nu o trata ca pe un bug de reparat într-o zi.

### D-1. Ce spun datele

Modelul nu bate linia de închidere în niciuna din cele 37 de ligi, iar ROI-ul e
semnificativ negativ. Asta e situația normală pentru un model Poisson + ELO care
concurează cu piața. Nu e un eșec de implementare — matematica e corectă (4.935 din
4.949 verificări de proprietate trec; cele 14 sunt artefacte de rotunjire).

### D-2. Piețe nebacktestate

`marketBreakdown` din `backtest_metrics.json` conține **o singură intrare: `1X2`**.
Over/Under, BTTS și Asian Handicap **nu au fost niciodată backtestate** — iar
`engine/index.ts:441` sortează value bets prioritizând explicit `AH: 4, OU: 3,
BTTS: 2, '1X2': 1`, „pentru că au marje mai mici".

**Piețele pe care radarul le promovează cel mai sus sunt exact cele fără validare.**

**De făcut, în ordine:** extinde `scripts/backtest.ts` la OU 2.5 și BTTS folosind
`oddsOver25`/`oddsUnder25` din dataset (există în seria principală). Dacă ies tot
negative, sortarea care le prioritizează trebuie scoasă.

### D-3. Fereastra 2022-23 produce 0 pariuri

`walkForwardWindows[0]`: `betsCount: 0`, `bettingRatePercent: 0`, dar e contorizată
ca fereastră validă. Investighează — probabil poarta de CLV nu are sezon-sondă
anterior. Ori repară, ori exclude-o explicit din agregat.

### D-4. Ligile noi au 0 pariuri în backtest

Cele 15 competiții adăugate în Faza 3 contribuie la forța echipelor și la Brier, dar
nu produc pariuri: seria „extra" de pe football-data.co.uk are **doar cote de
închidere**, deci CLV deschidere→închidere nu se poate calcula și poarta nu se
deschide. Corect conservator, dar înseamnă că ROI-ul vine integral din seria
principală.

**De evaluat:** o definiție alternativă de CLV pentru aceste ligi (preț luat vs media
pieței), raportată **separat**, nu amestecată în agregat.

### D-5. Direcții realiste

Ordonate după raportul șansă/efort:

1. **Nu paria 1X2.** Piața e cea mai eficientă acolo. Concentrează-te pe OU/cornere/
   cartonașe, unde marja e mai mică și modelarea e mai puțin saturată — **după** ce
   le backtestezi (D-2).
2. **Urmărește CLV, nu ROI.** CLV pozitiv susținut pe 1.000+ pariuri e singurul
   predictor real de profitabilitate. ROI-ul pe 100 de pariuri e zgomot.
3. **Aplică modelul rezidual** (D-5 în cod: `residualModel.ts`). E antrenat și
   nefolosit. Poate învăța sistematic unde modelul greșește față de piață.
4. **Coada de sus a calibrării.** Decila 10 rămâne supraîncrezătoare cu ~8 pp
   (0,960 prezis vs 0,880 observat). Restul curbei e bună după calibrarea PAVA.
5. **Ligi mici, nu ligi mari.** Dacă undeva există edge, e în competițiile pe care
   casele le prețuiesc cu mai puțină atenție — nu în Premier League.

### D-6. Ce să NU faci

- Nu ajusta praguri până ROI-ul iese pozitiv pe setul de test. E overfitting.
- Nu reintroduce valori implicite „ca să arate mai bine" interfața.
- Nu raporta ROI pe eșantioane sub 100 de pariuri ca dovadă de nimic.
  `engine/weeklyReport.ts` are deja `MIN_BETS_FOR_VERDICT = 100` — respectă-l.
- Nu promite procente de reușită. Un model bun de fotbal face 50-57% strike rate pe
  cote ~2.00 și 1-4% ROI pe termen lung. Orice peste înseamnă că cifrele sunt greșite.

---

# ETAPA E — Surse de date rămase

Lipsesc încă, cu motivul:

| Competiție | De ce lipsește |
|---|---|
| Europa League, Conference League | football-data.org le are doar pe planuri plătite; football-data.co.uk nu le are |
| Cehia, Croația, Serbia, Ucraina, Bulgaria, Slovacia, Cipru | nu sunt în seria „extra" |
| UCL sezoanele 2021-22, 2022-23 | 403 pe planul gratuit |

Sunt marcate explicit în `lib/leagueCodes.ts` → `LEAGUES_WITHOUT_HISTORY`. **Nu le
mapa pe coduri goale** — un cod fără date declanșează căutarea globală de echipe, de
unde vin potrivirile inter-competiție (bug-ul `Lillestrom → Lille`).

De explorat: openfootball/football.json pe GitHub, engsoccerdata, sau planul plătit
football-data.org (~€30/lună acoperă toate competițiile UEFA).

---

## Comenzi utile

```bash
npm run ingest        # seria principală + extra + validare
npm run ingest:extra  # doar competițiile adăugate în Faza 3
npm run validate
npm run calibrate     # RE-RULEAZĂ după orice schimbare de dataset
npm run backtest      # RE-RULEAZĂ după calibrate
npm test
npx tsc --noEmit
npx next build        # reîncearcă dacă dă spawn UNKNOWN
```

Ordinea obligatorie după orice modificare de date sau de model:
**ingest → validate → calibrate → backtest → test → build.**
Sărirea peste `calibrate` lasă site-ul pe curbe fitate pe alt dataset — exact
divergența backtest/producție reparată în Faza 3.
