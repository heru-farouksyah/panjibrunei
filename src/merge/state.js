// Game state + persistence + economy math for Merge Kampong.
// Energy/coins/gems are the resource-gating layer (component #3). NOTE: gems are
// earned in-game ONLY — this is an educational, non-commercial project, so there
// is deliberately no real-money purchase path. The variable-reward chest and
// daily streak are ordinary game mechanics, not a payment funnel.

export const ENERGY_MAX = 100;
export const ENERGY_REFILL_MS = 6000;   // +1 energy every 6s of real time
const KEY = 'mergeKampong.save';

export function defaultState() {
  return {
    v: 1,
    energy: ENERGY_MAX,
    energyTs: Date.now(),
    coins: 60,
    gems: 5,
    xp: 0,
    level: 1,
    discovered: { 'wood:0': true, 'sago:0': true, 'stone:0': true, 'fish:0': true },
    board: {},               // "x,y" -> itemId
    cols: 7,
    rows: 5,
    node: 'muara',
    stars: {},               // nodeId -> 0..3 orders cleared
    ordersDone: 0,
    pass: { xp: 0, claimed: [] },
    daily: { lastDay: 0, streak: 0 },
  };
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return seedBoard(defaultState());
    const s = { ...defaultState(), ...JSON.parse(raw) };
    return s;
  } catch {
    return seedBoard(defaultState());
  }
}

let saveTimer = 0;
export function save(s) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* quota */ }
  }, 200);
}

export function resetSave() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }

// Refill energy from elapsed real time; returns the (mutated) state.
export function tickEnergy(s) {
  const now = Date.now();
  if (s.energy >= ENERGY_MAX) { s.energyTs = now; return s; }
  const gained = Math.floor((now - s.energyTs) / ENERGY_REFILL_MS);
  if (gained > 0) {
    s.energy = Math.min(ENERGY_MAX, s.energy + gained);
    s.energyTs = s.energy >= ENERGY_MAX ? now : s.energyTs + gained * ENERGY_REFILL_MS;
  }
  return s;
}

// ms until the next +1 energy (for the "come back in…" countdown).
export function msToNextEnergy(s) {
  if (s.energy >= ENERGY_MAX) return 0;
  return Math.max(0, ENERGY_REFILL_MS - ((Date.now() - s.energyTs) % ENERGY_REFILL_MS));
}

// give a brand-new board a couple of generators + starter items
function seedBoard(s) {
  s.board['0,0'] = 'gen:jungle';
  s.board['1,0'] = 'gen:grove';
  s.board['0,1'] = 'gen:quarry';
  s.board['1,1'] = 'gen:river';
  s.board['3,2'] = 'wood:0';
  s.board['4,2'] = 'wood:0';
  s.board['3,3'] = 'sago:0';
  s.board['4,3'] = 'sago:0';
  return s;
}
