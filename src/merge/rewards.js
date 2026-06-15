// Retention scaffolding (component #5): daily login streak, a Kampong Pass track,
// and a mystery box with a *variable* payout. These are implemented as ordinary
// game mechanics with IN-GAME currency only — no real money, no purchase funnel.
// (The design brief notes this is the layer with the sharpest ethical edge; in an
// educational build we keep the mechanic, drop the monetisation.)
import { CHAINS, CHAIN_IDS, itemId, itemName, itemColor } from './data.js';

const DAY = 86400000;
const CHEST_COOLDOWN = 20 * 60 * 1000; // a free chest every 20 min of real time
const CHEST_GEM_COST = 8;

// Kampong Pass milestones (pass.xp earned from delivering orders).
export const PASS = [
  { xp: 20, coins: 50 },
  { xp: 50, gems: 3 },
  { xp: 90, coins: 120 },
  { xp: 140, gems: 5 },
  { xp: 200, coins: 250, gems: 5 },
];

// Daily streak rewards (in-game).
const DAILY = [
  { coins: 40 }, { coins: 60 }, { coins: 90 }, { gems: 3 },
  { coins: 140 }, { coins: 200 }, { gems: 8 },
];

export class Rewards {
  constructor(game) { this.game = game; this.s = game.state; if (!this.s.chest) this.s.chest = { ts: 0 }; }

  today() { return Math.floor(Date.now() / DAY); }

  // Returns a reward to show if it's a new day, else null.
  checkDaily() {
    const d = this.today();
    if (this.s.daily.lastDay === d) return null;
    const consecutive = this.s.daily.lastDay === d - 1;
    this.s.daily.streak = consecutive ? Math.min(this.s.daily.streak + 1, DAILY.length) : 1;
    this.s.daily.lastDay = d;
    const r = DAILY[this.s.daily.streak - 1];
    if (r.coins) this.game.addCoins(r.coins);
    if (r.gems) this.game.addGems(r.gems);
    this.game.save();
    return { ...r, streak: this.s.daily.streak };
  }

  chestReadyIn() { return Math.max(0, this.s.chest.ts + CHEST_COOLDOWN - Date.now()); }

  // Variable-ratio payout — the same shape as a gacha chest, in-game only.
  roll() {
    const r = Math.random();
    if (r < 0.46) return { kind: 'coins', amount: 30 + ((Math.random() * 40) | 0), rarity: 'common' };
    if (r < 0.70) return { kind: 'coins', amount: 80 + ((Math.random() * 80) | 0), rarity: 'common' };
    if (r < 0.84) { const c = CHAIN_IDS[(Math.random() * CHAIN_IDS.length) | 0]; return { kind: 'item', item: itemId(c, Math.random() < 0.6 ? 1 : 2), rarity: 'rare' }; }
    if (r < 0.95) return { kind: 'gems', amount: 2 + ((Math.random() * 3) | 0), rarity: 'rare' };
    if (r < 0.99) { const c = CHAIN_IDS[(Math.random() * CHAIN_IDS.length) | 0]; return { kind: 'item', item: itemId(c, 3), rarity: 'epic' }; }
    return { kind: 'gems', amount: 15 + ((Math.random() * 10) | 0), rarity: 'legendary' };
  }

  openChest(useGems) {
    const free = this.chestReadyIn() <= 0;
    if (!free) {
      if (!useGems) return { error: 'cooldown' };
      if (this.s.gems < CHEST_GEM_COST) return { error: 'gems' };
      this.game.addGems(-CHEST_GEM_COST);
    } else {
      this.s.chest.ts = Date.now();
    }
    const win = this.roll();
    if (win.kind === 'coins') this.game.addCoins(win.amount);
    else if (win.kind === 'gems') this.game.addGems(win.amount);
    else if (win.kind === 'item') this.game.dropItem(win.item);
    this.game.save();
    return win;
  }

  passClaimable() { return PASS.map((m, i) => ({ ...m, i, claimed: this.s.pass.claimed.includes(i), unlocked: this.s.pass.xp >= m.xp })); }

  claimPass(i) {
    const m = PASS[i];
    if (!m || this.s.pass.xp < m.xp || this.s.pass.claimed.includes(i)) return false;
    if (m.coins) this.game.addCoins(m.coins);
    if (m.gems) this.game.addGems(m.gems);
    this.s.pass.claimed.push(i);
    this.game.save();
    return true;
  }
}

// Label a chest payout for the reveal UI.
export function rewardLabel(win) {
  if (win.kind === 'coins') return { text: `+${win.amount} coins`, color: '#e6bb3e', sub: '🪙' };
  if (win.kind === 'gems') return { text: `+${win.amount} gems`, color: '#5ad1e6', sub: '💎' };
  return { text: itemName(win.item), color: itemColor(win.item), sub: CHAINS[win.item.split(':')[0]].name };
}
