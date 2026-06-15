import * as THREE from 'three';

// Building model builders — stylized Bruneian kampong architecture from
// composed primitives: stilt posts, layered hip roofs, woven walls.
// Origin at footprint center, ground level y=0. Materials with
// userData.faction = true get the owner's banner color.

const POST = 0x5a4632;
const WALL = 0x8a6f4d;
const WALL_LIGHT = 0xa08258;
const ROOF = 0x4a3a2a;
const ROOF_DARK = 0x3a2d20;
const THATCH = 0x7a6a45;
const GOLD = 0xc9a23b;
const STONE = 0x7d7468;
const SOIL = 0x5d4a33;
const CROP = 0x6f8f3e;

function mat(color, opts = {}) {
  const m = new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.9,
    metalness: opts.metalness ?? 0,
    flatShading: true,
  });
  if (opts.faction) m.userData.faction = true;
  return m;
}

function add(g, geo, material, x, y, z, opts = {}) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  if (opts.rx) m.rotation.x = opts.rx;
  if (opts.ry) m.rotation.y = opts.ry;
  if (opts.rz) m.rotation.z = opts.rz;
  if (opts.sx || opts.sy || opts.sz) m.scale.set(opts.sx ?? 1, opts.sy ?? 1, opts.sz ?? 1);
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  return m;
}

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, s = 6) => new THREE.CylinderGeometry(rt, rb, h, s);
// 4-sided pyramid (hip roof), rotated to sit square
function pyramid(r, h) {
  const geo = new THREE.ConeGeometry(r, h, 4);
  geo.rotateY(Math.PI / 4);
  return geo;
}

function posts(g, w, d, h, inset = 0.12) {
  const hw = w / 2 - inset;
  const hd = d / 2 - inset;
  for (const [x, z] of [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]]) {
    add(g, cyl(0.05, 0.06, h, 5), mat(POST), x, h / 2, z);
  }
}

function bannerPole(g, x, z, h = 1.6) {
  add(g, cyl(0.02, 0.02, h, 5), mat(POST), x, h / 2, z);
  add(g, box(0.34, 0.24, 0.02), mat(0xffffff, { faction: true }), x + 0.18, h - 0.16, z);
}

export function buildIstana() {
  const g = new THREE.Group();
  // grand stilt platform
  posts(g, 2.4, 2.4, 0.5, 0.2);
  add(g, box(2.6, 0.12, 2.6), mat(WALL), 0, 0.56, 0);
  // main hall
  add(g, box(2.1, 0.8, 2.1), mat(WALL_LIGHT), 0, 1.02, 0);
  // three-tier roof
  add(g, pyramid(1.85, 0.6), mat(ROOF), 0, 1.72, 0);
  add(g, pyramid(1.3, 0.55), mat(ROOF_DARK), 0, 2.18, 0);
  add(g, pyramid(0.8, 0.5), mat(ROOF), 0, 2.66, 0);
  add(g, new THREE.SphereGeometry(0.12, 7, 6), mat(GOLD, { metalness: 0.6, roughness: 0.3 }), 0, 3.0, 0);
  // entry stair
  add(g, box(0.5, 0.08, 0.7), mat(POST), 0, 0.3, 1.5, { rx: 0.45 });
  // little resident dwellings clustered at the base — the kampong lives here
  const hut = (hx, hz, ry) => {
    add(g, cyl(0.04, 0.05, 0.18, 4), mat(POST), hx - 0.13, 0.09, hz);
    add(g, cyl(0.04, 0.05, 0.18, 4), mat(POST), hx + 0.13, 0.09, hz);
    add(g, box(0.42, 0.3, 0.4), mat(WALL), hx, 0.33, hz, { ry });
    add(g, pyramid(0.36, 0.26), mat(THATCH), hx, 0.62, hz, { ry });
  };
  hut(1.08, 1.08, 0.3);
  hut(-1.12, 0.95, -0.35);
  hut(1.05, -1.05, 0.8);
  bannerPole(g, 1.25, -1.25, 2.0);
  return g;
}

