# PROMPT FAZA 2 — Reparare FlashStat (pentru Antigravity)

> Trimite tot textul de mai jos, începând de la „CONTEXT". Antigravity lucrează direct în `D:\PRONOSTICOSantigravity`.
> Lucrează pe etape — nu-i da toate etapele odată dacă vezi că se grăbește. Etapele 1-4 sunt obligatorii înainte de orice altceva.

---

## CONTEXT

Lucrezi în proiectul existent `D:\PRONOSTICOSantigravity` — aplicația FlashStat (Next.js 15 App Router, TypeScript, Tailwind, Vitest).

**Nu rescrie proiectul de la zero.** Scheletul este corect și complet: `engine/` conține Poisson, Dixon-Coles, ELO, devig, Kelly și cartonașe, toate cu teste unitare care trec. Componentele UI există. Rutele API există. Cache-ul și rate limiterul există.

Problema este alta: **aplicația rulează în întregime pe date inventate.** Un audit al codului a găsit cinci surse de date false. Misiunea ta în această fază este să le elimini pe toate și să conectezi engine-ul (care e bun) la date reale (care lipsesc).

### Cele cinci probleme confirmate în cod

**P1 — Datele istorice sunt generate cu `Math.random()`.**
În `scripts/ingestHistorical.ts`, funcția `generateFallbackHistoricalData()` fabrică meciuri:
```js
const hGoals = Math.min(6, Math.floor(Math.random() * (homeStrength * 1.8)));
```
Se activează silențios când descărcarea returnează zero meciuri. Exact asta s-a întâmplat. Dovada în `data/historical_matches.json`: 1440 de meciuri, exact 360 per ligă și exact 360 per sezon. Un sezon real de Premier League are 380 de meciuri, nu 90. Lipsește complet Ligue 1 (`F1`), deși e configurată. Lipsesc 5 din cele 9 sezoane configurate. Echipele sunt doar top-10 hardcodate per ligă.

**P2 — Backtestul măsoară zgomot.**
`fixtures/backtest_metrics.json` raportează `overallRoiPercent: 31.41` — imposibil pe date reale, unde un model bun face 1-3%. Decilele 8, 9 și 10 din curba de calibrare au `sampleCount: 0`, semn că modelul nu prezice niciodată peste 70%. Fișierul trebuie considerat invalid și șters.

**P3 — Forțele echipelor sunt constante hardcodate.**
În `app/api/fixtures/route.ts` și `app/api/predictions/[fixtureId]/route.ts`:
```ts
homeAttack: 1.25, homeDefense: 0.90, awayAttack: 1.10, awayDefense: 1.00
homeElo: 1620, awayElo: 1580
```
Aceleași valori pentru fiecare meci din lume. `engine/teamStrength.ts` este scris corect și testat, dar **nu este apelat niciodată de nicăieri**.

**P4 — Furnizorul de cote nu face niciun apel de rețea.**
`services/oddsProvider.ts` citește `process.env.ODDS_API_KEY` și apoi nu-l folosește deloc. `getMockOdds()` returnează pentru orice meci necunoscut:
```ts
match1X2: { home: 2.10, draw: 3.40, away: 3.60 }
```
Toate value bet-urile din aplicație sunt calculate față de aceste cote inventate.

**P5 — Arbitrii și jucătorii sunt fabricați în transformator.**
În `services/apiFootball.ts`, `transformApiFixtures()` atribuie fiecărui arbitru `avgYellowCardsPerMatch: 4.2, severityIndex: 1.0`, iar `parseApiLineup()` atribuie fiecărui jucător `minutesPlayed: 900, yellowCards: 2, foulsCommitted: 8, foulsDrawn: 5`.

---

## PRINCIPIU CARE GUVERNEAZĂ TOATĂ FAZA

**Este întotdeauna mai bine să afișezi „date indisponibile" decât un număr inventat.**

Nicio funcție din acest proiect nu are voie să returneze valori fabricate ca fallback. Dacă o sursă de date lipsește, propagă `null`/`undefined` până în UI și afișează starea reală. Un fallback silențios cu date false este cel mai grav bug posibil în acest proiect, pentru că produce încredere nejustificată în predicții pe care se pariază bani.

Aplică asta peste tot: dacă nu ai cote, nu există value bet. Dacă nu ai formații, predicția are încredere redusă și marcată vizibil. Dacă nu ai istoric pentru o echipă, nu inventa o forță medie — spune că echipa nu are suficiente date.

---

## ETAPA 1 — Diagnostic API (fă asta prima, e blocantă)

