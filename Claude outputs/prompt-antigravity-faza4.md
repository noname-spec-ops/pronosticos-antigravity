# PROMPT FAZA 4 — Măsurare corectă, calibrare și surse de date noi
## (pentru Antigravity — proiect `D:\PRONOSTICOSantigravity`)

> Trimite de la „CONTEXT" în jos. **O etapă pe rând**, cu oprire pentru confirmare după fiecare.
> Etapa 1 e obligatorie înainte de orice altceva. Nu accepta sărirea peste ea.

---

## CONTEXT

Proiect: FlashStat, Next.js 15 App Router + TypeScript, în `D:\PRONOSTICOSantigravity`.

Starea datelor este bună: 45.684 de meciuri reale, 22 de ligi, sezoanele 2019-20 → 2024-25, cote de deschidere și de închidere în ~100% din meciuri, șuturi/cornere/cartonașe în 93-100%, arbitri în 42% (doar ligile engleze și scoțiene, limitare a sursei).

Starea modelului, din ultima rulare de backtest:

```
Brier model:       0.6112
Brier casă:        0.5961        ← casa câștigă
Log-loss:          1.0199
ROI:               -7.77%
Pariuri:           7300 din 15366 meciuri  = 47.5%
Max drawdown:      614.36%       ← imposibil, bug de calcul
Bate casa în:      0 din 13 ligi
CLV:               nu se calculează
```

### Ce s-a făcut corect în Faza 3
- Ajustare la forța adversarilor în 2 treceri în `engine/teamStrength.ts`.
- Opțiunea `rejectSuspect` adăugată în `engine/valueBets.ts`.
- Module noi: `engine/comboBuilder.ts` (corect matematic — calculează probabilitatea comună din matricea Dixon-Coles), `engine/paperTrading.ts`, `scripts/backtest_totals.ts`.

### Ce NU s-a făcut, și de ce contează
Etapa 1 din Faza 3 — reparațiile de măsurare — a fost sărită, și s-au construit funcționalități noi în locul ei. CLV-ul tot nu există, drawdown-ul tot e imposibil (614%), iar `rejectSuspect` a rămas opțional și nu e activat nicăieri, de unde rata absurdă de pariere de 47.5%.

**Regula acestei faze: nu se construiește nicio funcționalitate nouă până când Etapa 1 nu e completă și verificată.** Fără măsurători corecte, nu poți ști dacă o schimbare ajută sau strică, iar toată munca ulterioară e pe ghicite.

---

# ETAPA 1 — Măsurare corectă

## 1.1 Calculează CLV (Closing Line Value)

Datele există deja: `BetSimulation` are câmpul `closingOdds`, populat din `closingOdds1X2` din dataset.

Pentru fiecare pariu simulat:

```ts
const clvPercent = (oddsAtBet / closingOdds - 1) * 100;
```

Agregă și raportează, global și per ligă:
- `avgClvPercent` — media aritmetică
- `positiveClvRatePercent` — procentul de pariuri cu CLV > 0
- `clvConfidenceInterval95` — interval de încredere pe medie
- defalcare pe benzi de cotă (vezi 1.4)

Adaugă în raportul din consolă un bloc de interpretare cu acest text exact:

```
CLV mediu pozitiv  -> modelul are avantaj informational real, chiar daca ROI-ul e negativ.
CLV mediu negativ  -> nu exista avantaj. Un ROI pozitiv in aceasta situatie a fost noroc.
CLV este mult mai stabil statistic decat ROI: da semnal credibil pe ~300 de pariuri,
in timp ce ROI-ul are nevoie de mii.
```

## 1.2 Repară drawdown-ul definitiv

Codul actual urmărește P&L cumulat, nu capital, de aceea dă 614%. Înlocuiește complet logica de simulare a capitalului:

```ts
let bankroll = 100;          // unitati de start
let peak = bankroll;
let maxDrawdown = 0;

for (const bet of betsInChronologicalOrder) {
  const stake = bankroll * (bet.stakePercent / 100);   // compunere pe bankroll-ul CURENT
  bankroll += bet.won ? stake * (bet.odds - 1) : -stake;

  if (bankroll > peak) peak = bankroll;
  const dd = (peak - bankroll) / peak * 100;
  if (dd > maxDrawdown) maxDrawdown = dd;
}
```

**Obligatoriu:** sortează pariurile cronologic după data meciului înainte de simulare. Ordinea contează pentru drawdown, iar acum nu e garantată.

**Criteriu de validare:** `maxDrawdownPercent` trebuie să fie între 0 și 100. Orice valoare peste 100 înseamnă că bug-ul e încă acolo — nu raporta „gata" până nu e în interval.

## 1.3 Activează `rejectSuspect` implicit

În `engine/valueBets.ts`, `rejectSuspect` e opțional și nu e activat în backtest. Fă-l comportament implicit: `options?.rejectSuspect !== false` în loc de `options?.rejectSuspect`.

Un edge peste 15% față de o piață eficientă nu e oportunitate — e aproape întotdeauna eroare de model, dată lipsă sau cotă expirată. Modelul nu are voie să parieze pe ce marchează singur ca suspect.

**Criteriu de acceptare:** rata de pariere scade sub 10%, ideal 2-5%. Dacă rămâne peste 10%, filtrul tot nu funcționează și trebuie investigat de ce.

