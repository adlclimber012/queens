// Grade boards from the original generator with the human-style solver.
// Usage: node tools/grade-old.js [count]
const L = require('../logic.js');
const { oldPuzzle } = require('./old-gen.js');

const count = +process.argv[2] || 200;
for (const n of [8, 9]) {
  const byLevel = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, stuck: 0 };
  let entry = 0, sizes = [], t0 = Date.now(), solveMs = 0;
  for (let k = 0; k < count; k++) {
    const reg = oldPuzzle(n);
    const s0 = Date.now();
    const g = L.solve(n, reg);
    solveMs += Date.now() - s0;
    if (g.solved) byLevel[g.maxUsed]++; else byLevel.stuck++;
    entry += L.entryPoints(n, reg);
    const sz = Array(n).fill(0); reg.forEach(r => sz[r]++); sizes.push(...sz);
  }
  const single = sizes.filter(s => s === 1).length / count;
  const pct = v => (100 * v / count).toFixed(0) + '%';
  console.log(`${n}x${n}: hardest move needed -> single ${pct(byLevel[1])}, confine ${pct(byLevel[2])}, ` +
    `shadow ${pct(byLevel[3])}, hall ${pct(byLevel[4])}, chain/guess ${pct(byLevel[5])}, stuck ${pct(byLevel.stuck)}`);
  console.log(`   avg entry points ${(entry / count).toFixed(1)}, avg 1-cell regions ${single.toFixed(2)}, ` +
    `region sizes min/max avg ${(Math.min(...sizes))}/${Math.max(...sizes)}, solver ${(solveMs / count).toFixed(1)} ms/board`);
}
