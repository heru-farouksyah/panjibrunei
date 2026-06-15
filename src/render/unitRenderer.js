import * as THREE from 'three';
import { WATER_LEVEL } from '../sim/constants.js';
import { UNIT_PROTOS } from '../sim/entities.js';
import { UNIT_MODEL_BUILDERS } from './unitModels.js';
import { loadGLTF, warnFallback } from './modelLoader.js';
import manifest from '../data/models.json' with { type: 'json' };
import factionsData from '../data/factions.json' with { type: 'json' };

const CAPACITY = {
  penduduk: 100, pahlawan_kampilan: 150, pemanah: 120, penikam_keris: 120,
  pelempar_lembing: 120, lela_gunner: 40, perahu_nelayan: 40, perahu_perang: 40,
  pedagang: 20, militia_ember: 100, spectral_warrior: 110,
};
const HERO_CAP = 3;
const UNIT_SCALE = 1.3; // render-only: units read bigger; sim radius unchanged
const CARRY_COLORS = { food: 0xd8c06a, timber: 0x7a5230, gold: 0xe6bb3e, camphor: 0xa9c489 };

const FACTION_COLORS = {};
for (const [id, f] of Object.entries(factionsData)) {
  if (!id.startsWith('_')) FACTION_COLORS[id] = new THREE.Color(f.color);
}

