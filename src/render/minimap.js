import { GRID, TileType, TICK_RATE } from '../sim/constants.js';
import factionsData from '../data/factions.json' with { type: 'json' };

const TILE_COLORS = {
  [TileType.GRASS]: '#5f7042',
  [TileType.EARTH]: '#7c6a4b',
  [TileType.SAND]: '#b2a078',
  [TileType.WATER]: '#2d5a50',
  [TileType.FORD]: '#8d9a6a',
  [TileType.JUNGLE]: '#3a4a2c',
  [TileType.GOLD]: '#c9a23b',
  [TileType.CAMPHOR]: '#9fb48a',
  [TileType.SAGO]: '#86a04e',
};

// Canvas minimap: baked terrain, fog overlay, unit dots, viewport box,
// attack pings. Left-click jumps the camera, right-click orders a move.
export class Minimap {
  constructor(sim, cameraRig, input, audio) {
    this.sim = sim;
    this.rig = cameraRig;
    this.input = input;
    this.audio = audio;
    this.pings = []; // {x, z, ttl}
    this.lastPingTick = -1e9;

    this.wrap = document.createElement('div');
    this.wrap.id = 'minimap-wrap';
    this.canvas = document.createElement('canvas');
    this.canvas.width = 192;
    this.canvas.height = 192;
    this.canvas.id = 'minimap';
    this.wrap.appendChild(this.canvas);
    document.body.appendChild(this.wrap);
    this.ctx = this.canvas.getContext('2d');

    // baked terrain layer (redrawn only when nodes deplete)
    this.baked = document.createElement('canvas');
    this.baked.width = this.sim.grid.size;
    this.baked.height = this.sim.grid.size;
    this.bakeTerrain();

    const toWorld = (ev) => {
      const r = this.canvas.getBoundingClientRect();
      return {
        x: ((ev.clientX - r.left) / r.width) * this.sim.grid.size,
        z: ((ev.clientY - r.top) / r.height) * this.sim.grid.size,
      };
    };
    this.canvas.addEventListener('mousedown', (ev) => {
      ev.preventDefault();
      const p = toWorld(ev);
      if (ev.button === 0) {
        this.rig.target.x = p.x;
        this.rig.target.z = p.z;
      } else if (ev.button === 2) {
        this.sim.cmdContext(this.input.selectionIds(), p.x, p.z, -1);
      }
    });
    this.canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());

    // touch: tap jumps the camera, drag scrubs across the map
    const touchJump = (ev) => {
      ev.preventDefault();
      const t = ev.changedTouches[0];
      const p = toWorld(t);
      this.rig.target.x = p.x;
      this.rig.target.z = p.z;
    };
    this.canvas.addEventListener('touchstart', touchJump, { passive: false });
    this.canvas.addEventListener('touchmove', touchJump, { passive: false });

    setInterval(() => this.draw(), 250);
  }

  bakeTerrain() {
    const ctx = this.baked.getContext('2d');
    const grid = this.sim.grid;
    for (let z = 0; z < this.sim.grid.size; z++) {
      for (let x = 0; x < this.sim.grid.size; x++) {
        ctx.fillStyle = TILE_COLORS[grid.typeAt(x, z)] ?? '#000';
        ctx.fillRect(x, z, 1, 1);
      }
    }
  }

  onEvent(ev) {
    if (ev.type === 'node-depleted') {
      const ctx = this.baked.getContext('2d');
      ctx.fillStyle = TILE_COLORS[TileType.GRASS];
      ctx.fillRect(ev.x, ev.z, 1, 1);
    }
    // attack warning ping: own things taking hits, rate-limited
    if (ev.type === 'damaged' && ev.owner === 0) {
      if (this.sim.tick - this.lastPingTick > 8 * TICK_RATE) {
        this.lastPingTick = this.sim.tick;
        this.pings.push({ x: ev.x, z: ev.z, ttl: 3 });
        this.audio?.play('attack_warning');
      }
    }
  }

  draw() {
    const { ctx, sim } = this;
    const S = this.canvas.width / this.sim.grid.size;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.baked, 0, 0, this.canvas.width, this.canvas.height);

    // fog: unexplored black, explored dim
    const vis = sim.fog.visible[0];
    const exp = sim.fog.explored[0];
    ctx.fillStyle = 'rgba(0,0,0,0.92)';
    for (let z = 0; z < this.sim.grid.size; z += 2) {
      for (let x = 0; x < this.sim.grid.size; x += 2) {
        if (!exp[z * this.sim.grid.size + x]) ctx.fillRect(x * S, z * S, S * 2, S * 2);
      }
    }
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    for (let z = 0; z < this.sim.grid.size; z += 2) {
      for (let x = 0; x < this.sim.grid.size; x += 2) {
        const i = z * this.sim.grid.size + x;
        if (exp[i] && !vis[i]) ctx.fillRect(x * S, z * S, S * 2, S * 2);
      }
    }

    // entities
    sim.pool.forEach((e) => {
      if (e.owner < 0) return;
      if (e.kind !== 'unit' && e.kind !== 'building') return;
      if (!sim.isVisibleToPlayer(0, e)) return;
      // clear friend/foe colours: you are green, every enemy is red
      const color = e.owner === 0 ? '#3ee07a' : '#ff4136';
      ctx.fillStyle = color;
      if (e.kind === 'building') {
        const s = Math.max(3, e.size * S);
        ctx.fillRect(e.x * S - s / 2, e.z * S - s / 2, s, s);
        if (e.protoId === 'istana' || e.protoId === 'mahkota_monument') {
          ctx.strokeStyle = '#fff';
          ctx.strokeRect(e.x * S - s / 2, e.z * S - s / 2, s, s);
        }
      } else {
        ctx.fillRect(e.x * S - 1, e.z * S - 1, 2.5, 2.5);
      }
    });

    // viewport box
    const halfW = this.rig.dist * 0.8;
    const halfH = this.rig.dist * 0.55;
    ctx.strokeStyle = 'rgba(240,230,200,0.8)';
    ctx.lineWidth = 1;
    ctx.strokeRect(
      (this.rig.target.x - halfW / 2) * S,
      (this.rig.target.z - halfH / 2) * S,
      halfW * S,
      halfH * S
    );

    // pings
    for (let i = this.pings.length - 1; i >= 0; i--) {
      const p = this.pings[i];
      p.ttl -= 0.25;
      if (p.ttl <= 0) {
        this.pings.splice(i, 1);
        continue;
      }
      const r = (3 - p.ttl) * 6 + 3;
      ctx.strokeStyle = `rgba(224, 90, 60, ${Math.min(1, p.ttl)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x * S, p.z * S, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}
