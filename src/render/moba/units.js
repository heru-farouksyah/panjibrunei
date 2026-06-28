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

// "Meriam" — Traditional ARTILLERY galleon: a broad gun-barge bristling with side
// cannons and a tall central mortar. Slow, long reach.
export function buildMeriam(team = 0) {
  const T = TEAM_COL[team]; const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(4.0, 1.0, 2.0), pbr(0x5a3d28, 0.82, 0.05)); hull.position.y = 0.5; g.add(hull);
  const bow = new THREE.Mesh(new THREE.ConeGeometry(1.0, 1.8, 4), pbr(0x6a4a30, 0.82, 0.05)); bow.rotation.z = -Math.PI / 2; bow.rotation.y = Math.PI / 4; bow.position.set(2.4, 0.5, 0); g.add(bow);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.24, 1.7), pbr(0x7a5230, 0.8, 0.05)); deck.position.y = 1.06; g.add(deck);
  for (const side of [-1, 1]) for (const dx of [-1.1, 0, 1.1]) {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 1.1, 8), pbr(0x33373b, 0.4, 0.7)); barrel.rotation.x = Math.PI / 2; barrel.position.set(dx, 0.95, side * 1.05); g.add(barrel);
  }
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 0.5, 10), pbr(T, 0.5, 0.3, T, 0.25)); base.position.set(-0.2, 1.35, 0); g.add(base);
  const mortar = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 1.7, 10), pbr(0x2a2d31, 0.35, 0.75)); mortar.position.set(0.2, 2.0, 0); mortar.rotation.z = -0.5; g.add(mortar);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 5), pbr(0x3a2a1a, 0.8, 0)); pole.position.set(-2.0, 1.7, 0); g.add(pole);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55), new THREE.MeshStandardMaterial({ color: T, roughness: 0.7, side: THREE.DoubleSide, emissive: T, emissiveIntensity: 0.35 })); flag.position.set(-2.4, 2.2, 0); flag.rotation.y = Math.PI / 2; g.add(flag);
  g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  g.scale.setScalar(1.12);
  return g;
}

// "Hammerhead" — Modern ASSASSIN gunboat: sleek grey steel hull, a wide hammerhead
// prow, low cabin, twin engines. Fast, low profile.
export function buildHammerhead(team = 0) {
  const T = TEAM_COL[team]; const g = new THREE.Group();
  const steel = pbr(0x9aa4ac, 0.45, 0.65);
  const hull = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.7, 1.2), steel); hull.position.y = 0.5; g.add(hull);
  const keel = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.4, 0.7), pbr(0x6b747c, 0.5, 0.6)); keel.position.y = 0.2; g.add(keel);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 2.6), steel); head.position.set(2.2, 0.5, 0); g.add(head);   // hammerhead prow
  for (const s of [-1, 1]) { const tip = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.7, 4), steel); tip.rotation.z = -Math.PI / 2; tip.rotation.y = Math.PI / 4; tip.position.set(2.6, 0.5, s * 1.2); g.add(tip); }
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.55, 0.9), pbr(0x42484e, 0.4, 0.55)); cabin.position.set(-0.3, 1.0, 0); g.add(cabin);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.85, 0.16, 0.06), new THREE.MeshStandardMaterial({ color: T, roughness: 0.5, emissive: T, emissiveIntensity: 0.4 })); stripe.position.set(0, 0.72, 0.61); g.add(stripe);
  const stripe2 = stripe.clone(); stripe2.position.z = -0.61; g.add(stripe2);
  for (const s of [-1, 1]) { const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.5, 8), pbr(0x303338, 0.4, 0.7)); eng.rotation.x = Math.PI / 2; eng.position.set(-2.0, 0.45, s * 0.4); g.add(eng); }
  g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  g.scale.setScalar(1.0);
  return g;
}

// "Sea-Naga" — the Epic neutral monster coiled in the central pit. A stack of
// scaly rings rising into a horned serpent head with glowing eyes.
export function buildNaga() {
  const g = new THREE.Group();
  const scale = pbr(0x2f6b52, 0.5, 0.18, 0x0a2218, 0.12);          // teal-green scales
  [[3.0, 0.55], [2.3, 0.5], [1.55, 0.45]].forEach(([R, t], i) => { const ring = new THREE.Mesh(new THREE.TorusGeometry(R, t, 10, 26), scale); ring.rotation.x = Math.PI / 2; ring.position.y = 0.5 + i * 0.75; g.add(ring); });
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.62, 2.6, 8), scale); neck.position.set(0.1, 3.1, 0); neck.rotation.z = 0.18; g.add(neck);
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.72, 1.7, 8), scale); head.position.set(0.45, 4.4, 0); head.rotation.z = -1.25; g.add(head);
  const jaw = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.0, 7), pbr(0x244f3c, 0.6, 0.1)); jaw.position.set(0.7, 4.05, 0); jaw.rotation.z = -1.4; g.add(jaw);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), new THREE.MeshStandardMaterial({ color: 0xffd23a, emissive: 0xffaa10, emissiveIntensity: 0.9 })); eye.position.set(0.62, 4.6, s * 0.28); g.add(eye);
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.7, 5), pbr(0xe8e0c8, 0.5, 0.1)); horn.position.set(0.2, 5.0, s * 0.22); horn.rotation.z = 0.4 * s; g.add(horn);
  }
  g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  g.scale.setScalar(1.05);
  return g;
}

// jungle-camp creature — a giant river crab squatting on a corner shoal. Clear it for
// gold + XP; it respawns. Domed shell, glowing eyes, two big claws.
export function buildCampMob() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(1.0, 10, 8), pbr(0x7a5238, 0.75, 0.05)); body.scale.y = 0.62; body.position.y = 0.66; g.add(body);
  const shell = new THREE.Mesh(new THREE.SphereGeometry(1.06, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), pbr(0x49642f, 0.6, 0.12)); shell.position.y = 0.66; g.add(shell);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 8), new THREE.MeshStandardMaterial({ color: 0xffe27a, emissive: 0xffaa10, emissiveIntensity: 0.6 })); eye.position.set(0.78, 0.95, s * 0.3); g.add(eye);
    const claw = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.85, 6), pbr(0x8a5a3a, 0.7, 0.05)); claw.position.set(0.85, 0.42, s * 0.82); claw.rotation.z = -1.05; g.add(claw);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.7, 5), pbr(0x5a3f28, 0.8, 0)); leg.position.set(-0.2, 0.3, s * 0.9); leg.rotation.x = s * 0.5; g.add(leg);
  }
  g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  return g;
}

// minion "creep" ship — small wedge hull + a single team sail. Cheap (spawns in waves).
export function buildMinion(team = 0) {
  const T = TEAM_COL[team]; const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.5, 0.85), pbr(0x6a4a30, 0.85, 0.05)); hull.position.y = 0.3; g.add(hull);
  const bow = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.95, 4), pbr(0x6a4a30, 0.85, 0.05)); bow.rotation.z = -Math.PI / 2; bow.rotation.y = Math.PI / 4; bow.position.set(1.05, 0.3, 0); g.add(bow);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.7, 5), pbr(0x3a2a1a, 0.8, 0)); mast.position.set(0, 1.0, 0); g.add(mast);
  const sail = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 1.15), new THREE.MeshStandardMaterial({ color: T, roughness: 0.72, side: THREE.DoubleSide, emissive: T, emissiveIntensity: 0.18 })); sail.position.set(0, 1.15, 0); sail.rotation.y = Math.PI / 2; g.add(sail);
  g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  return g;
}
