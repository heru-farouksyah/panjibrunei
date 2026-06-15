// Procedural SVG icon glyphs for the HUD (24x24 viewBox, stroke-based,
// currentColor so CSS controls the tint). Stand-ins until real art lands.

const G = {
  // resources
  food: '<path d="M4 12h16M5 12a7 7 0 0 0 14 0"/><path d="M9 8c0-2 1.5-3 3-4 1.5 1 3 2 3 4"/>',
  timber: '<circle cx="7" cy="16" r="3.2"/><circle cx="14" cy="16" r="3.2"/><circle cx="10.5" cy="10" r="3.2"/>',
  gold: '<path d="M4 17l2-4h5l2 4zM11 17l2-4h5l2 4zM7.5 12l2-4h5l2 4"/>',
  camphor: '<path d="M12 4c5 3 6 9 1 15-5-4-7-10-1-15z"/><path d="M12 8v8"/>',
  pop: '<circle cx="9" cy="8" r="3"/><path d="M4 19c0-3.5 2.5-5.5 5-5.5s5 2 5 5.5"/><circle cx="16.5" cy="9" r="2.4"/><path d="M14.5 18.5c.3-2.8 2-4.3 4-4.3 1.1 0 2 .4 2.5 1"/>',
  // units
  penduduk: '<path d="M4 10l8-5 8 5z"/><circle cx="12" cy="12.5" r="2.4"/><path d="M7 20c0-3 2.3-5 5-5s5 2 5 5"/>',
  pahlawan_kampilan: '<path d="M5 19L17 7l2-3-3 2L4 18z"/><path d="M8 15l2 2M15 6l3 3"/>',
  pemanah: '<path d="M7 4c6 2 6 14 0 16M7 4v16"/><path d="M7 12h11M15 9l3 3-3 3"/>',
  penikam_keris: '<path d="M12 3c2 2-1 3 1 5s-1 3 1 5l-2 2c-2-2 1-3-1-5s1-3-1-5z"/><path d="M9 16l-3 5M12 15l3-2"/>',
  pelempar_lembing: '<path d="M3 21L20 4M20 4h-5M20 4v5"/><path d="M7 13l3 3"/>',
  lela_gunner: '<path d="M4 16l9-7 3 4-9 7z"/><path d="M14 8l4-3 2 2.5-3 3"/><circle cx="8" cy="19" r="1.8"/>',
  perahu_nelayan: '<path d="M3 14h18l-3 5H6z"/><path d="M12 14V6M12 6c2 1 4 1 5 3"/>',
  perahu_perang: '<path d="M3 15h18l-3 4H6z"/><path d="M11 15V4M11 4l7 4-7 3"/>',
  pedagang: '<path d="M3 15h18l-3 4H6z"/><circle cx="12" cy="9" r="3.5"/><path d="M12 7v4M10.5 8h3"/>',
  hero: '<path d="M5 18h14M5 18l-1-9 5 3 3-6 3 6 5-3-1 9z"/>',
  // buildings
  istana: '<path d="M6 20v-4h12v4M7 16l5-3 5 3M9 13l3-3 3 3M10.5 10L12 8l1.5 2"/><path d="M4 20h16"/>',
  rumah_kampong: '<path d="M6 20v-7h12v7M5 13l7-5 7 5"/><path d="M11 16h2v4h-2z"/>',
  lumbung: '<path d="M5 20v-7h14v7M5 13c0-4 3-6 7-6s7 2 7 6"/><path d="M8 20v-4h3v4M14 16h3v4"/>',
  kebun: '<path d="M4 19h16"/><path d="M7 19v-3c-1.5 0-2.5-1-2.5-2.5C6 13.5 7 14.5 7 16M12 19v-4c-2 0-3-1.5-3-3 2 0 3 1.5 3 3M17 19v-3c1.5 0 2.5-1 2.5-2.5-1.5 0-2.5 1-2.5 2.5"/>',
  pangkalan: '<path d="M3 12h18M5 12v7M10 12v7M15 12v7M20 12v7"/><path d="M7 8h8l-2 4H9z"/>',
  balai_pahlawan: '<path d="M5 20L16 9M19 20L8 9"/><path d="M5 9h3v3M16 9h3v3"/>',
  gerai_tukang: '<path d="M5 13h10v3H9c0 2-2 3-4 3 1-1 1-2 0-3z"/><path d="M15 13c2 0 3-1 3-3h-6c0 2 1 3 3 3z"/><path d="M14 6l4 4"/>',
  kedai_runcit: '<path d="M4 10h16l-1 10H5z"/><path d="M4 10l1-4h14l1 4M9 10v10M15 10v10"/>',
  merc: '<path d="M5 19L15 9l3-4-4 3L4 18z"/><path d="M14 6l4 4"/><circle cx="18" cy="7" r="2.4"/>',
  balai_bomba: '<path d="M6 20v-8h12v8M5 12l7-5 7 5"/><path d="M12 3v3M9 20v-5h6v5"/>',
  fire: '<path d="M12 3c3 4 4 6 1 9 1-2-1-3-1-3-2 2-4 4-4 7a5 5 0 0 0 10 0c0-3-3-5-3-8-1 1-2 2-3 1 1-2 1-4 0-6z"/>',
  pelempar_bom: '<circle cx="9" cy="15" r="4.5"/><path d="M12 11l3-4M15 7l1-2"/><path d="M3 21L20 4"/>',
  kubu: '<path d="M8 20V8h8v12M8 8l-2-4h12l-2 4"/><path d="M10 12h4v4h-4z"/>',
  pagar: '<path d="M6 20V8l1.5-2L9 8v12M13 20V8l1.5-2L16 8v12M4 12h16M4 17h16"/>',
  surau: '<path d="M6 20v-6h12v6M12 5c3 2 5 4 5 8M12 5c-3 2-5 4-5 8"/><circle cx="12" cy="4" r="1"/><path d="M4 20h16"/>',
  panggung_panji: '<path d="M7 21V4M7 4h10l-3 3 3 3H7"/><path d="M4 21h7"/>',
  mahkota_monument: '<path d="M5 18h14M6 18l-1-8 4 2.5L12 7l3 5.5L19 10l-1 8z"/><circle cx="12" cy="4.5" r="1.2"/>',
  // actions / techs
  era: '<path d="M6 19l6-5 6 5M6 12l6-5 6 5"/>',
  ult: '<path d="M12 2l2 6 6-2-4 5 5 4-6.5.5L13 22l-2.5-5.5L4 18l4.5-5L4 8l6 2z"/>',
  summon: '<path d="M12 21V9M8 13l4-4 4 4"/><circle cx="12" cy="5" r="2.2"/>',
  tech_blade: '<path d="M6 18L16 8l2-4-4 2L4 16z"/><path d="M16 16l4 4M18 14l2 2M14 18l2 2"/>',
  tech_arrow: '<path d="M4 20L18 6M18 6h-5M18 6v5M7 13l4 4"/>',
  tech_armor: '<path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z"/><path d="M12 7v9M8.5 11h7"/>',
  tech_tools: '<path d="M4 12c2-4 6-6 9-5l-2 3 3 3 3-2c1 3-1 7-5 9"/><path d="M5 19l5-5"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="1"/>',
};

const ALIAS = {
  militia_ember: 'pahlawan_kampilan',
  spectral_warrior: 'pahlawan_kampilan',
  upah_pedang: 'pahlawan_kampilan',
  upah_panah: 'pemanah',
  upah_gergasi: 'merc',
  hero_semaun: 'hero', hero_sakam: 'hero', hero_hassan: 'hero',
  hero_shahbandar: 'hero', hero_saman: 'hero', hero_badar: 'hero',
  forged_kampilan: 'tech_blade',
  fletching: 'tech_arrow',
  woven_armor: 'tech_armor',
  efficient_tools: 'tech_tools',
  fire_arrows: 'fire',
};

export function iconSVG(name, size = 22) {
  const body = G[name] ?? G[ALIAS[name]] ?? G.ult;
  return `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none">${body}</svg>`;
}

export function hasIcon(name) {
  return name in G || name in ALIAS;
}