## 1.4 Descompune performanța pe benzi de cotă și pe piețe

Aceasta îți arată **unde** pierde modelul, ceea ce e mai valoros decât cifra globală.

Benzi de cotă: `1.01-1.50`, `1.50-2.00`, `2.00-3.00`, `3.00-5.00`, `5.00+`.

Pentru fiecare bandă raportează: număr de pariuri, ROI, CLV mediu, win rate real vs win rate așteptat de model.

Repetă defalcarea pe tip de piață (1X2 / Over-Under / BTTS) și pe ligă.

Motiv: există un fenomen documentat — *favourite-longshot bias* — prin care casele tind să subevalueze favoriții clari și să supraevalueze outsiderii. Dacă pierderile sunt concentrate într-o bandă, ai găsit jumătate din problemă fără să schimbi nimic la model.

## 1.5 Intervale de încredere peste tot

Nicio metrică de performanță nu se raportează ca cifră seacă. Pentru ROI, folosește deviația standard a randamentelor per pariu:

```ts
const returns = bets.map(b => b.won ? (b.odds - 1) : -1);
const mean = average(returns);
const sd = standardDeviation(returns);
const se = sd / Math.sqrt(bets.length);
const ci95 = [mean - 1.96 * se, mean + 1.96 * se];
const isSignificant = ci95[0] > 0 || ci95[1] < 0;
```

Adaugă `isSignificant: boolean` la fiecare metrică de ROI și CLV. Când intervalul conține zero, marchează explicit rezultatul ca nesemnificativ, indiferent cât de bine arată media.

## 1.6 Walk-forward validation în loc de un singur holdout

Backtestul actual folosește o singură împărțire: antrenare pe 2019-20 → 2022-23, test pe 2023-24 + 2024-25. Asta îți dă un singur punct de măsurare și nu-ți arată dacă modelul se degradează în timp.

Înlocuiește cu validare walk-forward:

```
antrenează 2019-20 … 2021-22  →  testează 2022-23
antrenează 2019-20 … 2022-23  →  testează 2023-24
antrenează 2019-20 … 2023-24  →  testează 2024-25
```

Ferestrele de test sunt exclusiv post-pandemie (2022-23, 2023-24, 2024-25). Sezoanele 2019-20 și 2020-21 rămân în antrenare, dar nu se folosesc niciodată ca set de test — vezi 2.5.

Cu granularitate pe jumătate de sezon dacă volumul permite, obții 6-8 ferestre în loc de una.

Beneficii concrete:
- de 4-5 ori mai multe puncte de măsurare din exact aceleași date
- vezi dacă performanța se deteriorează de la o fereastră la alta (semnal de model decay)
- parametrii se recalibrează la fiecare fereastră, exact cum s-ar întâmpla în realitate

Raportează metricile per fereastră **și** agregat. O medie bună care ascunde o tendință descrescătoare e o capcană.

**Atenție la leakage:** la fiecare fereastră, tot ce ține de calibrare (parametri, funcții de calibrare izotonică, praguri) se recalculează folosind exclusiv datele de dinaintea ferestrei de test. Testul din `engine/__tests__/dataLeakage.test.ts` trebuie extins ca să acopere și acest scenariu.

## CRITERIU DE ACCEPTARE ETAPA 1

Nu trece mai departe până când toate sunt adevărate:
- [ ] CLV calculat și raportat global, per ligă și pe benzi de cotă
- [ ] `maxDrawdownPercent` între 0 și 100
- [ ] rata de pariere sub 10%
- [ ] defalcare pe benzi de cotă și pe piețe prezentă în `backtest_metrics.json`
- [ ] fiecare ROI și CLV are interval de încredere și marcaj de semnificație
- [ ] walk-forward cu minim 3 ferestre, metrici raportate per fereastră și agregat

Raportează un tabel înainte/după și oprește-te.

---

# ETAPA 2 — Calibrare statistică

## 2.1 Strat de calibrare izotonică (cel mai bun raport efort/rezultat)

Modelul poate fi sistematic optimist sau pesimist în anumite zone de probabilitate. Calibrarea corectează asta empiric, fără să atingi modelul.

Implementează **PAVA** (Pool Adjacent Violators Algorithm) în `engine/calibration.ts`. Nu ai nevoie de bibliotecă externă, algoritmul are ~40 de linii:

1. Ia toate predicțiile din sezoanele de **antrenare**, ca perechi `(probabilitate_prezisă, rezultat_0_sau_1)`.
2. Sortează crescător după probabilitatea prezisă.
3. Inițializează fiecare punct ca un bloc cu greutate 1 și valoare = rezultatul observat.
4. Cât timp există un bloc a cărui valoare e mai mare decât a blocului următor, unește-le și înlocuiește valoarea cu media ponderată.
5. Rezultatul este o funcție în trepte, monoton crescătoare: probabilitate brută → probabilitate calibrată.
6. Interpolează liniar între trepte pentru valorile intermediare.

Antrenează câte o funcție de calibrare **separat pentru fiecare rezultat** (1, X, 2) și **pentru fiecare ligă**. Dacă o ligă are sub 500 de meciuri de antrenare, folosește funcția globală în locul celei de ligă.

