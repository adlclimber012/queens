// Verify every board in puzzles.js: exactly one solution, solvable by logic at its labeled
// difficulty (and actually needing that difficulty), no single-cell regions.
// Usage: node tools/check-bank.js [puzzles.js]
const path = require('path');
const L = require('../logic.js');
const { countSolutions } = require('./old-gen.js');
global.window = {};
require(path.resolve(process.argv[2] || 'puzzles.js'));
const LEVEL = { easy: 2, medium: 3, hard: 4 };
const NEED = { easy: null, medium: 'shadow', hard: 'hall' };
let bad = 0, total = 0;
for (const [n, byDiff] of Object.entries(window.QUEENS_BANK)) {
  for (const [d, list] of Object.entries(byDiff)) {
    const seen = new Set();
    list.forEach((s, k) => {
      total++;
      const reg = [...s].map(Number), N = +n, why = [];
      if (reg.length !== N * N) why.push('bad length');
      if (seen.has(s)) why.push('duplicate'); seen.add(s);
      if (countSolutions(reg, N) !== 1) why.push('not unique');
      const g = L.solve(N, reg, LEVEL[d]);
      if (!g.solved) why.push(`not solvable at ${d}`);
      if (NEED[d] && !g.counts[NEED[d]]) why.push(`never needs ${NEED[d]}`);
      const sizes = Array(N).fill(0); reg.forEach(r => sizes[r]++);
      if (sizes.some(z => z < 2)) why.push('1-cell region');
      if (why.length) { bad++; console.log(`${n}x${n} ${d} #${k}: ${why.join(', ')}`); }
    });
  }
}
console.log(`${total - bad}/${total} boards OK`);
process.exit(bad ? 1 : 0);