1. Scrie `scripts/checkApiAccess.ts` care apelează `GET https://v3.football.api-sports.io/status` cu cheia din `.env.local` și afișează: numele planului, requests folosite/rămase azi, limita pe minut și **lista sezoanelor accesibile**.
2. Apoi apelează `GET /leagues?current=true` și raportează câte ligi sunt efectiv accesibile cu cheia curentă.
3. Fă un apel de test `GET /fixtures?date=<data de azi>` și raportează: câte meciuri au venit în răspuns, și **ce conține obiectul `paging`** (`current` și `total`).

Raportează-mi rezultatele înainte să treci mai departe. Planul gratuit are 100 requests/zi și acces limitat la sezoane — dacă sezonul curent nu e accesibil, restul etapelor de date live nu au sens și trebuie discutat un plan plătit.

**Important:** codul actual din `services/apiFootball.ts` ignoră complet `json.paging`. Dacă `paging.total > 1`, trebuie implementată paginarea, altfel se pierd meciuri în zilele aglomerate.

---

## ETAPA 2 — Ingestie istorică reală, fără fallback

1. **Șterge complet** `generateFallbackHistoricalData()` din `scripts/ingestHistorical.ts`. Nu o înlocui, nu o comenta — șterge-o.
2. Dacă descărcarea eșuează, scriptul trebuie să **arunce eroare și să iasă cu cod diferit de zero**, cu mesaj explicit despre ce URL a picat. Niciodată să nu scrie un fișier de date parțial sau fabricat.
3. Înlocuiește `https.get` cu `fetch` nativ (Node 18+) și adaugă retry cu backoff exponențial, 3 încercări per URL.
4. Verifică formatul URL-urilor football-data.co.uk: `https://www.football-data.co.uk/mmz4281/{sezon}/{cod}.csv`, unde sezon e de forma `2425` și cod e `E0`, `SP1`, `I1`, `D1`, `F1`. Testează manual un URL înainte de a rula tot.
5. Extinde acoperirea: adaugă și `E1` (Championship), `SP2`, `I2`, `D2`, `F2`, `N1` (Olanda), `P1` (Portugalia), `B1` (Belgia), `T1` (Turcia), `G1` (Grecia). Rezultatul așteptat pentru 9 sezoane × ~15 ligi este de ordinul **40.000-60.000 de meciuri reale**, nu 1440.
6. Șterge `data/historical_matches.json` existent înainte de a rula. Este contaminat.

### Layer de validare a datelor (`scripts/validateDataset.ts`)

Aceasta e o idee bună pe care o implementezi acum, tocmai pentru că problema de mai sus a trecut neobservată. Scriptul rulează după ingestie și **oprește pipeline-ul** dacă găsește:

- scoruri imposibile (negative, sau peste 15)
- meciuri cu echipe identice acasă și în deplasare
- date în afara intervalului sezonului declarat
- duplicate (aceeași combinație echipe + dată)
- cote sub 1.01 sau peste 1000
- overround sub 1.00 (imposibil) sau peste 1.30 (suspect)
- meciuri cu câmpuri esențiale lipsă (goluri, dată, echipe)
- **verificare de sanitate statistică:** media golurilor per meci per ligă trebuie să fie între 2.2 și 3.6, iar procentul de victorii ale gazdei între 38% și 52%. Orice valoare în afara acestor intervale înseamnă date corupte sau sintetice.

Scriptul afișează un raport: meciuri totale, per ligă, per sezon, procent de câmpuri lipsă, și rezultatele verificărilor de sanitate. Adaugă-l în `package.json` ca `npm run validate` și apelează-l automat la finalul lui `npm run ingest`.

---

## ETAPA 3 — Conectează engine-ul la date reale

Aici e cea mai mare diferență de calitate din tot proiectul.

1. Creează `lib/strengthStore.ts`: la pornirea serverului încarcă `data/historical_matches.json`, calculează cu `engine/teamStrength.ts` forțele de atac/apărare pentru fiecare echipă din fiecare ligă și le ține în memorie, indexate după numele normalizat al echipei.
2. Construiește ratingurile ELO **cronologic**, parcurgând toate meciurile în ordinea datei, folosind `engine/elo.ts`. Salvează evoluția ELO în timp, nu doar valoarea finală — vei avea nevoie de ea la backtest.
3. **Șterge toate constantele hardcodate** din `app/api/fixtures/route.ts` și `app/api/predictions/[fixtureId]/route.ts`. Rutele apelează `strengthStore`.
4. **Problema numelor de echipe:** football-data.co.uk scrie „Man United", API-Football scrie „Manchester United". Creează `lib/teamMapping.ts` cu un dicționar de aliasuri și o funcție de potrivire fuzzy (Levenshtein sau similar). Raportează la pornire câte echipe nu au putut fi mapate.
5. Dacă o echipă nu are minim 15 meciuri în fereastra de calcul, aplică shrinkage spre media ligii (funcția există deja în `teamStrength.ts`) și **marchează predicția ca având date insuficiente**. Nu genera value bet-uri pentru astfel de meciuri.
6. Dacă o echipă nu e găsită deloc în istoric, ruta returnează predicție `null` cu motivul explicit. Fără valori implicite.