După calibrare, renormalizează cele trei probabilități ca să însumeze 1.0.

Salvează funcțiile în `data/calibration_maps.json`, citite la runtime cu fallback la identitate dacă fișierul lipsește.

**Alternativă mai simplă, dacă izotonica dă probleme:** Platt scaling — o regresie logistică pe logit-ul probabilității brute. Mai puțin flexibilă, dar mai stabilă pe eșantioane mici.

**Criteriu de acceptare:** Brier și log-loss îmbunătățite pe held-out. Curba de calibrare trebuie să se apropie vizibil de diagonală.

## 2.2 Corecție pentru remize

Poisson cu Dixon-Coles subestimează sistematic remizele. Adaugă un parametru multiplicativ:

```
P'(X) = P(X) × δ
P'(1) = P(1) × k
P'(2) = P(2) × k
```
unde `k` se alege astfel încât suma să rămână 1.0.

Potrivește `δ` **per ligă**, prin maximizarea log-likelihood pe sezoanele de antrenare. Așteaptă-te la valori între 1.02 și 1.12.

Verifică după: procentul de remize prezise trebuie să se apropie de procentul real observat per ligă (tipic 22-28%).

## 2.3 Poisson bivariat

Modelul actual presupune că golurile celor două echipe sunt independente. Nu sunt — meciurile deschise produc goluri la ambele capete, meciurile închise la niciunul.

Implementează Poisson bivariat (Holgate) în `engine/bivariatePoisson.ts`:

```
P(X=x, Y=y) = exp(-(λ1+λ2+λ3)) · (λ1^x / x!) · (λ2^y / y!) ·
              Σ[k=0..min(x,y)] C(x,k)·C(y,k)·k!·(λ3/(λ1·λ2))^k
```

unde `λ3` este parametrul de covarianță comună, `λ1 = λ_home - λ3`, `λ2 = λ_away - λ3`.

Potrivește `λ3` per ligă pe datele de antrenare. Valori tipice: 0.05-0.20.

**Impact:** îmbunătățește direct BTTS și Over/Under — exact piețele pe care ai șanse reale. Rulează backtestul pe acele piețe înainte și după, ca să măsori efectul izolat.

Dacă `λ3` calibrat iese sub 0.02 pentru o ligă, păstrează Poisson-ul independent acolo — corelația nu e semnificativă.

## 2.4 Conectează `scripts/calibrate.ts`

Fișierul există din prima zi și n-a fost folosit niciodată. Toți parametrii din `engine/config.ts` sunt ghiciți.

Optimizează prin maximizarea log-likelihood, **exclusiv pe sezoanele 2019-20 → 2022-23**:

| Parametru | Locație | Interval de căutare |
|---|---|---|
| `rho` (Dixon-Coles) | per ligă | -0.25 … 0.00 |
| `HALF_LIFE_DAYS_GOALS` | global | 60 … 250 |
| `HALF_LIFE_DAYS_CORNERS` | global | 150 … 450 |
| `HALF_LIFE_DAYS_CARDS` | global | 150 … 450 |
| `POISSON_WEIGHT` / `ELO_WEIGHT` | per ligă | 0.0 … 1.0 |
| `K_FACTOR` (ELO) | global | 10 … 45 |
| `HOME_ADVANTAGE_PTS` | per ligă | 20 … 150 | *(exclude meciurile `behindClosedDoors`)* |
| `δ` (inflație remize) | per ligă | 1.00 … 1.20 |
| `λ3` (covarianță) | per ligă | 0.00 … 0.30 |

Metodă: căutare pe grilă grosieră, apoi rafinare locală (Nelder-Mead sau coborâre pe coordonate).

Salvează în `data/calibrated_params.json`, citit la runtime cu fallback la `config.ts`.

**REGULĂ ABSOLUTĂ:** nu te uita la rezultatele pe held-out în timpul optimizării. O singură măsurătoare finală, la sfârșit. Dacă ajustezi parametri uitându-te la held-out, faci overfitting pe setul de test și toate cifrele devin minciuni.

## 2.5 Fereastra temporală — decizii ferme, nu negociabile

### Ce sezoane se folosesc

- **Dataset complet: păstrează toate cele 6 sezoane existente** (2019-20 → 2024-25, 45.684 meciuri). Nu șterge nimic, nu introduce niciun prag de vechime.
- **Extindere recomandată:** adaugă sezoanele 2015-16 → 2018-19 din football-data.co.uk. Ajung ~75.000 de meciuri. Acestea se folosesc **exclusiv pentru calibrarea parametrilor și pentru backtest**, niciodată pentru predicția unui meci curent.
- **Ferestrele de test la walk-forward: doar 2022-23, 2023-24, 2024-25.** Sezoanele afectate de pandemie nu se folosesc ca ferestre de test. Pot rămâne în antrenare.

### Interzis: pragul fix de vechime

Nu implementa niciun filtru de tipul „folosește doar meciurile de după data X" pentru calculul forței echipelor. Time decay-ul face deja treaba, continuu și corect. Cu half-life-ul actual de 180 de zile, ponderile efective sunt:

