import { TICK_RATE } from './constants.js';

// Combat: auto-acquisition, stances, melee wind-up, pooled projectiles,
// counter bonuses, armor, splash. Buildings with an `attack` block (kubu,
// later war boats use the unit path) fight through the same code.

function hasStatus(e, type) {
  if (!e.statuses) return false;
  for (const s of e.statuses) if (s.type === type) return true;
  return false;
}

function statusSum(e, type) {
  let v = 0;
  if (e.statuses) for (const s of e.statuses) if (s.type === type) v += s.data;
  return v;
}

function statusMult(e, type) {
  let v = 1;
  if (e.statuses) for (const s of e.statuses) if (s.type === type) v *= s.data;
  return v;
}

export function effectiveAtk(sim, e) {
  const mods = sim.players[e.owner]?.mods;
  if (!mods || e.kind !== 'unit') return e.atk;
  return e.atk + (e.range > 0 ? mods.rangedAtk : mods.meleeAtk);
}

export function effectiveArmor(sim, e) {
  const mods = sim.players[e.owner]?.mods;
  let armor = e.armor;
  if (mods && e.kind === 'unit') armor += mods.unitArmor;
  armor += statusSum(e, 'armorBonus');
  return armor;
}

function bonusMult(attackerProto, target) {
  let m = 1;
  const bonus = attackerProto.bonusVs ?? {}; // building attack blocks have none
  for (const tag of target.proto.tags) {
    if (bonus[tag]) m *= bonus[tag];
  }
  return m;
}

export function applyDamage(sim, attacker, target, baseAtk, attackerProto) {
  if (!target.alive) return;
  let dmg = baseAtk * bonusMult(attackerProto, target);
  dmg *= statusMult(target, 'dmgTakenMult'); // Badar mark etc.
  dmg = Math.max(1, dmg - effectiveArmor(sim, target));

  // shields absorb a flat pool first (Hassan ultimate)
  if (target.statuses) {
    for (const s of target.statuses) {
      if (s.type === 'shield' && s.data > 0) {
        const absorbed = Math.min(s.data, dmg);
        s.data -= absorbed;
        dmg -= absorbed;
        if (dmg <= 0) break;
      }
    }
  }
  if (dmg <= 0) return;

  target.hp -= dmg;
  target.lastAttackedTick = sim.tick;
  sim.emit('damaged', { x: target.x, z: target.z, owner: target.owner });
  if (attacker) {
    // retaliate if idle and armed
    if (
      target.kind === 'unit' && target.alive && target.atk > 0 &&
      target.targetId < 0 && target.stance === 'aggressive' &&
      (target.state === 'idle' || (target.state === 'moving' && !target.order))
    ) {
      target.targetId = attacker.id;
    }
    // workers and unarmed boats flee a short distance
    if (target.kind === 'unit' && target.atk === 0 && !target.order) {
      const dx = target.x - attacker.x;
      const dz = target.z - attacker.z;
      const d = Math.hypot(dx, dz) || 1;
      sim.requestPathTo(target, target.x + (dx / d) * 5, target.z + (dz / d) * 5);
    }
  }
  if (target.hp <= 0) {
    sim.killEntity(target, attacker ? attacker.owner : -1);
  }
}

function fireProjectile(sim, attacker, target, proto) {
  const p = sim.pool.spawn();
  p.kind = 'proj';
  p.proto = proto;
  p.protoId = attacker.protoId + ':proj';
  p.owner = attacker.owner;
  p.x = p.prevX = attacker.x;
  p.z = p.prevZ = attacker.z;
  p.projTargetId = target.id;
  p.projX1 = target.x;
  p.projZ1 = target.z;
  p.projX0 = attacker.x;
  p.projZ0 = attacker.z;
  p.projT = 0;
  p.speedPerTick = (proto.projSpeed ?? 9) / TICK_RATE;
  p.projDmg = effectiveAtk(sim, attacker) || (attacker.proto.attack?.atk ?? attacker.atk);
  p.projArc = proto.projArc === true;
  p.projSplash = proto.splash ?? 0;
  p.projThrown = attacker.proto.tags?.includes('thrower') === true;
  // ignition: firebomb throwers always set a blaze; archers do once the
  // player has researched Fire Arrows
  const mods = sim.players[attacker.owner]?.mods;
  if (attacker.proto.firebomb) p.projIgnite = (proto.splash ?? 1) + 0.5;
  else if (mods?.fireArrows && attacker.proto.tags?.includes('archer')) p.projIgnite = 0;
  else p.projIgnite = -1;
  p.projOwnerEnt = attacker.id;
  sim.emit('shoot', { x: attacker.x, z: attacker.z, thrown: p.projThrown, splash: p.projSplash });
}

