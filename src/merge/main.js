// Merge Kampong — entry point. Wires the board (core loop), orders (goal layer),
// economy (energy/coins/gems), journey map (meta-progression) and rewards
// (daily/chest/pass) together behind one persistent top bar, with juice.
import { load, save, tickEnergy, msToNextEnergy, resetSave, ENERGY_MAX } from './state.js';
import { Juice } from './juice.js';
import { Board } from './board.js';
import { Orders } from './orders.js';
import { Journey } from './journey.js';
import { Rewards, rewardLabel, PASS } from './rewards.js';
import { JOURNEY, ORDERS_PER_NODE, NODE_STORY, itemValue, itemName, itemColor, parseItem } from './data.js';

class Game {
  constructor() {
    this.state = tickEnergy(load());
    this.root = document.getElementById('app');
    this.juice = new Juice(this.root);
    this.rewards = new Rewards(this);

    this.topbar = document.createElement('div'); this.topbar.className = 'topbar';
    this.screen = document.createElement('div'); this.screen.className = 'screen';
    this.root.append(this.topbar, this.screen);

    this.renderTopbar();
    this.showJourney();
    setInterval(() => { tickEnergy(this.state); this.renderTopbar(); }, 1000);

    const daily = this.rewards.checkDaily();
    if (daily) this.showDaily(daily);
  }

  // --- economy / progression ----------------------------------------------
  save() { save(this.state); }
  spendEnergy(n) { if (this.state.energy < n) return false; tickEnergy(this.state); if (this.state.energy < n) return false; this.state.energy -= n; this.renderTopbar(); this.save(); return true; }
  addEnergy(n) { this.state.energy = Math.min(ENERGY_MAX, this.state.energy + n); this.renderTopbar(); }
  addCoins(n) { this.state.coins = Math.max(0, this.state.coins + n); this.renderTopbar(); }
  addGems(n) { this.state.gems = Math.max(0, this.state.gems + n); this.renderTopbar(); }
  addPassXp(n) { this.state.pass.xp += n; }
  discover(id) { if (!this.state.discovered[id]) { this.state.discovered[id] = true; this.save(); } }

  addXp(n) {
    this.state.xp += n;
    const need = this.state.level * 100;
    if (this.state.xp >= need) { this.state.xp -= need; this.state.level++; this.addGems(2); this.toast(`Level ${this.state.level}! +2💎`); this.juice.sound('reward'); }
    this.renderTopbar();
  }

  completeOrder() {
    const id = this.state.node;
    const before = this.state.stars[id] || 0;
    this.state.stars[id] = Math.min(ORDERS_PER_NODE, before + 1);
    this.state.ordersDone = (this.state.ordersDone || 0) + 1;
    if (before < ORDERS_PER_NODE && this.state.stars[id] === ORDERS_PER_NODE) {
      const idx = JOURNEY.findIndex((n) => n.id === id);
      const next = JOURNEY[idx + 1];
      this.toast(next ? `★★★ ${this.nodeName(id)} restored! ${next.name} unlocked` : `★★★ The kampong is whole!`);
      this.juice.sound('reward');
    }
    this.save();
  }

  dropItem(id) {
    if (this.board && this.board.firstEmpty()) {
      const spot = this.board.firstEmpty();
      this.state.board[`${spot.x},${spot.y}`] = id;
      this.board.render();
    } else {
      this.addCoins(itemValue(id)); // board full → convert to coins
    }
    this.save();
  }

  nodeName(id) { return JOURNEY.find((n) => n.id === id)?.name || id; }

  // --- screens -------------------------------------------------------------
  clear() { this.board?.unmount?.(); this.board = null; this.orders = null; this.screen.innerHTML = ''; }

  showJourney() {
    this.clear();
    this.view = 'journey';
    this.journey = new Journey(this);
    this.journey.mount(this.screen);
    this.renderTopbar();
  }

  enterNode(id) {
    this.state.node = id;
    this.save();
    this.showBoard();
    this.toast(`${this.nodeName(id)} — ${NODE_STORY[id] || ''}`, 3200);
  }

  showBoard() {
    this.clear();
    this.view = 'board';
    const wrap = document.createElement('div'); wrap.className = 'play';
    this.screen.appendChild(wrap);
    this.board = new Board(this);
    this.board.mount(wrap);
    this.orders = new Orders(this, this.board);
    this.orders.mount(wrap);
    this.onBoardChanged = () => this.orders?.render();
    this.renderTopbar();
  }

  // --- top bar -------------------------------------------------------------
  renderTopbar() {
    const s = this.state;
    const eTxt = s.energy >= ENERGY_MAX ? 'full' : fmt(msToNextEnergy(s));
    const chestReady = this.rewards.chestReadyIn() <= 0;
    this.topbar.innerHTML =
      `<button class="tb-btn ${this.view === 'board' ? '' : 'hide'}" id="tb-map" title="Journey map">🗺</button>` +
      `<div class="stat" title="Energy refills over time"><span class="stat-ic">⚡</span>${s.energy}/${ENERGY_MAX}<small>${eTxt}</small></div>` +
      `<div class="stat"><span class="stat-ic">🪙</span>${s.coins}</div>` +
      `<div class="stat"><span class="stat-ic">💎</span>${s.gems}</div>` +
      `<div class="stat lvl"><span class="stat-ic">Lv</span>${s.level}</div>` +
      `<div class="tb-right">` +
        `<button class="tb-btn ${chestReady ? 'glow' : ''}" id="tb-chest" title="Mystery box">📦</button>` +
        `<button class="tb-btn" id="tb-pass" title="Kampong Pass">🎖</button>` +
        `<button class="tb-btn" id="tb-mute" title="Sound">${this.juice.muted ? '🔇' : '🔊'}</button>` +
        `<button class="tb-btn" id="tb-home" title="Back to Panji Brunei (RTS)">🏰</button>` +
      `</div>`;
    const on = (id, fn) => { const b = this.topbar.querySelector(id); if (b) b.onclick = fn; };
    on('#tb-map', () => this.showJourney());
    on('#tb-chest', () => this.showChest());
    on('#tb-pass', () => this.showPass());
    on('#tb-mute', () => { this.juice.muted = !this.juice.muted; this.renderTopbar(); });
    on('#tb-home', () => { location.href = './index.html'; });
  }

