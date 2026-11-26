// The original in-page generator (random regions, keep if exactly one solution), for comparison.
const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

function shuffle(a, rnd = Math.random) {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) { const j = 0 | rnd() * (i + 1); [b[i], b[j]] = [b[j], b[i]]; }
  return b;
}

function genSolution(n, rnd = Math.random) {
  for (let t = 0; t < 50000; t++) {
    const cols = shuffle([...Array(n).keys()], rnd);
    let ok = true;
    for (let i = 0; i < n - 1 && ok; i++) if (Math.abs(cols[i] - cols[i + 1]) <= 1) ok = false;
    if (ok) return cols;
  }
  return null;
}

function buildRegions(sol, n) {
  const g = Array.from({ length: n }, () => Array(n).fill(-1));
  sol.forEach((c, r) => g[r][c] = r);
  let rem = shuffle(Array.from({ length: n * n }, (_, i) => [0 | i / n, i % n]).filter(([r, c]) => g[r][c] === -1));
  for (let pass = 0; pass < 40 && rem.length; pass++) {
    const left = [];
    for (const [r, c] of shuffle(rem)) {
      const cands = [];
      for (const [dr, dc] of DIRS) {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < n && nc >= 0 && nc < n && g[nr][nc] !== -1) {
          const reg = g[nr][nc];
          const dist = Math.abs(r - reg) + Math.abs(c - sol[reg]);
          cands.push({ reg, w: dist + (reg !== r ? 2 : 0) + Math.random() * 2 });
        }
      }
      if (!cands.length) { left.push([r, c]); continue; }
      cands.sort((a, b) => b.w - a.w);
      g[r][c] = cands[0].reg;
    }
    rem = left;
  }
  if (rem.length) return null;
  return g;
}

function countSolutions(flat, n) {
  let count = 0;
  const placed = new Int8Array(n).fill(-1), usedC = new Uint8Array(n), usedR = new Uint8Array(n);
  function bt(row) {
    if (count >= 2) return;
    if (row === n) { count++; return; }
    const prev = row > 0 ? placed[row - 1] : -99;
    for (let c = 0; c < n; c++) {
      if (usedC[c] || usedR[flat[row * n + c]] || Math.abs(prev - c) <= 1) continue;
      placed[row] = c; usedC[c] = 1; usedR[flat[row * n + c]] = 1;
      bt(row + 1);
      placed[row] = -1; usedC[c] = 0; usedR[flat[row * n + c]] = 0;
    }
  }
  bt(0);
  return count;
}

function oldPuzzle(n) {
  for (;;) {
    const sol = genSolution(n); if (!sol) continue;
    const g = buildRegions(sol, n); if (!g) continue;
    const flat = g.flat();
    if (countSolutions(flat, n) === 1) return flat;
  }
}

module.exports = { shuffle, genSolution, countSolutions, oldPuzzle };
