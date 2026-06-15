import { GRID } from '../sim/constants.js';

const EDGE_MARGIN = 16; // px from window edge that triggers scroll
export const MIN_DIST = 6;   // close enough to admire unit/building detail
export const MAX_DIST = 66;  // and far enough for a battlefield overview
// Classic RTS angled top-down; tilts a little more overhead as you zoom out.
const PITCH_NEAR = (50 * Math.PI) / 180;
const PITCH_FAR = (64 * Math.PI) / 180;

// Smooth RTS camera: WASD/arrow + edge-scroll panning, eased mouse-wheel
// zoom, clamped to the map. Follows terrain height softly so the river
// valley doesn't jolt the view.
export class CameraRig {
  constructor(camera, dom, grid) {
    this.camera = camera;
    this.grid = grid;
    const start = grid.startZones[0];
    this.target = { x: start.x, z: start.y };
    this.focusY = grid.heightAt(start.x, start.y);
    this.dist = 20;        // start zoomed in close to the action
    this.targetDist = 20;
    this.keys = new Set();
    this.mouse = { x: -1, y: -1, inside: false };

    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    window.addEventListener('blur', () => this.keys.clear());

    dom.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.targetDist = Math.max(
          MIN_DIST,
          Math.min(MAX_DIST, this.targetDist * (1 + e.deltaY * 0.0011))
        );
      },
      { passive: false }
    );

    window.addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this.mouse.inside = true;
    });
    document.addEventListener('mouseleave', () => {
      this.mouse.inside = false;
    });
  }

  update(dt) {
    let px = 0;
    let pz = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) pz -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) pz += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) px -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) px += 1;

    if (this.mouse.inside) {
      if (this.mouse.x < EDGE_MARGIN) px -= 1;
      if (this.mouse.x > window.innerWidth - EDGE_MARGIN) px += 1;
      if (this.mouse.y < EDGE_MARGIN) pz -= 1;
      if (this.mouse.y > window.innerHeight - EDGE_MARGIN) pz += 1;
    }

    if (px !== 0 || pz !== 0) {
      const len = Math.hypot(px, pz);
      const speed = (14 + this.dist * 0.6) * dt;
      this.target.x += (px / len) * speed;
      this.target.z += (pz / len) * speed;
      this.target.x = Math.max(3, Math.min(this.grid.size - 3, this.target.x));
      this.target.z = Math.max(3, Math.min(this.grid.size - 3, this.target.z));
    }

    this.dist += (this.targetDist - this.dist) * Math.min(1, dt * 7);

    const groundY = this.grid.heightAt(this.target.x, this.target.z);
    this.focusY += (groundY - this.focusY) * Math.min(1, dt * 4);

    const zoomT = (this.dist - MIN_DIST) / (MAX_DIST - MIN_DIST);
    const pitch = PITCH_NEAR + (PITCH_FAR - PITCH_NEAR) * zoomT;
    this.camera.position.set(
      this.target.x,
      this.focusY + this.dist * Math.sin(pitch),
      this.target.z + this.dist * Math.cos(pitch)
    );
    this.camera.lookAt(this.target.x, this.focusY, this.target.z);
  }
}
