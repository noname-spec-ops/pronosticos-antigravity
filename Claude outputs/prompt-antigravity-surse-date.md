# PROMPT — Integrare surse de date noi (pentru Antigravity)
## Proiect `D:\PRONOSTICOSantigravity` — FlashStat

> Trimite tot textul de la „CONTEXT" în jos.
> Aceasta este o sarcină de **integrare de date**, nu de model. Nu modifica `engine/` în afară de punctele indicate explicit.

---

## CONTEXT

### Surse deja integrate — NU le reimplementa, nu le propune din nou

| Sursă | Rol actual în proiect |
|---|---|
| API-Football (api-sports.io) | fixtures, live scores, formații, evenimente |
| The Odds API | cote pre-meci |
| Football-Data.org | fixtures, clasamente |
| football-data.co.uk | dataset istoric (45.684 meciuri, 22 ligi) |
| ClubElo | ratinguri ELO externe |
| Understat | xG |
| Open-Meteo | vreme |
| TheSportsDB | metadate, logouri |
| OpenLigaDB | ligi germane |

### Ce lipsește și trebuie rezolvat prin sursele noi

1. Statistici detaliate de **cornere, cartonașe, faulturi, șuturi** pe echipă și pe jucător
2. Acoperire pentru **ligi secundare** și **Liga 1 România**
3. **Cote de bursă** (fără marjă de casă) și **istoric al cotelor** pentru calculul CLV
4. **Coordonate de stadion** pentru calculul distanței de deplasare
5. **Redundanță** când cota zilnică API-Football (100 req/zi) se epuizează

---

## REGULĂ DE ARHITECTURĂ — obligatorie

Sursele se împart în două categorii, după licență, și **nu se amestecă**:

**A. Surse pentru uz OFFLINE** — antrenarea modelului, calibrare, backtest, rulate local pe mașina de dezvoltare. Datele extrase NU ajung pe site-ul public și NU se comit în repo.
→ FBref, Sofascore, Transfermarkt, StatsBomb Open Data

**B. Surse pentru uz PUBLIC** — pot fi afișate pe site, au licență clară sau API oficial.
→ API-Football, football-data.co.uk, openfootball, Wikidata, ESPN, Sportmonks, Betfair

Motivul: Sofascore, FBref și Transfermarkt nu au API-uri publice oficiale. Folosirea lor pentru analiză proprie e o zonă tolerată; redistribuirea publică a datelor extrase e altceva și poate încălca termenii lor.

Implementează separarea în cod: `scripts/python/` (offline) vs `services/` (public). Marchează fiecare sursă cu un câmp `usage: 'offline' | 'public'` într-un fișier de configurare `config/dataSources.ts`.

---

# PRIORITATEA 1 — FBref (offline)

**Cea mai valoroasă adăugare. Rezolvă punctele 1 și 2 din lista de lipsuri.**

- Acces: biblioteca Python `soccerdata` — https://github.com/probberechts/soccerdata
- Instalare: `pip install soccerdata`
- Fără cheie API. Rate limit auto-gestionat de bibliotecă (~1 request / 3 secunde).
- Documentație: https://soccerdata.readthedocs.io

Date disponibile, per echipă și per jucător, per meci și per sezon: xG, xA, șuturi, șuturi pe poartă, cornere, cartonașe galbene și roșii, faulturi comise și suferite, posesie, acțiuni care creează șuturi, pase progresive, presiuni.

### Sarcini

1. Creează `scripts/python/fetch_fbref.py`.
2. Extrage pentru toate ligile și sezoanele din datasetul existent: statistici de meci pe echipă (`read_team_match_stats`) și statistici de sezon pe jucător (`read_player_season_stats`).
3. **Verifică explicit dacă Liga 1 România există în lista de competiții FBref** și raportează rezultatul. Dacă există, include-o.
4. Exportă în `data/fbref_stats.json`, folosind exact aceleași chei de normalizare a numelor ca `lib/teamMapping.ts`.
5. Raportează: câte meciuri din datasetul principal au primit date FBref, câte nu, și care ligi au acoperire zero.
6. Adaugă în `package.json`: `"fetch:fbref": "python scripts/python/fetch_fbref.py"`.

### Impact asupra modelului