// Draws every unit via per-part InstancedMeshes: ~16 protos x ~5 parts =
// a few dozen draw calls for hundreds of units. Positions interpolate
// between sim ticks; bob/lean animation is procedural and render-side only.
export class UnitRenderer {
  constructor(scene, sim) {
    this.scene = scene;
    this.sim = sim;
    this.batches = new Map(); // protoId -> {parts: [{inst, local, faction}], cap, used}
    this.animPhase = new Map(); // entity id -> walk phase
    this.tmpRoot = new THREE.Matrix4();
    this.tmpMat = new THREE.Matrix4();
    this.tmpQuat = new THREE.Quaternion();
    this.tmpEuler = new THREE.Euler();
    this.tmpPos = new THREE.Vector3();
    this.tmpScale = new THREE.Vector3(UNIT_SCALE, UNIT_SCALE, UNIT_SCALE);
    this.white = new THREE.Color(0xffffff);
    this.tmpColor = new THREE.Color();

    for (const protoId of Object.keys(UNIT_PROTOS)) {
      const entry = manifest.units[protoId];
      const builderName = entry?.builder ?? protoId;
      const builder = UNIT_MODEL_BUILDERS[builderName] ?? UNIT_MODEL_BUILDERS[protoId];
      if (!builder) {
        console.warn(`No unit model builder for "${protoId}"`);
        continue;
      }
      const cap = CAPACITY[protoId] ?? (UNIT_PROTOS[protoId].hero ? HERO_CAP : 60);
      // Build the procedural batch immediately. If the manifest names a GLTF
      // asset, load it and rebuild this proto's batch from it once ready; on
      // failure we keep the procedural one and warn once. So a real model is a
      // pure data drop-in, with graceful fallback (PRD Phase 9).
      this.batches.set(protoId, this._makeBatch(builder(), cap));
      if (entry?.gltf) {
        const th = UNIT_PROTOS[protoId].hero ? 1.5 : 1.1;
        loadGLTF(entry.gltf, { targetHeight: th })
          .then((template) => {
            this._disposeBatch(this.batches.get(protoId));
            this.batches.set(protoId, this._makeBatch(template, cap));
          })
          .catch((err) => warnFallback(entry.gltf, err));
      }
    }

    // selection rings
    const ringGeo = new THREE.RingGeometry(0.3, 0.42, 24);
    ringGeo.rotateX(-Math.PI / 2);
    this.rings = new THREE.InstancedMesh(
      ringGeo,
      new THREE.MeshBasicMaterial({
        color: 0x86e26d, transparent: true, opacity: 0.85, depthWrite: false,
      }),
      160
    );
    this.rings.frustumCulled = false;
    this.rings.count = 0;
    scene.add(this.rings);

    // carried-resource load — a small coloured bundle on a worker's back so
    // you can tell at a glance what each villager/boat is hauling
    this.loads = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.24, 0.2, 0.18),
      new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.9 }),
      140
    );
    this.loads.frustumCulled = false;
    this.loads.castShadow = true;
    this.loads.count = 0;
    scene.add(this.loads);
    this.loadColor = new THREE.Color();

    // floating health bars (selected or recently-damaged units)
    this.bars = [];
    for (let i = 0; i < 80; i++) {
      const bg = new THREE.Sprite(new THREE.SpriteMaterial({
        color: 0x10140e, transparent: true, opacity: 0.75, depthTest: false,
      }));
      bg.scale.set(0.62, 0.075, 1);
      bg.renderOrder = 10;
      bg.visible = false;
      const fg = new THREE.Sprite(new THREE.SpriteMaterial({
        color: 0x7dc35a, transparent: true, opacity: 0.95, depthTest: false,
      }));
      fg.center.set(0, 0.5);
      fg.renderOrder = 11;
      fg.visible = false;
      scene.add(bg);
      scene.add(fg);
      this.bars.push({ bg, fg });
    }
  }

  // Build a per-part InstancedMesh batch from a template Group (procedural or
  // a loaded GLTF). Each mesh part becomes one InstancedMesh sharing geometry +
  // material; the part's baked world transform is its per-instance local offset.
  _makeBatch(template, cap) {
    template.updateMatrixWorld(true);
    const parts = [];
    template.traverse((node) => {
      if (!node.isMesh) return;
      const inst = new THREE.InstancedMesh(node.geometry, node.material, cap);
      inst.castShadow = node.castShadow !== false;
      inst.receiveShadow = false;
      inst.frustumCulled = false; // instances update every frame
      inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      inst.count = 0;
      this.scene.add(inst);
      parts.push({
        inst,
        local: node.matrixWorld.clone(),
        faction: node.material?.userData?.faction === true,
      });
    });
    return { parts, cap, used: 0 };
  }

  // Tear down a batch's InstancedMeshes (when swapping procedural → GLTF).
  _disposeBatch(batch) {
    if (!batch) return;
    for (const part of batch.parts) {
      this.scene.remove(part.inst);
      part.inst.dispose();
    }
  }

  factionColorOf(owner) {
    // colours come from the resolved faction object so enemy-theme kingdoms
    // (not in the static factions list) tint correctly too. Cached per owner.
    this._fcCache ??= new Map();
    let c = this._fcCache.get(owner);
    if (!c) {
      const hex = this.sim.players[owner]?.faction?.color;
      c = hex ? new THREE.Color(hex) : this.white;
      this._fcCache.set(owner, c);
    }
    return c;
  }

  // isVisible: optional fn(entity) -> bool (fog of war hook, Phase 4)
  update(alpha, dt, selection, isVisible) {
    const sim = this.sim;
    const grid = sim.grid;

    for (const batch of this.batches.values()) batch.used = 0;
    let ringCount = 0;
    let barCount = 0;
    let loadCount = 0;

    sim.pool.forEach((e) => {
      if (e.kind !== 'unit') return;
      if (isVisible && !isVisible(e)) return;
      const batch = this.batches.get(e.protoId);
      if (!batch || batch.used >= batch.cap) return;

      const ix = e.prevX + (e.x - e.prevX) * alpha;
      const iz = e.prevZ + (e.z - e.prevZ) * alpha;
      const water = e.proto.domain === 'water';
      let y;
      let lean = 0;
      let bob = 0;
      const moving = e.path !== null;

      const working = e.state === 'gathering' || e.state === 'building';
      let phase = this.animPhase.get(e.id) ?? e.animSeed * 1.7;
      if (moving) phase += dt * 11 * (e.speedPerTick * 20);
      else if (working) phase += dt * 9;   // chop / hammer cadence
      else phase += dt * 1.8;              // slow idle breathing
      this.animPhase.set(e.id, phase);

      // melee lunge: a forward poke that peaks just after each swing
      let lx = ix;
      let lz = iz;
      if (e.state === 'attacking' && e.range === 0 && e.atkTicks > 0) {
        const k = 1 - Math.min(1, e.cooldown / e.atkTicks); // 0→1 across the swing
        const lunge = Math.sin(k * Math.PI) * 0.22;
        lx += Math.sin(e.facing) * lunge;
        lz += Math.cos(e.facing) * lunge;
      } else if (e.state === 'attacking' && e.range > 0 && e.atkTicks > 0) {
        // ranged: small recoil hop
        bob += Math.max(0, Math.sin((1 - e.cooldown / e.atkTicks) * Math.PI)) * 0.04;
      }

      if (water) {
        y = WATER_LEVEL + 0.02 + Math.sin(phase * 0.4 + e.animSeed) * 0.015;
        lean = Math.sin(phase * 0.3 + e.animSeed) * 0.03;
      } else {
        y = grid.heightAt(ix, iz);
        if (moving) {
          bob = Math.abs(Math.sin(phase)) * 0.05;
          lean = Math.sin(phase * 2) * 0.04;
        } else if (working) {
          // chopping/hammering: a rhythmic forward dip toward the work
          const swing = Math.max(0, Math.sin(phase)) * 0.12;
          lx += Math.sin(e.facing) * swing;
          lz += Math.cos(e.facing) * swing;
          bob = -Math.max(0, Math.sin(phase)) * 0.03;
          lean = Math.sin(phase) * 0.1;
        } else {
          bob = Math.sin(phase) * 0.012; // idle breathing so units never freeze
        }
      }

      this.tmpPos.set(lx, y + bob, lz);
      this.tmpEuler.set(water ? lean * 0.5 : 0, e.facing, lean);
      this.tmpQuat.setFromEuler(this.tmpEuler);
      this.tmpRoot.compose(this.tmpPos, this.tmpQuat, this.tmpScale);

      // status tints: stunned units grey out
      let shade = 1;
      if (e.statuses) {
        for (const s of e.statuses) {
          if (s.type === 'stun') shade = 0.45;
        }
      }

      const i = batch.used++;
      for (const part of batch.parts) {
        this.tmpMat.multiplyMatrices(this.tmpRoot, part.local);
        part.inst.setMatrixAt(i, this.tmpMat);
        const base = part.faction ? this.factionColorOf(e.owner) : this.white;
        if (shade !== 1) {
          this.tmpColor.copy(base).multiplyScalar(shade);
          part.inst.setColorAt(i, this.tmpColor);
        } else {
          part.inst.setColorAt(i, base);
        }
      }

      // carried load on the back, coloured by resource
      if (e.carryAmount >= 1 && CARRY_COLORS[e.carryType] !== undefined && loadCount < 140) {
        const bx = ix - Math.sin(e.facing) * 0.16;
        const bz = iz - Math.cos(e.facing) * 0.16;
        this.tmpPos.set(bx, y + 0.6, bz);
        this.tmpEuler.set(0, e.facing, 0);
        this.tmpQuat.setFromEuler(this.tmpEuler);
        this.tmpMat.compose(this.tmpPos, this.tmpQuat, this.tmpScale);
        this.loads.setMatrixAt(loadCount, this.tmpMat);
        this.loads.setColorAt(loadCount, this.loadColor.setHex(CARRY_COLORS[e.carryType]));
        loadCount++;
      }

      const isSelected = selection && selection.has(e.id);
      if (isSelected && ringCount < 160) {
        this.tmpPos.set(ix, y + 0.03, iz);
        this.tmpMat.makeTranslation(this.tmpPos.x, this.tmpPos.y, this.tmpPos.z);
        const s = e.radius * 3.4 + (e.proto.hero ? 0.6 : 0.15);
        this.tmpMat.scale(new THREE.Vector3(s, 1, s));
        this.rings.setMatrixAt(ringCount++, this.tmpMat);
      }

      // health bar when selected or recently hurt
      // the enemy boss always shows its bar so the player can find/track it
      const hurt = e.hp < e.maxHp && sim.tick - e.lastAttackedTick < 140;
      if ((isSelected || hurt || e.isBoss) && barCount < this.bars.length) {
        const bar = this.bars[barCount++];
        const pct = Math.max(0, e.hp / e.maxHp);
        const h = y + (e.proto.hero ? 2.1 : 1.45);
        const w = e.isBoss ? 0.95 : 0.56;
        bar.bg.position.set(ix, h, iz);
        bar.bg.scale.set(w + 0.06, e.isBoss ? 0.1 : 0.075, 1);
        bar.fg.position.set(ix - w / 2, h, iz);
        bar.fg.scale.set(w * pct, e.isBoss ? 0.08 : 0.055, 1);
        bar.fg.material.color.setHex(
          e.isBoss ? (pct > 0.4 ? 0xd14b3a : 0xff7043)
          : pct > 0.6 ? 0x7dc35a : pct > 0.3 ? 0xd9b13b : 0xd95f3b
        );
        bar.bg.visible = true;
        bar.fg.visible = true;
      }
    });
    for (let i = barCount; i < this.bars.length; i++) {
      if (!this.bars[i].bg.visible) break;
      this.bars[i].bg.visible = false;
      this.bars[i].fg.visible = false;
    }

    for (const batch of this.batches.values()) {
      for (const part of batch.parts) {
        part.inst.count = batch.used;
        part.inst.instanceMatrix.needsUpdate = true;
        if (part.inst.instanceColor) part.inst.instanceColor.needsUpdate = true;
      }
    }
    this.rings.count = ringCount;
    this.rings.instanceMatrix.needsUpdate = true;
    this.loads.count = loadCount;
    this.loads.instanceMatrix.needsUpdate = true;
    if (this.loads.instanceColor) this.loads.instanceColor.needsUpdate = true;
  }
}