export function buildRumahKampong() {
  const g = new THREE.Group();
  // raised stilts + floor platform (a kampong house stands above the ground)
  posts(g, 1.45, 1.45, 0.58, 0.14);
  add(g, box(1.6, 0.1, 1.6), mat(POST), 0, 0.62, 0);
  // plank walls with a base band
  add(g, box(1.4, 0.6, 1.4), mat(WALL_LIGHT), 0, 0.94, 0);
  add(g, box(1.44, 0.08, 1.44), mat(WALL), 0, 0.68, 0);
  // door + shuttered windows
  add(g, box(0.32, 0.46, 0.04), mat(ROOF_DARK), 0, 0.87, 0.71);
  add(g, box(0.04, 0.26, 0.3), mat(0x6f7f84), 0.71, 1.0, 0.1);
  add(g, box(0.04, 0.26, 0.3), mat(0x6f7f84), -0.71, 1.0, -0.1);
  add(g, box(0.3, 0.26, 0.04), mat(0x6f7f84), 0.2, 1.0, -0.71);
  // wide eave overhang + steep atap hip roof
  add(g, box(1.78, 0.05, 1.78), mat(ROOF_DARK), 0, 1.26, 0);
  add(g, pyramid(1.42, 0.9), mat(ROOF), 0, 1.74, 0);
  add(g, box(0.13, 0.1, 1.25), mat(ROOF_DARK), 0, 2.18, 0); // ridge cap
  // crossed gable finials ("tanduk") at the apex — a Malay house motif
  add(g, box(0.04, 0.36, 0.04), mat(POST), 0.06, 2.32, 0.5, { rz: 0.5 });
  add(g, box(0.04, 0.36, 0.04), mat(POST), -0.06, 2.32, 0.5, { rz: -0.5 });
  // front porch deck with rail posts + a ladder down to the ground
  add(g, box(0.74, 0.08, 0.46), mat(POST), 0, 0.6, 0.95);
  add(g, cyl(0.025, 0.025, 0.42, 5), mat(POST), 0.32, 0.5, 1.12);
  add(g, cyl(0.025, 0.025, 0.42, 5), mat(POST), -0.32, 0.5, 1.12);
  add(g, box(0.05, 0.04, 0.46), mat(POST), 0.32, 0.7, 1.12);
  add(g, box(0.42, 0.04, 0.55), mat(0x6e573a), 0, 0.3, 1.32, { rx: 0.5 });
  return g;
}

export function buildKebun() {
  const g = new THREE.Group();
  add(g, box(1.8, 0.1, 1.8), mat(SOIL), 0, 0.05, 0);
  for (let i = -1; i <= 1; i++) {
    add(g, box(1.6, 0.12, 0.28), mat(CROP), 0, 0.14, i * 0.55);
  }
  add(g, cyl(0.035, 0.035, 0.7, 5), mat(POST), 0.8, 0.35, 0.8);
  add(g, box(0.26, 0.2, 0.02), mat(THATCH), 0.8, 0.62, 0.8);
  return g;
}

export function buildLumbung() {
  const g = new THREE.Group();
  // raised rice-granary on stilts
  posts(g, 1.4, 1.4, 0.5, 0.16);
  add(g, box(1.5, 0.12, 1.5), mat(POST), 0, 0.56, 0);
  add(g, box(1.3, 0.66, 1.3), mat(WALL), 0, 0.95, 0); // store body
  add(g, box(1.34, 0.07, 1.34), mat(WALL_LIGHT), 0, 0.66, 0);
  // bowed thatch roof (two stacked cones for a rounded granary look)
  add(g, pyramid(1.25, 0.5), mat(THATCH), 0, 1.45, 0);
  add(g, new THREE.SphereGeometry(0.62, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(THATCH), 0, 1.62, 0);
  add(g, box(0.4, 0.4, 0.04), mat(ROOF_DARK), 0, 0.92, 0.66); // hatch
  // a pile of sacks/baskets out front — scaled by fill level at render time
  const pile = new THREE.Group();
  const sackMat = mat(0xb9a86a);
  const sacks = [[-0.25, 0, 0.2], [0.0, 0, 0.18], [0.25, 0, 0.22], [-0.12, 0.18, 0.2], [0.14, 0.18, 0.21], [0.02, 0.34, 0.2]];
  for (const [x, y, z] of sacks) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.13, 6, 5), sackMat);
    s.position.set(x, 0.62 + y, 0.78 + z * 0.1);
    s.scale.set(1, 0.85, 1);
    s.castShadow = true;
    pile.add(s);
  }
  pile.userData.storagePile = true; // buildingRenderer scales this by fill
  g.add(pile);
  return g;
}

