import * as THREE from 'three';
import { MODEL_BUILDERS } from './models.js';
import manifest from '../data/models.json' with { type: 'json' };
import { hash2 } from '../sim/rng.js';

// Turns grid.props placements into instanced meshes — one InstancedMesh per
// model part, so thousands of trees cost a handful of draw calls. Returns a
// controller so depleted nodes (cleared jungle, mined-out gold, fished-out
// spots) can hide their props per tile.
export function buildProps(grid) {
  const group = new THREE.Group();
  group.name = 'props';
  const tileMap = new Map(); // tileKey -> [{parts: [inst...], index}]

  const byType = new Map();
  for (const p of grid.props) {
    if (!byType.has(p.type)) byType.set(p.type, []);
    byType.get(p.type).push(p);
  }

  const placement = new THREE.Matrix4();
  const final = new THREE.Matrix4();
  const tint = new THREE.Color();

  for (const [type, placements] of byType) {
    const entry = manifest.props[type];
    if (!entry) {
      console.warn(`models.json has no entry for prop "${type}"`);
      continue;
    }
    // entry.gltf will short-circuit to a GLTF loader in a later phase.
    const builder = MODEL_BUILDERS[entry.builder];
    if (!builder) {
      console.warn(`No model builder named "${entry.builder}"`);
      continue;
    }

    const template = builder();
    template.updateMatrixWorld(true);
    const atWaterLevel = template.userData.atWaterLevel === true;

    const partInsts = [];
    for (const part of template.children) {
      const inst = new THREE.InstancedMesh(
        part.geometry,
        part.material,
        placements.length
      );
      inst.castShadow = part.castShadow !== false;
      inst.receiveShadow = true;

      for (let i = 0; i < placements.length; i++) {
        const p = placements[i];
        const y = atWaterLevel ? 0.21 : grid.heightAt(p.x, p.z) - 0.04;
        placement.makeRotationY(p.rot);
        placement.scale(new THREE.Vector3(p.scale, p.scale, p.scale));
        placement.setPosition(p.x, y, p.z);
        final.multiplyMatrices(placement, part.matrixWorld);
        inst.setMatrixAt(i, final);

        const v = 0.88 + hash2(3, Math.floor(p.x * 7), Math.floor(p.z * 7)) * 0.24;
        tint.setRGB(v, v, v);
        inst.setColorAt(i, tint);
      }
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
      inst.computeBoundingSphere();
      group.add(inst);
      partInsts.push(inst);
    }

    for (let i = 0; i < placements.length; i++) {
      const p = placements[i];
      const key = (p.x | 0) * 96 + (p.z | 0);
      if (!tileMap.has(key)) tileMap.set(key, []);
      tileMap.get(key).push({ parts: partInsts, index: i });
    }
  }

  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  return {
    group,
    clearTile(x, z) {
      const entries = tileMap.get((x | 0) * 96 + (z | 0));
      if (!entries) return;
      for (const { parts, index } of entries) {
        for (const inst of parts) {
          inst.setMatrixAt(index, zero);
          inst.instanceMatrix.needsUpdate = true;
        }
      }
      tileMap.delete((x | 0) * 96 + (z | 0));
    },
  };
}
