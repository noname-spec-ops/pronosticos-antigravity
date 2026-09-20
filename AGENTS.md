# AGENTS.md — FlashStat (Football Scores & AI Betting Radar)

Rules for any AI agent working in this repository. Read this before editing.

## Stack
- Next.js 15 (App Router) · React 19 · TypeScript 5.7 strict · TailwindCSS 3.4
- Recharts 2.15 · lucide-react · clsx + tailwind-merge
- Vitest 2.1 (50 suites in `engine/__tests__/`) · tsx for scripts
- OpenTelemetry via `instrumentation.ts` · deploy target: Vercel
- Some data scripts are Python: `scripts/python/`

## Commands
| Purpose | Command |
|---|---|
| Dev server (localhost:3000) | `npm run dev` |
| Unit tests | `npm test` |
| Lint | `npm run lint` |
| Ingest historical data | `npm run ingest` |
| Validate dataset | `npm run validate` |
| Calibrate (MLE) | `npm run calibrate` |
| Train residual model | `npm run train:residual` |
| Out-of-sample backtest | `npm run backtest` |
| Weekly report | `npm run report` |

## Map
- `engine/` — pure modelling code. No I/O, no fetch, no `Date.now()` inside.
  Constants live only in `engine/config.ts` (`MODEL_CONFIG`).
- `services/` — external providers (API-Football, ESPN, ClubELO, Understat, odds,
  Betfair, weather). All network access goes here.
- `lib/` — cache, rate limiter, team mapping, league codes, VIP auth, date helpers.
- `app/api/*/route.ts` — route handlers. `app/page.tsx` — dashboard.
- `data/` — generated artefacts. Do not hand-edit; fix the generating script.
- `fixtures/` — demo dataset + backtest metrics.
- `BOT/` — standalone bots (sniper, telegram, UI).

## Invariants — do not break these
1. **Zero data leakage.** A prediction for a match at time T uses only data with
   timestamp < T. This applies to team strength, ELO, xG, form, referee severity,
   calibration maps and residual-model features. See `engine/__tests__/dataLeakage.test.ts`.
2. **Demo mode always works.** `npm run dev` with no API keys must run fully on
   `fixtures/matches.json`. Never add a code path that throws on a missing key.
3. **Score grids sum to 1.0** after the Dixon-Coles correction (tolerance 1e-9).
4. **No magic numbers** outside `engine/config.ts`.
5. **API budget:** API-Football free plan is ~100 req/day, 10 req/min. All calls go
   through `lib/rateLimiter.ts` and `lib/cache.ts`. Live polling stays at 60s.
6. **Staking is capped:** quarter Kelly (0.25x), max 2% of bankroll. No progressive
   or recovery staking, ever.
7. **Edge > 15% is SUSPECT**, meaning a data bug — surface it as a warning, never a tip.
8. **Secrets stay in `.env.local`**, which is gitignored. Never commit a key.
9. **Kickoff times are stored in UTC**, rendered via `lib/localDate.ts`. A timezone
   bug here creates silent data leakage.

## Definition of done
`npm test` passes · `npm run lint` passes · if engine or data changed, `npm run backtest`
was actually run and metrics compared to the previous run · no new constants outside
`config.ts` · no secrets added · temporary scratch files removed.

## Reporting rules
Report real numbers from real runs. If a metric regressed, lead with that. Never claim
a test passed or a model improved without the output in hand.

## Scope
Educational and statistical project. Keep the 18+ / not-financial-advice disclaimer.
No guaranteed-profit claims in code, UI or docs. Do not write scrapers that breach a
provider's terms or work around rate limits with rotating keys or proxies.