  // --- modals --------------------------------------------------------------
  modal(html, buttons = [{ label: 'OK' }]) {
    const ov = document.createElement('div'); ov.className = 'modal-ov';
    const card = document.createElement('div'); card.className = 'modal';
    card.innerHTML = html;
    const row = document.createElement('div'); row.className = 'modal-btns';
    for (const b of buttons) {
      const btn = document.createElement('button');
      btn.className = 'modal-btn' + (b.primary ? ' primary' : '');
      btn.textContent = b.label;
      btn.onclick = () => { const keep = b.fn?.(); if (!keep) ov.remove(); };
      row.appendChild(btn);
    }
    card.appendChild(row); ov.appendChild(card); this.root.appendChild(ov);
    ov.addEventListener('click', (e) => { if (e.target === ov) ov.remove(); });
    return ov;
  }

  showDaily(d) {
    const rw = d.coins ? `+${d.coins} 🪙` : `+${d.gems} 💎`;
    this.modal(`<div class="m-title">Daily Reward</div><div class="m-big">Day ${d.streak} streak 🔥</div>` +
      `<div class="m-reward">${rw}</div><div class="m-sub">Come back tomorrow to keep the streak.</div>`);
    this.juice.sound('reward');
  }

  showChest() {
    const ready = this.rewards.chestReadyIn() <= 0;
    const cd = fmt(this.rewards.chestReadyIn());
    const body = `<div class="m-title">Mystery Box</div><div class="m-chest">📦</div>` +
      `<div class="m-sub">${ready ? 'A free box is ready!' : `Next free box in ${cd}`}</div>` +
      `<div class="m-sub small">In-game rewards only — no purchases.</div>`;
    const buttons = ready
      ? [{ label: 'Open free', primary: true, fn: () => { this.doChest(false); return false; } }, { label: 'Close' }]
      : [{ label: `Open · 8💎`, primary: true, fn: () => { this.doChest(true); return false; } }, { label: 'Close' }];
    this.chestOv = this.modal(body, buttons);
  }

  doChest(useGems) {
    const win = this.rewards.openChest(useGems);
    this.chestOv?.remove();
    if (win.error === 'cooldown') return;
    if (win.error === 'gems') { this.toast('Not enough gems'); this.juice.sound('error'); return; }
    const lbl = rewardLabel(win);
    const ov = this.modal(`<div class="m-title">You got…</div>` +
      `<div class="m-prize" style="--c:${lbl.color}"><div class="m-prize-ic">🎁</div><div class="m-prize-t">${lbl.text}</div>` +
      `<div class="m-prize-r ${win.rarity}">${win.rarity}</div></div>`);
    const r = ov.getBoundingClientRect();
    this.juice.burst(innerWidth / 2, innerHeight / 2, lbl.color, 30, 1.6);
    this.juice.shake(6); this.juice.sound(win.rarity === 'legendary' ? 'tier' : 'reward'); this.juice.haptic(30);
    this.renderTopbar();
  }

  showPass() {
    const items = this.rewards.passClaimable();
    const rows = items.map((m) => {
      const rw = (m.coins ? `+${m.coins}🪙 ` : '') + (m.gems ? `+${m.gems}💎` : '');
      const status = m.claimed ? '<span class="pass-claimed">claimed</span>'
        : m.unlocked ? `<button class="pass-claim" data-i="${m.i}">Claim</button>`
        : `<span class="pass-lock">${m.xp} xp</span>`;
      return `<div class="pass-row ${m.unlocked ? 'on' : ''}"><div class="pass-rw">${rw}</div>${status}</div>`;
    }).join('');
    const ov = this.modal(`<div class="m-title">Kampong Pass</div>` +
      `<div class="m-sub">Pass XP: ${this.state.pass.xp} — earn it by delivering orders.</div>` +
      `<div class="pass-track">${rows}</div>`, [{ label: 'Close' }]);
    for (const b of ov.querySelectorAll('.pass-claim')) {
      b.onclick = () => { if (this.rewards.claimPass(+b.dataset.i)) { this.juice.sound('reward'); this.juice.haptic(18); ov.remove(); this.showPass(); } };
    }
  }

  toast(msg, ms = 2200) {
    let t = document.getElementById('m-toast');
    if (!t) { t = document.createElement('div'); t.id = 'm-toast'; this.root.appendChild(t); }
    t.textContent = msg; t.classList.add('show');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => t.classList.remove('show'), ms);
  }
}

function fmt(ms) {
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

// expose for headless tests
window.__merge = new Game();