---

## ETAPA 4 — Backtest curat

1. Șterge `fixtures/backtest_metrics.json`. Este produsul unor date false.
2. Rulează backtestul pe datele reale, cu ultimele 2 sezoane ca held-out.
3. Verifică riguros absența data leakage-ului: la predicția unui meci din data D se folosesc **strict** meciurile cu data < D. Scrie un test care încearcă să detecteze leakage prin verificarea că forțele calculate pentru un meci nu se schimbă dacă adaugi meciuri ulterioare în dataset.
4. Raportează, per ligă și global: Brier score al modelului vs Brier score al cotelor devigged ale casei, log-loss, curbă de calibrare pe decile cu `sampleCount`, ROI simulat vs cotele de închidere, drawdown maxim, număr de pariuri.
5. **Adaugă metrica decisivă: Closing Line Value (CLV).** Pentru fiecare pariu simulat, compară cota la care ai fi pariat cu cota de închidere. CLV mediu pozitiv este singurul indicator credibil că modelul are avantaj real. Un model cu ROI pozitiv dar CLV negativ a avut noroc.
6. Raportează rezultatele cu **intervale de încredere**, nu ca cifre seci. Un ROI de +2% pe 200 de pariuri nu e distinct de zero din punct de vedere statistic — spune asta explicit în raport.

**Așteptare realistă:** ROI-ul va scădea de la 31% la ceva între -3% și +3%. Asta e normal și e informația de care avem nevoie. Nu ajusta parametrii ca să obții o cifră frumoasă — asta ar fi overfitting pe setul de test.

---

## ETAPA 5 — Furnizor de cote real

1. Implementează un `OddsProvider` care face efectiv apeluri HTTP. Prima opțiune: The Odds API (`https://api.the-odds-api.com/v4`), care are plan gratuit rezonabil. A doua opțiune: endpoint-ul `/odds` din API-Football, dacă planul confirmat la Etapa 1 îl include.
2. Păstrează interfața abstractă existentă — doar implementarea se schimbă.
3. **Șterge complet `getMockOdds()` cu valorile 2.10/3.40/3.60.** Dacă nu există cote pentru un meci, `getMatchOdds()` returnează `null`, iar UI-ul afișează „cote indisponibile" și nu calculează niciun value bet.
4. Salvează în baza de date cota la momentul preluării și, după startul meciului, cota de închidere. Fără ele nu poți calcula CLV în producție.
5. Mod demo: rămâne funcțional pentru dezvoltare, dar orice cotă din fixtures trebuie marcată explicit `isDemo: true` și afișată în UI cu un indicator vizibil.

---

## ETAPA 6 — Date reale pentru arbitri, jucători, H2H

1. **Șterge valorile hardcodate** din `transformApiFixtures()` (arbitru: 4.2 galbene, severitate 1.0) și din `parseApiLineup()` (jucători: 900 minute, 2 galbene, 8 faulturi).
2. Construiește indicele de severitate al arbitrilor **din datele istorice football-data.co.uk**, care conțin coloana `Referee` plus cartonașele fiecărui meci. Calculează media reală de cartonașe per meci per arbitru, raportată la media ligii. Arbitrii cu sub 10 meciuri primesc shrinkage spre 1.0.
3. Statisticile jucătorilor vin din endpointul `/players?team=X&season=Y` al API-Football, cache-uite 24 de ore. Dacă nu sunt disponibile, câmpurile rămân `null` și UI-ul le ascunde.
4. Implementează H2H prin `GET /fixtures/headtohead?h2h={id1}-{id2}&last=20`. Tipul `H2HMatch` e deja importat în `services/apiFootball.ts` dar nu e folosit nicăieri — Tab 2 din modal nu are momentan sursă de date.
5. Adaugă și endpointurile lipsă pentru paritate cu Flashscore: `/fixtures/events` (goluri și cartonașe pe minut), `/standings` (clasamente), `/injuries` (accidentați și suspendați).

---

## ETAPA 7 — Variabilele care chiar contează