| Vechime | Pondere |
|---|---|
| 6 luni | 0.495 |
| 1 an | 0.245 |
| 2 ani | 0.060 |
| 3 ani | 0.015 |
| 4 ani | 0.0036 |

Un meci de acum 4 ani contribuie de 276 de ori mai puțin decât unul de săptămâna trecută. Un prag fix ar adăuga o discontinuitate artificială fără niciun câștig.

### Marchează meciurile fără spectatori

Analiza propriului dataset arată efectul pandemiei, pe 7.648 de meciuri:

| Sezon | Victorii gazdă | Goluri gazdă |
|---|---|---|
| 2019-20 | 43.5% | 1.48 |
| **2020-21** | **40.8%** | **1.39** |
| 2021-22 | 42.5% | 1.46 |
| 2022-23 | 44.2% | 1.47 |
| 2023-24 | 43.1% | 1.54 |
| 2024-25 | 43.7% | 1.48 |

Sezonul 2020-21 are cu 2.9 puncte procentuale mai puține victorii ale gazdei. Nu e zgomot statistic — e efectul stadioanelor goale.

Acțiune:
1. Adaugă în `IngestedMatch` un câmp `behindClosedDoors: boolean`, setat pentru tot sezonul 2020-21 și pentru meciurile din martie-iunie 2020 și din prima parte a lui 2021-22 (variază pe țară — dacă nu ai granularitate, marchează la nivel de sezon).
2. **Exclude aceste meciuri la calibrarea avantajului teren** (parametrul `HOME_ADVANTAGE_PTS` și punctul 2.6 de mai jos). Restul parametrilor pot folosi toate datele.
3. Raportează avantajul teren calibrat cu și fără aceste meciuri, ca să se vadă diferența.

### Calibrează half-life-ul, separat pe tip de piață

Valoarea de 180 de zile este ghicită. Lucrarea originală Dixon-Coles folosea o ponderare echivalentă cu un half-life de aproximativ 107 zile — aproape de două ori mai rapid.

Calibrează **trei half-life-uri distincte**, nu unul singur:

| Model | Interval de căutare | Așteptare |
|---|---|---|
| Goluri (atac/apărare) | 60 … 250 zile | 90-150 |
| Cornere | 150 … 450 zile | 250-400 |
| Cartonașe / faulturi | 150 … 450 zile | 250-400 |

Motivul separării: forma de marcat fluctuează rapid, dar stilul unei echipe — cât presează, cât faultează, câte cornere generează — e mult mai stabil în timp. Un singur half-life pentru toate e o simplificare care costă acuratețe pe piețele de cornere și cartonașe, exact acolo unde avem cele mai mari șanse de avantaj.

Adaugă în `engine/config.ts` câmpuri separate: `HALF_LIFE_DAYS_GOALS`, `HALF_LIFE_DAYS_CORNERS`, `HALF_LIFE_DAYS_CARDS`.

## 2.6 Avantaj teren per echipă

Acum e o constantă de ligă. În realitate variază mult — altitudine, distanță de deplasare pentru oaspeți, atmosferă.

Calculează pentru fiecare echipă raportul dintre performanța acasă și cea în deplasare, cu shrinkage puternic spre media ligii (prior echivalent cu ~20 de meciuri). Ai 45.000 de meciuri, deci ai suficiente date.

---

# ETAPA 3 — Surse de date noi

## 3.1 Integrează `soccerdata` (Python)

Proiectul e TypeScript, iar biblioteca e Python. Soluția: un director `scripts/python/` cu scripturi care exportă JSON, apelate manual sau prin `npm run` cu `child_process`. Nu încerca să reimplementezi scrapingul în TypeScript.

```bash
pip install soccerdata
```

