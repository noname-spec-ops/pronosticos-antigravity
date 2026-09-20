# PROMPT — Căutare de surse de date pentru FlashStat
## (de trimis către alte modele AI / asistenți de cercetare)

> Copiază tot de la „ÎNCEPE AICI" în jos și trimite-l ca mesaj unic.
> Funcționează cel mai bine la modele cu acces la web.

---

## ÎNCEPE AICI

Ești consultant de date sportive. Am nevoie să-mi găsești surse de date de fotbal
concrete și verificabile pentru un proiect existent. Nu-mi da idei generale — am
nevoie de endpoint-uri reale, prețuri reale și limite reale.

### Ce este proiectul

FlashStat: aplicație Next.js 15 + TypeScript care afișează meciuri de fotbal și
rulează un motor statistic propriu (Poisson cu corecție Dixon-Coles + rating ELO +
calibrare izotonică PAVA + devigging Shin) ca să estimeze probabilități și să
identifice pariuri cu valoare pozitivă față de cotele caselor.

Nu e un site de ponturi. E un motor de estimare, validat prin backtesting
out-of-sample walk-forward pe date istorice reale.

### Ce am deja — NU îmi propune astea

**Date istorice: 62.599 meciuri, 37 competiții, sezoanele 2021-22 → 2026-27.**

| Sursă | Ce dă | Stare |
|---|---|---|
| football-data.co.uk seria principală (`mmz4281`) | 22 ligi vest-europene: rezultate, șuturi, cornere, cartonașe, arbitru, cote deschidere + închidere | integrat |
| football-data.co.uk seria extra (`/new/<ȚARĂ>.csv`) | 14 ligi: România, Polonia, Austria, Elveția, Danemarca, Suedia, Norvegia, Irlanda, Finlanda, Japonia, Mexic, Brazilia, Argentina, MLS — rezultate + cote de închidere | integrat |
| football-data.org v4 (plan gratuit) | Champions League 2023-24 → prezent, 521 meciuri | integrat |
| ESPN scoreboard public | meciuri live, 56 competiții, fără cheie | integrat |
| TheSportsDB, OpenLigaDB | completare meciuri | integrat |
| The Odds API (plan gratuit, 500 cereri/lună) | cote 1X2 + totals, 44 competiții | integrat, quota insuficientă |
| API-Football v3 | — | cont suspendat |

### Ce îmi lipsește — ASTA CAUT

Ordonat după valoarea reală pentru calitatea estimărilor. Prioritatea 1 contează
mai mult decât toate celelalte la un loc.

---

**PRIORITATE 1 — Cote de la o casă „sharp", cu istoric și cu mișcarea liniei**

Îmi trebuie, pentru cât mai multe competiții:
- cota de **deschidere** și cota de **închidere** pentru același meci (am doar una
  din două pentru 14 din 37 de competiții)
- ideal, **timeline-ul complet** al mișcării cotei între deschidere și start
- de la o casă sharp (Pinnacle) sau de la o bursă (Betfair Exchange), nu de la case
  soft

De ce contează cel mai mult: linia de închidere a unei case sharp este cel mai bun
predictor public cunoscut al rezultatului. Fără perechea deschidere→închidere nu pot
calcula CLV (closing line value), iar CLV este singura metrică care spune dacă un
model are edge real înainte să treacă mii de pariuri.

Caută: API-uri Pinnacle (oficial sau prin agregatori), Betfair Exchange API,
OddsPortal / OddsChecker (verifică termenii de utilizare), Betfair historical data,
sau orice arhivă de mișcări de cote.

---

**PRIORITATE 2 — xG (expected goals) și calitatea șuturilor**

Fișierul meu de xG este literalmente gol. Am nevoie de:
- xG per echipă per meci, istoric, cât mai multe ligi
- ideal xG per șut, xGA, xG non-penalty
- dacă se poate: xT (expected threat), PPDA, field tilt

Caută: Understat (are API neoficial?), FBref / StatsBomb open data, Opta prin
revânzători, Sofascore, WhoScored, sau orice dataset public de xG cu acoperire
multi-ligă.

---

**PRIORITATE 3 — Formații probabile și accidentări, ÎNAINTE de meci**

Am cod care ajustează estimările în funcție de absențe, dar rulează pe nimic.
Îmi trebuie:
- formația probabilă / confirmată, cu ~1h înainte de start
- lista de accidentați și suspendați, cu poziția și importanța jucătorului

Caută: API-uri de lineup-uri, Sofascore, Transfermarkt (accidentări),
PhysioRoom, sau surse de team news.

