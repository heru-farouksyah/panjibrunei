import * as THREE from 'three';

// Mouse + keyboard → sim commands. Owns the current selection (a render-side
// concern — the sim only sees commands). Left: select / drag-box / shift-add.
// Right: context order. Ctrl+1..5 set control groups, 1..5 recall. A = attack-
// move modifier, S = stop, Esc = cancel.
export class InputController {
  constructor(sim, gameRenderer, cameraRig) {
    this.sim = sim;
    this.gr = gameRenderer;
    this.rig = cameraRig;
    this.selection = new Set();
    this.groups = new Map();
    this.mode = 'normal'; // 'attackmove' | 'place' (set by the HUD later)
    this.placeHandler = null;
    this.onSelectionChange = () => {};
    this.down = null;
    this.tmpVec = new THREE.Vector3();

    this.boxEl = document.createElement('div');
    this.boxEl.id = 'select-box';
    document.body.appendChild(this.boxEl);

    const el = gameRenderer.renderer.domElement;
    el.addEventListener('contextmenu', (e) => e.preventDefault());

    el.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        if (this.mode === 'place') {
          this.placeHandler?.(this.groundAt(e.clientX, e.clientY));
          return;
        }
        if (this.mode === 'attackmove') {
          const p = this.groundAt(e.clientX, e.clientY);
          if (p) this.sim.cmdAttackMove(this.selectionIds(), p.x, p.z);
          this.setMode('normal');
          return;
        }
        this.down = { x: e.clientX, y: e.clientY, dragging: false, shift: e.shiftKey };
      } else if (e.button === 2) {
        if (this.mode !== 'normal') {
          this.setMode('normal');
          return;
        }
        this.rightCommand(e.clientX, e.clientY);
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.down) return;
      const dx = e.clientX - this.down.x;
      const dy = e.clientY - this.down.y;
      if (!this.down.dragging && Math.hypot(dx, dy) > 5) {
        this.down.dragging = true;
        this.boxEl.style.display = 'block';
      }
      if (this.down.dragging) {
        const x0 = Math.min(this.down.x, e.clientX);
        const y0 = Math.min(this.down.y, e.clientY);
        this.boxEl.style.left = `${x0}px`;
        this.boxEl.style.top = `${y0}px`;
        this.boxEl.style.width = `${Math.abs(dx)}px`;
        this.boxEl.style.height = `${Math.abs(dy)}px`;
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button !== 0 || !this.down) return;
      const d = this.down;
      this.down = null;
      this.boxEl.style.display = 'none';
      if (d.dragging) {
        this.boxSelect(
          Math.min(d.x, e.clientX), Math.min(d.y, e.clientY),
          Math.max(d.x, e.clientX), Math.max(d.y, e.clientY),
          d.shift
        );
      } else {
        this.clickSelect(e.clientX, e.clientY, d.shift);
      }
    });

    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      const digit = e.code.startsWith('Digit') ? Number(e.code.slice(5)) : 0;
      if (digit >= 1 && digit <= 5) {
        if (e.ctrlKey || e.metaKey) {
          this.groups.set(digit, [...this.selectionIds()]);
          e.preventDefault();
        } else {
          const ids = (this.groups.get(digit) ?? []).filter((id) => this.sim.pool.get(id));
          this.setSelection(ids);
        }
      } else if (e.code === 'KeyS' && !e.ctrlKey) {
        this.sim.cmdStop(this.selectionIds());
      } else if (e.code === 'KeyA' && !e.ctrlKey && this.selection.size > 0) {
        this.setMode('attackmove');
      } else if (e.code === 'KeyZ' && !e.ctrlKey) {
        this.sim.cmdStance(this.selectionIds(), 'aggressive');
      } else if (e.code === 'KeyX' && !e.ctrlKey) {
        this.sim.cmdStance(this.selectionIds(), 'hold');
      } else if (e.code === 'KeyQ' && !e.ctrlKey) {
        // hero ultimate when the hero is selected
        for (const id of this.selectionIds()) {
          const u = this.sim.pool.get(id);
          if (u?.proto?.hero && u.owner === 0) {
            this.sim.cmdUltimate(0);
            break;
          }
        }
      } else if (e.code === 'Escape') {
        if (this.mode !== 'normal') this.setMode('normal');
        else this.setSelection([]);
      }
    });
  }

  setMode(mode) {
    this.mode = mode;
    document.body.style.cursor =
      mode === 'attackmove' ? 'crosshair' : mode === 'place' ? 'copy' : 'default';
    this.onModeChange?.(mode);
  }

  selectionIds() {
    // prune dead entities lazily
    for (const id of [...this.selection]) {
      if (!this.sim.pool.get(id)) this.selection.delete(id);
    }
    return [...this.selection];
  }

  setSelection(ids) {
    this.selection = new Set(ids);
    this.onSelectionChange(this.selection);
  }

  groundAt(clientX, clientY) {
    return this.gr.groundPoint(
      (clientX / window.innerWidth) * 2 - 1,
      -(clientY / window.innerHeight) * 2 + 1
    );
  }

  // Screen-space position of an entity, or null when behind the camera.
  screenPos(e, out) {
    this.tmpVec.set(e.x, this.heightOf(e) + 0.4, e.z);
    this.tmpVec.project(this.gr.camera);
    if (this.tmpVec.z > 1) return null;
    out.x = (this.tmpVec.x + 1) * 0.5 * window.innerWidth;
    out.y = (-this.tmpVec.y + 1) * 0.5 * window.innerHeight;
    return out;
  }

  heightOf(e) {
    return e.proto?.domain === 'water' ? 0.2 : this.sim.grid.heightAt(e.x, e.z);
  }

  pickEntity(mx, my) {
    const p = { x: 0, y: 0 };
    let best = null;
    let bestD = 18; // px
    this.sim.pool.forEach((e) => {
      if (e.kind !== 'unit' && e.kind !== 'building') return;
      if (!this.screenPos(e, p)) return;
      let d = Math.hypot(p.x - mx, p.y - my);
      if (e.owner !== 0) d += 4; // prefer own units on overlap
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    });
    return best;
  }

  clickSelect(mx, my, shift) {
    const hit = this.pickEntity(mx, my);
    if (!hit) {
      if (!shift) this.setSelection([]);
      return;
    }
    if (shift && hit.owner === 0) {
      const next = new Set(this.selection);
      if (next.has(hit.id)) next.delete(hit.id);
      else next.add(hit.id);
      this.setSelection([...next]);
    } else {
      this.setSelection([hit.id]);
    }
  }

  boxSelect(x0, y0, x1, y1, shift) {
    const p = { x: 0, y: 0 };
    const ids = shift ? [...this.selectionIds()] : [];
    this.sim.pool.forEach((e) => {
      if (e.kind !== 'unit' || e.owner !== 0) return;
      if (!this.screenPos(e, p)) return;
      if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1) ids.push(e.id);
    });
    if (ids.length > 0 || !shift) this.setSelection(ids);
  }

  rightCommand(mx, my) {
    const ids = this.selectionIds();
    if (ids.length === 0) return;
    const target = this.pickEntity(mx, my);
    const p = this.groundAt(mx, my);
    if (!p) return;
    // own buildings selected -> set rally point; units -> context order
    let hasUnit = false;
    for (const id of ids) {
      const e = this.sim.pool.get(id);
      if (e?.kind === 'unit') hasUnit = true;
      if (e?.kind === 'building' && e.owner === 0) {
        this.sim.cmdSetRally(id, p.x, p.z);
      }
    }
    if (hasUnit) this.sim.cmdContext(ids, p.x, p.z, target ? target.id : -1);
  }
}
