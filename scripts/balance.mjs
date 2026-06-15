// Phase 11 — headless balance harness. Runs AI-vs-AI 1v1 matches across every
// faction pairing (both start positions, to cancel positional bias), to a tick
// cap, and reports a win-rate matrix + match-length stats. Sim-only, no render.
//
//   node scripts/balance.mjs            # default sweep
//   REPS=3 TICKCAP=12000 node scripts/balance.mjs
//   PAIR=semaun,badar node scripts/balance.mjs   # one matchup (smoke test)
import { Sim } from '../src/sim/sim.js';
import { AIController } from '../src/sim/ai.js';
import factionsData from '../src/data/factions.json' with { type: 'json' };

const FACTIONS = Object.keys(factionsData).filter((k) => !k.startsWith('_'));
const REPS = parseInt(process.env.REPS ?? '2', 10);       // matches per orientation
const TICKCAP = parseInt(process.env.TICKCAP ?? '6000', 10); // ~5 min @ 20Hz
// AI-vs-AI tends to reach a defensive stalemate (neither razes the other's
// capital), so the decisive signal is POSITIONAL DOMINANCE — army + economy
// value — at the time horizon. A conquest still wins outright if it happens.
const DRAW_MARGIN = parseFloat(process.env.DRAW_MARGIN ?? '0.04');
const DIFFICULTY = process.env.DIFF ?? 'normal';

// Positional-dominance value for a side. Cost captures investment; adding a
// current-HP term so survivability buffs (infantry/villager HP, armor) get
// partial credit even though AI-vs-AI rarely forces decisive combat.
function score(sim, owner) {
  let s = 0;
  sim.pool.forEach((e) => {
    if (e.owner !== owner || !e.alive) return;
    const cost = Object.values(e.proto.cost ?? {}).reduce((a, b) => a + b, 0);
    if (e.kind === 'building') { s += cost * 0.5 + 50; return; } // territory weight
    const atk = e.atk || e.proto.attack?.atk || 0;
    s += cost + e.maxHp * 0.25 + atk * 0.5; // value = investment + durability + punch
  });
  return s;
}

// one match: factionA = player 0, factionB = player 1. Returns winner index
// (0/1) and tick length; -1 winner = draw.
function playMatch(factionA, factionB, seed) {
  const sim = new Sim({
    seed, playerFaction: factionA, aiFaction: factionB,
    difficulty: DIFFICULTY, numEnemies: 1,
  });
  sim.ais.push(new AIController(sim, 0, DIFFICULTY)); // AI also drives player 0
  while (sim.winner < 0 && sim.tick < TICKCAP) sim.step();
  if (sim.winner >= 0) return { winner: sim.winner, tick: sim.tick, timeout: false };
  // timed out: award to the stronger position (army + economy), else draw
  const s0 = score(sim, 0), s1 = score(sim, 1);
  const ratio = Math.abs(s0 - s1) / Math.max(1, s0 + s1);
  const winner = ratio < DRAW_MARGIN ? -1 : (s0 > s1 ? 0 : 1);
  return { winner, tick: sim.tick, timeout: true };
}

const wins = Object.fromEntries(FACTIONS.map((f) => [f, 0]));
const games = Object.fromEntries(FACTIONS.map((f) => [f, 0]));
const matrix = {}; // matrix[A][B] = wins of A over B
for (const a of FACTIONS) { matrix[a] = {}; for (const b of FACTIONS) matrix[a][b] = 0; }
const lengths = [];
let timeouts = 0, draws = 0, total = 0;

const only = process.env.PAIR ? process.env.PAIR.split(',') : null;

for (let i = 0; i < FACTIONS.length; i++) {
  for (let j = i + 1; j < FACTIONS.length; j++) {
    const A = FACTIONS[i], B = FACTIONS[j];
    if (only && !(only.includes(A) && only.includes(B))) continue;
    for (let rep = 0; rep < REPS; rep++) {
      // both orientations so each faction plays both start positions
      for (const [p0, p1] of [[A, B], [B, A]]) {
        const seed = 1000 + i * 131 + j * 17 + rep * 7 + (p0 === A ? 0 : 3);
        const r = playMatch(p0, p1, seed);
        total++;
        lengths.push(r.tick);
        if (r.timeout) timeouts++;
        games[p0]++; games[p1]++;
        if (r.winner === -1) { draws++; }
        else {
          const wf = r.winner === 0 ? p0 : p1;
          const lf = r.winner === 0 ? p1 : p0;
          wins[wf]++; matrix[wf][lf]++;
        }
      }
    }
    process.stdout.write('.');
  }
}
process.stdout.write('\n');

// ---- report ---------------------------------------------------------------
const ticksToMin = (t) => (t / 20 / 60).toFixed(1);
lengths.sort((a, b) => a - b);
const median = lengths[Math.floor(lengths.length / 2)] ?? 0;
const avg = lengths.reduce((s, t) => s + t, 0) / Math.max(1, lengths.length);

console.log(`\n=== PANJI BRUNEI balance report (${DIFFICULTY}) ===`);
console.log(`matches: ${total}  |  reps/orientation: ${REPS}  |  tick cap: ${TICKCAP} (${ticksToMin(TICKCAP)} min)`);
console.log(`match length: median ${ticksToMin(median)} min, avg ${ticksToMin(avg)} min  |  timeouts: ${timeouts} (${(100 * timeouts / total).toFixed(0)}%)  draws: ${draws}`);

console.log('\nwin rate by faction:');
const rows = FACTIONS.map((f) => ({ f, wr: games[f] ? wins[f] / games[f] : 0, g: games[f] }))
  .sort((a, b) => b.wr - a.wr);
for (const r of rows) {
  const pct = (r.wr * 100).toFixed(0);
  const bar = '█'.repeat(Math.round(r.wr * 30));
  console.log(`  ${r.f.padEnd(11)} ${pct.padStart(3)}%  ${bar}  (${wins[r.f]}/${r.g})`);
}

const spread = rows.length ? (rows[0].wr - rows[rows.length - 1].wr) * 100 : 0;
console.log(`\nwin-rate spread (best − worst): ${spread.toFixed(0)} points`);

console.log('\nhead-to-head wins (row beats column):');
console.log(''.padEnd(12) + FACTIONS.map((f) => f.slice(0, 4).padStart(6)).join(''));
for (const a of FACTIONS) {
  let line = a.padEnd(12);
  for (const b of FACTIONS) line += (a === b ? '—' : String(matrix[a][b])).padStart(6);
  console.log(line);
}

// machine-readable tail for diffing across tuning passes
console.log('\nJSON ' + JSON.stringify({ winRate: Object.fromEntries(rows.map((r) => [r.f, +(r.wr).toFixed(3)])), spread: +spread.toFixed(1), medianMin: +ticksToMin(median), timeouts }));
