import * as THREE from 'three';
import { GRID } from '../sim/constants.js';

// Fog-of-war rendering: a 96x96 data texture (0 unexplored / 128 explored /
// 255 visible) drives (a) a terrain-shaped dark overlay and (b) a shader
// patch on prop/building/water materials that hides them in the black and
// dims them in the grey.
export class FogRenderer {
  constructor(scene, sim, terrainMesh) {
    this.sim = sim;
    this.version = -1;
    const size = sim.grid.size;
    this.gridSize = size;
    this.data = new Uint8Array(size * size);
    this.texture = new THREE.DataTexture(this.data, size, size, THREE.RedFormat, THREE.UnsignedByteType);
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.minFilter = THREE.LinearFilter;
    this.uniform = { value: this.texture };

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uFog: this.uniform },
      vertexShader: /* glsl */ `
        varying vec2 vXZ;
        void main() {
          vXZ = position.xz;
          vec3 p = position;
          p.y += 0.07;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uFog;
        varying vec2 vXZ;
        void main() {
          float f = texture2D(uFog, vXZ / ${size}.0).r;
          // visible -> 0 alpha; explored -> light dim; unexplored -> soft dark blue
          // (softer max alpha so the edge fades gently and matches the blue theme)
          float alpha = mix(0.66, 0.0, smoothstep(0.0, 1.0, f));
          alpha = min(alpha, mix(0.66, 0.28, smoothstep(0.0, 0.6, f)));
          gl_FragColor = vec4(0.07, 0.11, 0.17, alpha);
        }
      `,
    });
    this.overlay = new THREE.Mesh(terrainMesh.geometry, mat);
    this.overlay.renderOrder = 5;
    this.overlay.frustumCulled = false;
    scene.add(this.overlay);
  }

  // Patch a standard material so fragments hide/dim with fog.
  patchMaterial(material) {
    if (material.userData.panjiFogPatched) return;
    material.userData.panjiFogPatched = true;
    const uniform = this.uniform;
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uPanjiFog = uniform;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vPanjiXZ;')
        .replace(
          '#include <project_vertex>',
          `#ifdef USE_INSTANCING
            vPanjiXZ = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xz;
          #else
            vPanjiXZ = (modelMatrix * vec4(transformed, 1.0)).xz;
          #endif
          #include <project_vertex>`
        );
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D uPanjiFog;\nvarying vec2 vPanjiXZ;')
        .replace(
          '#include <dithering_fragment>',
          `float panjiF = texture2D(uPanjiFog, vPanjiXZ / ${this.gridSize}.0).r;
          if (panjiF < 0.18) discard;
          gl_FragColor.rgb *= mix(0.4, 1.0, smoothstep(0.2, 0.95, panjiF));
          #include <dithering_fragment>`
        );
    };
    material.needsUpdate = true;
  }

  patchGroup(root) {
    root.traverse((n) => {
      if (n.isMesh && n.material) this.patchMaterial(n.material);
    });
  }

  update() {
    const fog = this.sim.fog;
    if (fog.version === this.version) return;
    this.version = fog.version;
    const vis = fog.visible[0];
    const exp = fog.explored[0];
    for (let i = 0; i < this.gridSize * this.gridSize; i++) {
      this.data[i] = vis[i] ? 255 : exp[i] ? 128 : 0;
    }
    this.texture.needsUpdate = true;
  }
}
