import * as THREE from 'three';

// Procedural model builders. Every builder returns a THREE.Group whose origin
// sits at the model's feet, built from composed primitives with intentional
// proportions. The manifest (src/data/models.json) maps ids to these names so
// real GLTF assets can replace them later without touching game code.

function mesh(geo, color, opts = {}) {
  const m = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      color,
      roughness: opts.roughness ?? 0.92,
      metalness: opts.metalness ?? 0.0,
      flatShading: true,
    })
  );
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function buildJungleTree() {
  const g = new THREE.Group();

  const trunk = mesh(new THREE.CylinderGeometry(0.07, 0.14, 1.5, 6), 0x5b4632);
  trunk.position.y = 0.75;
  g.add(trunk);

  const canopyLow = mesh(new THREE.IcosahedronGeometry(0.62, 0), 0x3f5a33);
  canopyLow.position.set(0.05, 1.65, -0.03);
  canopyLow.scale.set(1, 0.78, 1);
  g.add(canopyLow);

  const canopyHigh = mesh(new THREE.IcosahedronGeometry(0.42, 0), 0x4a6639);
  canopyHigh.position.set(-0.12, 2.12, 0.08);
  canopyHigh.scale.set(1, 0.85, 1);
  g.add(canopyHigh);

  return g;
}

function buildCamphorTree() {
  const g = new THREE.Group();

  const trunk = mesh(new THREE.CylinderGeometry(0.06, 0.1, 1.9, 6), 0xcfc6ae);
  trunk.position.y = 0.95;
  g.add(trunk);

  const canopy = mesh(new THREE.IcosahedronGeometry(0.5, 0), 0x93a878);
  canopy.position.y = 2.05;
  canopy.scale.set(1, 1.2, 1);
  g.add(canopy);

  const tip = mesh(new THREE.IcosahedronGeometry(0.26, 0), 0xc2cf9e);
  tip.position.y = 2.62;
  g.add(tip);

  return g;
}

function buildGoldRock() {
  const g = new THREE.Group();

  const rock = mesh(new THREE.DodecahedronGeometry(0.52, 0), 0x6e6a60, {
    roughness: 0.97,
  });
  rock.position.y = 0.3;
  rock.scale.set(1, 0.72, 1);
  g.add(rock);

  const veinPositions = [
    [0.3, 0.42, 0.22],
    [-0.32, 0.3, 0.1],
    [0.05, 0.5, -0.32],
  ];
  for (const [x, y, z] of veinPositions) {
    const vein = mesh(new THREE.IcosahedronGeometry(0.13, 0), 0xc9a23b, {
      metalness: 0.7,
      roughness: 0.35,
    });
    vein.position.set(x, y, z);
    g.add(vein);
  }

  return g;
}

function buildSagoPalm() {
  const g = new THREE.Group();

  const trunk = mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.8, 6), 0x6e5a38);
  trunk.position.y = 0.4;
  g.add(trunk);

  // splayed fronds
  for (let i = 0; i < 5; i++) {
    const ang = (i / 5) * Math.PI * 2;
    const frond = mesh(new THREE.BoxGeometry(0.1, 0.02, 0.75), 0x6f8f4a);
    frond.position.set(Math.sin(ang) * 0.28, 0.92, Math.cos(ang) * 0.28);
    frond.rotation.y = ang;
    frond.rotation.x = 0.55;
    g.add(frond);
  }

  return g;
}

function buildFishSpot() {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.18, 0.34, 16),
    new THREE.MeshBasicMaterial({
      color: 0xbfe0d8,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.castShadow = false;
  g.add(ring);
  const fin = mesh(new THREE.ConeGeometry(0.06, 0.12, 4), 0x5a7d75);
  fin.position.set(0.1, 0.03, 0.05);
  fin.rotation.z = 0.5;
  fin.castShadow = false;
  g.add(fin);
  g.userData.atWaterLevel = true;
  return g;
}

export const MODEL_BUILDERS = {
  jungle_tree: buildJungleTree,
  camphor_tree: buildCamphorTree,
  gold_rock: buildGoldRock,
  sago_palm: buildSagoPalm,
  fish_spot: buildFishSpot,
};
