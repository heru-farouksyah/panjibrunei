import * as THREE from 'three';

// Unit model builders: stylized low-poly figures from composed primitives,
// origin at feet, facing +Z. Materials with userData.faction = true are
// tinted per-owner by the unit renderer (instance color); everything else
// keeps its base color. A swordsman must read as a swordsman at RTS zoom.

const SKIN = 0x8a5c3b;
const SKIN_DARK = 0x744c30;
const STRAW = 0xc9b36a;
const WOOD = 0x6b4a2f;
const WOOD_DARK = 0x523822;
const STEEL = 0xb9bdc4;
const BRONZE = 0x9a7434;
const CLOTH_DARK = 0x3c3630;

function mat(color, opts = {}) {
  const m = new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.85,
    metalness: opts.metalness ?? 0,
    flatShading: true,
  });
  if (opts.faction) m.userData.faction = true;
  if (opts.transparent) {
    m.transparent = true;
    m.opacity = opts.opacity ?? 0.6;
  }
  return m;
}

function factionMat(opts = {}) {
  // white base — instance color carries the faction color
  return mat(0xffffff, { ...opts, faction: true });
}

function add(g, geo, material, x, y, z, opts = {}) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  if (opts.rx) m.rotation.x = opts.rx;
  if (opts.ry) m.rotation.y = opts.ry;
  if (opts.rz) m.rotation.z = opts.rz;
  if (opts.sx || opts.sy || opts.sz) m.scale.set(opts.sx ?? 1, opts.sy ?? 1, opts.sz ?? 1);
  m.castShadow = opts.shadow !== false;
  m.receiveShadow = false;
  g.add(m);
  return m;
}

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, s = 6) => new THREE.CylinderGeometry(rt, rb, h, s);
const sph = (r, s = 6) => new THREE.SphereGeometry(r, s, Math.max(4, s - 1));
const cone = (r, h, s = 6) => new THREE.ConeGeometry(r, h, s);

// Shared humanoid base (~0.8 world units tall): two legs, a sarong, torso,
// shoulders, two arms, a neck and a head — reads clearly as a person at
// gameplay zoom. Torso (y≈0.46) and head positions are kept stable so the
// per-unit weapons positioned against them still line up.
function humanoid(g, { torsoMat, legsColor = CLOTH_DARK, headY = 0.72, sarong = 0x6b5b46 } = {}) {
  const skin = mat(SKIN);
  // two legs
  add(g, cyl(0.04, 0.05, 0.26, 5), mat(legsColor), -0.05, 0.13, 0);
  add(g, cyl(0.04, 0.05, 0.26, 5), mat(legsColor), 0.05, 0.13, 0);
  // sarong wrap over the hips/upper legs
  add(g, cyl(0.115, 0.135, 0.2, 7), mat(sarong), 0, 0.3, 0);
  // torso
  add(g, cyl(0.115, 0.1, 0.34, 6), torsoMat ?? factionMat(), 0, 0.46, 0);
  // shoulders
  add(g, sph(0.13, 6), torsoMat ?? factionMat(), 0, 0.6, 0, { sy: 0.55 });
  // arms at the sides, angled slightly outward
  add(g, cyl(0.032, 0.032, 0.3, 5), skin, -0.135, 0.46, 0.01, { rz: 0.18 });
  add(g, cyl(0.032, 0.032, 0.3, 5), skin, 0.135, 0.46, 0.01, { rz: -0.18 });
  // neck + head
  add(g, cyl(0.04, 0.045, 0.06, 5), skin, 0, 0.65, 0);
  add(g, sph(0.095, 8), skin, 0, headY, 0);
  return g;
}

export function buildPenduduk() {
  const g = new THREE.Group();
  humanoid(g, { headY: 0.7 });
  // wide conical farmer hat — the villager silhouette
  add(g, cone(0.21, 0.13, 8), mat(STRAW), 0, 0.8, 0);
  // tool over the shoulder
  add(g, cyl(0.016, 0.016, 0.42, 5), mat(WOOD), 0.13, 0.56, -0.05, { rz: 0.5 });
  add(g, box(0.1, 0.04, 0.03), mat(STEEL), 0.23, 0.7, -0.05);
  return g;
}