function projectileImpact(sim, p) {
  const attacker = sim.pool.get(p.projOwnerEnt);
  const attackerProto = p.proto;
  const target = sim.pool.get(p.projTargetId);
  sim.emit('impact', { x: p.x, z: p.z, splash: p.projSplash });
  if (p.projSplash > 0) {
    const victims = [];
    sim.hash.near(p.x, p.z, p.projSplash + 0.4, (u) => {
      if (u.owner !== p.owner) victims.push(u);
    });
    sim.pool.forEach((b) => {
      if (b.kind === 'building' && b.owner !== p.owner && b.owner >= 0 &&
          Math.hypot(b.x - p.x, b.z - p.z) < p.projSplash + b.size * 0.5) {
        victims.push(b);
      }
    });
    for (const v of victims) {
      applyDamage(sim, attacker, v, p.projDmg * (v.id === p.projTargetId ? 1 : 0.5), attackerProto);
    }
  } else if (target) {
    // mild homing: hit if the target is still near the impact point
    if (Math.hypot(target.x - p.x, target.z - p.z) < 1.2 + target.radius) {
      applyDamage(sim, attacker, target, p.projDmg, attackerProto);
    }
  }
  // fire arrows / firebombs set the ground (and anything on it) alight
  if (p.projIgnite >= 0) sim.fire.ignite(sim, p.x, p.z, p.projIgnite);
  sim.pool.kill(p);
}

function meleeRangeOf(e, t) {
  return e.radius + t.radius + 0.3;
}

function tryAcquire(sim, e, losRange, includeBuildings) {
  let best = null;
  let bestD = losRange * losRange;
  sim.hash.near(e.x, e.z, losRange, (u) => {
    if (u.owner === e.owner || u.owner < 0 || !u.alive) return;
    if (u.hiddenInJungle) return;
    if (e.proto.domain === 'water' && u.proto?.domain === 'land' && e.range === 0) return;
    const d = (u.x - e.x) ** 2 + (u.z - e.z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = u;
    }
  });
  if (!best && includeBuildings) {
    sim.pool.forEach((b) => {
      if (b.kind !== 'building' || b.owner === e.owner || b.owner < 0) return;
      const d = (b.x - e.x) ** 2 + (b.z - e.z) ** 2;
      const r = losRange + b.size * 0.5;
      if (d < Math.min(bestD, r * r)) {
        bestD = d;
        best = b;
      }
    });
  }
  return best;
}

function engage(sim, e, t) {
  const isRanged = e.range > 0;
  const dist = Math.hypot(t.x - e.x, t.z - e.z);
  const reach = isRanged ? e.range + t.radius : meleeRangeOf(e, t);

  if (dist <= reach) {
    e.path = null;
    e.pathI = 0;
    e.facing = Math.atan2(t.x - e.x, t.z - e.z);
    e.state = 'attacking';
    if (e.cooldown <= 0 && e.windup < 0) {
      if (isRanged) {
        fireProjectile(sim, e, t, e.proto.attack ?? e.proto);
        e.cooldown = e.atkTicks * statusMult(e, 'atkSpeedMult');
        e.lastCombatTick = sim.tick;
      } else {
        e.windup = e.windupTicks;
      }
    }
    return true;
  }

  // out of reach: chase (buildings can't)
  if (e.kind === 'building') return false;
  e.state = 'moving';
  if (e.repathCooldown <= 0) {
    e.repathCooldown = 10;
    if (dist < 7) {
      e.path = [{ x: t.x, z: t.z }];
      e.pathI = 0;
    } else {
      sim.requestPathTo(e, t.x, t.z);
    }
  }
  return true;
}