Odată integrat, înlocuiește în `engine/teamStrength.ts` proxy-ul de xG bazat pe șuturi pe poartă (`shotsOnTarget × 0.31`) cu xG real din FBref, acolo unde e disponibil. Păstrează proxy-ul ca fallback. Raportează Brier separat pentru ligile cu xG real și cele cu proxy.

---

# PRIORITATEA 2 — ESPN hidden API (public)

**Rezolvă punctul 5: redundanță când se termină cota API-Football.**

- Fără cont, fără cheie, fără limită practică documentată.
- Endpoint de bază: `https://site.api.espn.com/apis/site/v2/sports/soccer/{liga}/scoreboard`
- Coduri de ligă: `eng.1` (Premier League), `esp.1`, `ita.1`, `ger.1`, `fra.1`, `rou.1` (Liga 1 România), `uefa.champions`, `uefa.europa`
- Parametru de dată: `?dates=YYYYMMDD`

### Sarcini

1. **Verifică mai întâi că endpoint-urile răspund** — sunt nedocumentate și se pot schimba. Testează fiecare cod de ligă și raportează care funcționează.
2. Creează `services/espnFallback.ts` cu aceeași interfață ca `services/apiFootball.ts` pentru fixtures și scoruri live.
3. În `lib/rateLimiter.ts`, adaugă logica de comutare: când cota API-Football e epuizată sau apare eroare 429, comută automat pe ESPN pentru scoruri și fixtures.
4. Marchează în UI sursa datelor, discret, când se folosește fallback-ul.

Fără această componentă, site-ul public devine inutilizabil după primele ~100 de cereri ale zilei.

---

# PRIORITATEA 3 — Betfair (public + offline)

**Rezolvă punctul 3. Cea mai importantă sursă pentru partea de validare a modelului.**

### 3a. Betfair Exchange API — prețuri live

- Portal: https://developer.betfair.com
- Necesită cont Betfair + cheie de aplicație (procesul de obținere e documentat pe portal)
- Gratuit pentru uz necomercial

Betfair nu e casă de pariuri, e bursă: prețurile sunt formate de pariori între ei, fără marjă de casă. Sunt cea mai bună estimare publică de probabilitate reală.

Sarcini:
1. Creează `services/betfairProvider.ts`, implementând interfața `OddsProvider` existentă.
2. Adaugă în `ValueBet` câmpul `exchangeProb` — probabilitatea implicită de pe bursă, după normalizare.
3. În `scripts/backtest.ts`, calculează Brier-ul modelului **și** față de probabilitățile de bursă, nu doar față de casele tradiționale. Acesta devine reperul principal.

### 3b. Betfair Historical Data — arhivă de prețuri

- https://historicdata.betfair.com
- Arhive cu evoluția completă a prețurilor până la start, pentru meciuri istorice.

Sarcini:
1. Creează `scripts/ingestBetfairHistorical.ts` care descarcă și normalizează arhivele pentru ligile și sezoanele acoperite.
2. Extrage în special **prețul de închidere** (ultimul preț înainte de start) pentru fiecare piață.
3. Folosește acest preț ca referință pentru CLV în backtest, în locul cotei de închidere a unei case oarecare.

Un CLV măsurat față de prețul de închidere de pe bursă e mult mai credibil decât unul măsurat față de o casă moale.

---

# PRIORITATEA 4 — Wikidata (public)

**Rezolvă punctul 4: distanțele de deplasare din pasul 3.8 al Fazei 4.**

- Endpoint SPARQL: `https://query.wikidata.org/sparql`
- Gratuit, fără cheie, fără limită practică. Cere un `User-Agent` descriptiv.
- Format: `?format=json`

### Sarcini

1. Creează `scripts/fetchStadiums.ts` care interoghează Wikidata pentru cluburile din ligile acoperite și extrage: numele stadionului, coordonatele geografice, capacitatea, altitudinea dacă există.
2. Salvează în `data/stadiums.json`.
3. Conectează la `engine/scheduleFatigue.ts`: calculează distanța haversine între stadionul gazdei și cel al echipei oaspete, adaugă ca factor de ajustare pentru oaspeți.
4. Raportează câte cluburi au primit coordonate și care au rămas fără.

Se rulează o singură dată — datele sunt statice.

---

# PRIORITATEA 5 — Sofascore (offline)

