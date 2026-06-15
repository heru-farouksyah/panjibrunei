import * as THREE from 'three';

// A gradient sky dome — warm hazy horizon rising to a soft blue zenith.
// Gives the scene atmospheric depth while keeping the stylized look. The
// horizon color is meant to match the scene fog so terrain melts into it.
export function buildSky(center, theme, radius = 340) {
  const sc = (theme && theme.sky) || { top: 0x6f9ec6, mid: 0xaec6c4, horizon: 0xe4d4ad, sun: 0xffe6b0 };
  const geo = new THREE.SphereGeometry(radius, 24, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: new THREE.Color(sc.top) },
      uMid: { value: new THREE.Color(sc.mid) },
      uHorizon: { value: new THREE.Color(sc.horizon) },
      uSunDir: { value: new THREE.Vector3(0.55, 0.55, 0.35).normalize() },
      uSun: { value: new THREE.Color(sc.sun) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop, uMid, uHorizon, uSun, uSunDir;
      varying vec3 vDir;
      void main() {
        float h = clamp(vDir.y, -0.12, 1.0);
        vec3 col = h < 0.2
          ? mix(uHorizon, uMid, smoothstep(-0.12, 0.2, h))
          : mix(uMid, uTop, smoothstep(0.2, 0.8, h));
        // warm glow toward the sun, strongest near the horizon
        float s = max(dot(normalize(vDir), normalize(uSunDir)), 0.0);
        col += uSun * pow(s, 6.0) * 0.5 * (1.0 - smoothstep(0.2, 0.6, h));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(center, 0, center);
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;
  mesh.name = 'sky';
  return mesh;
}
