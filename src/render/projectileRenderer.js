import * as THREE from 'three';
import { WATER_LEVEL } from '../sim/constants.js';

// Pooled projectile visuals: thin arrows for archers/towers, dark iron
// balls for lela cannons (splash > 0). Arced flight is render-side flavor.
export class ProjectileRenderer {
  constructor(scene, sim) {
    this.sim = sim;
    this.arrowMat = new THREE.MeshBasicMaterial({ color: 0x4a3a26 });
    this.ballMat = new THREE.MeshBasicMaterial({ color: 0x33312c });
    this.spearMat = new THREE.MeshBasicMaterial({ color: 0x6b4a2f });
    this.arrows = new THREE.InstancedMesh(new THREE.BoxGeometry(0.035, 0.035, 0.55), this.arrowMat, 240);
    this.balls = new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 6, 5), this.ballMat, 80);
    // javelins: longer, thicker shaft so they read as thrown spears
    this.spears = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.022, 0.01, 0.85, 5), this.spearMat, 120);
    this.spears.geometry.rotateX(Math.PI / 2); // lie along +Z
    for (const inst of [this.arrows, this.balls, this.spears]) {
      inst.frustumCulled = false;
      inst.count = 0;
      inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(inst);
    }
    this.mat = new THREE.Matrix4();
    this.pos = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.euler = new THREE.Euler();
    this.scale = new THREE.Vector3(1, 1, 1);
  }

  groundY(x, z) {
    const g = this.sim.grid.heightAt(x, z);
    return Math.max(g, WATER_LEVEL);
  }

  update(alpha, isVisible) {
    let nArrow = 0;
    let nBall = 0;
    let nSpear = 0;
    this.sim.pool.forEach((e) => {
      if (e.kind !== 'proj') return;
      if (isVisible && !isVisible(e)) return;
      const ix = e.prevX + (e.x - e.prevX) * alpha;
      const iz = e.prevZ + (e.z - e.prevZ) * alpha;
      const total = Math.hypot(e.projX1 - e.projX0, e.projZ1 - e.projZ0) || 1;
      const traveled = Math.hypot(ix - e.projX0, iz - e.projZ0);
      const p = Math.min(1, traveled / total);
      const arcH = e.projArc ? 0.25 + total * 0.1 : 0.06;
      const y0 = this.groundY(e.projX0, e.projZ0) + 0.7;
      const y1 = this.groundY(e.projX1, e.projZ1) + 0.5;
      const y = y0 + (y1 - y0) * p + Math.sin(p * Math.PI) * arcH;

      const inst = e.projSplash > 0 ? this.balls : e.projThrown ? this.spears : this.arrows;
      const idx = inst === this.balls ? nBall : inst === this.spears ? nSpear : nArrow;
      if (idx >= inst.instanceMatrix.count) return;

      this.pos.set(ix, y, iz);
      // pitch follows the arc slope
      const slope = Math.cos(p * Math.PI) * arcH * Math.PI / Math.max(1, total);
      this.euler.set(-slope * 2, e.facing, 0);
      this.quat.setFromEuler(this.euler);
      this.mat.compose(this.pos, this.quat, this.scale);
      inst.setMatrixAt(idx, this.mat);
      if (inst === this.balls) nBall++;
      else if (inst === this.spears) nSpear++;
      else nArrow++;
    });
    this.arrows.count = nArrow;
    this.balls.count = nBall;
    this.spears.count = nSpear;
    this.arrows.instanceMatrix.needsUpdate = true;
    this.balls.instanceMatrix.needsUpdate = true;
    this.spears.instanceMatrix.needsUpdate = true;
  }
}