**Cea mai largă acoperire pentru ligile mici, cu statistici detaliate.**

- Acces: tot prin `soccerdata` (clasa `Sofascore`)
- 500+ competiții, xG live, cornere și cartonașe în timp real

### Sarcini

1. Extinde `scripts/python/fetch_fbref.py` sau creează `fetch_sofascore.py`.
2. Folosește-l **exclusiv** pentru ligile unde FBref nu are acoperire — în special ligile secundare și Liga 1 România dacă FBref nu o are.
3. Exportă în `data/sofascore_stats.json`, marcat clar `usage: 'offline'`.
4. **Nu servi aceste date prin niciun endpoint public al aplicației.**

---

# PRIORITATEA 6 — Surse complementare

### openfootball (public)
- https://github.com/openfootball/football.json și https://github.com/openfootball/europe
- Domeniu public, fără cheie API. Fixtures, rezultate, cluburi, stadioane.
- Utilizare: verificare încrucișată a fixtures și sursă de metadate cu licență curată pentru site-ul public.
- Acces direct prin raw GitHub, fără autentificare.

### StatsBomb Open Data (offline)
- https://github.com/statsbomb/open-data
- Date la nivel de eveniment cu xG propriu, licență deschisă. Competiții limitate ca număr.
- Utilizare: **validarea propriilor calcule de xG**. Compară xG-ul calculat de tine cu al lor pe competițiile comune. O divergență sistematică indică o eroare în modelul tău.

### Sportmonks (public)
- https://www.sportmonks.com/football-api/free-plan/
- Plan gratuit permanent, dar **doar Superliga Daneză și Scottish Premiership**.
- Pentru acele două ligi oferă tot: cornere, cartonașe, formații, evenimente cu coordonatele mingii.
- Utilizare: teren de testare pentru funcționalități noi înainte de a plăti pentru acoperire largă. Plătit de la 29 €/lună.
- Autentificare: token în query string sau header.

### Transfermarkt (offline)
- Acces prin `worldfootballR` (R) sau proiecte comunitare pe GitHub.
- Valori de piață ale loturilor, accidentări, suspendări.
- Utilizare: valoarea de piață a lotului e un proxy bun pentru forța unei echipe **la început de sezon**, când nu ai încă meciuri suficiente. Folosește-o ca prior în locul shrinkage-ului simplu spre media ligii.

---

# MOD DE LUCRU

### Pasul 0 — Verificare înainte de implementare

Pentru **fiecare** sursă de mai sus, înainte să scrii cod de integrare:
1. Fă un apel de test minimal.
2. Raportează: a răspuns sau nu, ce format are răspunsul, ce limite de rată ai observat, ce autentificare a cerut.
3. Pentru endpoint-urile neoficiale (ESPN, Sofascore), confirmă explicit că funcționează **azi** — se pot schimba fără preaviz.

Nu construi nimic pe o sursă pe care n-ai testat-o. Raportează-mi rezultatele acestui pas înainte de a trece mai departe.

### Pasul 1-6

Implementează în ordinea priorităților de mai sus, una pe rând, cu oprire pentru confirmare după fiecare.

### Livrabile per sursă

- scriptul de extragere
- fișierul de date exportat
- un raport de acoperire: câte meciuri/echipe au primit date, câte nu, per ligă
- intrarea corespunzătoare în `config/dataSources.ts` cu `usage: 'offline' | 'public'`
- documentare în README: cum se rulează, ce cheie cere, ce limite are

---

# CE SĂ NU FACI

- Nu reimplementa niciuna dintre sursele deja integrate din tabelul de la început.
- Nu servi date din surse marcate `offline` prin endpoint-uri publice ale aplicației.
- Nu comite fișierele mari de date în repo — adaugă-le în `.gitignore`.
- Nu presupune că un endpoint neoficial funcționează — testează-l.
- Nu adăuga chei API în cod. Toate în `.env.local`, documentate în `.env.example`.
- Nu construi scraping propriu pentru site-uri care au deja o bibliotecă (`soccerdata`, `worldfootballR`) — bibliotecile gestionează rate limiting și schimbări de structură.
- Nu folosi Opta, WhoScored direct sau Sportradar — enterprise sau fără API public.

Începe cu **Pasul 0** — verificarea tuturor surselor — și raportează.