export function buildKedaiRuncit() {
  const g = new THREE.Group();
  // plank platform + corner poles
  add(g, box(1.7, 0.12, 1.7), mat(POST), 0, 0.06, 0);
  posts(g, 1.55, 1.55, 1.05, 0.12);
  // shop counter at the front with goods on top
  add(g, box(1.5, 0.5, 0.36), mat(WALL), 0, 0.35, 0.56);
  add(g, box(1.6, 0.07, 0.46), mat(WALL_LIGHT), 0, 0.63, 0.56);
  add(g, box(0.28, 0.24, 0.26), mat(0x6b4a2f), -0.42, 0.79, 0.54); // crate
  add(g, box(0.24, 0.2, 0.24), mat(THATCH), -0.05, 0.77, 0.55); // basket
  add(g, new THREE.SphereGeometry(0.12, 7, 5), mat(0xc25b3a), 0.32, 0.76, 0.55); // produce
  add(g, new THREE.SphereGeometry(0.1, 7, 5), mat(0xd8b94a), 0.5, 0.74, 0.55);
  // striped cloth awning (slightly peaked) + eave
  add(g, box(1.82, 0.04, 1.82), mat(0xb56b46), 0, 1.12, 0);
  add(g, pyramid(1.4, 0.42), mat(0x9c4f33), 0, 1.32, 0);
  add(g, box(1.84, 0.16, 0.08), mat(0xe7d9b0), 0, 1.08, 0.9); // valance trim
  // hanging gold scales (a market motif)
  add(g, cyl(0.015, 0.015, 0.3, 5), mat(0x9a7434, { metalness: 0.5 }), 0.62, 0.95, -0.5);
  add(g, cyl(0.12, 0.12, 0.02, 10), mat(0xc9a23b, { metalness: 0.6, roughness: 0.3 }), 0.62, 0.8, -0.5);
  return g;
}

export function buildBalaiBomba() {
  const g = new THREE.Group();
  // stone-footed hall
  add(g, box(1.7, 0.16, 1.7), mat(STONE), 0, 0.08, 0);
  add(g, box(1.5, 0.66, 1.5), mat(0x8a4438), 0, 0.5, 0); // reddish station walls
  add(g, box(1.54, 0.08, 1.54), mat(0xd8cdb0), 0, 0.86, 0); // white trim
  add(g, pyramid(1.4, 0.5), mat(ROOF_DARK), 0, 1.15, 0);
  // big garage door
  add(g, box(0.7, 0.5, 0.04), mat(0x4a3a2a), 0, 0.42, 0.76);
  // water tank (barrel) raised on a frame
  add(g, cyl(0.05, 0.05, 0.7, 5), mat(POST), -0.55, 0.55, -0.55);
  add(g, cyl(0.05, 0.05, 0.7, 5), mat(POST), -0.25, 0.55, -0.55);
  add(g, cyl(0.26, 0.26, 0.34, 10), mat(0x3a6f86), -0.4, 1.05, -0.55); // water tank
  add(g, cyl(0.27, 0.27, 0.05, 10), mat(0x2a5566), -0.4, 1.24, -0.55);
  // alarm bell on a post + a coiled hose
  add(g, cyl(0.02, 0.02, 0.5, 5), mat(POST), 0.62, 0.5, -0.5);
  add(g, new THREE.SphereGeometry(0.1, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xc9a23b, { metalness: 0.6, roughness: 0.3 }), 0.62, 0.74, -0.5);
  add(g, new THREE.TorusGeometry(0.13, 0.04, 6, 12), mat(0x2a2a2a), 0.5, 0.32, 0.5, { rx: Math.PI / 2 });
  return g;
}

export function buildPangkalan() {
  const g = new THREE.Group();
  // tall stilts — it stands over the shoreline
  posts(g, 1.7, 1.7, 0.7, 0.15);
  add(g, box(1.9, 0.12, 1.9), mat(WALL), 0, 0.76, 0);
  // open boat shed: roof on poles
  add(g, cyl(0.04, 0.04, 0.85, 5), mat(POST), -0.7, 1.2, -0.7);
  add(g, cyl(0.04, 0.04, 0.85, 5), mat(POST), 0.7, 1.2, -0.7);
  add(g, cyl(0.04, 0.04, 0.85, 5), mat(POST), -0.7, 1.2, 0.7);
  add(g, cyl(0.04, 0.04, 0.85, 5), mat(POST), 0.7, 1.2, 0.7);
  add(g, pyramid(1.45, 0.55), mat(THATCH), 0, 1.85, 0);
  // jetty plank sticking out
  add(g, box(0.5, 0.08, 1.1), mat(POST), 0, 0.72, 1.45);
  bannerPole(g, 0.8, -0.8, 1.9);
  return g;
}

