import * as THREE from 'three';
import { BUILDING_MODEL_BUILDERS } from './buildingModels.js';
import manifest from '../data/models.json' with { type: 'json' };
import factionsData from '../data/factions.json' with { type: 'json' };

const FACTION_COLORS = {};
for (const [id, f] of Object.entries(factionsData)) {
  if (!id.startsWith('_')) FACTION_COLORS[id] = new THREE.Color(f.color);
}

const SCAFFOLD = 0xb89a5e; // bamboo
const FLAG_BUILDINGS = new Set(['istana', 'panggung_panji', 'mahkota_monument']);

// A faction banner on a tall pole, mounted on the major buildings. Returns
// { group, mesh, base } where mesh's geometry is wind-animated each frame.
function makeFlag(size) {
  const group = new THREE.Group();
  const poleH = size * 1.15 + 1.6;
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.8, flatShading: true });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, poleH, 6), poleMat);
  pole.position.y = poleH / 2;
  pole.castShadow = true;
  group.add(pole);
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0xc9a23b, metalness: 0.6, roughness: 0.3 }));
  finial.position.y = poleH + 0.05;
  group.add(finial);

  // cloth: plane whose left edge is lashed to the pole
  const W = 0.85;
  const H = 0.55;
  const geo = new THREE.PlaneGeometry(W, H, 12, 6);
  geo.translate(W / 2, 0, 0); // pivot at the pole edge
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.85, side: THREE.DoubleSide, flatShading: false,
  }));
  mesh.material.userData.faction = true; // tinted per owner
  mesh.position.set(0, poleH - H / 2 - 0.1, 0);
  mesh.castShadow = true;
  group.add(mesh);

  const base = geo.attributes.position.array.slice();
  return { group, mesh, base, w: W };
}

// Soft round dust sprite, generated once.
function makeDustTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(190,175,140,0.9)');
  g.addColorStop(0.5, 'rgba(170,155,120,0.5)');
  g.addColorStop(1, 'rgba(150,135,100,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

// A bamboo scaffold frame that surrounds a building under construction.
function buildScaffold(size) {
  const g = new THREE.Group();
  const h = size * 1.05 + 0.5;
  const half = size * 0.5 + 0.12;
  const poleMat = new THREE.MeshStandardMaterial({ color: SCAFFOLD, roughness: 0.85, flatShading: true });
  const pole = new THREE.CylinderGeometry(0.045, 0.05, h, 5);
  const corners = [[-half, -half], [half, -half], [-half, half], [half, half]];
  for (const [x, z] of corners) {
    const m = new THREE.Mesh(pole, poleMat);
    m.position.set(x, h / 2, z);
    m.castShadow = true;
    g.add(m);
  }
  // horizontal rails at two heights
  const railGeo = new THREE.BoxGeometry(half * 2 + 0.1, 0.04, 0.04);
  for (const ry of [h * 0.45, h * 0.85]) {
    for (const side of [-half, half]) {
      const a = new THREE.Mesh(railGeo, poleMat);
      a.position.set(0, ry, side);
      g.add(a);
      const b = new THREE.Mesh(railGeo, poleMat);
      b.rotation.y = Math.PI / 2;
      b.position.set(side, ry, 0);
      g.add(b);
    }
  }
  // a work plank and a lashed cloth
  const plank = new THREE.Mesh(
    new THREE.BoxGeometry(half * 2, 0.05, 0.34),
    new THREE.MeshStandardMaterial({ color: 0x9c7a48, roughness: 0.9, flatShading: true })
  );
  plank.position.set(0, h * 0.45 + 0.05, half);
  plank.castShadow = true;
  g.add(plank);
  return g;
}

// Per-era material tint applied to the base model (not faction parts):
// Kampong wood → cooler Kota Batu stone → warm/gilded Empire → dark fortified.
const ERA_TINT = {
  1: [1, 1, 1],
  2: [0.9, 0.93, 0.99],
  3: [1.08, 1.02, 0.88],
  4: [0.82, 0.85, 0.92],
};

function captureBaseColors(group) {
  group.traverse((n) => {
    if (n.isMesh && n.material && !n.material.userData?.faction && !n.material.userData.baseColor) {
      n.material.userData.baseColor = n.material.color.clone();
    }
  });
}

function applyEraTint(group, era) {
  const mul = ERA_TINT[Math.min(4, Math.max(1, era))];
  group.traverse((n) => {
    if (!n.isMesh || !n.material) return;
    const b = n.material.userData?.baseColor;
    if (!b) return; // skip faction parts + era-decor (no captured base)
    n.material.color.setRGB(b.r * mul[0], b.g * mul[1], b.b * mul[2]);
  });
}

// Era "upgrade" decorations clamped to the building base (height-independent):
// era2 stone foundation + corner stones, era3 gold caps + band, era4
// battlement crenellations. Stacks cumulatively.
function eraDecor(era, size) {
  const g = new THREE.Group();
  if (era < 2) return g;
  const half = size * 0.5;
  const stone = new THREE.MeshStandardMaterial({ color: 0x8b8b80, roughness: 0.96, flatShading: true });
  const stoneDk = new THREE.MeshStandardMaterial({ color: 0x73736a, roughness: 0.96, flatShading: true });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd6af3a, metalness: 0.6, roughness: 0.32, flatShading: true });

  // era 2: stone foundation platform + corner footings
  const base = new THREE.Mesh(new THREE.BoxGeometry(size * 1.08, 0.22, size * 1.08), stone);
  base.position.y = 0.11;
  base.castShadow = true;
  base.receiveShadow = true;
  g.add(base);
  const corners = [[-half, -half], [half, -half], [-half, half], [half, half]];
  for (const [sx, sz] of corners) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.5, 0.34), stone);
    c.position.set(sx, 0.25, sz);
    c.castShadow = true;
    g.add(c);
    if (era >= 3) {
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.22, 4), gold);
      cap.position.set(sx, 0.6, sz);
      cap.rotation.y = Math.PI / 4;
      g.add(cap);
    }
  }
  if (era >= 3) {
    // gilded band around the foundation
    const band = new THREE.Mesh(new THREE.BoxGeometry(size * 1.1, 0.05, size * 1.1), gold);
    band.position.y = 0.2;
    g.add(band);
  }
  if (era >= 4) {
    // battlement crenellations along the foundation top
    const per = Math.max(5, Math.round(size * 3));
    for (let s = 0; s < 4; s++) {
      for (let i = 0; i <= per; i++) {
        if (i % 2 === 1) continue;
        const t = (i / per - 0.5) * size * 1.04;
        const blk = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.16), stoneDk);
        if (s === 0) blk.position.set(t, 0.32, -half - 0.04);
        else if (s === 1) blk.position.set(t, 0.32, half + 0.04);
        else if (s === 2) blk.position.set(-half - 0.04, 0.32, t);
        else blk.position.set(half + 0.04, 0.32, t);
        blk.castShadow = true;
        g.add(blk);
      }
    }
  }
  return g;
}

