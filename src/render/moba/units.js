// Hero / unit models (presentation). Low-poly but readable silhouettes, PBR
// materials, shadows. Forward axis = +x (the controller yaws the group to face
// its heading).  (§4 Phase 2 / §8 roster)

import * as THREE from 'three';

const pbr = (color, rough = 0.6, metal = 0.1, em = 0x000000, ei = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, emissive: em, emissiveIntensity: ei });
export const TEAM_COL = [0x35b6ff, 0xff5246];

// "Bahtera" — War-Junk (Traditional tank): broad wooden hull, a metal ram, two
// battened junk sails, a stern banner. Instantly readable from above.
export function buildBahtera(team = 0) {
  const T = TEAM_COL[team]; const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.9, 1.5), pbr(0x5a3d28, 0.82, 0.05)); hull.position.y = 0.45; g.add(hull);
  const bow = new THREE.Mesh(new THREE.ConeGeometry(0.78, 1.7, 4), pbr(0x6a4a30, 0.82, 0.05)); bow.rotation.z = -Math.PI / 2; bow.rotation.y = Math.PI / 4; bow.position.set(2.15, 0.45, 0); g.add(bow);
  const ram = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.1, 6), pbr(0x9aa0a4, 0.4, 0.6)); ram.rotation.z = -Math.PI / 2; ram.position.set(2.7, 0.22, 0); g.add(ram);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.75, 1.15), pbr(0x7a5230, 0.78, 0.05)); cabin.position.set(-0.7, 1.12, 0); g.add(cabin);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.2, 1.35), pbr(T, 0.5, 0.2, T, 0.28)); roof.position.set(-0.7, 1.55, 0); g.add(roof);
  for (const [mx, sh] of [[0.7, 2.3], [-1.45, 1.9]]) {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, sh + 1.6, 6), pbr(0x3a2a1a, 0.8, 0)); mast.position.set(mx, 1.0 + (sh + 1.6) / 2 - 0.5, 0); g.add(mast);
    const sail = new THREE.Mesh(new THREE.PlaneGeometry(1.55, sh), new THREE.MeshStandardMaterial({ color: 0xe7ddc8, roughness: 0.88, side: THREE.DoubleSide })); sail.position.set(mx - 0.05, 1.25 + sh / 2, 0); sail.rotation.y = Math.PI / 2; g.add(sail);
    const trim = new THREE.Mesh(new THREE.PlaneGeometry(1.55, 0.22), new THREE.MeshStandardMaterial({ color: T, roughness: 0.7, side: THREE.DoubleSide, emissive: T, emissiveIntensity: 0.25 })); trim.position.set(mx - 0.04, 1.25 + sh - 0.11, 0); trim.rotation.y = Math.PI / 2; g.add(trim);
  }
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.7, 5), pbr(0x3a2a1a, 0.8, 0)); pole.position.set(-1.95, 1.55, 0); g.add(pole);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.58), new THREE.MeshStandardMaterial({ color: T, roughness: 0.7, side: THREE.DoubleSide, emissive: T, emissiveIntensity: 0.35 })); flag.position.set(-2.35, 2.05, 0); flag.rotation.y = Math.PI / 2; g.add(flag);
  g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  g.scale.setScalar(1.1);
  return g;
}
