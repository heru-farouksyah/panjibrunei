import * as THREE from 'three';
import { TileTypeName } from '../sim/constants.js';

// F3 debug overlay: FPS, sim tick rate, draw calls, entity count, and the
// grid tile under the cursor (raycast against the terrain mesh).
export class DebugOverlay {
  constructor(gameRenderer, sim) {
    this.gr = gameRenderer;
    this.sim = sim;
    this.el = document.getElementById('debug-overlay');
    this.visible = false;
    this.fps = 60;
    this.tickCount = 0;
    this.tps = 0;
    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2(-2, -2);
    this.cursorTile = null;

    window.addEventListener('keydown', (e) => {
      if (e.code === 'F3') {
        e.preventDefault();
        this.visible = !this.visible;
        this.el.style.display = this.visible ? 'block' : 'none';
      }
    });

    window.addEventListener('mousemove', (e) => {
      this.ndc.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.ndc.y = -(e.clientY / window.innerHeight) * 2 + 1;
    });

    setInterval(() => {
      this.tps = this.tickCount;
      this.tickCount = 0;
    }, 1000);
    setInterval(() => this.refresh(), 250);
  }

  markTicks(n) {
    this.tickCount += n;
  }

  frame(dtMs) {
    if (dtMs > 0) this.fps += ((1000 / dtMs) - this.fps) * 0.05;
  }

  refresh() {
    if (!this.visible) return;

    this.raycaster.setFromCamera(this.ndc, this.gr.camera);
    const hit = this.raycaster.intersectObject(this.gr.terrain, false)[0];
    if (hit) {
      const tx = Math.floor(hit.point.x);
      const tz = Math.floor(hit.point.z);
      this.cursorTile = { tx, tz, type: this.sim.grid.typeAt(tx, tz) };
    } else {
      this.cursorTile = null;
    }

    const info = this.gr.info.render;
    const cursor = this.cursorTile
      ? `${this.cursorTile.tx}, ${this.cursorTile.tz} (${TileTypeName[this.cursorTile.type]})`
      : '—';
    let aliveCount = 0;
    for (const e of this.sim.entities) if (e.alive) aliveCount++;
    this.el.textContent =
      `FPS        ${this.fps.toFixed(0)}\n` +
      `Tick rate  ${this.tps}/s (tick ${this.sim.tick})\n` +
      `Draw calls ${info.calls}\n` +
      `Triangles  ${info.triangles.toLocaleString()}\n` +
      `Entities   ${aliveCount}\n` +
      `Cursor     ${cursor}`;
  }
}