// Buildings are few (<100), so each gets its own Group — which makes
// construction scaling, faction tinting, selection and rubble swaps easy.
export class BuildingRenderer {
  constructor(scene, sim) {
    this.scene = scene;
    this.sim = sim;
    this.groups = new Map(); // entity id -> {group, ring, scaffold, dustT, flag}
    this.rubble = [];        // {group, ttl}
    this.puffs = [];         // {sprite, vy, ttl, maxTtl, grow}
    this.flags = [];         // {mesh, base, w} wind-animated banners
    this.ghost = null;
    this.flagTime = 0;
    this.dustTex = makeDustTexture();
  }

  spawnPuff(x, y, z, opts = {}) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.dustTex,
      color: opts.color ?? 0xbcac86,
      transparent: true,
      opacity: opts.opacity ?? 0.7,
      depthWrite: false,
    }));
    const s = opts.size ?? 0.4;
    sprite.scale.set(s, s, 1);
    sprite.position.set(x, y, z);
    this.scene.add(sprite);
    this.puffs.push({
      sprite,
      vy: opts.vy ?? 0.4,
      ttl: opts.ttl ?? 0.8,
      maxTtl: opts.ttl ?? 0.8,
      grow: opts.grow ?? 0.9,
    });
  }

  // A burst of dust + a quick bright ground flash when a building finishes.
  completionBurst(e) {
    const cx = e.x;
    const cz = e.z;
    const y = this.sim.grid.heightAt(cx, cz);
    const r = e.size * 0.5;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      this.spawnPuff(cx + Math.cos(a) * r, y + 0.1, cz + Math.sin(a) * r, {
        size: 0.5, vy: 0.7, ttl: 1.0, grow: 1.6,
      });
    }
    // central upward poof
    this.spawnPuff(cx, y + 0.3, cz, { size: 0.7, vy: 1.1, ttl: 1.1, grow: 1.8, opacity: 0.85 });
    // bright flash ring
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(r * 0.5, r * 0.7, 28),
      new THREE.MeshBasicMaterial({ color: 0xffe6a0, transparent: true, opacity: 0.9, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(cx, y + 0.12, cz);
    this.scene.add(ring);
    this.rubble.push({ group: ring, ttl: 0.6, flash: true, baseR: r });
  }

  buildGroup(protoId) {
    const entry = manifest.buildings[protoId];
    const builder = BUILDING_MODEL_BUILDERS[entry?.builder ?? protoId];
    if (!builder) return new THREE.Group();
    return builder();
  }

  tintFaction(group, owner) {
    const color = FACTION_COLORS[this.sim.players[owner]?.factionId];
    if (!color) return;
    group.traverse((n) => {
      if (n.isMesh && n.material.userData?.faction) n.material.color.copy(color);
    });
  }

  update(dt, selection, isVisible) {
    const sim = this.sim;
    const seen = new Set();

    sim.pool.forEach((e) => {
      if (e.kind !== 'building') return;
      seen.add(e.id);
      let rec = this.groups.get(e.id);
      if (!rec) {
        const group = this.buildGroup(e.protoId);
        captureBaseColors(group); // remember base colors for per-era tinting
        let flag = null;
        if (FLAG_BUILDINGS.has(e.protoId)) {
          flag = makeFlag(e.size);
          group.add(flag.group);
          this.flags.push(flag);
        }
        this.tintFaction(group, e.owner);
        this.materialPatcher?.(group); // fog-of-war shader patch
        group.position.set(e.x, sim.grid.heightAt(e.x, e.z) - 0.03, e.z);
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(e.size * 0.62, e.size * 0.62 + 0.1, 28),
          new THREE.MeshBasicMaterial({
            color: 0x86e26d, transparent: true, opacity: 0.85, depthWrite: false,
          })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.06;
        ring.visible = false;
        group.add(ring);
        this.scene.add(group);

        let scaffold = null;
        if (!e.complete) {
          scaffold = buildScaffold(e.size);
          scaffold.position.set(e.x, sim.grid.heightAt(e.x, e.z) - 0.03, e.z);
          this.scene.add(scaffold);
        }
        rec = { group, ring, scaffold, flag, decor: null, era: -1, wasComplete: e.complete, dustT: 0 };
        this.groups.set(e.id, rec);
      }
      const visible = !isVisible || isVisible(e);

      // era appearance upgrade: restyle the building when its owner advances
      const era = sim.players[e.owner]?.era ?? 1;
      if (e.complete && era !== rec.era) {
        if (rec.decor) rec.group.remove(rec.decor);
        rec.decor = eraDecor(era, e.size);
        rec.group.add(rec.decor);
        this.materialPatcher?.(rec.decor); // fog-patch the new stone/gold meshes
        applyEraTint(rec.group, era);
        rec.era = era;
      }

      if (!e.complete) {
        const t = Math.max(0.12, e.buildProgress / e.proto.buildTicks);
        rec.group.scale.set(1, t, 1);
        // working dust at the base while villagers build (only if seen)
        if (visible) {
          rec.dustT -= dt;
          if (rec.dustT <= 0) {
            rec.dustT = 0.45;
            const a = (e.id * 1.7 + this.sim.tick * 0.13) % (Math.PI * 2);
            const r = e.size * 0.45;
            const y = sim.grid.heightAt(e.x, e.z) + 0.05;
            this.spawnPuff(e.x + Math.cos(a) * r, y, e.z + Math.sin(a) * r,
              { size: 0.32, vy: 0.35, ttl: 0.7, grow: 0.8, opacity: 0.5 });
          }
        }
        if (rec.scaffold) rec.scaffold.visible = visible;
      } else {
        if (rec.group.scale.y !== 1) rec.group.scale.set(1, 1, 1);
        // just finished: drop the scaffold and burst dust
        if (!rec.wasComplete) {
          rec.wasComplete = true;
          if (rec.scaffold) {
            this.scene.remove(rec.scaffold);
            rec.scaffold = null;
          }
          if (visible) this.completionBurst(e);
        }
      }

      rec.group.visible = visible;
      rec.ring.visible = visible && selection?.has(e.id) === true;
    });

    // remove groups for dead buildings (death event also adds rubble)
    for (const [id, rec] of this.groups) {
      if (!seen.has(id)) {
        this.scene.remove(rec.group);
        if (rec.scaffold) this.scene.remove(rec.scaffold);
        if (rec.flag) this.flags = this.flags.filter((f) => f !== rec.flag);
        this.groups.delete(id);
      }
    }

    // wind-animate the faction banners
    this.flagTime += dt;
    const t = this.flagTime;
    for (const flag of this.flags) {
      const arr = flag.mesh.geometry.attributes.position.array;
      const base = flag.base;
      for (let i = 0; i < arr.length; i += 3) {
        const bx = base[i];
        const by = base[i + 1];
        const u = bx / flag.w; // 0 at pole, 1 at free edge
        arr[i + 2] = Math.sin(bx * 5 + t * 5 + by * 2) * 0.09 * u
                   + Math.sin(bx * 9 - t * 3) * 0.03 * u;
        arr[i] = bx - u * u * 0.06; // slight billow shortening
      }
      flag.mesh.geometry.attributes.position.needsUpdate = true;
      flag.mesh.geometry.computeVertexNormals();
    }

    for (let i = this.rubble.length - 1; i >= 0; i--) {
      const r = this.rubble[i];
      r.ttl -= dt;
      if (r.flash) {
        // expanding, fading completion ring
        const p = 1 - r.ttl / 0.6;
        const s = 1 + p * 1.8;
        r.group.scale.set(s, s, 1);
        r.group.material.opacity = 0.9 * (1 - p);
      } else {
        r.group.position.y -= dt * 0.01;
      }
      if (r.ttl <= 0) {
        this.scene.remove(r.group);
        this.rubble.splice(i, 1);
      }
    }

    // dust puffs (construction, completion, etc.)
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const pf = this.puffs[i];
      pf.ttl -= dt;
      const k = pf.ttl / pf.maxTtl;
      pf.sprite.position.y += pf.vy * dt;
      const s = pf.sprite.scale.x + pf.grow * dt;
      pf.sprite.scale.set(s, s, 1);
      pf.sprite.material.opacity = Math.max(0, k) * 0.7;
      if (pf.ttl <= 0) {
        this.scene.remove(pf.sprite);
        this.puffs.splice(i, 1);
      }
    }
  }

  onEvent(ev) {
    if (ev.type === 'death' && ev.kind === 'building') {
      const group = this.buildGroup('rubble');
      const s = (ev.size ?? 2) * 0.55;
      group.scale.set(s, s, s);
      group.position.set(ev.x, this.sim.grid.heightAt(ev.x, ev.z) - 0.02, ev.z);
      this.scene.add(group);
      this.rubble.push({ group, ttl: 25 });
    } else if (ev.type === 'demolish-dust') {
      const y = this.sim.grid.heightAt(ev.x, ev.z) + 0.1;
      const r = (ev.size ?? 2) * 0.4;
      for (let i = 0; i < 3; i++) {
        const a = (this.sim.tick * 0.7 + i * 2.1) % (Math.PI * 2);
        this.spawnPuff(ev.x + Math.cos(a) * r, y, ev.z + Math.sin(a) * r,
          { size: 0.42, vy: 0.5, ttl: 0.9, grow: 1.0, opacity: 0.6 });
      }
    }
  }

  // --- ghost placement preview ---

  showGhost(protoId) {
    this.hideGhost();
    const group = this.buildGroup(protoId);
    const mats = [];
    group.traverse((n) => {
      if (n.isMesh) {
        n.material = n.material.clone();
        n.material.transparent = true;
        n.material.opacity = 0.55;
        n.castShadow = false;
        mats.push(n.material);
      }
    });
    this.ghost = { group, mats, protoId };
    group.visible = false;
    this.scene.add(group);
  }

  moveGhost(tileX, tileZ, valid) {
    if (!this.ghost) return;
    const size = this.sim.protos.buildings[this.ghost.protoId].size;
    const cx = tileX + size / 2;
    const cz = tileZ + size / 2;
    this.ghost.group.visible = true;
    this.ghost.group.position.set(cx, this.sim.grid.heightAt(cx, cz), cz);
    for (const m of this.ghost.mats) {
      m.color.offsetHSL(0, 0, 0); // keep base; tint via emissive
      m.emissive = m.emissive ?? new THREE.Color();
      m.emissive.set(valid ? 0x1d4a1d : 0x5a1414);
      m.emissiveIntensity = 0.9;
    }
  }

  hideGhost() {
    if (this.ghost) {
      this.scene.remove(this.ghost.group);
      this.ghost = null;
    }
  }
}
