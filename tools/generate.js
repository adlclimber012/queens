// Offline puzzle designer.
// Starts from a hidden solution and a rough partition, then repeatedly nudges one boundary cell
// into a neighboring region (simulated annealing), keeping changes that make the board read
// better: solvable by logic alone at the target difficulty, one or two clear starting points,
// no free single-cell regions, no region swallowing the board.
//
// Usage: node tools/generate.js --per 30 [--seed 1] [--sizes 8,9] [--out puzzles.js]
const L = require('../logic.js');
const { countSolutions } = require('./old-gen.js');

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => {
  if (v.startsWith('--')) a.push([v.slice(2), all[i + 1]]);
  return a;
}, []));
const PER = +(args.per || 10);
const SIZES = (args.sizes || '8,9').split(',').map(Number);
const OUT = args.out || 'puzzles.js';
let seed = +(args.seed || Date.now() % 1e9);

function rnd() { // mulberry32
  seed |= 0; seed = seed + 0x6D2B79F5 | 0;
  let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
}
const ri = k => (rnd() * k) | 0;
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = ri(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }

function genSolution(n) {
  for (;;) {
    const cols = shuffle([...Array(n).keys()]);
    let ok = true;
    for (let i = 0; i < n - 1; i++) if (Math.abs(cols[i] - cols[i + 1]) <= 1) { ok = false; break; }
    if (ok) return cols;
  }
}

function nbrs(i, n) {
  const r = (i / n) | 0, c = i % n, out = [];
  if (r > 0) out.push(i - n); if (r < n - 1) out.push(i + n);
  if (c > 0) out.push(i - 1); if (c < n - 1) out.push(i + 1);
  return out;
}

// Rough start: regions grow from their queens at random speeds (so sizes vary).
function seedRegions(n, sol) {
  const reg = new Int8Array(n * n).fill(-1);
  const speed = Array.from({ length: n }, () => 0.3 + rnd());
  const frontier = [];
  sol.forEach((c, r) => { reg[r * n + c] = r; frontier.push(r * n + c); });
  let left = n * n - n;
  while (left) {
    // pick a region weighted by speed, grow it by one random frontier cell
    const r = weighted(speed);
    const own = [];
    for (let i = 0; i < n * n; i++) if (reg[i] === r) for (const j of nbrs(i, n)) if (reg[j] === -1) own.push(j);
    if (!own.length) { speed[r] = 0; if (speed.every(s => !s)) break; continue; }
    reg[own[ri(own.length)]] = r; left--;
  }
  return reg;
}
function weighted(w) {
  let t = 0; for (const x of w) t += x;
  let x = rnd() * t;
  for (let i = 0; i < w.length; i++) { x -= w[i]; if (x <= 0 && w[i] > 0) return i; }
  return w.findIndex(v => v > 0);
}

function contiguous(reg, n, r) {
  let start = -1, total = 0;
  for (let i = 0; i < n * n; i++) if (reg[i] === r) { total++; if (start < 0) start = i; }
  if (!total) return false;
  const seen = new Uint8Array(n * n), q = [start]; seen[start] = 1; let k = 1;
  while (q.length) { const i = q.pop(); for (const j of nbrs(i, n)) if (!seen[j] && reg[j] === r) { seen[j] = 1; k++; q.push(j); } }
  return k === total;
}

const TARGETS = {
  // maxLevel: hardest technique allowed; need: technique that must appear at least once
  easy:   { maxLevel: 2, need: null },
  medium: { maxLevel: 3, need: 'shadow', want: { shadow: 3 } },
  hard:   { maxLevel: 4, need: 'hall', want: { shadow: 3, hall: 2 } },
};

const W = { perimeter: +(args.wper || 0.6), tips: +(args.wtip || 2) };

function shapeStats(n, reg) {
  let perimeter = 0, tips = 0;
  for (let i = 0; i < n * n; i++) {
    let same = 0;
    for (const j of nbrs(i, n)) { if (reg[j] === reg[i]) same++; else if (j > i) perimeter++; }
    if (same <= 1) tips++;
  }
  return { perimeter, tips };
}

