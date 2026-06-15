// Content for "Merge Kampong" — the merge mini-game. Themed to rebuilding a
// Bruneian water village, so merging has a story reason (component #2).
//
// Tier chains are intentionally LEGIBLE (you always see the whole ladder and the
// next rung you're working toward) and higher tiers are DISCOVERED on first
// merge — the curiosity gap that pulls you forward (component #1).

export const CHAINS = {
  wood:  { name: 'Timber', from: 'jungle', color: '#a9743f',
    tiers: ['Twig', 'Branch', 'Log', 'Plank', 'Beam', 'House Frame'] },
  sago:  { name: 'Sago',   from: 'grove',  color: '#d9b24e',
    tiers: ['Seedling', 'Frond', 'Bundle', 'Pith', 'Flour', 'Ambuyat'] },
  stone: { name: 'Stone',  from: 'quarry', color: '#9aa0a8',
    tiers: ['Pebble', 'Rock', 'Boulder', 'Cut Block', 'Foundation'] },
  fish:  { name: 'Catch',  from: 'river',  color: '#46a0b8',
    tiers: ['Bait', 'Fry', 'Fish', 'Full Net', 'Smoked Fish'] },
};

export const CHAIN_IDS = Object.keys(CHAINS);

// An item id is `${chain}:${tier}` (tier is 0-based).
export const itemId = (chain, tier) => `${chain}:${tier}`;
export const parseItem = (id) => { const [c, t] = id.split(':'); return { chain: c, tier: +t }; };
export const maxTier = (chain) => CHAINS[chain].tiers.length - 1;
export const itemName = (id) => { const { chain, tier } = parseItem(id); return CHAINS[chain].tiers[tier]; };
export const itemColor = (id) => CHAINS[parseItem(id).chain].color;
// coins an item is worth when sold / used (rises steeply with tier)
export const itemValue = (id) => { const { tier } = parseItem(id); return Math.round(3 * Math.pow(2.1, tier)); };

// Generators: tap to spawn a low-tier item of their chain. Costs energy and sits
// on a cooldown — the pacing/return hook (component #3).
export const GENERATORS = {
  jungle: { name: 'Jungle',     chain: 'wood',  cost: 2, cooldownMs: 1200, spawn: [0, 0, 0, 1] },
  grove:  { name: 'Sago Grove', chain: 'sago',  cost: 2, cooldownMs: 1200, spawn: [0, 0, 0, 1] },
  quarry: { name: 'Quarry',     chain: 'stone', cost: 3, cooldownMs: 1800, spawn: [0, 0, 1] },
  river:  { name: 'River',      chain: 'fish',  cost: 3, cooldownMs: 1800, spawn: [0, 0, 1] },
};
export const GENERATOR_IDS = Object.keys(GENERATORS);

// Journey-map nodes (component #4 meta-progression). Each is a stop along the
// river; clearing its orders earns stars and unlocks the next. Coordinates are
// in the map's 760×360 viewBox; `road` links to the previous node.
export const JOURNEY = [
  { id: 'muara',     name: "Muara Mouth",     x: 70,  y: 250, prev: null },
  { id: 'ayer',      name: 'Kampong Ayer',    x: 180, y: 200, prev: 'muara' },
  { id: 'pasar',     name: 'Tamu Pasar',      x: 300, y: 250, prev: 'ayer' },
  { id: 'sungai',    name: 'Sungai Damuan',   x: 410, y: 170, prev: 'pasar' },
  { id: 'kianggeh',  name: 'Kianggeh',        x: 520, y: 240, prev: 'sungai' },
  { id: 'kotabatu',  name: 'Kota Batu',       x: 620, y: 150, prev: 'kianggeh' },
  { id: 'istana',    name: 'Istana Lama',     x: 700, y: 230, prev: 'kotabatu' },
];

// Each node needs this many completed orders (stars: up to 3) to count as cleared.
export const ORDERS_PER_NODE = 3;

// Short narrative beat shown when a node is entered — the "reason to keep going".
export const NODE_STORY = {
  muara:    'The flood has scattered the kampong. Begin where the river meets the sea.',
  ayer:     'Rebuild the stilt houses of Kampong Ayer, plank by plank.',
  pasar:    'The tamu (market) reopens — traders need sago and fish.',
  sungai:   'Clear the Damuan channel and raise new jetties.',
  kianggeh: 'Kianggeh stream feeds the village — restore its water gardens.',
  kotabatu: 'The old stone capital must rise again from cut blocks.',
  istana:   'Raise the Istana Lama and the kampong is whole once more.',
};
