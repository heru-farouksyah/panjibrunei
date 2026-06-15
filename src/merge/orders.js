// Orders / quests (component #2): villagers ask for specific items, which gives
// merging a reason. Framed as rebuilding the kampong — "I'm helping the village"
// rather than "I'm merging shapes". Clearing orders earns coins/gems/XP, fills
// the Kampong Pass, and earns stars toward the current journey node (#4).
import { CHAINS, parseItem, itemId, itemName, itemColor, itemValue, ORDERS_PER_NODE } from './data.js';

const NPCS = ['Tok Penghulu', 'Nakhoda Ragam', 'Mak Inang', 'Awang Kerja', 'Dang Ayu', 'Pak Nelayan'];

export class Orders {
  constructor(game, board) {
    this.game = game; this.board = board; this.s = game.state;
    this.active = [];
  }

  mount(container) {
    this.el = document.createElement('div');
    this.el.className = 'orders';
    container.appendChild(this.el);
    this.ensure();
    this.render();
  }

  discoveredMergeables() {
    // items the player has discovered at tier ≥1 (require at least one merge)
    return Object.keys(this.s.discovered).filter((id) => parseItem(id).tier >= 1);
  }

  generate() {
    const pool = this.discoveredMergeables();
    const pick = pool.length ? pool : ['wood:1', 'sago:1'];
    const nReq = pool.length >= 2 && Math.random() < 0.5 ? 2 : 1;
    const items = [];
    const used = new Set();
    for (let i = 0; i < nReq; i++) {
      let id = pick[(Math.random() * pick.length) | 0];
      let guard = 0;
      while (used.has(id) && guard++ < 8) id = pick[(Math.random() * pick.length) | 0];
      used.add(id);
      const tier = parseItem(id).tier;
      const qty = tier >= 3 ? 1 : 1 + ((Math.random() * 2) | 0);
      items.push({ id, qty });
    }
    const coins = Math.round(items.reduce((a, it) => a + itemValue(it.id) * it.qty, 0) * 1.6);
    const gems = Math.random() < 0.35 ? 1 + ((Math.random() * 2) | 0) : 0;
    const xp = items.reduce((a, it) => a + (parseItem(it.id).tier + 1) * it.qty, 0) * 3;
    return { id: 'o' + Math.floor(Math.random() * 1e9), npc: NPCS[(Math.random() * NPCS.length) | 0], items, coins, gems, xp };
  }

  ensure() { while (this.active.length < 3) this.active.push(this.generate()); }

  canFill(o) { return o.items.every((it) => this.board.countItem(it.id) >= it.qty); }

  render() {
    this.el.innerHTML = `<div class="orders-h">Orders · rebuild the kampong</div>`;
    for (const o of this.active) {
      const ready = this.canFill(o);
      const card = document.createElement('div');
      card.className = 'order' + (ready ? ' ready' : '');
      const reqs = o.items.map((it) => {
        const have = this.board.countItem(it.id);
        return `<span class="req ${have >= it.qty ? 'ok' : ''}" style="--c:${itemColor(it.id)}">` +
          `${itemName(it.id)} <b>${Math.min(have, it.qty)}/${it.qty}</b></span>`;
      }).join('');
      card.innerHTML =
        `<div class="order-npc">${o.npc}</div>` +
        `<div class="order-reqs">${reqs}</div>` +
        `<div class="order-rew">+${o.coins}🪙${o.gems ? ` +${o.gems}💎` : ''} +${o.xp}xp</div>` +
        `<button class="order-go" ${ready ? '' : 'disabled'}>Deliver</button>`;
      card.querySelector('.order-go').onclick = () => this.fulfill(o);
      this.el.appendChild(card);
    }
  }

  fulfill(o) {
    if (!this.canFill(o)) return;
    for (const it of o.items) this.board.consume(it.id, it.qty);
    this.game.addCoins(o.coins);
    if (o.gems) this.game.addGems(o.gems);
    this.game.addXp(o.xp);
    this.game.addPassXp(10);
    this.game.completeOrder(); // node stars + ordersDone
    this.active = this.active.filter((x) => x !== o);
    this.ensure();
    this.render();
    this.game.juice.sound('reward'); this.game.juice.haptic(24);
    this.game.toast(`${o.npc}: terima kasih! +${o.coins}🪙`);
    this.game.save();
  }
}
