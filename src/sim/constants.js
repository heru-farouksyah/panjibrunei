// Logical world constants. The sim layer must never import Three.js.

export const GRID = 96;            // logical grid is GRID x GRID tiles
export const TILE = 1;             // world units per tile (render scale)
export const TICK_RATE = 20;       // sim ticks per second
export const TICK_MS = 1000 / TICK_RATE;
export const MAX_TICKS_PER_FRAME = 5; // spiral-of-death guard

export const WATER_LEVEL = 0.18;   // world-space height of the river surface

export const TileType = {
  GRASS: 0,
  EARTH: 1,
  SAND: 2,
  WATER: 3,
  FORD: 4,     // shallow river crossing — land units can pass
  JUNGLE: 5,   // blocks land movement, hides units (later phases)
  GOLD: 6,     // gold-mine rock tile
  CAMPHOR: 7,  // rare camphor grove tile
  SAGO: 8,     // sago grove — early food source
};

// Starting amount of resource per tile, by tile type.
export const NODE_AMOUNT = {
  [TileType.JUNGLE]: 175,  // timber
  [TileType.GOLD]: 900,
  [TileType.CAMPHOR]: 350,
  [TileType.SAGO]: 250,    // food
};
export const FISH_AMOUNT = 500;

export const TileTypeName = Object.fromEntries(
  Object.entries(TileType).map(([k, v]) => [v, k])
);
