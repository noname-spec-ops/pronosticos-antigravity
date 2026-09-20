# PROMPT FAZA 3 — Calibrare și validare model (pentru Antigravity)

> Trimite textul de la „CONTEXT" în jos. Lucrează o etapă pe rând.
> Etapele 1-3 sunt cele care schimbă imaginea. Etapele 4-7 sunt cele care mișcă acuratețea.

---

## CONTEXT

Lucrezi în `D:\PRONOSTICOSantigravity`. Faza 2 e încheiată cu succes: datele sunt reale (45.684 meciuri, 22 ligi, sezoane 2019-20 → 2024-25, cote de închidere în ~100% din meciuri, șuturi/cornere/cartonașe în 93-100%), constantele hardcodate au dispărut din rute, `strengthStore` e conectat, iar `oddsProvider` face apeluri HTTP reale fără fallback inventat.

Backtestul rulat pe date reale a dat următorul rezultat, care este punctul de plecare al acestei faze:

```
Brier model:      0.5883
Brier casă:       0.5710      ← casa câștigă
Log-loss:         0.9878
ROI:              -7.15%
Pariuri:          4600 din 8078 meciuri (57%)
Max drawdown:     3693.89%    ← imposibil, bug de calcul
Bate casa în:     0 din 12 ligi
```

Un audit al codului a identificat cauzele. Nu sunt probleme de date — sunt probleme de logică de model și de măsurare. Le rezolvăm în ordinea de mai jos.

**Nu rescrie proiectul.** Modificările sunt chirurgicale, în fișiere precise.

---

## ETAPA 1 — Repară măsurătorile (fă asta prima)

Până când măsurătorile nu sunt corecte, nu poți ști dacă vreo schimbare ulterioară ajută sau strică.

### 1.1 Drawdown-ul este calculat greșit

În `scripts/backtest.ts`, în jurul liniilor 293-303 și 342-361:

```ts
let peakBankroll = 0;
let currentBankroll = 0;
...
currentBankroll += b.profitUnits;
if (currentBankroll > peakBankroll) peakBankroll = currentBankroll;
const dd = peakBankroll > 0 ? ((peakBankroll - currentBankroll) / peakBankroll) * 100 : 0;
```

Se urmărește P&L-ul cumulat, nu un capital. După o primă victorie mică, `peakBankroll` e 0.5; când P&L-ul ajunge la -18, formula dă 3700%.

**Fix:** pornește `bankroll = 100` unități. Mizele se calculează ca procent din bankroll-ul curent (compunere), iar drawdown-ul se măsoară față de vârful bankroll-ului, nu al profitului. Rezultatul trebuie să fie între 0% și 100%.

### 1.2 Adaugă CLV (Closing Line Value) — cea mai importantă metrică lipsă

`BetSimulation` stochează deja `closingOdds`, iar `closeOdds` este populat din date. Metrica pur și simplu nu se calculează nicăieri.

Pentru fiecare pariu simulat:
```
CLV% = (cota_la_care_am_pariat / cota_de_inchidere - 1) × 100
```

Raportează CLV mediu global și per ligă, plus procentul de pariuri cu CLV pozitiv.

**Interpretarea, pe care trebuie s-o incluzi în raportul afișat în consolă:**
- CLV mediu pozitiv → modelul are avantaj informațional real, chiar dacă ROI-ul e încă negativ. Merită continuat.
- CLV mediu negativ cu ROI pozitiv → a fost noroc. Modelul nu are avantaj.
- CLV este mult mai stabil statistic decât ROI-ul: îți dă un semnal credibil pe 300 de pariuri, în timp ce ROI-ul are nevoie de mii.

### 1.3 Raportează toate metricile cu interval de încredere

ROI-ul de +9.46% pe 233 de pariuri din Scottish Premiership are un interval de încredere 95% de **-8.7% până la +27.6%**. Adică zgomot. Raportat ca cifră seacă, induce în eroare.

Calculează și afișează intervalul de încredere 95% pentru ROI, per ligă și global. Marchează explicit `"semnificativ": false` când intervalul conține zero.

### 1.4 Raportează rata de pariere

Adaugă în metrici `betRatePercent` = pariuri / meciuri evaluate. Valoarea actuală, 57%, este anormală — o strategie reală de value betting se declanșează pe 2-5% din meciuri. Această cifră este un indicator de sănătate a filtrului.

**Criteriu de acceptare Etapa 1:** drawdown între 0-100%, CLV raportat global și per ligă, intervale de încredere prezente, rată de pariere raportată.

---

## ETAPA 2 — Unifică backtestul cu aplicația

În momentul de față, backtestul măsoară un model diferit de cel care rulează în producție. Metricile afișate pe site nu descriu predicțiile de pe site.

### 2.1 Backtestul nu aplică blendingul cu piața

În `scripts/backtest.ts`, în bucla de predicție:
```ts
const probs = derive1X2FromMatrix(matrix);
```
Model brut. Dar `engine/index.ts` aplică `blendWithMarketPrior` cu 65% pondere piață. Sunt două modele diferite.

### 2.2 Backtestul dezactivează tăcut proxy-ul xG

