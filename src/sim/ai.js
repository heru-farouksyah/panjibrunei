import { GRID, TICK_RATE, TileType } from './constants.js';
import { UNIT_PROTOS, BUILDING_PROTOS } from './entities.js';
import { RES_OF_TILE } from './economy.js';

const THINK_INTERVAL = 2 * TICK_RATE; // slow think-tick, every 2s

const DIFFICULTY = {
  easy: {
    villagerScale: 0.6,
    firstWave: 3 * 60 * TICK_RATE,
    waveEvery: 2 * 60 * TICK_RATE,
    waveSize: [4, 7, 10, 12],
    maxEra: 3,
    trickle: 0, // resource trickle knob (cheats); 0 = honest
  },
  normal: {
    villagerScale: 1,
    firstWave: 1.4 * 60 * TICK_RATE, // raids very early so the pressure is on
    waveEvery: 1.2 * 60 * TICK_RATE,
    waveSize: [3, 8, 13, 17],
    maxEra: 4,
    trickle: 0, // no cheating on Normal
  },
  hard: {
    villagerScale: 1.15,
    firstWave: 0.8 * 60 * TICK_RATE, // an immediate rush — defend or die
    waveEvery: 0.9 * 60 * TICK_RATE,
    waveSize: [4, 10, 18, 24],
    maxEra: 4,
    trickle: 2, // a light, declared resource edge so Hard out-produces you
  },
};

// Scripted AI: economy ratios + expansion, counter-based army composition
// using only fog-revealed information, timed attack waves that scale with
// era, retreat when losing, rebuild after raids, hero + ultimate usage.
export class AIController {
  constructor(sim, owner = 1, difficulty = 'normal') {
    this.sim = sim;
    this.owner = owner;
    this.cfg = DIFFICULTY[difficulty] ?? DIFFICULTY.normal;
    this.enemySeen = { infantry: 0, archer: 0, skirmisher: 0, siege: 0, boat: 0, villager: 0 };
    this.nextWaveTick = this.cfg.firstWave;
    this.waveActive = false;
    this.waveIds = [];
    this.waveStartSize = 0;
    this.waveCount = 0;
    this.defendUntil = 0;
    this.defendPoint = null;
  }

  think() {
    const sim = this.sim;
    const player = sim.players[this.owner];
    if (player.defeated) return;

    if (this.cfg.trickle > 0) {
      for (const res of ['food', 'timber', 'gold']) player.resources[res] += this.cfg.trickle;
    }

    // --- census ---
    const my = {
      villagers: [], military: [], idleVillagers: [], buildings: new Map(),
      istana: null, balai: null, panggung: null, hero: null,
    };
    sim.pool.forEach((e) => {
      if (e.owner !== this.owner) return;
      if (e.kind === 'unit') {
        if (e.proto.tags.includes('villager')) {
          my.villagers.push(e);
          if (e.state === 'idle' && !e.order) my.idleVillagers.push(e);
        } else if (e.proto.tags.includes('military') && e.proto.domain === 'land' && !e.proto.uncontrollable) {
          my.military.push(e);
        }
        if (e.proto.hero) my.hero = e;
      } else if (e.kind === 'building') {
        const list = my.buildings.get(e.protoId) ?? [];
        list.push(e);
        my.buildings.set(e.protoId, list);
        if (e.protoId === 'istana' && e.complete) my.istana = e;
        if (e.protoId === 'balai_pahlawan' && e.complete) my.balai = e;
        if (e.protoId === 'panggung_panji' && e.complete) my.panggung = e;
      }
    });
    const base = my.istana ?? my.buildings.get('istana')?.[0];
    const home = sim.grid.startZones[this.owner];
    const basePos = base ? { x: base.x, z: base.z } : { x: home.x, z: home.y };

    // --- intel: decay memory, count enemy units we can currently see ---
    for (const k of Object.keys(this.enemySeen)) this.enemySeen[k] *= 0.9;
    sim.pool.forEach((e) => {
      if (e.kind !== 'unit' || e.owner === this.owner || e.owner < 0) return;
      if (!sim.fog.entityVisible(this.owner, e)) return;
      for (const tag of e.proto.tags) {
        if (tag in this.enemySeen) this.enemySeen[tag] += 1;
      }
    });

    this.economy(my, basePos);
    this.infrastructure(my, basePos);
    this.military(my);
    this.defense(my, basePos);
    this.waves(my, basePos);
    this.heroPlay(my, basePos);
  }

  // ---------- economy ----------

  villagerTarget(player) {
    return Math.round((6 + player.era * 6) * this.cfg.villagerScale);
  }

