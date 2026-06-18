// Campaign missions — the goal layer + meta-progression for the RTS. Each node
// on the journey map is a scripted skirmish along the Brunei river, escalating in
// difficulty. Three stars per mission: ★ win · ★ win under `parMin` minutes ·
// ★ win without losing a building (flawless). Coords are in the 760×360 map.
export const MISSIONS = [
  {
    id: 'muara', name: 'Landing at Muara', x: 70, y: 250, prev: null,
    faction: 'semaun', difficulty: 'easy', mode: 'naval',
    naval: { goal: 24, gunboatsFrom: 2, spawn: 1.7, par: 2.5,
      intro: 'Steer with one finger — your cannons fire themselves. Sink 24 raiders!' },
    blurb: 'Awang Semaun sails the Muara channel alone. Steer your war perahu, let the cannons loose on the raider boats swarming in, and break through to the beach.',
  },
  {
    id: 'ayer', name: 'Defence of Kampong Ayer', x: 180, y: 200, prev: 'muara',
    faction: 'sakam', difficulty: 'easy', theme: 'water_village', mapSize: 72, seed: 102, parMin: 12,
    blurb: 'Stilt-houses under threat — hold the water village and drive the raiders back.',
  },
  {
    id: 'pasar', name: 'Skirmish at the Tamu', x: 300, y: 250, prev: 'ayer',
    faction: 'shahbandar', difficulty: 'normal', mode: 'tycoon',
    tycoon: { secs: 80, target: 650, startGold: 60 },
    blurb: 'The market is contested ground. Run your stalls, keep them stocked through the rush, and out-trade three rival kampongs before the bell.',
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
    faction: 'saman', difficulty: 'normal', mode: 'td',
    td: { waves: 6, kampongHp: 100, startGold: 175 },
    blurb: 'A people’s resistance forms at the stream. Plant defenders along the banks and hold the kampong through every wave of raiders.',
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
