import * as THREE from 'three';

// Placeholder VFX for ultimates and statuses: simple shapes and particles in
// faction colors, driven by sim events. Each effect is an object with
// update(dt, alpha) -> bool (false = done).

function basicMat(color, opacity = 0.7) {
  return new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide,
  });
}

class RingPulse {
  constructor(scene, sim, x, z, color, maxR = 5, dur = 0.9) {
    this.scene = scene;
    this.dur = dur;
    this.t = 0;
    this.maxR = maxR;
    const y = Math.max(sim.grid.heightAt(x, z), 0.18) + 0.08;
    this.mesh = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 36), basicMat(color, 0.85));
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.set(x, y, z);
    scene.add(this.mesh);
  }
  update(dt) {
    this.t += dt;
    const p = this.t / this.dur;
    if (p >= 1) {
      this.scene.remove(this.mesh);
      return false;
    }
    const s = 0.2 + p * this.maxR;
    this.mesh.scale.set(s, s, 1);
    this.mesh.material.opacity = 0.85 * (1 - p);
    return true;
  }
}

class CrackDecal {
  constructor(scene, sim, x, z, dur = 10) {
    this.scene = scene;
    this.dur = dur;
    this.t = 0;
    this.group = new THREE.Group();
    const y = sim.grid.heightAt(x, z) + 0.04;
    const dark = basicMat(0x1c1812, 0.8);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.1, 16), dark);
    disc.rotation.x = -Math.PI / 2;
    this.group.add(disc);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.4;
      const len = 1.2 + (i % 3) * 0.5;
      const crack = new THREE.Mesh(new THREE.PlaneGeometry(0.12, len), dark);
      crack.rotation.x = -Math.PI / 2;
      crack.rotation.z = a;
      crack.position.set(Math.sin(a) * len * 0.5, 0.005, Math.cos(a) * len * 0.5);
      this.group.add(crack);
    }
    this.group.position.set(x, y, z);
    scene.add(this.group);
  }
  update(dt) {
    this.t += dt;
    if (this.t >= this.dur) {
      this.scene.remove(this.group);
      return false;
    }
    if (this.t > this.dur - 2) {
      const fade = (this.dur - this.t) / 2;
      this.group.traverse((n) => {
        if (n.material) n.material.opacity = 0.8 * fade;
      });
    }
    return true;
  }
}

// Follows a living entity (shield bubble, ember flame, mark ring).
class Follower {
  constructor(scene, sim, id, mesh, dur, yOff = 0.5, spin = 0) {
    this.scene = scene;
    this.sim = sim;
    this.id = id;
    this.mesh = mesh;
    this.dur = dur;
    this.t = 0;
    this.yOff = yOff;
    this.spin = spin;
    scene.add(mesh);
  }
  update(dt, alpha) {
    this.t += dt;
    const e = this.sim.pool.get(this.id);
    if (this.t >= this.dur || !e) {
      this.scene.remove(this.mesh);
      return false;
    }
    const ix = e.prevX + (e.x - e.prevX) * alpha;
    const iz = e.prevZ + (e.z - e.prevZ) * alpha;
    const y = e.proto.domain === 'water' ? 0.2 : this.sim.grid.heightAt(ix, iz);
    this.mesh.position.set(ix, y + this.yOff, iz);
    if (this.spin) this.mesh.rotation.y += this.spin * dt;
    return true;
  }
}

class Swirl {
  constructor(scene, sim, x, z, color, dur = 2) {
    this.scene = scene;
    this.dur = dur;
    this.t = 0;
    this.group = new THREE.Group();
    this.bits = [];
    for (let i = 0; i < 8; i++) {
      const bit = new THREE.Mesh(new THREE.SphereGeometry(0.07, 5, 4), basicMat(color, 0.9));
      this.group.add(bit);
      this.bits.push(bit);
    }
    this.group.position.set(x, sim.grid.heightAt(x, z), z);
    scene.add(this.group);
  }
  update(dt) {
    this.t += dt;
    const p = this.t / this.dur;
    if (p >= 1) {
      this.scene.remove(this.group);
      return false;
    }
    for (let i = 0; i < this.bits.length; i++) {
      const a = p * 7 + (i / this.bits.length) * Math.PI * 2;
      const r = 0.6 - p * 0.3;
      this.bits[i].position.set(Math.cos(a) * r, 0.2 + p * 1.4, Math.sin(a) * r);
      this.bits[i].material.opacity = 0.9 * (1 - p);
    }
    return true;
  }
}

const ULT_COLORS = {
  kekuatan_gergasi: 0xb05030,
  serbuan_berani_mati: 0xc23a3a,
  perintah_adil: 0x6fc3e0,
  lidah_pujangga: 0x9fc3e8,
  bara_perjuangan: 0xe08a3a,
  mata_strategi: 0x3fd9c8,
};

export class VFX {
  constructor(scene, sim) {
    this.scene = scene;
    this.sim = sim;
    this.effects = [];
  }

  onEvent(ev) {
    const { scene, sim } = this;
    switch (ev.type) {
      case 'ultimate': {
        const color = ULT_COLORS[ev.ultId] ?? 0xffffff;
        this.effects.push(new RingPulse(scene, sim, ev.x, ev.z, color, ev.ultId === 'mata_strategi' ? 14 : 6, 1.1));
        if (ev.ultId === 'kekuatan_gergasi') {
          this.effects.push(new CrackDecal(scene, sim, ev.x, ev.z));
        }
        break;
      }
      case 'shielded': {
        const bubble = new THREE.Mesh(
          new THREE.IcosahedronGeometry(0.55, 1),
          basicMat(0x6fc3e0, 0.28)
        );
        this.effects.push(new Follower(scene, sim, ev.id, bubble, 15, 0.5, 0.8));
        break;
      }
      case 'converted':
        this.effects.push(new Swirl(scene, sim, ev.x, ev.z, 0x9fc3e8, 2));
        break;
      case 'transformed': {
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.4, 6), basicMat(0xe08a3a, 0.85));
        this.effects.push(new Follower(scene, sim, ev.id, flame, 20, 1.25, 3));
        break;
      }
      case 'marked': {
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.3, 18), basicMat(0x3fd9c8, 0.95));
        ring.rotation.x = -Math.PI / 2;
        this.effects.push(new Follower(scene, sim, ev.id, ring, 15, 1.45, 2));
        break;
      }
      case 'hero-died':
        this.effects.push(new RingPulse(this.scene, this.sim, ev.x, ev.z, 0x222222, 3, 1.4));
        break;
    }
  }

  update(dt, alpha) {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      if (!this.effects[i].update(dt, alpha)) this.effects.splice(i, 1);
    }
  }
}