În `scripts/backtest.ts`, `formattedHistory` mapează doar `date`, echipele și golurile — omite `homeShotsOnTarget` și `awayShotsOnTarget`. Deci `calculateLeagueTeamStrengths` cade pe goluri brute la backtest, dar folosește proxy-ul xG în aplicație. Una dintre componentele cele mai valoroase nu a fost măsurată niciodată.

### 2.3 Fix

Extrage o singură funcție `predictFixture(input): ModelPrediction` folosită **identic** de `scripts/backtest.ts`, `app/api/fixtures/route.ts` și `app/api/predictions/[fixtureId]/route.ts`. Aceiași parametri, aceleași câmpuri, aceeași ordine de operații.

Adaugă `homeShotsOnTarget` și `awayShotsOnTarget` în `formattedHistory` din backtest.

Scrie un test care rulează același meci prin ambele căi și verifică egalitatea probabilităților până la a 4-a zecimală. Orice divergență invalidează toate metricile.

**Criteriu de acceptare Etapa 2:** testul de echivalență trece; raportează Brier-ul modelului cu blending și cu xG activ — se așteaptă o îmbunătățire substanțială față de 0.5883.

---

## ETAPA 3 — Repară logica de value betting

Aici e cauza principală a ROI-ului negativ.

### 3.1 Problema

În `engine/index.ts`, probabilitatea 1X2 finală este:
```ts
P_final = 0.35 × P_model + 0.65 × P_piață_devigged
```
Apoi `evaluateValueBet` compară exact acel `P_final` cu cotele **aceleiași case** din care a venit `P_piață`. Matematic, blendingul se anulează singur:

| Pondere piață | Edge brut necesar pentru a trece pragul de 5% |
|---|---|
| 65% (actual) | 23.1% |
| 50% | 14.8% |
| 35% | 10.3% |
| 0% | 5.0% |

Singurele pariuri care trec filtrul sunt cele unde modelul brut se abate de piață cu peste 23%. O abatere atât de mare față de o piață eficientă înseamnă aproape întotdeauna eroare de model — date lipsă, lot schimbat, cotă mișcată — nu oportunitate. **Filtrul selectează sistematic erorile propriului model.**

### 3.2 Separă cele două probabilități

- `probabilities1X2` (blended, 35/65) rămâne ce afișezi utilizatorului. E mai bine calibrată și e corect s-o folosești pentru afișare.
- Introdu un câmp separat `bettingProbabilities1X2` folosit exclusiv pentru detecția de value.

Pariul se justifică prin dovada că modelul bate piața **în acel tip de situație, pe acea ligă** — stabilită la backtest — nu printr-o diferență aritmetică față de cotă. Concret: generează value bets doar pentru ligile unde backtestul arată `beatsBookmakerBrier: true` **și** CLV mediu pozitiv. În rest, afișează probabilitățile ca informație, fără recomandare de pariu.

### 3.3 Exclude complet edge-urile suspecte

`classifyValueGrade` etichetează corect edge-urile peste 15% ca `SUSPECT`, dar `evaluateValueBet` le returnează oricum și backtestul pariază pe ele. Modelul spune „datele par greșite" și apoi mizează.

În `engine/valueBets.ts`, `evaluateValueBet`: dacă `edgePercent >= SUSPECT_EDGE_PERCENT`, returnează `null`. Fără grad, fără avertisment, excludere.

### 3.4 Tratează toate piețele la fel

`overUnderProbabilities` și `bttsProbabilities` nu trec prin `blendWithMarketPrior` — doar 1X2 trece. De acolo vine probabil masa celor 4600 de pariuri. Aplică aceeași logică de blending și aceeași separare display/betting pe toate piețele.

**Criteriu de acceptare Etapa 3:** rata de pariere scade sub 10%; raportează noul ROI și noul CLV.

---

## ETAPA 4 — Ajustarea la forța adversarilor

Antetul din `engine/teamStrength.ts` promite explicit „Opponent strength adjustment". În cod nu există — sunt medii ponderate simple ale golurilor marcate și primite. O echipă care a prins un calendar ușor apare artificial puternică.

Acesta este cel mai mare câștig de acuratețe rămas.

Implementează potrivire iterativă:
1. Inițializează toate atacurile și apărările la 1.0.
2. Recalculează atacul fiecărei echipe, împărțind golurile marcate la forța apărării adversarilor întâlniți (ponderat cu time-decay).
3. Recalculează apărarea, împărțind golurile primite la forța atacului adversarilor.
4. Repetă până când modificarea maximă scade sub 0.001, sau maxim 20 de iterații.
5. Renormalizează astfel încât media ligii să rămână 1.0.

Alternativa mai riguroasă, dacă o poți implementa curat: potrivire prin maximum likelihood a modelului Poisson pe tot setul de antrenare, cu parametri de atac și apărare per echipă plus un parametru de avantaj teren.

**Criteriu de acceptare Etapa 4:** Brier îmbunătățit față de Etapa 2 pe held-out; raportează diferența.

---

## ETAPA 5 — Calibrează parametrii pe date

