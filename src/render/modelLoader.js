import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// GLTF ingestion pipeline. The model manifest (src/data/models.json) maps every
// entity id to a procedural builder AND an optional `gltf` path. When a path is
// set, renderers load it through here and use it INSTEAD of the procedural
// builder; on any failure they fall back to procedural and warn once. Loads are
// cached/deduped by path so the same asset is fetched once.
//
// Convention so faction colouring keeps working with real assets: any mesh
// whose name (or material name) contains "faction" is marked tintable
// (material.userData.faction = true). See ART_PIPELINE.md.

const _loader = new GLTFLoader();
const _cache = new Map();  // path -> Promise<THREE.Group>
const _warned = new Set(); // paths we've already warned about

// Resolves to a normalized template Group (origin at feet, scaled to
// targetHeight, faction meshes tagged, animation clips on userData.animations).
// Callers that need their own materials (per-owner tint of non-instanced
// models) should cloneTemplate() the result.
export function loadGLTF(path, { targetHeight = 1.6 } = {}) {
  if (_cache.has(path)) return _cache.get(path);
  const promise = new Promise((resolve, reject) => {
    _loader.load(
      path,
      (gltf) => {
        const root = gltf.scene || (gltf.scenes && gltf.scenes[0]);
        if (!root) { reject(new Error('GLTF has no scene')); return; }
        normalizeToFeet(root, targetHeight);
        markFactionMeshes(root);
        root.userData.animations = gltf.animations || [];
        resolve(root);
      },
      undefined,
      (err) => reject(err)
    );
  });
  _cache.set(path, promise);
  return promise;
}

// One warning per bad path, so a missing asset doesn't spam the console.
export function warnFallback(path, err) {
  if (_warned.has(path)) return;
  _warned.add(path);
  console.warn(`[art] GLTF "${path}" failed to load — using procedural fallback. ${err?.message ?? err ?? ''}`);
}

// Recenter so the model's feet sit at y=0 and it's centred on x/z, then scale
// uniformly so its height matches the engine's expected footprint.
function normalizeToFeet(root, targetHeight) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) return;
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  const s = size.y > 1e-4 ? targetHeight / size.y : 1;
  // wrap in a transform group so we don't fight existing node transforms
  const wrapper = new THREE.Group();
  for (const child of [...root.children]) wrapper.add(child);
  wrapper.scale.setScalar(s);
  wrapper.position.set(-center.x * s, -box.min.y * s, -center.z * s);
  root.add(wrapper);
  root.updateMatrixWorld(true);
}

function markFactionMeshes(root) {
  root.traverse((n) => {
    if (!n.isMesh) return;
    const name = `${n.name} ${n.material?.name ?? ''}`.toLowerCase();
    if (name.includes('faction') || name.includes('banner')) {
      if (Array.isArray(n.material)) n.material = n.material.map((m) => m.clone());
      else n.material = n.material.clone();
      n.material.userData = { ...(n.material.userData || {}), faction: true };
    }
  });
}

// Deep clone that also clones materials, so per-owner tinting of a
// non-instanced model (e.g. a building) doesn't bleed across owners.
export function cloneTemplate(template) {
  const clone = template.clone(true);
  clone.traverse((n) => {
    if (!n.isMesh) return;
    if (Array.isArray(n.material)) n.material = n.material.map((m) => m.clone());
    else if (n.material) n.material = n.material.clone();
  });
  clone.userData.animations = template.userData.animations || [];
  return clone;
}