  economy(my, basePos) {
    const sim = this.sim;
    const player = sim.players[this.owner];

    // train villagers
    if (my.istana && my.villagers.length < this.villagerTarget(player) && my.istana.queue.length < 2) {
      sim.cmdTrain(my.istana.id, 'penduduk', this.owner);
    }

    // era advancement
    if (
      player.era < this.cfg.maxEra &&
      my.istana && !my.istana.techQueue &&
      my.villagers.length >= this.villagerTarget(player) * 0.7
    ) {
      sim.cmdResearchEra(my.istana.id, this.owner);
    }

    // assign idle villagers to the most-needed resource
    for (const v of my.idleVillagers) {
      const weights = {
        food: 1.1 / (1 + player.resources.food / 250),
        timber: 1.0 / (1 + player.resources.timber / 250),
        gold: 0.85 / (1 + player.resources.gold / 250),
        camphor: (player.era >= 2 ? 0.9 : 0.1) / (1 + player.resources.camphor / 150),
      };
      const order = Object.entries(weights).sort((a, b) => b[1] - a[1]);
      let assigned = false;
      for (const [res] of order) {
        const tile = this.findNodeTile(res, basePos);
        if (tile) {
          sim.cmdGather([v.id], tile.x, tile.z, this.owner);
          assigned = true;
          break;
        }
      }
      if (!assigned) {
        // no nodes left nearby: work or build a farm
        const farms = (my.buildings.get('kebun') ?? []).filter((f) => f.complete);
        if (farms.length > 0) {
          sim.cmdFarm([v.id], farms[(sim.rng() * farms.length) | 0].id, this.owner);
        } else {
          this.tryBuild(my, 'kebun', basePos, [v]);
        }
      }
    }
  }

  findNodeTile(res, basePos) {
    const grid = this.sim.grid;
    const want = Object.entries(RES_OF_TILE).find(([, r]) => r === res);
    if (!want) return null;
    const wantType = Number(want[0]);
    let best = null;
    let bestD = 28 * 28;
    const bx = basePos.x | 0;
    const bz = basePos.z | 0;
    for (let dz = -28; dz <= 28; dz += 1) {
      for (let dx = -28; dx <= 28; dx += 1) {
        const x = bx + dx;
        const z = bz + dz;
        if (!grid.inBounds(x, z)) continue;
        if (grid.types[grid.idx(x, z)] !== wantType) continue;
        if (grid.resources[grid.idx(x, z)] <= 0) continue;
        const d = dx * dx + dz * dz;
        if (d < bestD) {
          bestD = d;
          best = { x, z };
        }
      }
    }
    return best;
  }