function evaluate(n, reg, target) {
  const T = TARGETS[target];
  const g = L.solve(n, reg, T.maxLevel);
  const sizes = Array(n).fill(0); for (const r of reg) sizes[r]++;
  const avg = n;
  let s = 0;
  // shape: no freebies, no giant blobs, prefer a spread of sizes
  for (const z of sizes) { if (z === 1) s -= 40; else if (z === 2) s -= 8; }
  const big = Math.max(...sizes);
  if (big > 2.3 * avg) s -= (big - 2.3 * avg) * 4;
  // chunky, hand-drawn-looking outlines: penalize long borders and dangling one-cell tips
  const sh = shapeStats(n, reg);
  s -= sh.perimeter * W.perimeter + sh.tips * W.tips;
  // starting points: one or two is the designed feel
  const entry = L.entryPoints(n, reg);
  s -= Math.max(0, entry - 2) * 6;
  if (entry === 0 && g.solved) s -= 4; // must exist, but solver can still open via harder moves
  if (!g.solved) return { score: s - 150 + 100 * g.resolved / (n * n), g, entry, sizes, ok: false };
  s += 100;
  // difficulty shape: a longer chain of real deductions reads as designed
  const real = g.steps.filter(x => x.tech !== 'single').length;
  s += Math.min(real, 14) * 1.5;
  let ok = true;
  if (T.need) {
    if (!g.counts[T.need]) { s -= 40; ok = false; }
    for (const [k, v] of Object.entries(T.want)) s += Math.min(g.counts[k], v) * 4;
  }
  ok = ok && sizes.every(z => z >= 2) && entry <= 3 && big <= 2.6 * avg;
  return { score: s, g, entry, sizes, ok };
}

function design(n, target, iters = 3000) {
  const sol = genSolution(n);
  const queenCell = new Set(sol.map((c, r) => r * n + c));
  let reg = seedRegions(n, sol);
  let cur = evaluate(n, reg, target);
  let best = { reg: reg.slice(), ev: cur };
  for (let it = 0; it < iters; it++) {
    const temp = 6 * (1 - it / iters) + 0.2;
    // pick a boundary cell and a different neighboring region
    const i = ri(n * n);
    if (queenCell.has(i)) continue;
    const opts = [...new Set(nbrs(i, n).map(j => reg[j]))].filter(r => r !== reg[i]);
    if (!opts.length) continue;
    const from = reg[i], to = opts[ri(opts.length)];
    reg[i] = to;
    if (!contiguous(reg, n, from)) { reg[i] = from; continue; }
    const ev = evaluate(n, reg, target);
    if (ev.score >= cur.score || rnd() < Math.exp((ev.score - cur.score) / temp)) {
      cur = ev;
      if (ev.score > best.ev.score) best = { reg: reg.slice(), ev };
    } else reg[i] = from;
  }
  return best;
}

function makeOne(n, target) {
  for (let attempt = 1; ; attempt++) {
    const b = design(n, target);
    if (b.ev.ok && countSolutions(b.reg, n) === 1) return { ...b, attempt };
  }
}

if (require.main === module) {
  const fs = require('fs');
  const bank = {};
  const t0 = Date.now();
  for (const n of SIZES) {
    bank[n] = {};
    for (const target of Object.keys(TARGETS)) {
      bank[n][target] = [];
      for (let k = 0; k < PER; k++) {
        const s0 = Date.now();
        const b = makeOne(n, target);
        bank[n][target].push(Array.from(b.reg).join(''));
        const c = b.ev.g.counts;
        console.log(`${n}x${n} ${target.padEnd(6)} #${k + 1} ${((Date.now() - s0) / 1000).toFixed(1)}s ` +
          `tries=${b.attempt} entry=${b.ev.entry} sizes=${[...b.ev.sizes].sort((a, b) => a - b).join(',')} ` +
          `moves: confine ${c.confine} shadow ${c.shadow} hall ${c.hall}`);
      }
    }
  }
  const body = `// Generated by tools/generate.js on ${new Date().toISOString().slice(0, 10)}. Each entry is a ` +
    `row-major string of region ids.\nwindow.QUEENS_BANK = ${JSON.stringify(bank)};\n`;
  fs.writeFileSync(OUT, body);
  console.log(`wrote ${OUT} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

module.exports = { design, evaluate, makeOne };