Niciun parametru din `engine/config.ts` nu este potrivit pe date. Toți sunt ghiciți: `DEFAULT_RHO: -0.13`, `HALF_LIFE_DAYS: 180`, `POISSON_WEIGHT: 0.60 / ELO_WEIGHT: 0.40`, `MODEL_WEIGHT: 0.35 / MARKET_WEIGHT: 0.65`, `K_FACTOR: 24`, `HOME_ADVANTAGE_PTS: 75`.

`scripts/calibrate.ts` există dar nu e conectat la nimic.

1. Optimizează prin maximizarea log-likelihood, **exclusiv pe sezoanele de antrenare** (2019-20 → 2022-23). Nu atinge sezoanele held-out.
2. Calibrează `rho` **per ligă** — diferă vizibil între competiții.
3. Calibrează și ponderea model/piață per ligă. În unele ligi mici modelul poate merita o pondere mai mare decât 35%.
4. Salvează parametrii calibrați într-un fișier pe care engine-ul îl citește la runtime, cu fallback la valorile din config dacă lipsește.
5. Rulează backtestul cu parametrii calibrați și compară.

**Regulă strictă:** dacă ajustezi parametri și apoi te uiți la held-out, apoi ajustezi din nou pe baza acelui rezultat, faci overfitting pe setul de test. O singură măsurătoare finală pe held-out, la sfârșit.

---

## ETAPA 6 — Corecții punctuale

### 6.1 Discontinuitate la shrinkage
În `engine/teamStrength.ts`, `applyBayesianShrinkage` se aplică doar sub pragul de 15 meciuri. O echipă cu 14 meciuri primește ponderea 14/19 = 0.74; una cu 15 sare brusc la 1.0. Aplică shrinkage-ul mereu, continuu, eliminând pragul.

### 6.2 Echipe promovate și retrogradate
ELO-ul se transferă între divizii la valoare nominală. O echipă promovată din Championship intră în Premier League cu ELO-ul din liga inferioară și e sistematic supraevaluată. Ai 22 de ligi și 6 sezoane — deci poți **măsura** discountul corect din propriile date: compară performanța reală a echipelor promovate cu cea prezisă și derivă factorul de ajustare per pereche de divizii. Nu-l ghici.

### 6.3 Arbitri
`referee` e disponibil doar în 42% din meciuri — football-data.co.uk publică această coloană doar pentru ligile engleze și scoțiene. Pentru celelalte 13 ligi, indicele de severitate nu are bază. Marchează-l explicit ca indisponibil acolo și ascunde-l în UI, în loc să cadă pe o valoare implicită.

---

## ETAPA 7 — Backtestează cornerele și cartonașele

`engine/corners.ts` și `engine/cards.ts` sunt scrise și au teste unitare, dar **nu au fost niciodată backtestate**. Nu știi dacă funcționează.

Ai în date `homeCorners`, `awayCorners`, `homeYellowCards`, `awayYellowCards`, `homeFouls`, `awayFouls` în peste 93% din meciuri. Deci poți face backtest complet pe aceste piețe.

Aici e cel mai probabil să găsești avantaj real: 1X2 este cea mai eficientă piață din fotbal, urmărită de toată lumea. Cornerele și cartonașele sunt semnificativ mai puțin eficient prețuite, mai ales în ligile mici.

Extinde `scripts/backtest.ts` cu module pentru total cornere și total cartonașe, cu aceleași metrici: Brier, calibrare, CLV. Dacă nu ai cote istorice pentru aceste piețe, măsoară măcar calitatea predicției (eroare absolută medie față de valoarea reală și calibrarea distribuției).

---

## CE SĂ NU FACI

- Nu ajusta parametrii până obții un ROI frumos pe held-out. O singură măsurătoare finală.
- Nu introduce Random Forest, XGBoost sau rețele neuronale. Pe volumul disponibil per ligă overfitează și pierd în fața Poisson-ului bine specificat.
- Nu adăuga variabile noi în această fază. Întâi facem să funcționeze corect ce există.
- Nu genera date de fallback nicăieri.
- Nu afișa value bets pe ligi unde backtestul arată că modelul pierde în fața casei.
- Nu raporta ROI fără interval de încredere și fără numărul de pariuri.

---

## AȘTEPTĂRI REALISTE

Este foarte posibil ca după toate etapele modelul să nu bată piața pe 1X2. Asta **nu** este un eșec — 1X2 e cea mai eficientă piață din fotbal.

Semnalul de succes al acestei faze nu este ROI pozitiv, ci: **CLV mediu pozitiv pe cel puțin câteva ligi**, plus metrici corect măsurate în care putem avea încredere. Dacă obținem asta, avem o bază reală de construit. Dacă nu, vom ști exact unde nu are modelul avantaj și vom muta efortul pe cornere și cartonașe.

---

## MOD DE LUCRU

O etapă pe rând, cu oprire pentru confirmare după fiecare.

După fiecare etapă raportează un tabel comparativ: Brier, log-loss, ROI cu interval de încredere, CLV, rată de pariere, drawdown — înainte și după modificare. Vreau să văd efectul fiecărei schimbări izolat.

Începe cu **ETAPA 1**.
