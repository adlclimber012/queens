// Human-style Queens solver.
// It only makes deductions a person could make, records each one, and reports whether the
// board can be finished without guessing. Works in Node (require) and in the browser (window.QueensLogic).
//
// Board: n and a flat region array `reg` of length n*n (region ids 0..n-1).
// Cell state: 0 = candidate, 1 = eliminated (X), 2 = queen.
//
// Technique levels (lower = easier, a solve is graded by what it needed):
//   1 single   - a row, column or region has exactly one cell left: it must be the crown.
//   2 confine  - a region fits in one row/column (clear the rest of that line), or a line
//                fits inside one region (clear the rest of that region).
//   3 shadow   - every possible crown spot of some row/column/region attacks a cell, so that
//                cell is out. Includes "a crown here would wipe out a region".
//   4 hall     - k regions squeezed into k rows/columns (or k lines into k regions):
//                nothing else may use those rows/columns.
//   5 chain    - try a crown, follow easy deductions (levels 1-3) to a contradiction.
//                This is trial-and-error; good puzzles should not need it.
(function (root) {
  const TECH = { single: 1, confine: 2, shadow: 3, hall: 4, chain: 5 };

  function makeBoard(n, reg) {
    const N = n * n;
    const rows = [], cols = [], regs = [];
    for (let i = 0; i < n; i++) { rows.push([]); cols.push([]); regs.push([]); }
    for (let i = 0; i < N; i++) {
      rows[(i / n) | 0].push(i);
      cols[i % n].push(i);
      regs[reg[i]].push(i);
    }
    // units: [type, index, cells]; type 0 row, 1 col, 2 region
    const units = [];
    rows.forEach((c, i) => units.push([0, i, c]));
    cols.forEach((c, i) => units.push([1, i, c]));
    regs.forEach((c, i) => units.push([2, i, c]));
    // attack[i]: every other cell eliminated by a crown at i
    const attack = [];
    for (let i = 0; i < N; i++) {
      const r = (i / n) | 0, c = i % n, s = new Set();
      for (const j of rows[r]) s.add(j);
      for (const j of cols[c]) s.add(j);
      for (const j of regs[reg[i]]) s.add(j);
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr, cc = c + dc;
        if (rr >= 0 && rr < n && cc >= 0 && cc < n) s.add(rr * n + cc);
      }
      s.delete(i);
      attack.push([...s]);
    }
    return { n, N, reg, rows, cols, regs, units, attack };
  }

  function place(B, st, i) {
    st[i] = 2;
    for (const j of B.attack[i]) if (st[j] === 0) st[j] = 1;
  }

  // Returns false if some unit can no longer get a crown, or two crowns clash.
  function consistent(B, st) {
    for (const [, , cells] of B.units) {
      let q = 0, c = 0;
      for (const i of cells) { if (st[i] === 2) q++; else if (st[i] === 0) c++; }
      if (q > 1 || (q === 0 && c === 0)) return false;
    }
    return true;
  }

  function solvedState(B, st) {
    let q = 0;
    for (let i = 0; i < B.N; i++) if (st[i] === 2) q++;
    return q === B.n;
  }

  // ---- techniques: each returns {tech, place?:[i], elim?:[...]} or null ----

  function tSingle(B, st) {
    for (const [, , cells] of B.units) {
      let q = false, cand = -1, k = 0;
      for (const i of cells) { if (st[i] === 2) { q = true; break; } if (st[i] === 0) { cand = i; k++; } }
      if (!q && k === 1) return { tech: 'single', place: [cand] };
    }
    return null;
  }

  // candidate cells of a unit, or null if it already holds a crown
  function openCands(st, cells) {
    const out = [];
    for (const i of cells) { if (st[i] === 2) return null; if (st[i] === 0) out.push(i); }
    return out;
  }

  function tConfine(B, st) {
    const { n, reg } = B;
    for (const [type, idx, cells] of B.units) {
      const cs = openCands(st, cells);
      if (!cs || cs.length < 2) continue;
      // which other unit types are all candidates confined to?
      const keys = type === 2
        ? [[0, i => (i / n) | 0], [1, i => i % n]]
        : [[2, i => reg[i]]];
      for (const [t2, f] of keys) {
        const k = f(cs[0]);
        if (!cs.every(i => f(i) === k)) continue;
        const target = t2 === 0 ? B.rows[k] : t2 === 1 ? B.cols[k] : B.regs[k];
        const inUnit = new Set(cells);
        const elim = target.filter(j => st[j] === 0 && !inUnit.has(j));
        if (elim.length) return { tech: 'confine', elim, unit: [type, idx] };
      }
    }
    return null;
  }

  function tShadow(B, st) {
    for (const [type, idx, cells] of B.units) {
      const cs = openCands(st, cells);
      if (!cs || cs.length === 0) continue;
      // cells attacked by every candidate of this unit
      let common = null;
      for (const i of cs) {
        const s = new Set(B.attack[i].filter(j => st[j] === 0));
        if (common === null) common = s;
        else for (const j of common) if (!s.has(j)) common.delete(j);
        if (!common.size) break;
      }
      if (common && common.size) {
        const inUnit = new Set(cells);
        const elim = [...common].filter(j => !inUnit.has(j));
        if (elim.length) return { tech: 'shadow', elim, unit: [type, idx] };
      }
    }
    return null;
  }

  // k units of kind A whose candidates fit inside k lines of kind B: other A-units can't use those B lines.
  function tHall(B, st) {
    const { n, reg } = B;
    const groups = [B.rows, B.cols, B.regs];
    const keyOf = [i => (i / n) | 0, i => i % n, i => reg[i]];
    const pairs = [[2, 0], [2, 1], [0, 2], [1, 2], [0, 1], [1, 0]];
    for (const [a, b] of pairs) {
      const open = [];
      for (let u = 0; u < n; u++) {
        const cs = openCands(st, groups[a][u]);
        if (!cs) continue;
        let mask = 0;
        for (const i of cs) mask |= 1 << keyOf[b](i);
        open.push([u, mask]);
      }
      const m = open.length;
      if (m < 3) continue;
      // subsets of size 2..m-1, smallest first so the reported step is the simplest one
      const order = [];
      for (let s = 1; s < (1 << m); s++) {
        const k = popcount(s);
        if (k >= 2 && k < m) order.push([k, s]);
      }
      order.sort((x, y) => x[0] - y[0]);
      for (const [k, s] of order) {
        let mask = 0;
        for (let j = 0; j < m; j++) if (s & (1 << j)) mask |= open[j][1];
        if (popcount(mask) !== k) continue;
        const members = new Set();
        for (let j = 0; j < m; j++) if (s & (1 << j)) members.add(open[j][0]);
        const elim = [];
        for (let bl = 0; bl < n; bl++) if (mask & (1 << bl))
          for (const i of groups[b][bl]) if (st[i] === 0 && !members.has(keyOf[a](i))) elim.push(i);
        if (elim.length) return { tech: 'hall', elim, size: k };
      }
    }
    return null;
  }

  function popcount(x) { let c = 0; while (x) { x &= x - 1; c++; } return c; }

  // Apply easy techniques until stuck; returns false on contradiction.
  function propagate(B, st, maxLevel) {
    for (;;) {
      if (!consistent(B, st)) return false;
      if (solvedState(B, st)) return true;
      const s = step(B, st, maxLevel, false);
      if (!s) return true;
      apply(B, st, s);
    }
  }

  function tChain(B, st) {
    for (let i = 0; i < B.N; i++) {
      if (st[i] !== 0) continue;
      const t = st.slice();
      place(B, t, i);
      if (!propagate(B, t, 3)) return { tech: 'chain', elim: [i] };
    }
    return null;
  }

  const ORDER = [[1, tSingle], [2, tConfine], [3, tShadow], [4, tHall], [5, tChain]];

  function step(B, st, maxLevel = 5) {
    for (const [lvl, f] of ORDER) {
      if (lvl > maxLevel) break;
      const s = f(B, st);
      if (s) return s;
    }
    return null;
  }

  function apply(B, st, s) {
    if (s.place) for (const i of s.place) place(B, st, i);
    if (s.elim) for (const i of s.elim) if (st[i] === 0) st[i] = 1;
  }

  // Full solve from an empty board. Returns a grade.
  function solve(n, reg, maxLevel = 5) {
    const B = makeBoard(n, reg);
    const st = new Uint8Array(B.N);
    const steps = [];
    for (;;) {
      if (!consistent(B, st)) return { solved: false, contradiction: true, steps, st };
      if (solvedState(B, st)) break;
      const s = step(B, st, maxLevel);
      if (!s) break;
      steps.push(s);
      apply(B, st, s);
    }
    const solved = solvedState(B, st);
    const counts = { single: 0, confine: 0, shadow: 0, hall: 0, chain: 0 };
    let maxUsed = 0;
    for (const s of steps) { counts[s.tech]++; maxUsed = Math.max(maxUsed, TECH[s.tech]); }
    // How many distinct non-trivial moves are available at the very start (fewer = clearer entry).
    const resolved = st.reduce((a, v) => a + (v !== 0 ? 1 : 0), 0);
    return { solved, steps, counts, maxUsed, resolved, st };
  }

  // Count different deductions available on the empty board at levels <= 3 (entry points).
  function entryPoints(n, reg) {
    const B = makeBoard(n, reg);
    const st = new Uint8Array(B.N);
    let k = 0;
    for (const [type, idx, cells] of B.units) {
      const cs = openCands(st, cells);
      if (!cs) continue;
      if (cs.length === 1) { k++; continue; }
      let common = null;
      for (const i of cs) {
        const s = new Set(B.attack[i]);
        if (common === null) common = s; else for (const j of common) if (!s.has(j)) common.delete(j);
      }
      const inUnit = new Set(cells);
      if ([...common].some(j => !inUnit.has(j))) k++;
    }
    return k;
  }

  const api = { solve, entryPoints, makeBoard, step, apply, place, consistent, TECH };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.QueensLogic = api;
})(typeof window !== 'undefined' ? window : globalThis);
