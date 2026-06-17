// Persistent player profile — the meta-progression that wraps the RTS with the
// engagement loop (XP/levels, mission stars, daily streak, a campaign pass and a
// reward chest). All rewards are cosmetic / in-game only; this is an educational,
// non-commercial project, so there is deliberately no real-money path.
const KEY = 'panji.profile';
const DAY = 86400000;

// XP needed to go from `lvl` to `lvl+1`.
export const levelXp = (lvl) => 90 + (lvl - 1) * 70;

// Cosmetic unlocks granted at profile levels (titles + banner frames).
export const UNLOCKS = [
  { level: 2, kind: 'title', id: 'panglima', name: 'Panglima' },
  { level: 3, kind: 'banner', id: 'gold', name: 'Gold Banner' },
  { level: 5, kind: 'title', id: 'pahlawan', name: 'Pahlawan' },
  { level: 7, kind: 'banner', id: 'royal', name: 'Royal Banner' },
  { level: 10, kind: 'title', id: 'wira', name: 'Wira Negara' },
];

// Daily login streak rewards (in-game).
export const DAILY = [
  { xp: 30 }, { xp: 45 }, { xp: 60, chest: 1 }, { xp: 80 },
  { xp: 110 }, { xp: 150 }, { xp: 220, chest: 1 },
];

// Campaign Pass milestones (pass xp earned from missions).
export const PASS = [
  { xp: 30, reward: { xp: 60 } },
  { xp: 80, reward: { chest: 1 } },
  { xp: 150, reward: { xp: 150 } },
  { xp: 250, reward: { chest: 2 } },
];

export function defaultProfile() {
  return {
    v: 1, level: 1, xp: 0,
    stars: {},            // nodeId -> 0..3
    lastNode: null,
    daily: { lastDay: 0, streak: 0 },
    pass: { xp: 0, claimed: [] },
    chests: 0,
    unlocked: [],         // unlock ids earned
    titles: [],           // earned titles
  };
}

export function loadProfile() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultProfile();
    return { ...defaultProfile(), ...JSON.parse(raw) };
  } catch { return defaultProfile(); }
}

export function saveProfile(p) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* quota */ }
}

// Add XP, rolling levels. Returns {gained, levels:[newLevel,...], unlocks:[...]}.
export function addXp(p, n) {
  p.xp += n;
  const levels = [], unlocks = [];
  while (p.xp >= levelXp(p.level)) {
    p.xp -= levelXp(p.level);
    p.level++;
    levels.push(p.level);
    for (const u of UNLOCKS) {
      if (u.level === p.level && !p.unlocked.includes(u.id)) {
        p.unlocked.push(u.id);
        if (u.kind === 'title') p.titles.push(u.id);
        unlocks.push(u);
      }
    }
  }
  return { gained: n, levels, unlocks };
}

// Record a mission result. stars 0..3, xp earned. Returns level-up info.
export function completeMission(p, nodeId, stars, xp) {
  const before = p.stars[nodeId] || 0;
  p.stars[nodeId] = Math.max(before, stars);
  const newStars = Math.max(0, p.stars[nodeId] - before); // only count improvement
  p.lastNode = nodeId;
  p.pass.xp += 10 + stars * 5;
  const lv = addXp(p, xp);
  saveProfile(p);
  return { ...lv, newStars };
}

export function totalStars(p) { return Object.values(p.stars).reduce((a, b) => a + b, 0); }

// Daily streak: returns the reward for a new day, else null.
export function checkDaily(p) {
  const d = Math.floor(Date.now() / DAY);
  if (p.daily.lastDay === d) return null;
  p.daily.streak = p.daily.lastDay === d - 1 ? Math.min(p.daily.streak + 1, DAILY.length) : 1;
  p.daily.lastDay = d;
  const r = DAILY[p.daily.streak - 1];
  const lv = addXp(p, r.xp || 0);
  if (r.chest) p.chests += r.chest;
  saveProfile(p);
  return { ...r, streak: p.daily.streak, levels: lv.levels, unlocks: lv.unlocks };
}

export function passClaimable(p) {
  return PASS.map((m, i) => ({ ...m, i, claimed: p.pass.claimed.includes(i), unlocked: p.pass.xp >= m.xp }));
}
export function claimPass(p, i) {
  const m = PASS[i];
  if (!m || p.pass.xp < m.xp || p.pass.claimed.includes(i)) return null;
  p.pass.claimed.push(i);
  if (m.reward.xp) addXp(p, m.reward.xp);
  if (m.reward.chest) p.chests += m.reward.chest;
  saveProfile(p);
  return m.reward;
}

// Variable-ratio reward chest (in-game only): XP / chest tokens / a cosmetic.
export function openChest(p) {
  const r = Math.random();
  let win;
  if (r < 0.5) win = { kind: 'xp', amount: 40 + ((Math.random() * 40) | 0), rarity: 'common' };
  else if (r < 0.8) win = { kind: 'xp', amount: 100 + ((Math.random() * 80) | 0), rarity: 'rare' };
  else if (r < 0.95) win = { kind: 'chest', amount: 1, rarity: 'rare' };
  else win = { kind: 'xp', amount: 300, rarity: 'legendary' };
  p.chests = Math.max(0, p.chests - 1);
  if (win.kind === 'xp') win.level = addXp(p, win.amount);
  else if (win.kind === 'chest') p.chests += win.amount;
  saveProfile(p);
  return win;
}
