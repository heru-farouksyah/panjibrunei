// Shared cel-shading toolkit: stepped gradient ramp, inked outlines (inverted
// hull), a toon() mesh builder, canvas-texture helper, and a painted sky dome.
import * as THREE from 'three';

// 3-band gradient ramp → the stepped "cel" look.
export function gradientMap(bands = [70, 150, 230, 255]) {
  const tex = new THREE.DataTexture(Uint8Array.from(bands), bands.length, 1, THREE.RedFormat);
  tex.colorSpace = THREE.NoColorSpace;
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}
export const RAMP = gradientMap();

// Ink outline: expand back-faces along their normals, paint them dark.
export function outlineMaterial(thickness = 0.045, color = 0x213039) {
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.thickness = { value: thickness };
    sh.vertexShader = 'uniform float thickness;\n' + sh.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n  transformed += normalize(normal) * thickness;'
    );
  };
  return m;
}

// Build a toon mesh (+ optional ink outline child + shadows).
export function toon(geo, color, opts = {}) {
  const { map = null, outline = true, thickness = 0.045, shadow = true, flat = false, emissive = 0x000000, opacity = 1 } = opts;
  const mat = new THREE.MeshToonMaterial({ color, gradientMap: RAMP, map, emissive });
  if (opacity < 1) { mat.transparent = true; mat.opacity = opacity; }
  if (flat) geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, mat);
  if (shadow) { mesh.castShadow = true; mesh.receiveShadow = true; }
  if (outline) mesh.add(new THREE.Mesh(geo, outlineMaterial(thickness)));
  return mesh;
}

export const place = (mesh, x, y, z) => { mesh.position.set(x, y, z); return mesh; };

export function canvasTex(w, h, draw, { repeat = null, srgb = true } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = 4;
  if (repeat) { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(repeat[0], repeat[1]); }
  return tex;
}

// Painted teal sky dome (inside-out sphere, unlit, fog-exempt).
export function skyDome(THREE_ = THREE) {
  const tex = canvasTex(2048, 1024, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0.0, '#36a6a2'); grad.addColorStop(0.55, '#5fc0b8'); grad.addColorStop(1.0, '#a7e4d6');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    const blob = (x, y, r, a, col) => { g.globalAlpha = a; g.fillStyle = col; g.beginPath(); g.ellipse(x, y, r, r * 0.5, 0, 0, 7); g.fill(); };
    for (let i = 0; i < 90; i++) blob(Math.random() * w, Math.random() * h * 0.6, 40 + Math.random() * 150, 0.05 + Math.random() * 0.12, '#ffffff');
    for (let i = 0; i < 40; i++) blob(Math.random() * w, Math.random() * h * 0.5, 30 + Math.random() * 90, 0.04 + Math.random() * 0.08, '#2f8f8c');
    g.globalAlpha = 1;
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(170, 32, 16), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false }));
  return dome;
}