export function buildKampilan() {
  const g = new THREE.Group();
  humanoid(g);
  // headband
  add(g, cyl(0.1, 0.1, 0.035, 7), factionMat(), 0, 0.75, 0);
  // broad kampilan blade raised at the right side
  add(g, box(0.045, 0.5, 0.02), mat(STEEL, { metalness: 0.35, roughness: 0.45 }), 0.21, 0.62, 0.06, { rz: -0.25 });
  add(g, box(0.05, 0.1, 0.04), mat(WOOD_DARK), 0.15, 0.38, 0.06);
  // round shield on the left arm
  add(g, cyl(0.13, 0.13, 0.035, 10), mat(WOOD), -0.19, 0.5, 0.04, { rz: Math.PI / 2 });
  return g;
}

export function buildPemanah() {
  const g = new THREE.Group();
  humanoid(g);
  // bow held forward-left: curved silhouette from a thin torus arc
  const bowGeo = new THREE.TorusGeometry(0.24, 0.014, 5, 10, Math.PI);
  add(g, bowGeo, mat(WOOD_DARK), -0.18, 0.52, 0.1, { rz: Math.PI / 2 });
  // quiver on the back
  add(g, cyl(0.045, 0.045, 0.24, 6), mat(WOOD), 0.08, 0.58, -0.13, { rx: 0.3 });
  add(g, box(0.06, 0.06, 0.02), mat(STRAW), 0.1, 0.71, -0.16);
  return g;
}

export function buildPenikam() {
  const g = new THREE.Group();
  humanoid(g, { headY: 0.7 });
  // head wrap
  add(g, sph(0.1, 7), factionMat(), 0, 0.73, 0, { sy: 0.6 });
  // wavy keris dagger held low and forward
  add(g, box(0.025, 0.3, 0.02), mat(STEEL, { metalness: 0.3, roughness: 0.5 }), 0.17, 0.42, 0.14, { rx: 0.9, rz: 0.15 });
  add(g, box(0.04, 0.07, 0.035), mat(WOOD_DARK), 0.16, 0.34, 0.05);
  return g;
}

export function buildPelempar() {
  const g = new THREE.Group();
  humanoid(g, { headY: 0.71 });
  // simple headband
  add(g, cyl(0.1, 0.1, 0.03, 7), factionMat(), 0, 0.74, 0);
  // javelin cocked back over the right shoulder, ready to throw
  add(g, cyl(0.014, 0.014, 0.62, 5), mat(WOOD), 0.2, 0.66, -0.04, { rz: 0.45, rx: -0.35 });
  add(g, cone(0.03, 0.12, 5), mat(STEEL, { metalness: 0.4, roughness: 0.4 }), 0.34, 0.92, 0.05);
  // quiver of spare javelins on the back
  add(g, cyl(0.04, 0.05, 0.26, 6), mat(WOOD_DARK), -0.05, 0.58, -0.13, { rx: 0.25 });
  for (let i = -1; i <= 1; i++) {
    add(g, cyl(0.01, 0.01, 0.22, 4), mat(WOOD), -0.05 + i * 0.025, 0.74, -0.14, { rx: 0.25 });
  }
  return g;
}

export function buildLelaGunner() {
  const g = new THREE.Group();
  // crew figure, slightly back and to the side
  const crew = new THREE.Group();
  humanoid(crew);
  while (crew.children.length > 0) {
    const c = crew.children[0];
    c.position.multiplyScalar(0.9);
    c.scale.multiplyScalar(0.9);
    c.position.add(new THREE.Vector3(-0.18, 0, -0.3));
    g.add(c); // removes from crew
  }
  // lela swivel cannon on a wooden mount
  add(g, box(0.3, 0.12, 0.42), mat(WOOD_DARK), 0.1, 0.12, 0.1);
  add(g, cyl(0.05, 0.07, 0.62, 8), mat(BRONZE, { metalness: 0.55, roughness: 0.4 }), 0.1, 0.32, 0.18, { rx: Math.PI / 2 - 0.12 });
  add(g, cyl(0.085, 0.085, 0.05, 8), mat(BRONZE, { metalness: 0.55, roughness: 0.4 }), 0.1, 0.32, -0.08, { rx: Math.PI / 2 });
  // wheels
  add(g, cyl(0.09, 0.09, 0.04, 8), mat(WOOD), -0.06, 0.09, 0.1, { rz: Math.PI / 2 });
  add(g, cyl(0.09, 0.09, 0.04, 8), mat(WOOD), 0.26, 0.09, 0.1, { rz: Math.PI / 2 });
  return g;
}

// --- Boats: origin at waterline center, facing +Z ---

function perahuHull(g, len, width, color) {
  add(g, box(width, 0.14, len), mat(color), 0, 0.02, 0);
  // raised prow and stern
  add(g, box(width * 0.7, 0.12, 0.22), mat(color), 0, 0.1, len / 2 - 0.05, { rx: -0.5 });
  add(g, box(width * 0.7, 0.12, 0.22), mat(color), 0, 0.1, -len / 2 + 0.05, { rx: 0.5 });
}

