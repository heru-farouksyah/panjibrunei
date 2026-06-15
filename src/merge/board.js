// The merge board — the core loop (component #1). Drag one item onto an
// identical one to fuse them into the next tier, with a pop, particles, sound,
// haptics and (on big merges) screen-shake. Generators spawn raw items on a
// cooldown for energy (component #3 feeds the loop here).
import { CHAINS, GENERATORS, parseItem, maxTier, itemId, itemName, itemColor, itemValue } from './data.js';

const isGen = (v) => typeof v === 'string' && v.startsWith('gen:');
const genId = (v) => v.slice(4);

export class Board {
  constructor(game) {
    this.game = game;
    this.s = game.state;
    this.cooldown = {}; // genId -> ready timestamp
    this.drag = null;
  }

  mount(container) {
    this.el = document.createElement('div');
    this.el.className = 'board';
    container.appendChild(this.el);
    this.el.style.setProperty('--cols', this.s.cols);
    this.el.style.setProperty('--rows', this.s.rows);
    this.cells = [];
    for (let y = 0; y < this.s.rows; y++) {
      for (let x = 0; x < this.s.cols; x++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.x = x; cell.dataset.y = y;
        this.el.appendChild(cell);
        this.cells.push(cell);
      }
    }
    this.el.addEventListener('pointerdown', (e) => this.onDown(e));
    this._mv = (e) => this.onMove(e);
    this._up = (e) => this.onUp(e);
    addEventListener('pointermove', this._mv);
    addEventListener('pointerup', this._up);
    this.render();
    this._cdTimer = setInterval(() => this.refreshGenReady(), 200);
  }

  unmount() {
    clearInterval(this._cdTimer);
    removeEventListener('pointermove', this._mv);
    removeEventListener('pointerup', this._up);
    this.ghost?.remove();
    this.el?.remove();
  }

  key(x, y) { return `${x},${y}`; }
  at(x, y) { return this.s.board[this.key(x, y)]; }
  cellEl(x, y) { return this.cells[y * this.s.cols + x]; }

  cellFromPoint(px, py) {
    const r = this.el.getBoundingClientRect();
    const cw = r.width / this.s.cols, ch = r.height / this.s.rows;
    const x = Math.floor((px - r.left) / cw), y = Math.floor((py - r.top) / ch);
    if (x < 0 || y < 0 || x >= this.s.cols || y >= this.s.rows) return null;
    return { x, y };
  }

  render() {
    for (let y = 0; y < this.s.rows; y++) {
      for (let x = 0; x < this.s.cols; x++) {
        const cell = this.cellEl(x, y);
        const v = this.at(x, y);
        cell.innerHTML = '';
        if (!v) continue;
        if (isGen(v)) {
          const g = GENERATORS[genId(v)];
          const node = document.createElement('div');
          node.className = 'tile gen';
          node.style.setProperty('--c', CHAINS[g.chain].color);
          node.innerHTML = `<div class="tile-ic">${this.icon(g.chain)}</div>` +
            `<div class="tile-name">${g.name}</div><div class="gen-cost">⚡${g.cost}</div>` +
            `<div class="gen-cd"></div>`;
          cell.appendChild(node);
        } else {
          const { chain, tier } = parseItem(v);
          const node = document.createElement('div');
          node.className = 'tile item';
          node.style.setProperty('--c', itemColor(v));
          node.innerHTML = `<div class="tile-ic">${this.icon(chain)}</div>` +
            `<div class="tile-name">${itemName(v)}</div>` +
            `<div class="tile-tier">${'•'.repeat(tier + 1)}</div>`;
          cell.appendChild(node);
        }
      }
    }
    this.refreshGenReady();
  }

  icon(chain) {
    // tiny inline SVG glyph per chain
    const c = CHAINS[chain].color;
    if (chain === 'wood') return `<svg viewBox="0 0 24 24" width="30" height="30"><rect x="9" y="4" width="6" height="16" rx="2" fill="${c}"/><path d="M6 9l6-4 6 4" stroke="#3c7a3a" stroke-width="3" fill="none"/></svg>`;
    if (chain === 'sago') return `<svg viewBox="0 0 24 24" width="30" height="30"><circle cx="12" cy="13" r="7" fill="${c}"/><path d="M12 6V2M9 7L6 4M15 7l3-3" stroke="#7a9a3a" stroke-width="2"/></svg>`;
    if (chain === 'stone') return `<svg viewBox="0 0 24 24" width="30" height="30"><path d="M5 16l3-8 7-2 4 6-3 6z" fill="${c}" stroke="#5c6066" stroke-width="1.5"/></svg>`;
    return `<svg viewBox="0 0 24 24" width="30" height="30"><path d="M4 12c4-5 12-5 16 0-4 5-12 5-16 0z" fill="${c}"/><circle cx="15" cy="11" r="1.4" fill="#0a2630"/></svg>`;
  }

  refreshGenReady() {
    const now = Date.now();
    for (let i = 0; i < this.cells.length; i++) {
      const cd = this.cells[i].querySelector('.gen-cd');
      if (!cd) continue;
      const x = i % this.s.cols, y = (i / this.s.cols) | 0;
      const v = this.at(x, y);
      const ready = (this.cooldown[genId(v)] ?? 0) <= now;
      cd.parentElement.classList.toggle('cooling', !ready);
    }
  }

  // --- drag / tap -----------------------------------------------------------
  onDown(e) {
    const c = this.cellFromPoint(e.clientX, e.clientY);
    if (!c) return;
    const v = this.at(c.x, c.y);
    if (!v) return;
    this.down = { ...c, v, sx: e.clientX, sy: e.clientY, moved: false };
    if (!isGen(v)) {
      // start a drag ghost (created lazily on first move)
      e.preventDefault();
    }
  }

