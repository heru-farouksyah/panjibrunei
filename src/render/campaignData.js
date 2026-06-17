// Campaign missions — the goal layer + meta-progression for the RTS. Each node
// on the journey map is a scripted skirmish along the Brunei river, escalating in
// difficulty. Three stars per mission: ★ win · ★ win under `parMin` minutes ·
// ★ win without losing a building (flawless). Coords are in the 760×360 map.
export const MISSIONS = [
  {
    id: 'muara', name: 'Landing at Muara', x: 70, y: 250, prev: null,
    faction: 'semaun', difficulty: 'easy', theme: 'water_village', mapSize: 72, seed: 101, parMin: 11,
    blurb: 'Awang Semaun comes ashore. Carve out a foothold and break the first warband.',
  },
  {
    id: 'ayer', name: 'Defence of Kampong Ayer', x: 180, y: 200, prev: 'muara',
    faction: 'sakam', difficulty: 'easy', theme: 'water_village', mapSize: 72, seed: 102, parMin: 12,
    blurb: 'Stilt-houses under threat — hold the water village and drive the raiders back.',
  },
  {
    id: 'pasar', name: 'Skirmish at the Tamu', x: 300, y: 250, prev: 'ayer',
    faction: 'shahbandar', difficulty: 'normal', theme: 'tropical', mapSize: 96, seed: 103, parMin: 14,
    blurb: 'The market is contested ground. Out-trade and out-fight three rival kampongs.',
  },
  {
    id: 'sungai', name: 'Sungai Damuan', x: 410, y: 170, prev: 'pasar',
    faction: 'hassan', difficulty: 'normal', theme: 'tropical', mapSize: 96, seed: 104, parMin: 15,
    blurb: 'Seize the river channel and its fords before the enemy fleets gather.',
  },
  {
    id: 'kianggeh', name: 'Kianggeh Stand', x: 520, y: 240, prev: 'sungai',
    faction: 'saman', difficulty: 'normal', theme: 'desert', mapSize: 96, seed: 105, parMin: 16,
    blurb: 'A people’s resistance forms at the stream. Survive the early rush and rally.',
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