  findSpot(protoId, basePos, towardEnemy = 0) {
    const sim = this.sim;
    const enemyHome = sim.nearestEnemyHome(this.owner);
    let cx = basePos.x;
    let cz = basePos.z;
    if (towardEnemy > 0) {
      const dx = enemyHome.x - basePos.x;
      const dz = enemyHome.y - basePos.z;
      const d = Math.hypot(dx, dz) || 1;
      cx += (dx / d) * towardEnemy;
      cz += (dz / d) * towardEnemy;
    }
    for (let r = 2; r < 16; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const x = (cx | 0) + dx;
          const z = (cz | 0) + dz;
          if (sim.canPlace(protoId, x, z)) return { x, z };
        }
      }
    }
    return null;
  }

  tryBuild(my, protoId, basePos, builders = null, towardEnemy = 0) {
    const sim = this.sim;
    const player = sim.players[this.owner];
    const proto = BUILDING_PROTOS[protoId];
    if (proto.era > player.era) return false;
    if (!sim.canAfford(this.owner, sim.costOf(this.owner, proto))) return false;
    const crew = builders ?? my.idleVillagers.slice(0, 2);
    const fallback = crew.length === 0 ? my.villagers.slice(0, 2) : crew;
    if (fallback.length === 0) return false;
    const spot = this.findSpot(protoId, basePos, towardEnemy);
    if (!spot) return false;
    return sim.cmdBuild(fallback.map((e) => e.id), protoId, spot.x, spot.z, this.owner);
  }

  // ---------- infrastructure ----------

  countOf(my, protoId) {
    return (my.buildings.get(protoId) ?? []).length;
  }

  infrastructure(my, basePos) {
    const sim = this.sim;
    const player = sim.players[this.owner];

    // critical: rebuild a lost istana
    if (this.countOf(my, 'istana') === 0 && my.villagers.length > 0) {
      this.tryBuild(my, 'istana', basePos);
      return;
    }
    // housing ahead of need
    if (player.popCap - player.pop < 4 && player.popCap < 80) {
      const pending = (my.buildings.get('rumah_kampong') ?? []).some((b) => !b.complete);
      if (!pending) this.tryBuild(my, 'rumah_kampong', basePos);
    }
    // storage ahead of need: expand the granary BEFORE a resource caps out, or
    // the AI's gathered surplus is wasted and its economy stalls. (Same lesson
    // as towers — gate it so it never starves the build budget.)
    if (player.resCap) {
      const nearCap = Object.keys(player.resCap).some(
        (r) => player.resCap[r] > 0 && player.resources[r] > player.resCap[r] * 0.85
      );
      const pendingStore = (my.buildings.get('lumbung') ?? []).some((b) => !b.complete);
      if (nearCap && !pendingStore && this.countOf(my, 'lumbung') < 5) {
        this.tryBuild(my, 'lumbung', basePos);
      }
    }
    if (this.countOf(my, 'balai_pahlawan') === 0 && my.villagers.length >= 6) {
      this.tryBuild(my, 'balai_pahlawan', basePos);
    }
    if (player.era >= 2 && this.countOf(my, 'gerai_tukang') === 0) {
      this.tryBuild(my, 'gerai_tukang', basePos);
    }
    // watchtowers: fortify toward the enemy once there's a barracks and a
    // few troops. Only with spare timber and pop headroom, so towers never
    // starve housing (each costs ~90 timber). Build more readily when the
    // base has been raided recently.
    const recentlyRaided = sim.tick - (this.lastRaidTick ?? -1e9) < 25 * TICK_RATE;
    const towerCap = recentlyRaided ? 3 : 2;
    const timberFloor = recentlyRaided ? 120 : 150;
    if (my.balai && this.countOf(my, 'kubu') < towerCap && my.military.length >= 4 &&
        player.resources.timber > timberFloor && player.popCap - player.pop >= 0) {
      this.tryBuild(my, 'kubu', basePos, null, 7);
    }
    if (player.era >= 2 && this.countOf(my, 'surau') === 0) {
      this.tryBuild(my, 'surau', basePos);
    }
    if (player.era >= 3 && this.countOf(my, 'panggung_panji') === 0) {
      this.tryBuild(my, 'panggung_panji', basePos);
    }
    // a dock if the shore is close (enables fishing boats later)
    if (this.countOf(my, 'pangkalan') === 0 && player.era >= 2) {
      const spot = this.findSpot('pangkalan', basePos);
      if (spot && Math.hypot(spot.x - basePos.x, spot.z - basePos.z) < 14) {
        this.tryBuild(my, 'pangkalan', basePos);
      }
    }
    // research blacksmith techs when comfortable
    const gerai = (my.buildings.get('gerai_tukang') ?? []).find((b) => b.complete && !b.techQueue);
    if (gerai && player.resources.food > 400) {
      for (const tech of gerai.proto.techs) {
        if (!player.techs.has(tech.id) && tech.era <= player.era) {
          if (sim.cmdResearchTech(gerai.id, tech.id, this.owner)) break;
        }
      }
    }
  }

  // ---------- military ----------

  pickTrainProto(player) {
    const seen = this.enemySeen;
    const e3 = player.era >= 3;
    // counter what we've SEEN of the enemy army; archers form the backbone
    const scores = {
      pahlawan_kampilan: 1 + seen.skirmisher * 0.6,
      penikam_keris: 1.05 + seen.archer * 0.8, // cheap default rush unit
      pelempar_lembing: 1.15 + seen.infantry * 0.5, // early thrown ranged
      pemanah: 1.3 + seen.infantry * 0.7, // arrow army (available from era 1)
      lela_gunner: e3 ? 0.4 + seen.siege * 0.2 : -1,
    };
    let best = 'pahlawan_kampilan';
    let bestS = -1;
    for (const [id, s] of Object.entries(scores)) {
      if (s > bestS) {
        bestS = s;
        best = id;
      }
    }
    return best;
  }

  military(my) {
    const sim = this.sim;
    const player = sim.players[this.owner];
    if (!my.balai || my.balai.queue.length >= 3) return;
    if (my.villagers.length < 6) return; // economy first
    // once the next wave's army is ready, bank resources for the era-up
    const threshold = this.cfg.waveSize[player.era - 1];
    if (
      my.military.length >= threshold + 2 &&
      player.era < this.cfg.maxEra &&
      my.istana && !my.istana.techQueue
    ) {
      return;
    }
    sim.cmdTrain(my.balai.id, this.pickTrainProto(player), this.owner);
  }

  // ---------- defense / waves ----------

  defense(my, basePos) {
    const sim = this.sim;
    // base under attack? (buildings hit in the last 5s)
    let attacked = null;
    sim.pool.forEach((e) => {
      if (e.owner !== this.owner || e.kind !== 'building') return;
      if (sim.tick - e.lastAttackedTick < 5 * TICK_RATE) attacked = e;
    });
    if (attacked) {
      this.defendPoint = { x: attacked.x, z: attacked.z };
      this.defendUntil = sim.tick + 12 * TICK_RATE;
      this.lastRaidTick = sim.tick; // prompts the AI to fortify with towers
      if (!this.waveActive) {
        const defenders = my.military.filter((e) => !e.order || e.order.type === 'move');
        if (defenders.length > 0) {
          sim.cmdAttackMove(defenders.map((e) => e.id), attacked.x, attacked.z, this.owner);
        }
      }
    }
  }

  waves(my, basePos) {
    const sim = this.sim;
    const player = sim.players[this.owner];
    // the first wave goes out at the era-1 size so it lands on schedule
    const threshold =
      this.waveCount === 0 ? this.cfg.waveSize[0] : this.cfg.waveSize[player.era - 1];

    if (!this.waveActive) {
      if (sim.tick >= this.nextWaveTick && my.military.length >= threshold) {
        // target the NEAREST rival kingdom (free-for-all) — a scouted enemy
        // istana if known, otherwise that kingdom's home
        const enemyHome = sim.nearestEnemyHome(this.owner);
        let target = { x: enemyHome.x, z: enemyHome.y };
        let bestD = Infinity;
        sim.pool.forEach((en) => {
          if (en.kind !== 'building' || en.protoId !== 'istana') return;
          if (en.owner === this.owner || en.owner < 0) return;
          if (!sim.fog.tileExplored(this.owner, en.x | 0, en.z | 0)) return;
          const d = (en.x - my.istana?.x) ** 2 + (en.z - my.istana?.z) ** 2;
          if (d < bestD) {
            bestD = d;
            target = { x: en.x, z: en.z };
          }
        });
        // the boss stays home to guard the capital — never joins a wave
        this.waveIds = my.military.filter((e) => !e.isBoss).map((e) => e.id);
        this.waveStartSize = this.waveIds.length;
        this.waveActive = true;
        this.waveCount++;
        if (my.hero && !my.hero.isBoss) this.waveIds.push(my.hero.id);
        sim.cmdAttackMove(this.waveIds, target.x, target.z, this.owner);
      }
      return;
    }

    const alive = this.waveIds.filter((id) => sim.pool.get(id)).length;
    if (alive === 0 || alive < this.waveStartSize * 0.4) {
      // retreat what's left and regroup
      const survivors = this.waveIds.filter((id) => sim.pool.get(id));
      if (survivors.length > 0) {
        sim.cmdMove(survivors, basePos.x, basePos.z, this.owner);
      }
      this.waveActive = false;
      this.waveIds = [];
      this.nextWaveTick = sim.tick + this.cfg.waveEvery;
    }
  }

  // ---------- hero ----------

  heroPlay(my, basePos) {
    const sim = this.sim;
    const player = sim.players[this.owner];
    if (my.panggung && !player.heroAlive && player.heroRespawn === 0 && player.era >= 3) {
      sim.cmdSummonHero(my.panggung.id, this.owner);
    }
    const hero = my.hero;
    if (!hero || player.ultCooldown > 0) return;

    let enemiesNear = 0;
    let alliesNear = 0;
    let alliesHurt = 0;
    let villagersNear = 0;
    sim.hash.near(hero.x, hero.z, 9, (u) => {
      if (u.owner === this.owner) {
        alliesNear++;
        if (u.hp < u.maxHp * 0.7) alliesHurt++;
        if (u.proto.tags.includes('villager')) villagersNear++;
      } else if (u.owner >= 0) {
        enemiesNear++;
      }
    });

    const ultId = player.faction.ult.id;
    const fire =
      (ultId === 'kekuatan_gergasi' && enemiesNear >= 4) ||
      (ultId === 'serbuan_berani_mati' && enemiesNear >= 6) ||
      (ultId === 'perintah_adil' && alliesNear >= 6 && alliesHurt >= 3) ||
      (ultId === 'lidah_pujangga' && enemiesNear >= 4) ||
      (ultId === 'bara_perjuangan' && villagersNear >= 5 && enemiesNear >= 3) ||
      (ultId === 'mata_strategi' && this.waveActive && enemiesNear >= 2);
    if (fire) sim.cmdUltimate(this.owner);
  }
}

export function aiSystem(sim) {
  if (!sim.ais || sim.ais.length === 0) return;
  if (sim.tick % THINK_INTERVAL !== 0) return;
  // stagger the kingdoms across think-ticks so they don't all run on the same
  // frame (smoother) and so their decisions feel independent
  for (const ai of sim.ais) ai.think();
}
