// Campaign missions — the goal layer + meta-progression for the RTS. Each node
// on the journey map is a scripted skirmish along the Brunei river, escalating in
// difficulty. Three stars per mission: ★ win · ★ win under `parMin` minutes ·
// ★ win without losing a building (flawless). Coords are in the 760×360 map.
export const MISSIONS = [
  {
    id: 'muara', name: 'Landing at Muara', x: 70, y: 250, prev: null,
    faction: 'semaun', difficulty: 'easy', mode: 'explore',
    explore: { par: 6 },
    blurb: 'Awang Semaun comes ashore at Kampong Ayer. Cross three stilt villages by bridge: find the Boatman’s fish for a plank to mend the first bridge, win the Brass Key to unlock the next, then gather the cargo baskets and load the waterfront boat. Greet folk, dodge bicycles, solve each puzzle to reach the next.',
  },
  {
    id: 'ayer', name: 'Defence of Kampong Ayer', x: 180, y: 200, prev: 'muara',
    faction: 'sakam', difficulty: 'normal', mode: 'moba',
    moba: { lanes: 2, epic: true },
    blurb: 'Naval MOBA — Traditional vs Modern warships clash over the river. Push two lanes, raze the turrets, fight for the Sea-Naga, and sink the enemy Core. (3D, in development.)',
  },
  {
    id: 'pasar', name: 'Skirmish at the Tamu', x: 300, y: 250, prev: 'ayer',
    faction: 'shahbandar', difficulty: 'normal', theme: 'water_village', mapSize: 72, seed: 102, parMin: 12,
    reveal: true, enemies: 1, enemyScale: 2, // the RTS, moved here: whole map clear; ONE foe at 2× your whole force
    blurb: 'A rival clan contests the floating Tamu — and they muster twice your number. The whole market is in view (enemies show red). Out-fight them and seize the bazaar.',
  },
  {
    id: 'sungai', name: 'Sungai Damuan', x: 410, y: 170, prev: 'pasar',
    faction: 'hassan', difficulty: 'normal', mode: 'naval',
    naval: { goal: 24, boss: true, hpScale: 1.25, spawn: 1.2, par: 4,
      intro: 'Seize the channel — clear the raider fleet, then sink the enemy flagship!' },
    blurb: 'Seize the river channel and its fords. Clear the raider fleet, then sink the enemy flagship before it breaks through to the kampong.',
  },
  {
    id: 'kianggeh', name: 'Kianggeh Stand', x: 520, y: 240, prev: 'sungai',
    faction: 'saman', difficulty: 'normal', mode: 'farm',
    farm: { quota: 8, day: 210, can: 6 },
    blurb: 'Peace by the stream — tend the kampong farm. Hoe the soil, plant, water from the well and harvest your crops to fill the cart before the day ends. Mind the chicken!',
  },
  {
    id: 'kotabatu', name: 'Siege of Kota Batu', x: 620, y: 150, prev: 'kianggeh',
    faction: 'badar', difficulty: 'hard', theme: 'mountain', mapSize: 128, seed: 106, parMin: 18,
    blurb: 'The old stone capital is held in force. Break the siege lines and raze the keep.',
  },
  {
    id: 'istana', name: 'The Istana Lama', x: 700, y: 230, prev: 'kotabatu',
    faction: 'semaun', difficulty: 'hard', theme: 'mountain', mapSize: 128, seed: 107, parMin: 20,
    blurb: 'The final stronghold. Unite the kampongs and take the throne hall.',
  },
];

export const missionById = (id) => MISSIONS.find((m) => m.id === id);
