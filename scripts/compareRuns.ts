/**
 * FlashStat — Backtest Run Comparison
 *
 * Usage:
 *   npm run compare            last 10 runs, with the delta of the newest vs the one before it
 *   npm run compare -- 25      last 25 runs
 *   npm run compare -- diff    field-by-field MODEL_CONFIG diff of the last two runs
 *
 * Lower Brier and lower log-loss are better. ROI is reported with its 95% CI:
 * a CI that straddles zero means the sample does not establish an edge, however
 * pleasant the point estimate looks.
 */

import { readRuns, type ExperimentRun } from './experimentLog';

const arg = process.argv[2];
const runs = readRuns();

if (runs.length === 0) {
  console.log('Nu există istoric încă. Rulează `npm run backtest` cel puțin o dată.');
  process.exit(0);
}

const sign = (n: number) => (n >= 0 ? '+' : '') + n.toFixed(4);
const signP = (n: number) => (n >= 0 ? '+' : '') + n.toFixed(2) + '%';

function flatten(obj: unknown, prefix = ''): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      Object.assign(out, flatten(v, prefix ? `${prefix}.${k}` : k));
    }
  } else {
    out[prefix] = obj;
  }
  return out;
}

function configDiff(a: ExperimentRun, b: ExperimentRun): void {
  const fa = flatten(a.config);
  const fb = flatten(b.config);
  const keys = [...new Set([...Object.keys(fa), ...Object.keys(fb)])].sort();
  const changed = keys.filter(k => JSON.stringify(fa[k]) !== JSON.stringify(fb[k]));
  if (changed.length === 0) {
    console.log('MODEL_CONFIG identic între ultimele două rulări — diferența de metrici vine din date sau din cod, nu din parametri.');
    return;
  }
  console.log(`\nMODEL_CONFIG: ${changed.length} parametri schimbați (${a.runId} -> ${b.runId})\n`);
  for (const k of changed) {
    console.log(`  ${k.padEnd(48)} ${JSON.stringify(fa[k])}  ->  ${JSON.stringify(fb[k])}`);
  }
}

if (arg === 'diff') {
  if (runs.length < 2) {
    console.log('E nevoie de cel puțin două rulări pentru un diff.');
    process.exit(0);
  }
  configDiff(runs[runs.length - 2], runs[runs.length - 1]);
  process.exit(0);
}

const limit = Number.isFinite(Number(arg)) && Number(arg) > 0 ? Number(arg) : 10;
const shown = runs.slice(-limit);

console.log(`\nISTORIC BACKTEST — ultimele ${shown.length} din ${runs.length} rulări\n`);
console.log('Data             | Git      | Config | Brier  | Bookie | Bate? | LogLoss | ROI     | Semnif | CLV    | MaxDD  | Pariuri');
console.log('-'.repeat(125));

for (const r of shown) {
  const m = r.metrics;
  const when = r.timestamp.slice(0, 16).replace('T', ' ');
  const sha = ((r.gitSha ?? '—') + (r.gitDirty ? '*' : '')).padEnd(8);
  console.log(
    [
      when.padEnd(16),
      sha,
      r.configHash.slice(0, 6),
      m.brier.toFixed(4),
      m.bookmakerBrier.toFixed(4),
      (m.beatsBookmaker ? ' DA  ' : ' NU  '),
      m.logLoss.toFixed(4).padStart(7),
      signP(m.roiPercent).padStart(7),
      (m.roiSignificant ? '  da  ' : '  nu  '),
      (m.avgClvPercent === null ? '   —  ' : signP(m.avgClvPercent).padStart(6)),
      (m.maxDrawdownPercent.toFixed(2) + '%').padStart(6),
      String(m.bets).padStart(7),
    ].join(' | ')
  );
  if (r.note) console.log(`                 └─ ${r.note}`);
}

console.log('\n* = worktree cu modificări necommise la momentul rulării (rezultat nereproductibil exact)\n');

if (shown.length >= 2) {
  const prev = shown[shown.length - 2];
  const last = shown[shown.length - 1];
  const dBrier = last.metrics.brier - prev.metrics.brier;
  const dLog = last.metrics.logLoss - prev.metrics.logLoss;
  const dRoi = last.metrics.roiPercent - prev.metrics.roiPercent;

  console.log('DELTA ULTIMA RULARE vs PRECEDENTA');
  console.log(`  Brier    ${sign(dBrier)}   ${dBrier < 0 ? 'mai bun' : dBrier > 0 ? 'mai slab' : 'neschimbat'}`);
  console.log(`  LogLoss  ${sign(dLog)}   ${dLog < 0 ? 'mai bun' : dLog > 0 ? 'mai slab' : 'neschimbat'}`);
  console.log(`  ROI      ${signP(dRoi)}   (interpretează doar împreună cu CI și numărul de pariuri)`);

  if (dRoi > 0 && dBrier > 0) {
    console.log('\n  ATENȚIE: ROI a crescut dar Brier s-a înrăutățit. Tiparul ăsta înseamnă de regulă');
    console.log('  overfitting pe un eșantion mic, nu edge real. Verifică numărul de pariuri și CI-ul.');
  }
  if (prev.configHash === last.configHash) {
    console.log('\n  MODEL_CONFIG neschimbat între cele două rulări.');
  } else {
    console.log('\n  MODEL_CONFIG s-a schimbat — rulează `npm run compare -- diff` pentru detalii.');
  }
}
console.log('');