  onMove(e) {
    if (!this.down) return;
    if (Math.hypot(e.clientX - this.down.sx, e.clientY - this.down.sy) > 6) this.down.moved = true;
    if (isGen(this.down.v) || !this.down.moved) return;
    if (!this.ghost) {
      this.ghost = this.cellEl(this.down.x, this.down.y).firstChild.cloneNode(true);
      this.ghost.className = 'tile item ghost';
      document.body.appendChild(this.ghost);
      this.cellEl(this.down.x, this.down.y).firstChild.style.opacity = '0.3';
    }
    this.ghost.style.left = e.clientX + 'px';
    this.ghost.style.top = e.clientY + 'px';
    const t = this.cellFromPoint(e.clientX, e.clientY);
    for (const cell of this.cells) cell.classList.remove('hot');
    if (t) {
      const tv = this.at(t.x, t.y);
      if (tv === this.down.v && !isGen(tv) && parseItem(tv).tier < maxTier(parseItem(tv).chain)) {
        this.cellEl(t.x, t.y).classList.add('hot');
      }
    }
  }

  onUp(e) {
    if (!this.down) return;
    const down = this.down; this.down = null;
    for (const cell of this.cells) cell.classList.remove('hot');
    if (this.ghost) { this.ghost.remove(); this.ghost = null; }
    const src = this.cellEl(down.x, down.y).firstChild;
    if (src) src.style.opacity = '';

    if (isGen(down.v) && !down.moved) { this.tapGen(down.x, down.y); return; }
    if (!down.moved) return;

    const t = this.cellFromPoint(e.clientX, e.clientY);
    if (!t || (t.x === down.x && t.y === down.y)) return;
    const tv = this.at(t.x, t.y);
    if (tv === undefined || tv === null || tv === '') {
      this.move(down.x, down.y, t.x, t.y);
    } else if (tv === down.v && !isGen(tv)) {
      this.merge(down.x, down.y, t.x, t.y);
    } else if (!isGen(tv) && !isGen(down.v)) {
      this.swap(down.x, down.y, t.x, t.y);
    }
  }

  move(x0, y0, x1, y1) {
    this.s.board[this.key(x1, y1)] = this.s.board[this.key(x0, y0)];
    delete this.s.board[this.key(x0, y0)];
    this.render(); this.game.save();
  }

  swap(x0, y0, x1, y1) {
    const a = this.s.board[this.key(x0, y0)], b = this.s.board[this.key(x1, y1)];
    this.s.board[this.key(x0, y0)] = b; this.s.board[this.key(x1, y1)] = a;
    this.render(); this.game.save();
  }

  merge(x0, y0, x1, y1) {
    const v = this.at(x1, y1);
    const { chain, tier } = parseItem(v);
    if (tier >= maxTier(chain)) return;
    const next = itemId(chain, tier + 1);
    delete this.s.board[this.key(x0, y0)];
    this.s.board[this.key(x1, y1)] = next;

    const fresh = !this.s.discovered[next];
    this.game.discover(next);
    this.game.addXp(2 + tier);
    this.render();
    this.game.save();

    // juice
    const cell = this.cellEl(x1, y1);
    const r = cell.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const j = this.game.juice;
    this.game.juice.pop(cell.firstChild, 1.4);
    if (tier + 1 >= 3) { j.burst(cx, cy, itemColor(next), 26, 1.5); j.shake(7); j.sound('tier'); j.haptic(28); }
    else { j.burst(cx, cy, itemColor(next), 14, 1); j.sound('merge'); j.haptic(12); }
    if (fresh) this.game.toast(`New! ${itemName(next)} discovered`);
    this.game.onBoardChanged?.();
  }

  tapGen(x, y) {
    const gid = genId(this.at(x, y));
    const g = GENERATORS[gid];
    const now = Date.now();
    if ((this.cooldown[gid] ?? 0) > now) { this.game.juice.sound('error'); return; }
    if (!this.game.spendEnergy(g.cost)) { this.game.toast('Out of energy — it refills over time'); this.game.juice.sound('error'); this.game.juice.haptic(20); return; }
    const spot = this.firstEmpty();
    if (!spot) { this.game.addEnergy(g.cost); this.game.toast('Board is full — merge to make room'); return; }
    const tier = g.spawn[(Math.random() * g.spawn.length) | 0];
    const id = itemId(g.chain, tier);
    this.s.board[this.key(spot.x, spot.y)] = id;
    this.game.discover(id);
    this.cooldown[gid] = now + g.cooldownMs;
    this.render();
    this.game.save();
    const cell = this.cellEl(spot.x, spot.y);
    const r = cell.getBoundingClientRect();
    this.game.juice.pop(cell.firstChild, 1.3);
    this.game.juice.burst(r.left + r.width / 2, r.top + r.height / 2, CHAINS[g.chain].color, 8, 0.8);
    this.game.juice.sound('spawn'); this.game.juice.haptic(8);
    this.game.onBoardChanged?.();
  }

  firstEmpty() {
    for (let y = 0; y < this.s.rows; y++)
      for (let x = 0; x < this.s.cols; x++)
        if (!this.at(x, y)) return { x, y };
    return null;
  }

  // count how many of an item are on the board (used by orders)
  countItem(id) {
    let n = 0;
    for (const v of Object.values(this.s.board)) if (v === id) n++;
    return n;
  }

  // consume n of an item (for fulfilling an order); returns true if it had enough
  consume(id, n) {
    if (this.countItem(id) < n) return false;
    for (const k of Object.keys(this.s.board)) {
      if (n <= 0) break;
      if (this.s.board[k] === id) { delete this.s.board[k]; n--; }
    }
    this.render(); this.game.save();
    return true;
  }
}