---

**PRIORITATE 4 — Competițiile care îmi lipsesc complet**

Zero date istorice pentru:
- **UEFA Europa League** și **Conference League** (football-data.org le are doar pe
  planuri plătite — spune-mi exact care plan și cât costă)
- Cehia, Croația, Serbia, Ucraina, Bulgaria, Slovacia, Cipru, Israel, Grecia liga 2
- cupele naționale (FA Cup, Copa del Rey, Coppa Italia, DFB-Pokal, Coupe de France)
- Champions League sezoanele 2021-22 și 2022-23

Pentru fiecare vreau: rezultate + cote, măcar din 2021 încoace.

---

**PRIORITATE 5 — Date suplimentare**

- arbitri cu istoric de cartonașe (am acoperire doar 42%, doar Anglia și Scoția)
- cornere și cartonașe pentru cele 14 ligi din seria extra (îmi lipsesc complet)
- vreme la ora meciului, istoric
- distanțe de deplasare / altitudine stadion

---

### Ce vreau de la tine, exact

Pentru **fiecare** sursă pe care o propui, dă-mi tabelul ăsta completat:

```
NUME:
URL documentație:
Ce date oferă (specific):
Competiții acoperite:
Adâncime istorică (din ce an):
Format (REST JSON / CSV / scraping / bulk download):
Autentificare necesară:
Limită plan gratuit (cereri/lună, competiții):
Preț plan plătit (exact, în EUR/USD/lună):
Licență / termeni — permite uz comercial? permite stocare?:
Endpoint exemplu (URL complet, funcțional):
Cum se leagă numele echipelor de alte surse (id-uri stabile? doar nume?):
Riscuri (rate limit agresiv, scraping interzis, date incomplete):
```

Dacă nu poți verifica un câmp, scrie „NEVERIFICAT" — nu ghici.

Ordonează sursele după **valoare/preț**, nu alfabetic. Spune-mi clar care 3 aș lua
primele dacă am buget de 50 EUR/lună.

---

### Reguli — citește-le, sunt importante

**1. Nu-mi propune servicii care promit rate de reușită.**
Dacă un vendor scrie „85% accuracy", „sure tips", „VIP predictions", „AI picks cu
90% win rate" — nu mi-l trimite, și spune-mi de ce l-ai exclus. Nu vând ponturi și
nu cumpăr ponturi. Am nevoie de **date brute**, nu de predicțiile altcuiva.
Orice serviciu care garantează un procent de câștig la pariuri sportive fie minte,
fie își selectează retroactiv istoricul. E cel mai sigur semn că sursa e de evitat.

**2. Verifică înainte să afirmi.**
Dacă spui că un endpoint există, dă-mi URL-ul complet și spune-mi dacă l-ai
verificat sau doar presupui. Un API inventat mă costă ore.

**3. Contează licența.**
Multe surse interzic explicit stocarea sau uzul comercial. Scrie-mi ce zic termenii,
nu presupune.

**4. Mă interesează și sursele gratuite/deschise.**
GitHub, Kaggle, datasets academice, arhive open data. Nu doar API-uri comerciale.

**5. Id-uri stabile de echipă valorează mult.**
Am avut deja probleme serioase cu potrivirea numelor între surse — un club scris
„FC Bayern München" într-o sursă și „Bayern Munich" în alta primea două profiluri
statistice separate. O sursă care dă id-uri stabile, sau un mapping între id-urile
mai multor furnizori, valorează mai mult decât una cu date puțin mai bogate.

---

### Despre așteptări, ca să nu pierdem timpul

Scopul datelor mai bune **nu** este o rată de reușită mare. Este o **estimare mai
bine calibrată** — adică atunci când modelul zice 60%, să se întâmple în 60% din
cazuri.

Reperele reale în pariurile sportive: un model bun bate linia de închidere rar și
puțin; 1-4% ROI pe termen lung, cu 50-57% rată de reușită la cote în jur de 2.00,
înseamnă un model foarte bun. Orice sursă sau metodă care sugerează mult peste atât
descrie altceva decât realitatea.

Backtest-ul meu actual dă ROI −10,48% cu interval de încredere [−18,45%, −2,51%] pe
1.305 pariuri — semnificativ negativ. De asta caut date mai bune: ca să aflu dacă
problema e în date sau în model. Nu ca să obțin un procent anume.

Dacă în răspunsul tău apare o promisiune de procent de câștig, am greșit undeva în
prompt — ignoră-o și revino la date.
