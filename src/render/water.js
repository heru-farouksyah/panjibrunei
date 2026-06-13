import * as THREE from 'three';
import { TileType, WATER_LEVEL } from '../sim/constants.js';

// One merged quad per water/ford tile, animated by a small custom shader:
// moving ripples, fresnel toward the hazy sky, golden sun glints.
export function buildWater(grid) {
  const positions = [];
  const indices = [];
  let quad = 0;
  for (let z = 0; z < grid.size; z++) {
    for (let x = 0; x < grid.size; x++) {
      const t = grid.typeAt(x, z);
      if (t !== TileType.WATER && t !== TileType.FORD) continue;
      positions.push(
        x, WATER_LEVEL, z,
        x + 1, WATER_LEVEL, z,
        x, WATER_LEVEL, z + 1,
        x + 1, WATER_LEVEL, z + 1
      );
      const b = quad * 4;
      indices.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
      quad++;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);

  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color(0x1d4a42) },
      uShallow: { value: new THREE.Color(0x3f7a68) },
      uSky: { value: new THREE.Color(0xa9c3cd) },
      uSunDir: { value: new THREE.Vector3(0.55, 0.7, 0.35).normalize() },
      uFogMap: { value: null }, // fog-of-war texture, set by GameRenderer
      uFogOn: { value: 0 },
    },
  ]);

  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    fog: true,
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      uniform float uTime;
      varying vec3 vWorldPos;
      void main() {
        vec3 p = position;
        p.y += sin(p.x * 1.4 + uTime * 1.2) * 0.025
             + cos(p.z * 1.9 + uTime * 0.9) * 0.02;
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vWorldPos = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      uniform float uTime;
      uniform vec3 uDeep;
      uniform vec3 uShallow;
      uniform vec3 uSky;
      uniform vec3 uSunDir;
      uniform sampler2D uFogMap;
      uniform float uFogOn;
      varying vec3 vWorldPos;
      void main() {
        float r1 = sin(vWorldPos.x * 2.1 + uTime * 1.3)
                 * cos(vWorldPos.z * 1.7 - uTime * 1.1);
        float r2 = sin((vWorldPos.x + vWorldPos.z) * 0.8 + uTime * 0.7);
        float ripple = r1 * 0.5 + r2 * 0.5;
        vec3 n = normalize(vec3(ripple * 0.18, 1.0, (r2 - r1) * 0.15));
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        float fres = pow(1.0 - max(dot(viewDir, n), 0.0), 2.5);
        vec3 col = mix(uDeep, uShallow, ripple * 0.5 + 0.5);
        col = mix(col, uSky, fres * 0.6);
        float spec = pow(max(dot(reflect(-uSunDir, n), viewDir), 0.0), 70.0);
        col += vec3(1.0, 0.93, 0.78) * spec * 0.8;
        if (uFogOn > 0.5) {
          float fw = texture2D(uFogMap, vWorldPos.xz / 96.0).r;
          col *= mix(0.03, 1.0, smoothstep(0.0, 0.95, fw));
        }
        gl_FragColor = vec4(col, 0.9);
        #include <fog_fragment>
      }
    `,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'water';
  mesh.renderOrder = 1;
  return mesh;
}
