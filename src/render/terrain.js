import * as THREE from 'three';
import { TileType } from '../sim/constants.js';
import { hash2 } from '../sim/rng.js';
import { getTheme } from './themes.js';

export function buildTerrain(grid, themeId) {
  const t = getTheme(themeId).terrain;
  const TILE_COLORS = {
    [TileType.GRASS]: new THREE.Color(t.grass),
    [TileType.EARTH]: new THREE.Color(t.earth),
    [TileType.SAND]: new THREE.Color(t.sand),
    [TileType.WATER]: new THREE.Color(t.water), // river bed, seen through water
    [TileType.FORD]: new THREE.Color(t.ford),
    [TileType.JUNGLE]: new THREE.Color(t.jungle),
    [TileType.GOLD]: new THREE.Color(t.gold),
    [TileType.CAMPHOR]: new THREE.Color(t.camphor),
    [TileType.SAGO]: new THREE.Color(t.sago),
  };
  const DRY_TINT = new THREE.Color(t.dry); // high ground dries out
  const size = grid.size;
  const n = size + 1;
  const positions = new Float32Array(n * n * 3);
  const colors = new Float32Array(n * n * 3);
  const indices = [];

  const c = new THREE.Color();
  for (let vz = 0; vz < n; vz++) {
    for (let vx = 0; vx < n; vx++) {
      const vi = vz * n + vx;
      const h = grid.vertexHeight(vx, vz);
      positions[vi * 3 + 0] = vx;
      positions[vi * 3 + 1] = h;
      positions[vi * 3 + 2] = vz;

      // Average the colors of the (up to 4) tiles touching this vertex.
      c.setRGB(0, 0, 0);
      let count = 0;
      for (let dz = -1; dz <= 0; dz++) {
        for (let dx = -1; dx <= 0; dx++) {
          const tx = vx + dx;
          const tz = vz + dz;
          if (tx < 0 || tz < 0 || tx >= size || tz >= size) continue;
          c.add(TILE_COLORS[grid.typeAt(tx, tz)]);
          count++;
        }
      }
      c.multiplyScalar(1 / Math.max(1, count));
      if (h > 2.0) c.lerp(DRY_TINT, Math.min(0.45, (h - 2.0) * 0.35));
      const jitter = 0.92 + hash2(7, vx, vz) * 0.16;
      colors[vi * 3 + 0] = c.r * jitter;
      colors[vi * 3 + 1] = c.g * jitter;
      colors[vi * 3 + 2] = c.b * jitter;
    }
  }

  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const a = z * n + x;
      const b = z * n + x + 1;
      const d = (z + 1) * n + x;
      const e = (z + 1) * n + x + 1;
      indices.push(a, d, b, b, d, e);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.96,
    metalness: 0.0,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.name = 'terrain';
  return mesh;
}
