// Phase 10 verification — save/load round-trip fidelity + deterministic
// lock-step + same-seed map reproducibility. Runs AI-free (like the other
// sim tests) so the step is fully deterministic and a faithful restore must
// stay byte-for-byte in lock-step with the original.
import { Sim } from '../src/sim/sim.js';

let failed = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`);
  if (!ok) failed++;
};

// snapshot of the observable state we expect to match exactly
function fingerprint(sim) {
  const ents = [];
  sim.pool.forEach((e) => ents.push(
    `${e.id}:${e.kind}:${e.protoId}:${e.owner}:${e.x.toFixed(4)},${e.z.toFixed(4)}:${e.hp.toFixed(3)}:${e.state}`
  ));
  ents.sort();
  const res = sim.players.map((p) =>
    `${p.factionId}|${p.era}|${Object.values(p.resources).map((v) => v.toFixed(2)).join(',')}|${p.pop}/${p.popCap}`
  );
  return JSON.stringify({ tick: sim.tick, rng: sim.rng.getState(), fireRng: sim.fire.rng, ents, res });
}

// --- build a sim with some live activity (paths, gathering, training) -------
function makeBusySim() {
  const sim = new Sim({ seed: 778899, playerFaction: 'semaun', numEnemies: 1 });
  // villagers go gather; istana trains a unit -> exercises path/order/queue
  const vils = [];
  sim.pool.forEach((e) => { if (e.owner === 0 && e.protoId === 'penduduk') vils.push(e.id); });
  sim.cmdMove(vils, sim.grid.startZones[0].x + 6, sim.grid.startZones[0].y + 6, 0);
  let istana = -1;
  sim.pool.forEach((e) => { if (e.owner === 0 && e.protoId === 'istana') istana = e.id; });
  if (istana >= 0) sim.cmdTrain(istana, 'penduduk', 0);
  return sim;
}

const orig = makeBusySim();
for (let i = 0; i < 250; i++) orig.step();

// round-trip through JSON, exactly as localStorage would
const json = JSON.stringify(orig.serialize());
const restored = Sim.deserialize(JSON.parse(json));

check('save is JSON-serializable', typeof json === 'string' && json.length > 100, `${json.length} bytes`);
check('restored tick matches', restored.tick === orig.tick, `${restored.tick}`);

let oc = 0, rc = 0;
orig.pool.forEach(() => oc++); restored.pool.forEach(() => rc++);
check('restored entity count matches', oc === rc, `${oc} vs ${rc}`);
check('restored resources match',
  JSON.stringify(orig.players.map((p) => p.resources)) ===
  JSON.stringify(restored.players.map((p) => p.resources)));
check('full fingerprint matches at restore', fingerprint(orig) === fingerprint(restored));

// the strong test: both step identically for a good while
let lockstep = true;
let divergedAt = -1;
for (let i = 0; i < 500; i++) {
  orig.step();
  restored.step();
  if (fingerprint(orig) !== fingerprint(restored)) { lockstep = false; divergedAt = i; break; }
}
check('stays in lock-step for 500 ticks after restore', lockstep, divergedAt >= 0 ? `diverged at +${divergedAt}` : '');

// --- proto re-linking actually worked (units can still act) ----------------
let hasProto = true;
restored.pool.forEach((e) => { if (!e.proto) hasProto = false; });
check('every restored entity re-linked its proto', hasProto);

// --- map reproducibility: same seed => identical map; different => different -
function mapFP(seed) {
  const s = new Sim({ seed, playerFaction: 'semaun', numEnemies: 1 });
  return s.grid.types ? Array.from(s.grid.types).join('') : JSON.stringify(s.grid.startZones);
}
check('same seed reproduces the same map', mapFP(42) === mapFP(42));
check('different seed gives a different map', mapFP(42) !== mapFP(43));

// --- incompatible save is rejected cleanly ---------------------------------
let rejected = false;
try { Sim.deserialize({ v: 0 }); } catch { rejected = true; }
check('incompatible save version is rejected', rejected);

console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
