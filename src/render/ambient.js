import * as THREE from 'three';
import { GRID } from '../sim/constants.js';

// Atmospheric life that makes the world feel alive: warm dust motes drifting
// in the sunlight and a few birds wheeling overhead. Pure eye-candy, cheap.
export class AmbientLife {
  constructor(scene, density = 1, size = GRID) {
    this.scene = scene;

    // --- drifting light motes (instanced points, looping upward) ---
    // density scales the mote count for the graphics-quality preset (Phase 12);
    // size spreads them across the actual map (Phase 13)
    const N = Math.max(40, Math.round(460 * density));
    const pos = new Float32Array(N * 3);
    const off = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = Math.random() * size;
      pos[i * 3 + 1] = Math.random() * 7;
      pos[i * 3 + 2] = Math.random() * size;
      off[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aOff', new THREE.BufferAttribute(off, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(size / 2, 3, size / 2), size);

    this.moteMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        attribute float aOff;
        uniform float uTime;
        varying float vA;
        void main() {
          vec3 p = position;
          p.y = mod(position.y + uTime * 0.18 + aOff * 7.0, 7.0) + 0.4;
          p.x += sin(uTime * 0.25 + aOff * 6.28) * 0.5;
          vA = 0.4 + 0.4 * sin(uTime * 1.5 + aOff * 12.0);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = (3.2 + aOff * 2.0) * (60.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          gl_FragColor = vec4(1.0, 0.88, 0.62, (1.0 - d * 2.0) * vA * 0.6);
        }
      `,
    });
    this.motes = new THREE.Points(geo, this.moteMat);
    this.motes.frustumCulled = false;
    scene.add(this.motes);

    // --- birds wheeling overhead ---
    this.birds = [];
    const birdMat = new THREE.MeshBasicMaterial({ color: 0x2a2620 });
    for (let i = 0; i < 7; i++) {
      const g = new THREE.Group();
      const wingL = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.16), birdMat);
      const wingR = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.16), birdMat);
      wingL.position.x = -0.26;
      wingR.position.x = 0.26;
      g.add(wingL, wingR);
      g.rotation.x = -Math.PI / 2;
      scene.add(g);
      this.birds.push({
        g, wingL, wingR,
        cx: 18 + Math.random() * (size - 36),
        cz: 18 + Math.random() * (size - 36),
        r: 6 + Math.random() * 12,
        alt: 9 + Math.random() * 5,
        speed: 0.18 + Math.random() * 0.16,
        phase: Math.random() * Math.PI * 2,
        flap: Math.random() * Math.PI * 2,
      });
    }
  }

  update(dt, timeSec) {
    this.moteMat.uniforms.uTime.value = timeSec;
    for (const b of this.birds) {
      b.phase += b.speed * dt;
      const x = b.cx + Math.cos(b.phase) * b.r;
      const z = b.cz + Math.sin(b.phase) * b.r;
      b.g.position.set(x, b.alt, z);
      // face direction of travel
      b.g.rotation.z = -b.phase + Math.PI / 2;
      // wing flap
      b.flap += dt * 9;
      const f = Math.sin(b.flap) * 0.5;
      b.wingL.rotation.y = f;
      b.wingR.rotation.y = -f;
    }
  }
}
