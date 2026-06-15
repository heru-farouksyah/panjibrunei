// Environment colour themes — recolour the whole world (terrain, water, sky,
// fog and lighting). Render-only; chosen on the faction-select screen and
// passed to GameRenderer. Add a theme here and it appears in the picker.
export const THEMES = {
  tropical: {
    name: 'Tropical Kampong',
    blurb: 'warm earthy jungle & golden sun',
    terrain: {
      grass: 0x5f7042, earth: 0x7c6a4b, sand: 0xb2a078, water: 0x4e4b3c,
      ford: 0xb8a87c, jungle: 0x455233, gold: 0x6f654d, camphor: 0x5d6c45,
      sago: 0x71814b, dry: 0x8a8462,
    },
    water: { deep: 0x1d4a42, shallow: 0x3f7a68, sky: 0xa9c3cd },
    sky: { top: 0x6f9ec6, mid: 0xaec6c4, horizon: 0xe4d4ad, sun: 0xffe6b0 },
    background: 0xc7d2c8, fog: 0xdccca6, fogDensity: 0.0036,
    sun: { color: 0xffe1b0, intensity: 2.9 },
    hemi: { sky: 0xbcd2dd, ground: 0x7a6638, intensity: 0.6 },
    exposure: 1.22,
  },

  water_village: {
    name: 'Water Village',
    blurb: 'teal lagoons & Kampong Ayer stilts',
    terrain: {
      grass: 0x4f7a5e, earth: 0x6e6a52, sand: 0xc2bd8e, water: 0x244e54,
      ford: 0xa8c0aa, jungle: 0x335442, gold: 0x5f6a5a, camphor: 0x4a6f5a,
      sago: 0x5f8a6a, dry: 0x7a8a72,
    },
    water: { deep: 0x103f52, shallow: 0x2f93a2, sky: 0xc2e2e8 },
    sky: { top: 0x57a4c6, mid: 0x9fcdd6, horizon: 0xdfeee0, sun: 0xfff0cc },
    background: 0xc2dfe2, fog: 0xc8e0e0, fogDensity: 0.0034,
    sun: { color: 0xfff0d0, intensity: 2.8 },
    hemi: { sky: 0xbfe0e6, ground: 0x5a6a52, intensity: 0.65 },
    exposure: 1.24,
  },

  mountain: {
    name: 'Highland Mountains',
    blurb: 'cool stone, pine green & misty air',
    terrain: {
      grass: 0x5a6e4a, earth: 0x6b6155, sand: 0x9a9488, water: 0x33414e,
      ford: 0x8f8f86, jungle: 0x36493a, gold: 0x6a665c, camphor: 0x4f6450,
      sago: 0x647a52, dry: 0x8c8c84,
    },
    water: { deep: 0x223a46, shallow: 0x49707c, sky: 0xb8c6cc },
    sky: { top: 0x6f86a0, mid: 0xb0bcc0, horizon: 0xd6d6ca, sun: 0xf0ead0 },
    background: 0xc2c8c8, fog: 0xc6ccc6, fogDensity: 0.0040,
    sun: { color: 0xf2ecd6, intensity: 2.6 },
    hemi: { sky: 0xc0ccd6, ground: 0x5a5648, intensity: 0.62 },
    exposure: 1.20,
  },
};

export const THEME_IDS = Object.keys(THEMES);
export const DEFAULT_THEME = 'tropical';

export function getTheme(id) {
  return THEMES[id] ?? THEMES[DEFAULT_THEME];
}