export function combatSystem(sim) {
  sim.pool.forEach((e) => {
    if (!e.alive) return;

    // --- projectiles fly every tick ---
    if (e.kind === 'proj') {
      const t = sim.pool.get(e.projTargetId);
      if (t) {
        e.projX1 = t.x;
        e.projZ1 = t.z;
      }
      const dx = e.projX1 - e.x;
      const dz = e.projZ1 - e.z;
      const dist = Math.hypot(dx, dz);
      e.projT += e.speedPerTick / Math.max(0.6, dist + e.projT * 0); // normalized-ish step
      const step = e.speedPerTick;
      if (dist <= step) {
        e.x = e.projX1;
        e.z = e.projZ1;
        projectileImpact(sim, e);
      } else {
        e.x += (dx / dist) * step;
        e.z += (dz / dist) * step;
        e.facing = Math.atan2(dx, dz);
      }
      return;
    }

    const canFight =
      (e.kind === 'unit' && e.atk > 0) ||
      (e.kind === 'building' && e.proto.attack && e.complete);
    if (!canFight) return;
    if (hasStatus(e, 'stun')) {
      e.windup = -1;
      return;
    }

    if (e.cooldown > 0) e.cooldown--;
    if (e.repathCooldown > 0) e.repathCooldown--;

    // melee wind-up resolves into a hit
    if (e.windup >= 0) {
      e.windup--;
      if (e.windup < 0) {
        const t = sim.pool.get(e.targetId);
        if (t && Math.hypot(t.x - e.x, t.z - e.z) <= meleeRangeOf(e, t) + 0.35) {
          applyDamage(sim, e, t, effectiveAtk(sim, e), e.proto);
          // hero cleave (Semaun): splash around the struck target
          if (e.proto.splash && e.kind === 'unit' && e.range === 0) {
            sim.hash.near(t.x, t.z, e.proto.splash, (u) => {
              if (u.owner !== e.owner && u.owner >= 0 && u !== t) {
                applyDamage(sim, e, u, effectiveAtk(sim, e) * 0.5, e.proto);
              }
            });
          }
          e.lastCombatTick = sim.tick;
          sim.emit('melee-hit', { x: t.x, z: t.z });
        }
        e.cooldown = Math.round(e.atkTicks * statusMult(e, 'atkSpeedMult'));
      }
      return;
    }

    // current target
    let target = e.targetId >= 0 ? sim.pool.get(e.targetId) : null;
    if (target && (target.owner === e.owner || target.hiddenInJungle)) target = null;
    if (target) {
      // leash: don't chase forever without an explicit order
      const leash = e.order?.type === 'attack' ? 1e9 : (e.proto.los ?? 6) + 4;
      if (Math.hypot(target.x - e.x, target.z - e.z) > leash) target = null;
    }
    if (!target) {
      e.targetId = -1;
      if (e.state === 'attacking') e.state = 'idle';
      // auto-acquire on a slow scan
      if (e.scanCooldown > 0) {
        e.scanCooldown--;
      } else {
        e.scanCooldown = 8;
        // explicit attack order: re-lock the target once it's targetable
        // again (e.g. an ambusher revealed itself); drop the order if dead
        if (e.order?.type === 'attack') {
          const ot = sim.pool.get(e.order.targetId);
          if (!ot) e.order = null;
          else if (!ot.hiddenInJungle && ot.owner !== e.owner) e.targetId = ot.id;
        }
        const idleOrMarching =
          e.state === 'idle' ||
          e.order?.type === 'attackmove' ||
          e.order?.type === 'attack' ||
          (e.kind === 'building');
        const uncontrolled = e.proto.uncontrollable === true;
        if ((idleOrMarching || uncontrolled) && e.stance !== 'hold') {
          const losRange = (e.proto.los ?? 6) + (sim.players[e.owner]?.mods.losBonus ?? 0);
          // aggressive military units also pick off nearby enemy buildings,
          // so an army parked at the enemy base tears it down on its own
          const isMilitary = e.proto.tags?.includes('military');
          const includeBuildings = e.order?.type === 'attackmove' || uncontrolled ||
            (isMilitary && e.stance === 'aggressive');
          const found = tryAcquire(sim, e, losRange, includeBuildings);
          if (found) e.targetId = found.id;
        } else if (e.stance === 'hold' && e.state === 'idle') {
          // hold ground: only hit things already in reach
          const reach = e.range > 0 ? e.range : meleeRangeOf(e, { x: e.x, z: e.z, radius: 0.3 });
          const found = tryAcquire(sim, e, reach, false);
          if (found) e.targetId = found.id;
        }
      }
      // resume an interrupted attack-move
      if (e.targetId < 0 && e.kind === 'unit' && e.order?.type === 'attackmove' &&
          !e.path && e.state !== 'moving' && e.repathCooldown <= 0) {
        e.repathCooldown = 20;
        sim.requestPathTo(e, e.order.x, e.order.z);
      }
      if (e.targetId < 0) return;
    }

    const t = sim.pool.get(e.targetId);
    if (t) engage(sim, e, t);
    else e.targetId = -1;
  });
}
