import * as THREE from 'three';
import { GRID } from '../sim/constants.js';

// Animated flames over burning ground tiles and burning buildings. Two
// instanced cones (outer orange, inner yellow) flicker per-flame; smoke is a
// faint instanced sprite drifting up. Cheap and reads clearly as fire.
const MAX_FLAMES = 360;

export class FireRenderer {
  constructor(scene, sim) {
    this.sim = sim;
    const outerGeo = new THREE.ConeGeometry(0.24, 0.66, 5);
    outerGeo.translate(0, 0.33, 0);
    const innerGeo = new THREE.ConeGeometry(0.13, 0.42, 5);
    innerGeo.translate(0, 0.21, 0);
    this.outer = new THREE.InstancedMesh(
      outerGeo,
      new THREE.MeshBasicMaterial({ color: 0xe2641e, transparent: true, opacity: 0.92, depthWrite: false }),
      MAX_FLAMES
    );
    this.inner = new THREE.InstancedMesh(
      innerGeo,
      new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.95, depthWrite: false }),
      MAX_FLAMES
    );
    for (const m of [this.outer, this.inner]) {
      m.frustumCulled = false;
      m.count = 0;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.renderOrder = 6;
      scene.add(m);
    }
    this.mat = new THREE.Matrix4();
    this.pos = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.scl = new THREE.Vector3();
  }

  flame(n, x, y, z, t, seed, big) {
    if (n >= MAX_FLAMES) return n;
    const fl = 0.78 + 0.45 * Math.sin(t * 11 + seed * 3.3) * Math.cos(t * 7 + seed);
    const sx = (big ? 1.5 : 1) * (0.85 + 0.1 * Math.sin(t * 9 + seed));
    const sy = (big ? 1.7 : 1) * fl;
    this.pos.set(x + Math.sin(t * 6 + seed) * 0.03, y, z + Math.cos(t * 5 + seed) * 0.03);
    this.quat.identity();
    this.scl.set(sx, sy, sx);
    this.mat.compose(this.pos, this.quat, this.scl);
    this.outer.setMatrixAt(n, this.mat);
    this.scl.set(sx * 0.8, sy * 0.85, sx * 0.8);
    this.mat.compose(this.pos, this.quat, this.scl);
    this.inner.setMatrixAt(n, this.mat);
    return n + 1;
  }

  update(time, isVisible) {
    const sim = this.sim;
    const grid = sim.grid;
    let n = 0;

    // ground fires (only those the player can currently see)
    for (const idx of sim.fire.tiles.keys()) {
      const tx = idx % grid.size;
      const tz = (idx / grid.size) | 0;
      if (!sim.fog.tileVisible(0, tx, tz) && !sim.fog.tileExplored(0, tx, tz)) continue;
      const y = grid.heightAt(tx + 0.5, tz + 0.5);
      n = this.flame(n, tx + 0.5, y, tz + 0.5, time, idx * 0.13, false);
      if (n >= MAX_FLAMES) break;
    }

    // burning buildings — a cluster of bigger flames across the footprint
    sim.pool.forEach((b) => {
      if (b.kind !== 'building' || !b.burning || b.burning <= 0) return;
      if (isVisible && !isVisible(b)) return;
      const y = grid.heightAt(b.x, b.z);
      const spots = Math.min(4, Math.ceil(b.size));
      for (let i = 0; i < spots && n < MAX_FLAMES; i++) {
        const a = (i / spots) * Math.PI * 2 + b.id;
        const r = b.size * 0.32;
        n = this.flame(n, b.x + Math.cos(a) * r, y + 0.3, b.z + Math.sin(a) * r, time, b.id * 0.7 + i, true);
      }
    });

    this.outer.count = n;
    this.inner.count = n;
    this.outer.instanceMatrix.needsUpdate = true;
    this.inner.instanceMatrix.needsUpdate = true;
  }
}