export function buildBalaiPahlawan() {
  const g = new THREE.Group();
  posts(g, 1.8, 1.6, 0.4);
  // longhouse hall
  add(g, box(1.8, 0.62, 1.4), mat(WALL), 0, 0.72, 0);
  add(g, pyramid(1.5, 0.7), mat(ROOF_DARK), 0, 1.4, 0);
  // weapon rack: two spears and a shield by the entrance
  add(g, cyl(0.02, 0.02, 1.0, 5), mat(POST), -0.75, 0.5, 0.85, { rz: 0.18 });
  add(g, cyl(0.02, 0.02, 1.0, 5), mat(POST), -0.6, 0.5, 0.85, { rz: -0.12 });
  add(g, new THREE.ConeGeometry(0.04, 0.14, 5), mat(0xb9bdc4, { metalness: 0.4 }), -0.78, 1.05, 0.85);
  add(g, cyl(0.14, 0.14, 0.04, 9), mat(0xffffff, { faction: true }), 0.7, 0.55, 0.82, { rx: Math.PI / 2 });
  return g;
}

export function buildGeraiTukang() {
  const g = new THREE.Group();
  add(g, box(1.7, 0.16, 1.7), mat(STONE), 0, 0.08, 0);
  // open smithy: 4 poles + roof
  posts(g, 1.7, 1.7, 1.1, 0.18);
  add(g, pyramid(1.4, 0.55), mat(THATCH), 0, 1.4, 0);
  // forge chimney + anvil + glow
  add(g, cyl(0.16, 0.22, 0.9, 6), mat(STONE), -0.45, 0.6, -0.4);
  const ember = new THREE.Mesh(cyl(0.13, 0.13, 0.06, 6), new THREE.MeshStandardMaterial({
    color: 0xd96b2e, emissive: 0xa53e10, emissiveIntensity: 0.8, roughness: 0.6,
  }));
  ember.position.set(-0.45, 1.08, -0.4);
  g.add(ember);
  add(g, box(0.4, 0.18, 0.16), mat(0x4d4d52, { metalness: 0.5, roughness: 0.5 }), 0.3, 0.4, 0.1);
  add(g, box(0.2, 0.3, 0.2), mat(POST), 0.3, 0.24, 0.1);
  return g;
}

export function buildKubu() {
  const g = new THREE.Group();
  posts(g, 0.85, 0.85, 1.3, 0.08);
  add(g, box(0.95, 0.1, 0.95), mat(WALL), 0, 1.36, 0);
  // parapet
  for (const [x, z] of [[-0.42, 0], [0.42, 0], [0, -0.42], [0, 0.42]]) {
    add(g, box(x === 0 ? 0.95 : 0.1, 0.3, z === 0 ? 0.95 : 0.1), mat(WALL_LIGHT), x, 1.55, z);
  }
  add(g, pyramid(0.7, 0.5), mat(ROOF_DARK), 0, 2.05, 0);
  add(g, cyl(0.025, 0.025, 0.5, 5), mat(POST), 0.3, 2.4, 0);
  add(g, box(0.2, 0.14, 0.02), mat(0xffffff, { faction: true }), 0.41, 2.55, 0);
  return g;
}

export function buildPagar() {
  const g = new THREE.Group();
  for (let i = -2; i <= 2; i++) {
    const x = i * 0.18;
    add(g, cyl(0.05, 0.06, 0.85 + (i % 2) * 0.12, 5), mat(POST), x, 0.45, 0);
    add(g, new THREE.ConeGeometry(0.05, 0.14, 5), mat(0x4a3826), x, 0.93 + (i % 2) * 0.12, 0);
  }
  add(g, box(0.95, 0.08, 0.06), mat(0x4a3826), 0, 0.55, 0.04, { rz: 0.02 });
  return g;
}

export function buildSurau() {
  const g = new THREE.Group();
  posts(g, 1.6, 1.6, 0.45);
  add(g, box(1.55, 0.65, 1.55), mat(WALL_LIGHT), 0, 0.8, 0);
  // two-tier prayer-hall roof with gold finial
  add(g, pyramid(1.35, 0.55), mat(ROOF), 0, 1.4, 0);
  add(g, pyramid(0.85, 0.5), mat(ROOF_DARK), 0, 1.85, 0);
  add(g, cyl(0.03, 0.03, 0.3, 5), mat(GOLD, { metalness: 0.6, roughness: 0.3 }), 0, 2.35, 0);
  add(g, new THREE.SphereGeometry(0.09, 7, 6), mat(GOLD, { metalness: 0.6, roughness: 0.3 }), 0, 2.5, 0);
  // small porch
  add(g, box(0.6, 0.06, 0.4), mat(WALL), 0, 0.5, 0.95);
  return g;
}

