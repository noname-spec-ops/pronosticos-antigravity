# FlashStat — Notes Vault

An Obsidian vault that lives inside the repository, so notes are versioned
alongside the code they describe.

Open it in Obsidian: *Open folder as vault* -> `D:\PRONOSTICOSantigravity\notes`

## Layout
- `decizii/` — one note per modelling decision. What was changed, why, what the
  backtest said before and after. Link the run with its `configHash` from
  `data/backtest_history.jsonl`.
- `research/` — papers, methods, provider quirks, things worth not rediscovering.

## What goes where
The numbers are logged automatically by `npm run backtest`; this vault is for the
reasoning the numbers cannot carry: why a parameter was tried, what was expected,
and what the result actually means. Do not copy metric tables in here by hand —
reference the run id and let `npm run compare` print the numbers.
