// General StatusEffect system. A status is {type, ticksLeft, data}.
// Known types (all generic — no hero-specific hacks elsewhere):
//   stun            — unit takes no actions (movement + combat check it)
//   shield          — data = remaining flat damage absorption
//   atkSpeedMult    — data multiplies attack cooldown (0.8 = 20% faster)
//   speedMult       — data multiplies move speed
//   dmgTakenMult    — data multiplies incoming damage (Badar mark: 1.25)
//   armorBonus      — data adds to effective armor (Hassan auras)
//   conversionImmune— blocks ownership conversion
//   marked          — render flag (teal outline), no sim effect by itself
//   transform       — temporary proto swap (Saman militia); data holds the
//                     saved villager fields and is restored on expiry

export function addStatus(e, type, ticks, data) {
  if (!e.statuses) e.statuses = [];
  e.statuses.push({ type, ticksLeft: ticks, data });
}

export function getStatus(e, type) {
  if (!e.statuses) return null;
  for (const s of e.statuses) if (s.type === type) return s;
  return null;
}

export function hasStatus(e, type) {
  return getStatus(e, type) !== null;
}

export function clearStatus(e, type) {
  if (!e.statuses) return;
  for (let i = e.statuses.length - 1; i >= 0; i--) {
    if (e.statuses[i].type === type) e.statuses.splice(i, 1);
  }
}

function revertTransform(sim, e, saved) {
  const frac = Math.max(0.05, e.hp / e.maxHp);
  e.proto = saved.proto;
  e.protoId = saved.protoId;
  e.maxHp = saved.maxHp;
  e.hp = Math.round(e.maxHp * frac);
  e.atk = saved.atk;
  e.range = saved.range;
  e.atkTicks = saved.atkTicks;
  e.windupTicks = saved.windupTicks;
  e.speedPerTick = saved.speedPerTick;
  e.targetId = -1;
  e.order = null;
  e.path = null;
  e.state = 'idle';
  // resume the interrupted gather trip (carried resources were never touched)
  if (saved.gatherTile >= 0 && sim.grid.resources[saved.gatherTile] > 0) {
    const tx = saved.gatherTile % sim.grid.size;
    const tz = (saved.gatherTile / sim.grid.size) | 0;
    sim.cmdGather([e.id], tx, tz, e.owner);
  } else if (saved.farmId >= 0 && sim.pool.get(saved.farmId)) {
    sim.cmdFarm([e.id], saved.farmId, e.owner);
  }
  sim.emit('transform-revert', { id: e.id });
}

export function statusSystem(sim) {
  sim.pool.forEach((e) => {
    if (!e.statuses || e.statuses.length === 0) return;
    for (let i = e.statuses.length - 1; i >= 0; i--) {
      const s = e.statuses[i];
      s.ticksLeft--;
      if (s.ticksLeft <= 0) {
        if (s.type === 'transform') revertTransform(sim, e, s.data);
        e.statuses.splice(i, 1);
      }
    }
  });
}
