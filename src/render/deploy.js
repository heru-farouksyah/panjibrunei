import { iconSVG } from './icons.js';

// Pre-battle DEPLOYMENT phase. The player is given an army as a diamond-shaped
// "card" of items; they pick an item, then click/tap the map inside their
// territory to place it where they like. Items can be left unplaced. When
// happy, they press Start Battle. The match is paused throughout.
const DEPLOY_ITEMS = [
  { id: 'pahlawan_kampilan', kind: 'unit', name: 'Swordsman', n: 5, pos: 'top' },
  { id: 'pemanah', kind: 'unit', name: 'Archer', n: 5, pos: 'left' },
  { id: 'kubu', kind: 'building', name: 'Watchtower', n: 1, pos: 'right' },
  { id: 'lela_gunner', kind: 'unit', name: 'Destroyer', n: 1, pos: 'bottom' },
];

const TERRITORY_R = 14; // how far from the Istana you may deploy

export class DeployController {
  constructor(sim, input, cameraRig, onStart) {
    this.sim = sim;
    this.input = input;
    this.rig = cameraRig;
    this.onStart = onStart;
    this.items = DEPLOY_ITEMS.map((it) => ({ ...it }));
    this.selected = null;

    // centre the camera on the player's base so the territory is in view
    const s = sim.grid.startZones[0];
    this.base = { x: s.x + 0.5, z: s.y + 0.5 };
    cameraRig.target.x = this.base.x;
    cameraRig.target.z = this.base.z + 2;
    cameraRig.targetDist = cameraRig.dist = 26;

    this.buildPanel();
  }

  buildPanel() {
    const wrap = document.createElement('div');
    wrap.id = 'deploy-wrap';
    wrap.innerHTML =
      `<div class="deploy-hint">Place your forces, Panglima — tap an item, then tap the ground inside your land. Skip any you don't want.</div>` +
      `<div class="deploy-diamond"></div>` +
      `<div class="deploy-actions">` +
        `<button class="deploy-auto">Auto-place rest</button>` +
        `<button class="deploy-start">Start Battle ›</button>` +
      `</div>`;
    document.body.appendChild(wrap);
    this.wrap = wrap;
    this.diamond = wrap.querySelector('.deploy-diamond');
    wrap.querySelector('.deploy-start').onclick = () => this.finish();
    wrap.querySelector('.deploy-auto').onclick = () => this.autoPlace();
    this.renderChips();
  }

  renderChips() {
    this.diamond.innerHTML = '';
    for (const it of this.items) {
      const chip = document.createElement('button');
      chip.className = `deploy-chip pos-${it.pos}${this.selected === it ? ' sel' : ''}`;
      chip.disabled = it.n <= 0;
      chip.innerHTML =
        `<span class="dc-ic">${iconSVG(it.id, 28)}</span>` +
        `<span class="dc-name">${it.name}</span>` +
        `<span class="dc-n">×${it.n}</span>`;
      chip.onclick = () => this.select(it);
      this.diamond.appendChild(chip);
    }
  }

  select(it) {
    if (it.n <= 0) return;
    this.selected = it;
    this.renderChips();
    this.input.setMode('place');
    this.input.placeHandler = (p) => this.tryPlace(p);
  }

  inTerritory(x, z) {
    return Math.hypot(x - this.base.x, z - this.base.z) <= TERRITORY_R;
  }

  tryPlace(p) {
    const it = this.selected;
    if (!p || !it || it.n <= 0) return;
    if (!this.inTerritory(p.x, p.z)) {
      this.flashHint('Place inside your own territory.');
      return;
    }
    let ok = false;
    if (it.kind === 'building') {
      const tx = Math.round(p.x - 0.5);
      const tz = Math.round(p.z - 0.5);
      if (this.sim.canPlace(it.id, tx, tz)) {
        this.sim.spawnBuilding(it.id, 0, tx, tz, true);
        ok = true;
      } else {
        this.flashHint('Cannot build there.');
      }
    } else {
      if (this.sim.grid.isLandPassable(p.x | 0, p.z | 0)) {
        this.sim.spawnUnit(it.id, 0, p.x, p.z);
        ok = true;
      } else {
        this.flashHint('Cannot stand there.');
      }
    }
    if (ok) {
      it.n--;
      if (it.n <= 0) {
        this.selected = null;
        this.input.setMode('normal');
      }
      this.renderChips();
    }
  }

  // Scatter all remaining items around the base automatically.
  autoPlace() {
    const s = this.base;
    for (const it of this.items) {
      let guard = 0;
      while (it.n > 0 && guard++ < 60) {
        const a = Math.random() * Math.PI * 2;
        const r = 4 + Math.random() * 8;
        const x = s.x + Math.cos(a) * r;
        const z = s.z + Math.sin(a) * r;
        if (it.kind === 'building') {
          const tx = Math.round(x - 0.5);
          const tz = Math.round(z - 0.5);
          if (this.sim.canPlace(it.id, tx, tz)) {
            this.sim.spawnBuilding(it.id, 0, tx, tz, true);
            it.n--;
          }
        } else if (this.sim.grid.isLandPassable(x | 0, z | 0)) {
          this.sim.spawnUnit(it.id, 0, x, z);
          it.n--;
        }
      }
    }
    this.renderChips();
  }

  flashHint(msg) {
    const h = this.wrap.querySelector('.deploy-hint');
    h.textContent = msg;
    h.classList.add('warn');
    clearTimeout(this._ht);
    this._ht = setTimeout(() => {
      h.classList.remove('warn');
      h.textContent = "Place your forces, Panglima — tap an item, then tap the ground inside your land.";
    }, 1800);
  }

  finish() {
    this.input.setMode('normal');
    this.input.placeHandler = null;
    this.wrap.remove();
    this.onStart();
  }
}