Adaugă **doar** aceste patru, în ordinea impactului real. Nu adăuga zeci de variabile — pe un target cu trei clase și zgomot mare, fiecare variabilă în plus înseamnă overfitting.

1. **Formații și accidentări înainte de start.** Cel mai mare câștig informațional care există. Preia lineup-ul cu ~1 oră înainte de meci și ajustează λ în funcție de absența jucătorilor cheie (ponderați după minutele jucate și contribuția la goluri în sezon).
2. **Forțe bazate pe xG, nu doar pe goluri.** Golurile sunt zgomotoase; xG se stabilizează mult mai repede. Unde ai xG disponibil, folosește o combinație (aproximativ 70% xG / 30% goluri) pentru calculul forțelor. Unde nu ai xG, folosește șuturile pe poartă ca proxy — există în datele football-data.co.uk.
3. **Odihnă și aglomerare de calendar.** Zile de la ultimul meci, și numărul de meciuri în ultimele 14 zile. Se calculează gratuit din datele pe care le ai deja.
4. **Cota pieței ca prior, nu doar ca țintă.** Aceasta e cea mai importantă și cea mai contraintuitivă. Cota de închidere e cel mai bun predictor unic existent. Implementează un mod de blending în care probabilitatea finală este o medie ponderată între probabilitatea modelului și probabilitatea devigged a pieței, cu ponderea determinată empiric la backtest (probabil în jur de 30% model / 70% piață pentru majoritatea ligilor). Value bet-ul apare atunci când modelul se abate semnificativ de la piață **și** are istoric de a avea dreptate în astfel de situații pe liga respectivă.

**Nu implementa Random Forest, XGBoost sau rețele neuronale.** Pe volumul de date disponibil per ligă, acestea overfitează sistematic și performează mai slab decât Poisson cu Dixon-Coles bine specificat. Structura Poisson încorporează deja modelul generativ corect al fotbalului.

---

## ETAPA 8 — Transparență în UI

Aici implementăm ideile bune despre explicabilitate, dar onest.

1. **Explicația fiecărei predicții.** Sub fiecare probabilitate, afișează descompunerea: contribuția forței de atac/apărare, contribuția ELO, ajustarea pentru absențe, ajustarea pentru odihnă, și cât a tras piața rezultatul final. Utilizatorul trebuie să vadă *de ce*, nu doar *cât*.
2. **Indicator de completitudine a datelor.** Un badge per meci care arată ce informații au fost disponibile: formații ✓/✗, accidentări ✓/✗, cote ✓/✗, istoric suficient ✓/✗. Predicțiile fără formații se marchează vizibil ca provizorii.
3. **Istoric onest de performanță.** Afișează track recordul real al modelului, dar **întotdeauna cu dimensiunea eșantionului și intervalul de încredere**. Formularea corectă e „+1.8% ROI pe 340 de pariuri (interval de încredere 95%: -2.1% până la +5.7%)", nu „85% acuratețe". Dacă eșantionul e sub 200 de pariuri, afișează explicit „eșantion insuficient pentru o concluzie".
4. **Interzis în UI:** cuvintele „sigur", „garantat", „97%", „pariu sigur", și orice procent de încredere care nu provine direct din backtest. Un model bun de fotbal atinge 52-56% acuratețe pe 1X2 — orice cifră afișată peste asta e o eroare de calcul sau o minciună.
5. `ModelHealthBadge` trebuie să citească metricile reale și să blocheze afișarea de value bet-uri pe ligile unde modelul nu bate Brier score-ul casei.

---

## CE SĂ NU FACI

- Nu genera date de fallback în nicio situație. Eroare zgomotoasă în loc de date false.
- Nu rescrie `engine/` — e corect și testat. Îl conectezi, nu îl înlocuiești.
- Nu ajusta parametrii modelului până obții un ROI frumos la backtest. Asta e overfitting pe test set.
- Nu adăuga zeci de variabile „pentru mai multă acuratețe". Adaugă doar cele patru din Etapa 7.
- Nu promite și nu afișa acuratețe peste ~56% pe 1X2. Nu e realizabil în fotbal.
- Nu folosi Opta sau WhoScored — primul e enterprise cu costuri de zeci de mii pe an, al doilea nu are API public și scrapingul le încalcă termenii.

---

## MOD DE LUCRU

Lucrează **o etapă pe rând** și oprește-te după fiecare pentru confirmare.

După fiecare etapă raportează: ce fișiere ai modificat, ce teste trec, și — cel mai important — **ce date sunt acum reale și ce date sunt încă lipsă sau simulate**.

Începe cu **ETAPA 1** și dă-mi rezultatele apelului `/status` înainte de orice altceva.