export function buildPerahuNelayan() {
  const g = new THREE.Group();
  perahuHull(g, 1.0, 0.34, WOOD);
  const figure = new THREE.Group();
  humanoid(figure);
  while (figure.children.length > 0) {
    const c = figure.children[0];
    c.position.multiplyScalar(0.75);
    c.scale.multiplyScalar(0.75);
    c.position.y += 0.08; // standing on the deck
    g.add(c);
  }
  add(g, cone(0.16, 0.1, 7), mat(STRAW), 0, 0.66, 0);
  // net pole over the side
  add(g, cyl(0.012, 0.012, 0.7, 5), mat(WOOD_DARK), 0.18, 0.3, 0.2, { rz: 0.9 });
  return g;
}

export function buildPerahuPerang() {
  const g = new THREE.Group();
  perahuHull(g, 1.6, 0.44, WOOD_DARK);
  // mast + faction sail
  add(g, cyl(0.025, 0.025, 0.85, 6), mat(WOOD), 0, 0.45, -0.1);
  add(g, box(0.5, 0.42, 0.02), factionMat(), 0, 0.62, -0.1);
  // shield row along the gunwale
  for (let i = -1; i <= 1; i++) {
    add(g, cyl(0.07, 0.07, 0.03, 8), factionMat(), 0.21, 0.16, i * 0.4, { rz: Math.PI / 2 });
  }
  // prow swivel gun
  add(g, cyl(0.035, 0.045, 0.34, 7), mat(BRONZE, { metalness: 0.5, roughness: 0.45 }), 0, 0.22, 0.62, { rx: Math.PI / 2 - 0.1 });
  return g;
}

export function buildPedagang() {
  const g = new THREE.Group();
  perahuHull(g, 1.35, 0.48, WOOD);
  // cargo crates + woven canopy
  add(g, box(0.24, 0.18, 0.24), mat(WOOD_DARK), -0.08, 0.2, -0.25);
  add(g, box(0.2, 0.16, 0.2), mat(STRAW), 0.1, 0.19, -0.02);
  add(g, box(0.42, 0.03, 0.5), mat(STRAW), 0, 0.5, 0.25);
  add(g, cyl(0.02, 0.02, 0.4, 5), mat(WOOD), 0.17, 0.3, 0.07);
  add(g, cyl(0.02, 0.02, 0.4, 5), mat(WOOD), -0.17, 0.3, 0.43);
  return g;
}

export function buildMilitiaEmber() {
  const g = new THREE.Group();
  humanoid(g, { headY: 0.7 });
  // parang blade + ember-orange sash
  add(g, box(0.035, 0.36, 0.02), mat(STEEL, { metalness: 0.3, roughness: 0.5 }), 0.18, 0.5, 0.1, { rz: -0.35 });
  add(g, box(0.24, 0.06, 0.26), mat(0xd96b2e), 0, 0.52, 0, { ry: 0.4 });
  return g;
}

export function buildSpectral() {
  const g = new THREE.Group();
  const ghost = mat(0xc23a3a, { transparent: true, opacity: 0.55 });
  add(g, cyl(0.1, 0.13, 0.55, 6), ghost, 0, 0.35, 0, { shadow: false });
  add(g, sph(0.09, 6), ghost, 0, 0.7, 0, { shadow: false });
  add(g, box(0.03, 0.4, 0.02), mat(0xe06060, { transparent: true, opacity: 0.5 }), 0.16, 0.5, 0.08, { rz: -0.3, shadow: false });
  return g;
}

// --- Heroes: bigger, ornamented versions with strong silhouettes ---

function heroBase(g, scale = 1.25) {
  humanoid(g);
  for (const c of g.children) {
    c.position.multiplyScalar(scale);
    c.scale.multiplyScalar(scale);
  }
  return g;
}

export function buildHeroSemaun() {
  const g = new THREE.Group();
  heroBase(g, 1.5); // the giant
  add(g, box(0.09, 0.85, 0.05), mat(STEEL, { metalness: 0.4, roughness: 0.4 }), 0.34, 0.85, 0.1, { rz: -0.3 });
  add(g, box(0.4, 0.08, 0.3), factionMat(), 0, 0.95, 0); // massive shoulders
  add(g, cyl(0.14, 0.15, 0.06, 7), mat(BRONZE, { metalness: 0.5 }), 0, 1.18, 0);
  return g;
}

