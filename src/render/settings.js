// Persistent player settings (localStorage). Audio volumes live in the
// AudioManager (it owns its own persisted keys); this module owns the graphics
// quality preset that Phase 12's renderer consumes, plus the save-game slot.

const GFX_KEY = 'panji.gfx';
const SAVE_KEY = 'panji.save';
export const GFX_LEVELS = ['low', 'medium', 'high'];

export function getGraphics() {
  const v = localStorage.getItem(GFX_KEY);
  if (GFX_LEVELS.includes(v)) return v;
  // no explicit choice yet: default Low on small touch devices (weak GPUs),
  // High everywhere else. The player can still override in Settings.
  try {
    const coarse = matchMedia('(pointer: coarse)').matches;
    const small = Math.min(window.innerWidth, window.innerHeight) <= 520;
    if (coarse && small) return 'low';
  } catch { /* non-browser */ }
  return 'high';
}

export function setGraphics(level) {
  if (GFX_LEVELS.includes(level)) localStorage.setItem(GFX_KEY, level);
}

// --- save game slot --------------------------------------------------------
export function hasSave() {
  return !!localStorage.getItem(SAVE_KEY);
}

export function writeSave(snapshot) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot));
    return true;
  } catch (e) {
    console.warn('[save] could not write save:', e?.message ?? e);
    return false;
  }
}

export function readSave() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearSave() {
  localStorage.removeItem(SAVE_KEY);
}