Biblioteca ([github.com/probberechts/soccerdata](https://github.com/probberechts/soccerdata)) acoperă Club Elo, ESPN, FBref, Football-Data.co.uk, Sofascore, SoFIFA, Understat și WhoScored, cu interfață unică și cache local pe disc.

Creează `scripts/python/fetch_xg.py` care extrage din FBref și Understat, pentru ligile și sezoanele din dataset:
- xG și xGA per echipă per meci
- xG per șut, unde e disponibil
- statistici avansate de echipă

Exportă în `data/xg_data.json`, cu aceleași chei de potrivire a echipelor ca `lib/teamMapping.ts`. Raportează câte meciuri din datasetul principal au primit xG și câte nu.

## 3.2 Înlocuiește proxy-ul xG cu xG real

În `engine/teamStrength.ts`, proxy-ul actual este:

```ts
effectiveGoals = goals × 0.60 + (shotsOnTarget × 0.31) × 0.40
```

E o aproximare grosieră — un șut de la 30 de metri și unul de la 6 metri contează identic.

Înlocuiește cu xG real acolo unde există. Formula devine o combinație între goluri și xG real, cu ponderea potrivită pe date (probabil în jur de 30% goluri / 70% xG — dar **măsoară**, nu presupune). Păstrează proxy-ul din șuturi ca fallback pentru ligile fără acoperire xG, și marchează explicit în metrici ce sursă s-a folosit.

**Criteriu de acceptare:** raportează Brier-ul separat pentru ligile cu xG real și pentru cele cu proxy. Diferența îți spune cât valorează sursa.

## 3.3 Club Elo ca reper independent

[clubelo.com/API](http://clubelo.com/API) oferă gratuit, fără cheie:
- `http://api.clubelo.com/YYYY-MM-DD` → CSV cu ratingurile tuturor cluburilor la acea dată
- `http://api.clubelo.com/TeamName` → istoricul complet al unui club

Două utilizări:

1. **Verificare independentă.** Compară ELO-ul tău cu al lor pentru aceleași echipe la aceleași date. O divergență sistematică înseamnă bug în implementarea ta. Raportează corelația — dacă e sub 0.85, investighează.
2. **Feature suplimentar.** Ratingurile lor sunt calibrate pe date mult mai largi și includ cupe europene, ceea ce ajută la compararea între ligi.

Descarcă istoricul lunar pentru toată perioada datasetului și salvează în `data/clubelo_history.json`.

## 3.4 Cote de la mai multe case

Acum compari modelul cu o singură casă. Un parior profesionist face invers: compară **casele între ele**, și caută casa rămasă în urmă față de consens.

Extinde `services/oddsProvider.ts`:
- preia cote de la 15-20 de case prin The Odds API (`https://api.the-odds-api.com/v4/sports/soccer_*/odds/?regions=eu&markets=h2h,totals,spreads`)
- calculează consensul devigged al caselor „ascuțite" (Pinnacle și bursele, dacă sunt disponibile)
- semnalează cazurile unde o casă se abate semnificativ de consens
- afișează în UI cea mai bună cotă disponibilă per selecție, cu numele casei

Această comparație casă-vs-consens este o sursă de avantaj mult mai solidă decât model-vs-casă. Adaugă un câmp nou `marketDisagreementPercent` în `ValueBet`.

### Ierarhia pieței — cine e reperul

Nu toate casele au aceeași valoare informațională. Construiește explicit această ierarhie în cod, ca o configurare:

1. **Bursele de pariuri** (Betfair Exchange, Smarkets) — prețuri formate de pariorii înșiși, fără marjă de casă, cu lichiditate reală. Cel mai bun reper de probabilitate publică existent.
2. **Casele „ascuțite"** (Pinnacle, SBOBet, IBCBet) — marje mici, limite mari, acceptă pariori câștigători, își corectează cotele în secunde.
3. **Casele „moi"** — marje mari, publicitate, reacție lentă la informație.

Regula operațională: **probabilitatea reală o iei din nivelurile 1-2, iar pariul îl cauți la nivelul 3.** Un value bet real înseamnă că o casă moale a rămas în urmă față de consensul ascuțit — nu că modelul tău are o părere diferită de piață.

Adaugă în `ValueBet` câmpurile `sharpConsensusProb` și `softBookDeviationPercent`, și sortează radarul după al doilea, nu după edge-ul față de model.

## 3.7 Reperul Betfair

[Betfair Exchange](https://developer.betfair.com) oferă API gratuit cu un cont. Prețurile de acolo sunt cea mai bună estimare publică de probabilitate reală, pentru că nu conțin marjă de casă — doar comisionul pe profit.

Două utilizări:
- **Benchmark pentru model.** Măsoară Brier-ul modelului tău față de probabilitățile implicite Betfair la momentul închiderii. Dacă nu le bați, nu ai avantaj — indiferent ce spune comparația cu o casă moale.
- **Sursă de CLV de calitate.** Cota de închidere de pe bursă e un reper mai curat decât cota de închidere a unei case oarecare.

Salvează prețurile de închidere Betfair pentru fiecare meci urmărit, alături de cele ale caselor.

## 3.8 Distanță de deplasare și odihnă

`engine/scheduleFatigue.ts` calculează deja zilele de odihnă și aglomerarea de calendar. Extinde cu distanța de deplasare:

- construiește o tabelă cu coordonatele stadioanelor pentru echipele din ligile acoperite (sursă: Wikipedia/OpenStreetMap, o dată, salvată în `data/stadiums.json`)
- calculează distanța haversine între stadionul gazdei și cel al oaspeților
- adaugă ca factor de ajustare pentru echipa oaspete, calibrat pe date

Relevant mai ales pentru ligi extinse geografic — Turcia, Rusia, Spania — și pentru echipele care au jucat în cupele europene la mijlocul săptămânii.

**Ce să NU adaugi:** vremea. Efectul măsurabil asupra numărului de goluri este aproape de zero după ce controlezi pentru forța echipelor, iar costul de integrare e mare. Nu merită.

## 3.5 Istoricul mișcării cotelor — pornește colectarea AZI

Nimeni nu-ți dă gratis istoricul mișcării cotelor. Trebuie colectat, iar fiecare zi în care nu colectezi e o zi pierdută definitiv.

Creează un job care, pentru fiecare meci din următoarele 48 de ore, salvează cotele la fiecare 15 minute până la fluierul de start, în `data/odds_timeline/`. Structură: `fixtureId`, `timestamp`, `bookmaker`, cotele pe fiecare piață.

După câteva săptămâni vei putea calcula: direcția și magnitudinea mișcării, momentul mișcărilor bruște („steam moves"), și — cel mai valoros — cât de bine prezice mișcarea cotelor rezultatul final. Pentru un bot, direcția mișcării e adesea mai predictivă decât orice model statistic.

## 3.6 Formații și accidentări înainte de start

Preia lineup-ul prin `GET /fixtures/lineups?fixture={id}` cu ~60 de minute înainte de start, și accidentările prin `GET /injuries?fixture={id}`.

Conectează la `engine/lineupAdjuster.ts`, care există dar nu primește date reale. Ponderează absențele după minutele jucate în sezon și contribuția la goluri, nu după „titular sau nu".

**Constrângere practică:** cu planul API actual (100 requests/zi) nu poți face asta pentru toate meciurile. Folosește `lib/leaguePriority.ts` ca să acoperi doar ligile prioritare, și raportează clar în UI pentru care meciuri există informație de formație.

---

# ETAPA 4 — Selecția pariurilor

## 4.1 Scoate 1X2 din radarul de value bets

Modelul a pierdut în 13 din 13 ligi, consecvent, în două rulări independente. 1X2 e cea mai eficientă piață din fotbal — marjă mică, atenție maximă, bani informați.

Continuă să afișezi probabilitățile 1X2 ca informație pentru utilizator, dar **nu genera recomandări de pariu** pe această piață până când CLV-ul măsurat nu e pozitiv pe o ligă anume. Regula în cod: value bets pe 1X2 doar unde `avgClvPercent > 0` **și** `beatsBookmakerBrier === true`.

## 4.2 Mută efortul pe Asian Handicap și Over/Under

Motivul e marja: AH are tipic 2-3%, Over/Under 3-5%, față de 5-7% la 1X2. Un avantaj mic supraviețuiește unei marje mici și moare sub una mare.

În plus, modelul tău prezice **goluri**, nu rezultate — deci e structural mai bine poziționat pe piețele de goluri decât pe 1X2.

`deriveAsianHandicap` există deja în `engine/poisson.ts`. Extinde-l la liniile standard (-2.5 … +2.5 din 0.25 în 0.25, inclusiv liniile sfert) și adaugă-l în backtest cu metrici complete.

## 4.3 Kelly ajustat la incertitudinea modelului

Formula actuală tratează `P_model` ca adevăr absolut. Nu e — e o estimare cu eroare, iar eroarea variază mult de la meci la meci.

Introdu un factor de încredere între 0 și 1, calculat din:
- numărul de meciuri în istoricul ambelor echipe (puține → încredere mică)
- dacă formațiile sunt cunoscute
- dacă liga e calibrată și trece testul CLV
- dacă xG real e disponibil sau doar proxy
- dispersia între casele de pariuri (dezacord mare între case → incertitudine mare)

```ts
stake = kellyStake × confidenceFactor
```

Un parior adevărat își variază miza mult mai mult decât crede majoritatea. O miză de 0.3% și una de 2% pe același edge nominal sunt decizii diferite și corecte, în funcție de cât de sigur ești pe estimare.

## 4.4 Folosește `comboBuilder` ca instrument de transparență

Modulul calculează corect probabilitatea comună din matricea Dixon-Coles. Folosește-l ca să **arăți utilizatorului cât pierde**, nu ca să-i recomanzi combinate.

Fiecare selecție adăugată înmulțește marja casei încă o dată: un bilet de 4 meciuri, fiecare cu marjă de 5%, pornește cu aproximativ 19% dezavantaj matematic.

În UI, pentru fiecare combinat construit de utilizator afișează: cota corectă calculată de model, cota oferită de casă, diferența procentuală, și avertismentul că fiecare selecție în plus reduce valoarea așteptată. Aproape niciun site nu face asta — e o funcționalitate onestă care te diferențiază.

## 4.5 Răbdarea ca funcționalitate — scalare asimetrică

Acesta este principiul care separă un sistem matur de unul care pierde bani. Sistemul actual pariază pe 47.5% din meciuri. Un sistem corect pariază rar.

Implementează explicit:

- **Nicio cotă minimă de pariuri.** Sistemul trebuie să poată rula 30 de zile consecutive fără să recomande un singur pariu, dacă nu găsește nimic care trece pragurile. Asta e comportament corect, nu defecțiune. Scrie un test care confirmă că sistemul nu generează pariuri pe un set de meciuri fără oportunități reale.
- **Fără „pariul zilei".** Nu implementa nicio funcționalitate care garantează o recomandare pe zi sau pe etapă. Orice mecanism care forțează un pariu ca să umple un slot distruge valoarea așteptată.
- **Miza rămâne guvernată de Kelly.** Nu introduce nicio cale de suprascriere manuală a mizei, oricât de mare ar părea avantajul. Kelly ține deja cont de mărimea edge-ului — un avantaj mai mare produce automat o miză mai mare. Suprascrierea e mecanismul prin care se pierd capitaluri întregi într-un weekend. Plafonul de 2% din bankroll rămâne absolut.
- **Indicator de sănătate în UI:** afișează câte oportunități au fost găsite în ultimele 7 zile și din câte meciuri analizate. O rată constant sub 5% e semn de sistem sănătos.

---

# ETAPA 5 — Operațional

## 5.1 Pornește paper trading live

`engine/paperTrading.ts` există. Activează-l acum, în producție.

Pentru fiecare pariu pe care modelul l-ar recomanda, înregistrează: data și ora deciziei, meciul, piața, selecția, cota la momentul deciziei, casa, probabilitatea modelului, edge-ul, miza Kelly, factorul de încredere. Apoi, după startul meciului, completează cota de închidere, iar după final rezultatul.

Salvează într-o bază de date persistentă, nu în memorie.

Construiește un dashboard `/paper-trading` cu: numărul de pariuri acumulate, CLV mediu cu interval de încredere, ROI cu interval de încredere, curba de bankroll, defalcare pe piață și pe ligă.

**Regulă:** minim 500 de pariuri acumulate înainte de orice concluzie, și înainte de orice ban real. CLV pozitiv după 500 → ai ceva real. Negativ → ai aflat gratis.

## 5.2 Monitorizare de drift

Modelele de fotbal se degradează în timp. Regulile se schimbă — introducerea VAR a modificat măsurabil ratele de penalty și de cartonașe roșii. Stilurile de joc evoluează.

Creează un job lunar care:
- rulează backtestul pe ultimele 6 luni de date
- compară Brier-ul cu referința din ultima calibrare
- alertează dacă deteriorarea depășește 3%
- declanșează recalibrare automată la începutul fiecărui sezon

Adaugă în `ModelHealthBadge` data ultimei calibrări și starea de drift.

Adaugă și alerta pe fereastră mobilă: dacă ROI-ul mediu pe ultimele 500 de pariuri înregistrate scade sub pragul de referință, marchează sistemul ca necesitând recalibrare și afișează asta vizibil.

## 5.3 Kill-switch la drawdown

Disciplina financiară trebuie codificată, nu promisă. Implementează în `engine/paperTrading.ts` un întrerupător automat:

```ts
if (currentDrawdownPercent >= 15) {
  suspendBettingUntil = now + 24h;
  logEvent('KILL_SWITCH_TRIGGERED', { drawdown, bankroll, lastBets });
}
```

Reguli:
- la -15% drawdown față de vârful capitalului, sistemul suspendă orice recomandare nouă timp de 24 de ore
- **fără excepții și fără posibilitate de suprascriere din UI** — dacă se poate dezactiva cu un click, nu e un kill-switch
- la reluare, sistemul rulează automat o verificare de drift (5.2) înainte de a permite pariuri noi
- la -25%, suspendare până la recalibrare manuală completă

Motivul e comportamental: după o serie de pierderi, tendința naturală e să mărești mizele ca să recuperezi. Un sistem automat care refuză să parieze într-o perioadă proastă e singura protecție care funcționează, pentru că nu negociază.

## 5.4 Raport săptămânal automat

Un job care rulează duminica și generează un raport din baza de date de paper trading:

- ROI și CLV pe ultimele 7 zile, 30 de zile și total, fiecare cu interval de încredere
- defalcare pe ligă, piață și bandă de cotă
- **recomandări explicite de oprire:** orice ligă sau piață cu CLV negativ pe minim 100 de pariuri primește eticheta „oprește pariurile aici"
- orice ligă cu CLV pozitiv semnificativ primește eticheta „candidat pentru mărirea expunerii"
- evoluția numărului de oportunități găsite (dacă scade brusc, ceva s-a stricat în pipeline)

Raportul se salvează ca JSON și se afișează în dashboard-ul `/paper-trading`.

---

# ETAPA 6 — Model de reziduu peste piață (EXPERIMENTAL, doar după Etapele 1-5)

**Nu începe această etapă până când Etapele 1-5 nu sunt complete și CLV-ul nu e măsurat corect.**

Există o singură utilizare a învățării automate care funcționează credibil în pariurile sportive, și e diferită de abordarea obișnuită. Nu prezici rezultatul de la zero — prezici **unde greșește piața**.

### Formularea corectă

- **Intrare:** probabilitatea devigged a consensului ascuțit, plus maximum 8 features (forța din model, diferența de xG recent, absențe cheie, odihnă, distanță, mișcarea cotei de la deschidere, dezacordul între case, indicator de ligă).
- **Țintă:** reziduul — diferența dintre rezultatul real și probabilitatea prețuită de piață.
- **Model:** gradient boosting cu regularizare puternică (adâncime maximă 3-4, `min_child_weight` mare, subsample 0.8, learning rate mic cu early stopping).
- **Validare:** exclusiv walk-forward, niciodată `train_test_split` aleatoriu.

### De ce funcționează asta și nu abordarea directă

Prezicerea rezultatului de la zero e o problemă cu semnal slab și zgomot uriaș — modelul memorează. Prezicerea reziduului pornește de la cea mai bună estimare existentă (piața) și caută doar corecția, ceea ce e o problemă mult mai mică, cu semnal mai concentrat.

### Criteriu de oprire

Dacă modelul de reziduu nu produce CLV pozitiv pe walk-forward, **îl abandonezi**. Nu-l ajusta până când arată bine — asta e overfitting pe setul de validare. Un rezultat negativ aici e informație validă: înseamnă că piața nu are ineficiențe pe care aceste features le pot detecta.

Maximum 8 features. Dacă simți nevoia să adaugi a 15-a, semnalul nu e acolo.

---

# CE SĂ NU FACI

- **Nu construi funcționalități noi până Etapa 1 nu e completă.** Asta s-a întâmplat în Faza 3 și ne-a costat o rundă întreagă.
- Nu te uita la rezultatele pe held-out în timpul calibrării. O singură măsurătoare finală.
- Nu introduce Random Forest, XGBoost sau rețele neuronale. Pe volumul disponibil per ligă overfitează și pierd în fața Poisson-ului bine specificat.
- Nu recomanda combinate ca value bets.
- Nu afișa ROI sau acuratețe fără interval de încredere și fără numărul de pariuri.
- Nu genera date de fallback nicăieri — eroare zgomotoasă în loc de valori inventate.
- Nu introduce praguri fixe de vechime a meciurilor (de tip „doar după 2022"). Time decay calibrat face treaba — vezi 2.5.
- Nu folosi sezoanele afectate de pandemie ca ferestre de test și nu calibra avantajul teren pe ele.
- Nu folosi un singur half-life pentru goluri, cornere și cartonașe.
- Nu scădea pragul de edge ca să apară mai multe pariuri. Rata mică de pariere e obiectivul, nu problema.
- Nu folosi Opta sau WhoScored direct (enterprise, respectiv fără API public) și nu reintroduce dataset-ul Kaggle `hugomathien/soccer` (se oprește în 2016). Nu propune Sportradar — e enterprise, cu costuri de zeci de mii pe an.

### Abordări respinse explicit, cu motivul

Acestea apar frecvent în ghidurile online și au fost evaluate și respinse pentru acest proiect. Nu le implementa, nici dacă par atrăgătoare.

**Simulări Monte Carlo pentru un meci individual.** Matricea Dixon-Coles 9×9 conține deja probabilitatea exactă a fiecărui scor. A simula 10.000 de meciuri din aceeași distribuție dă același rezultat plus zgomot de eșantionare — este strict inferior. Monte Carlo își are locul doar la simularea unui sezon întreg (cine câștigă liga) sau la bilete corelate pe piețe dependente de traseu.

**NLP pe Twitter/X pentru anticiparea formațiilor.** API-ul costă sute de dolari pe lună, scrapingul încalcă termenii de utilizare, tweet-urile jurnaliștilor sunt zgomotoase și contradictorii, iar formațiile oficiale apar oricum cu 60 de minute înainte prin API-ul de fixtures. Raport efort/beneficiu foarte prost și o cursă de viteză care nu poate fi câștigată de la un laptop.

**Scanner de arbitraj cu plasare automată de pariuri.** Arbitrajul este comportamentul cel mai rapid detectat de casele de pariuri și duce la limitare în câteva săptămâni. În plus, majoritatea caselor nu expun API de plasare — doar bursele o fac. Nu construi această funcționalitate.

**Co-location / optimizare de latență la nivel de milisecunde.** Are sens pentru trading live pe tenis sau curse de cai. La fotbal pre-meci, o cotă rămasă în urmă trăiește minute, nu milisecunde. Un VPS obișnuit este mai mult decât suficient.

**Multi-accounting, gestionare de identități, rotație de proxy-uri.** Nu implementa nimic din această categorie. Conturile deschise pe numele altor persoane constituie fraudă de identitate în majoritatea jurisdicțiilor, iar rezultatul obișnuit nu este limitarea contului, ci confiscarea fondurilor și eventuale consecințe penale. Alternativele legitime pentru problema limitării sunt bursele de pariuri, unde limitarea nu există, și brokerii licențiați care agregă accesul la piețele asiatice.

**Suprascrierea manuală a mizei Kelly.** Vezi 4.5. Nu implementa nicio cale prin care o miză poate depăși plafonul de 2% din bankroll, indiferent de mărimea edge-ului aparent.

---

# AȘTEPTĂRI REALISTE

Semnalul de succes al acestei faze **nu este ROI pozitiv**. Este:

1. Măsurători în care putem avea încredere (Etapa 1), validate walk-forward, nu pe un singur holdout.
2. Un model mai bine calibrat — Brier apropiat de cel al burselor și al caselor ascuțite, curbă de calibrare aproape de diagonală (Etapa 2).
3. **CLV mediu pozitiv pe cel puțin o piață sau o ligă**, măsurat față de cota de închidere a unei surse ascuțite, nu a unei case moi (Etapele 3-4).
4. Un sistem de paper trading care acumulează dovezi, cu kill-switch funcțional și raport săptămânal (Etapa 5).
5. O rată de pariere sub 5%, cu capacitatea demonstrată de a nu paria deloc perioade lungi (4.5).

Este foarte posibil ca modelul să nu bată piața pe 1X2 nici după toate astea. Nu e eșec — e informație. Avantajul, dacă există, va fi pe Asian Handicap, Over/Under, cornere sau cartonașe, în ligile mai puțin urmărite. Acolo căutăm.

---

# MOD DE LUCRU

O etapă pe rând. După fiecare, raportează un tabel comparativ înainte/după cu: Brier, log-loss, ROI cu IC, CLV cu IC, rată de pariere, drawdown, număr de pariuri. Vreau efectul fiecărei schimbări izolat, nu cumulat.

Dacă o schimbare înrăutățește metricile, spune asta explicit și propune revenirea — nu o masca prin ajustări compensatorii.

Începe cu **ETAPA 1** și oprește-te după criteriul ei de acceptare.