export function buildHeroSakam() {
  const g = new THREE.Group();
  heroBase(g, 1.3);
  // long spear
  add(g, cyl(0.018, 0.018, 1.1, 5), mat(WOOD_DARK), 0.26, 0.7, 0.1, { rx: 0.35 });
  add(g, cone(0.035, 0.16, 6), mat(STEEL, { metalness: 0.4 }), 0.26, 1.2, 0.28, { rx: 0.35 });
  add(g, cone(0.13, 0.18, 6), factionMat(), 0, 1.05, 0); // tall war cap
  return g;
}

export function buildHeroHassan() {
  const g = new THREE.Group();
  heroBase(g, 1.3);
  // royal layered crown + sceptre, commanding pose
  add(g, cyl(0.12, 0.14, 0.1, 8), mat(BRONZE, { metalness: 0.6, roughness: 0.35 }), 0, 1.04, 0);
  add(g, cyl(0.06, 0.08, 0.08, 8), mat(BRONZE, { metalness: 0.6, roughness: 0.35 }), 0, 1.13, 0);
  add(g, cyl(0.02, 0.02, 0.7, 5), mat(BRONZE, { metalness: 0.5 }), 0.24, 0.62, 0.08);
  add(g, sph(0.05, 7), mat(0xd9c06a, { metalness: 0.6, roughness: 0.3 }), 0.24, 1.0, 0.08);
  // long royal cloak
  add(g, box(0.34, 0.5, 0.06), factionMat(), 0, 0.55, -0.14);
  return g;
}

export function buildHeroShahbandar() {
  const g = new THREE.Group();
  heroBase(g, 1.25);
  // scholar's turban + open book/scroll held forward
  add(g, sph(0.13, 8), factionMat(), 0, 0.98, 0, { sy: 0.75 });
  add(g, box(0.26, 0.03, 0.18), mat(0xe8e2d0), 0.16, 0.6, 0.2, { rz: -0.1 });
  add(g, box(0.3, 0.55, 0.05), factionMat(), 0, 0.52, -0.13); // robe back
  return g;
}

export function buildHeroSaman() {
  const g = new THREE.Group();
  heroBase(g, 1.3);
  // musket across the body + parang at the hip
  add(g, cyl(0.022, 0.022, 0.8, 6), mat(WOOD_DARK), 0.05, 0.72, 0.12, { rz: 1.1 });
  add(g, cyl(0.016, 0.016, 0.3, 5), mat(STEEL, { metalness: 0.4 }), -0.22, 0.85, 0.12, { rz: 1.1 });
  add(g, box(0.03, 0.3, 0.02), mat(STEEL, { metalness: 0.3 }), 0.2, 0.4, 0.02, { rz: 0.4 });
  add(g, cyl(0.11, 0.11, 0.05, 7), factionMat(), 0, 0.95, 0); // songkok-like cap
  return g;
}

export function buildHeroBadar() {
  const g = new THREE.Group();
  heroBase(g, 1.2);
  // twin keris, one in each hand, low crouched look
  add(g, box(0.025, 0.3, 0.02), mat(STEEL, { metalness: 0.35, roughness: 0.45 }), 0.22, 0.5, 0.16, { rx: 0.7, rz: 0.2 });
  add(g, box(0.025, 0.3, 0.02), mat(STEEL, { metalness: 0.35, roughness: 0.45 }), -0.22, 0.5, 0.16, { rx: 0.7, rz: -0.2 });
  add(g, sph(0.11, 7), factionMat(), 0, 0.94, 0, { sy: 0.55 }); // low head wrap
  add(g, box(0.26, 0.4, 0.04), factionMat(), 0, 0.5, -0.12); // short cape
  return g;
}

export const UNIT_MODEL_BUILDERS = {
  penduduk: buildPenduduk,
  pahlawan_kampilan: buildKampilan,
  pemanah: buildPemanah,
  penikam_keris: buildPenikam,
  pelempar_lembing: buildPelempar,
  lela_gunner: buildLelaGunner,
  perahu_nelayan: buildPerahuNelayan,
  perahu_perang: buildPerahuPerang,
  pedagang: buildPedagang,
  militia_ember: buildMilitiaEmber,
  spectral_warrior: buildSpectral,
  hero_semaun: buildHeroSemaun,
  hero_sakam: buildHeroSakam,
  hero_hassan: buildHeroHassan,
  hero_shahbandar: buildHeroShahbandar,
  hero_saman: buildHeroSaman,
  hero_badar: buildHeroBadar,
};