export function buildPanggungPanji() {
  const g = new THREE.Group();
  // ceremonial raised stage
  add(g, box(1.9, 0.3, 1.9), mat(STONE), 0, 0.15, 0);
  add(g, box(1.5, 0.25, 1.5), mat(WALL), 0, 0.42, 0);
  posts(g, 1.5, 1.5, 1.5, 0.12);
  add(g, pyramid(1.25, 0.7), mat(ROOF_DARK), 0, 1.85, 0);
  add(g, new THREE.SphereGeometry(0.1, 7, 6), mat(GOLD, { metalness: 0.6, roughness: 0.3 }), 0, 2.3, 0);
  // grand central banner
  add(g, cyl(0.03, 0.03, 2.4, 5), mat(POST), 0, 1.2, 0);
  add(g, box(0.55, 0.4, 0.03), mat(0xffffff, { faction: true }), 0.3, 2.1, 0);
  // brazier bowls at the corners
  add(g, cyl(0.1, 0.06, 0.12, 6), mat(GOLD, { metalness: 0.5, roughness: 0.4 }), 0.8, 0.62, 0.8);
  add(g, cyl(0.1, 0.06, 0.12, 6), mat(GOLD, { metalness: 0.5, roughness: 0.4 }), -0.8, 0.62, 0.8);
  return g;
}

export function buildMahkotaMonument() {
  const g = new THREE.Group();
  // tiered stone base
  add(g, box(2.7, 0.4, 2.7), mat(STONE), 0, 0.2, 0);
  add(g, box(2.1, 0.4, 2.1), mat(0x8d8478), 0, 0.6, 0);
  add(g, box(1.5, 0.4, 1.5), mat(STONE), 0, 1.0, 0);
  // the crown: gold ring + points + central spire
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.62, 0.09, 6, 14),
    mat(GOLD, { metalness: 0.7, roughness: 0.25 })
  );
  ring.position.y = 1.5;
  ring.rotation.x = Math.PI / 2;
  ring.castShadow = true;
  g.add(ring);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    add(g, new THREE.ConeGeometry(0.09, 0.4, 5), mat(GOLD, { metalness: 0.7, roughness: 0.25 }),
      Math.cos(a) * 0.62, 1.75, Math.sin(a) * 0.62);
  }
  add(g, cyl(0.07, 0.1, 1.1, 6), mat(0x8d8478), 0, 2.0, 0);
  add(g, new THREE.SphereGeometry(0.16, 8, 6), mat(GOLD, { metalness: 0.7, roughness: 0.25 }), 0, 2.65, 0);
  // four faction banners
  for (const [x, z] of [[1.15, 1.15], [-1.15, 1.15], [1.15, -1.15], [-1.15, -1.15]]) {
    bannerPole(g, x, z, 1.7);
  }
  return g;
}

export function buildRubble() {
  const g = new THREE.Group();
  const dark = mat(0x453a2c);
  add(g, new THREE.IcosahedronGeometry(0.55, 0), dark, 0, 0.12, 0, { sy: 0.35 });
  add(g, new THREE.IcosahedronGeometry(0.4, 0), dark, 0.45, 0.1, -0.3, { sy: 0.4 });
  add(g, new THREE.IcosahedronGeometry(0.3, 0), mat(0x3a3226), -0.4, 0.08, 0.35, { sy: 0.45 });
  add(g, cyl(0.05, 0.06, 0.7, 5), mat(0x4a3826), 0.2, 0.2, 0.3, { rz: 1.1 });
  return g;
}

export const BUILDING_MODEL_BUILDERS = {
  istana: buildIstana,
  rumah_kampong: buildRumahKampong,
  lumbung: buildLumbung,
  kedai_runcit: buildKedaiRuncit,
  balai_bomba: buildBalaiBomba,
  kebun: buildKebun,
  pangkalan: buildPangkalan,
  balai_pahlawan: buildBalaiPahlawan,
  gerai_tukang: buildGeraiTukang,
  kubu: buildKubu,
  pagar: buildPagar,
  surau: buildSurau,
  panggung_panji: buildPanggungPanji,
  mahkota_monument: buildMahkotaMonument,
  rubble: buildRubble,
};
