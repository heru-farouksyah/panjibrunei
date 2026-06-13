import * as THREE from 'three';
import { GRID } from '../sim/constants.js';
import { buildTerrain } from './terrain.js';
import { buildWater } from './water.js';
import { buildProps } from './props.js';
import { UnitRenderer } from './unitRenderer.js';
import { BuildingRenderer } from './buildingRenderer.js';
import { FogRenderer } from './fogRender.js';
import { ProjectileRenderer } from './projectileRenderer.js';
import { VFX } from './vfx.js';
import { AmbientLife } from './ambient.js';
import { buildSky } from './sky.js';

// Owns the WebGL renderer, scene, lighting and all world meshes.
// Style C: grounded semi-realistic tropical — warm golden sun, soft haze,
// muted earthy palette, filmic tone mapping.
export class GameRenderer {
  constructor(container, sim) {
    const grid = sim.grid;
    this.sim = sim;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.22;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    // warm hazy horizon; terrain melts into it via matching fog
    this.scene.background = new THREE.Color(0xc7d2c8);
    this.scene.fog = new THREE.FogExp2(0xdccca6, 0.0036);

    // gradient sky dome behind everything
    const center = GRID / 2;
    this.scene.add(buildSky(center));

    // Golden tropical sun + cool sky fill, higher-res soft shadows.
    const sun = new THREE.DirectionalLight(0xffe1b0, 2.9);
    sun.position.set(center + 55, 88, center + 38);
    sun.target.position.set(center, 0, center);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -80;
    sun.shadow.camera.right = 80;
    sun.shadow.camera.top = 80;
    sun.shadow.camera.bottom = -80;
    sun.shadow.camera.near = 20;
    sun.shadow.camera.far = 320;
    sun.shadow.bias = -0.0002;
    sun.shadow.normalBias = 0.12;
    this.scene.add(sun);
    this.scene.add(sun.target);
    this.sun = sun;

    // sky/ground hemisphere fill + a soft warm bounce from the far side
    const hemi = new THREE.HemisphereLight(0xbcd2dd, 0x7a6638, 0.6);
    this.scene.add(hemi);
    const fill = new THREE.DirectionalLight(0xbfd0e0, 0.35);
    fill.position.set(center - 60, 50, center - 40);
    this.scene.add(fill);

    // Dark earth skirt so the map edge doesn't drop straight into sky.
    const skirt = new THREE.Mesh(
      new THREE.PlaneGeometry(900, 900),
      new THREE.MeshStandardMaterial({ color: 0x3d3a2c, roughness: 1 })
    );
    skirt.rotation.x = -Math.PI / 2;
    skirt.position.set(center, -1.6, center);
    this.scene.add(skirt);

    this.terrain = buildTerrain(grid);
    this.scene.add(this.terrain);

    this.water = buildWater(grid);
    this.scene.add(this.water);

    this.props = buildProps(grid);
    this.scene.add(this.props.group);

    this.units = new UnitRenderer(this.scene, sim);
    this.buildings = new BuildingRenderer(this.scene, sim);
    this.projectiles = new ProjectileRenderer(this.scene, sim);
    this.vfx = new VFX(this.scene, sim);
    this.ambient = new AmbientLife(this.scene);

    this.fogOfWar = new FogRenderer(this.scene, sim, this.terrain);
    this.fogOfWar.patchGroup(this.props.group);
    this.buildings.materialPatcher = (group) => this.fogOfWar.patchGroup(group);
    this.water.material.uniforms.uFogMap.value = this.fogOfWar.texture;
    this.water.material.uniforms.uFogOn.value = 1;

    this.camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.5,
      400
    );
    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  // Terrain point under a normalized device coordinate, or null.
  groundPoint(ndcX, ndcY) {
    this.ndc.set(ndcX, ndcY);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const hit = this.raycaster.intersectObject(this.terrain, false)[0];
    return hit ? { x: hit.point.x, z: hit.point.z } : null;
  }

  // Route one-shot sim events to render-side consumers.
  consumeEvents(events) {
    for (const ev of events) {
      if (ev.type === 'death' && ev.kind === 'building') this.buildings.onEvent(ev);
      else if (ev.type === 'demolish-dust') this.buildings.onEvent(ev);
      else if (ev.type === 'node-depleted') this.props.clearTile(ev.x, ev.z);
      else this.vfx.onEvent(ev);
    }
  }

  render(alpha, timeSec, dt = 0, selection = null, isVisible = null) {
    this.water.material.uniforms.uTime.value = timeSec;
    this.fogOfWar.update();
    this.units.update(alpha, dt, selection, isVisible);
    this.buildings.update(dt, selection, isVisible);
    this.projectiles.update(alpha, isVisible);
    this.vfx.update(dt, alpha);
    this.ambient.update(dt, timeSec);
    this.renderer.render(this.scene, this.camera);
  }

  get info() {
    return this.renderer.info;
  }
}
