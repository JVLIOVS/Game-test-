import {
  AGES,
  CRATE_INTERVAL,
  CRATE_LIFE,
  EVOLVE_XP,
  KILL_GOLD,
  KILL_XP,
  LANE,
  LANE_HALF,
  QUEUE_MAX,
  RAGE_TIME,
  SPECIAL,
  SUDDEN_DEATH,
  SUDDEN_DRAIN,
  START_GOLD,
  TURRET,
  UNITS,
  ageCost,
  ageStat,
  baseHp,
  incomePerSec,
  overtime,
  turretCost,
  unitCost,
} from './data';
import { aiThink } from './ai';
import type { Base, Crate, EpochState, Side, Unit, UnitKind } from './types';

// Simulation du mode Époques, indépendante du dessin.

/** Écart minimal entre deux troupes du même camp. */
const SPACING = 30;
const SHOT_SPEED = 520;
const BASE_REACH = 50;

function makeBase(): Base {
  return {
    hp: baseHp(0),
    maxHp: baseHp(0),
    age: 0,
    xp: 0,
    gold: START_GOLD,
    turret: -1,
    turretCooldown: 0,
    queue: [],
    queueTimer: 0,
    special: 20,
    rage: 0,
    flash: 0,
    evolving: 0,
  };
}

export function createEpoch(): EpochState {
  return {
    time: 0,
    bases: [makeBase(), makeBase()],
    units: [],
    shots: [],
    strikes: [],
    crates: [],
    sparks: [],
    texts: [],
    trauma: 0,
    nextId: 1,
    crateTimer: 14,
    aiTimer: 1,
    kills: [0, 0],
    result: null,
    events: [],
  };
}

const dirOf = (side: Side) => (side === 0 ? 1 : -1);
const baseZ = (side: Side) => (side === 0 ? 0 : LANE);

// ---------- Effets ----------

export function burst(state: EpochState, z: number, x: number, h: number, count: number, colors: readonly string[], power = 1) {
  for (let i = 0; i < count; i++) {
    if (state.sparks.length > 260) state.sparks.shift();
    const a = Math.random() * Math.PI * 2;
    const sp = (40 + Math.random() * 120) * power;
    const life = 0.4 + Math.random() * 0.5;
    state.sparks.push({
      z,
      x,
      h,
      vz: Math.cos(a) * sp,
      vx: Math.sin(a) * sp,
      vh: (120 + Math.random() * 220) * power,
      life,
      maxLife: life,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: 3 + Math.random() * 4 * power,
    });
  }
}

function floatText(state: EpochState, z: number, x: number, text: string, color: string) {
  if (state.texts.length > 40) state.texts.shift();
  state.texts.push({ z, x: x + (Math.random() - 0.5) * 16, h: 70, text, color, life: 0.9 });
}

// ---------- Actions (joueur ou ordinateur) ----------

export function canTrain(state: EpochState, side: Side, kind: UnitKind) {
  const b = state.bases[side];
  return !state.result && b.queue.length < QUEUE_MAX && b.gold >= unitCost(kind, b.age);
}

export function trainUnit(state: EpochState, side: Side, kind: UnitKind) {
  if (!canTrain(state, side, kind)) return false;
  const b = state.bases[side];
  b.gold -= unitCost(kind, b.age);
  if (!b.queue.length) b.queueTimer = UNITS[kind].train;
  b.queue.push(kind);
  return true;
}

export const canBuyTurret = (state: EpochState, side: Side) => {
  const b = state.bases[side];
  return !state.result && b.turret < b.age && b.gold >= turretCost(b.age);
};

export function buyTurret(state: EpochState, side: Side) {
  if (!canBuyTurret(state, side)) return false;
  const b = state.bases[side];
  b.gold -= turretCost(b.age);
  b.turret = b.age;
  burst(state, baseZ(side) + dirOf(side) * 20, 0, 90, 20, ['#FFD25A', '#FFFFFF', '#FF9A5A'], 1);
  return true;
}

export const canEvolve = (state: EpochState, side: Side) => {
  const b = state.bases[side];
  return !state.result && b.age < AGES - 1 && b.xp >= EVOLVE_XP[b.age];
};

export function evolve(state: EpochState, side: Side) {
  if (!canEvolve(state, side)) return false;
  const b = state.bases[side];
  b.age++;
  const before = b.maxHp;
  b.maxHp = baseHp(b.age);
  b.hp = Math.min(b.maxHp, b.hp + (b.maxHp - before) + b.maxHp * 0.15);
  b.evolving = 1.6;
  burst(state, baseZ(side) + dirOf(side) * 30, 0, 80, 40, ['#FFFFFF', '#8EC5FF', '#E6C8FF', '#FFD25A'], 1.6);
  state.trauma = Math.min(1, state.trauma + (side === 0 ? 0.5 : 0.2));
  state.events.push({ type: 'evolve', side, age: b.age });
  return true;
}

export const specialReady = (state: EpochState, side: Side) => !state.result && state.bases[side].special <= 0;

/** Déclenche le pouvoir de l'époque à cet endroit du chemin. */
export function useSpecial(state: EpochState, side: Side, z: number) {
  if (!specialReady(state, side)) return false;
  const b = state.bases[side];
  b.special = SPECIAL.cooldown;
  const center = Math.max(80, Math.min(LANE - 80, z));
  const drops = Array.from({ length: SPECIAL.hits }, (_, i) => ({
    z: center + (Math.random() - 0.5) * SPECIAL.radius * 2,
    x: (Math.random() - 0.5) * LANE_HALF * 2,
    t: 0.5 + (i / SPECIAL.hits) * SPECIAL.duration,
    done: false,
  }));
  state.strikes.push({ side, age: b.age, z: center, time: 0, drops });
  state.events.push({ type: 'special', side, age: b.age });
  return true;
}

/** Toucher une caisse de ravitaillement (seulement le joueur). */
export function collectCrate(state: EpochState, id: number) {
  const i = state.crates.findIndex((c) => c.id === id);
  if (i < 0 || state.result) return false;
  const c = state.crates[i];
  state.crates.splice(i, 1);
  const b = state.bases[0];
  const k = ageCost(b.age);
  if (c.bonus === 'gold') {
    const g = Math.round(110 * k);
    b.gold += g;
    floatText(state, c.z, c.x, `+${g} 🪙`, '#FFD25A');
  } else if (c.bonus === 'xp') {
    const xp = Math.round(140 * k);
    b.xp += xp;
    floatText(state, c.z, c.x, `+${xp} XP`, '#8EC5FF');
  } else if (c.bonus === 'rage') {
    b.rage = RAGE_TIME;
    floatText(state, c.z, c.x, 'RAGE !', '#FF5A5A');
  } else {
    b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.25);
    floatText(state, c.z, c.x, '+25 % ❤️', '#7BD35A');
  }
  burst(state, c.z, c.x, c.h + 20, 26, ['#FFD25A', '#FFFFFF', '#8EC5FF', '#FF6B9A'], 1.3);
  state.events.push({ type: 'crate', bonus: c.bonus });
  return true;
}

// ---------- Combat ----------

function spawnUnit(state: EpochState, side: Side, kind: UnitKind) {
  const b = state.bases[side];
  const def = UNITS[kind];
  const k = ageStat(b.age) * overtime(state.time);
  const u: Unit = {
    id: state.nextId++,
    side,
    kind,
    age: b.age,
    z: baseZ(side) + dirOf(side) * 40,
    x: (Math.random() - 0.5) * LANE_HALF * 1.4,
    hp: def.hp * k,
    maxHp: def.hp * k,
    damage: def.damage * k,
    range: def.range,
    speed: def.speed * (1 + b.age * 0.04),
    cooldown: 0.3,
    walk: Math.random() * 10,
    attack: 0,
    flash: 0,
  };
  state.units.push(u);
  state.events.push({ type: 'spawn', side, kind });
}

function killUnit(state: EpochState, u: Unit) {
  const i = state.units.indexOf(u);
  if (i < 0) return;
  state.units.splice(i, 1);
  const killer: Side = u.side === 0 ? 1 : 0;
  const cost = unitCost(u.kind, u.age);
  const kb = state.bases[killer];
  kb.gold += cost * KILL_GOLD;
  kb.xp += cost * KILL_XP;
  state.kills[killer]++;
  burst(state, u.z, u.x, 30, u.kind === 'heavy' ? 26 : 14, u.side === 0 ? ['#4E7BD6', '#8EC5FF', '#FFFFFF'] : ['#E0533D', '#FF9A7A', '#FFFFFF'], u.kind === 'heavy' ? 1.4 : 1);
  if (killer === 0) floatText(state, u.z, u.x, `+${Math.round(cost * KILL_GOLD)}`, '#FFD25A');
  state.events.push({ type: 'kill', side: killer, age: u.age });
}

function hurtUnit(state: EpochState, u: Unit, amount: number) {
  u.hp -= amount;
  u.flash = 1;
  if (u.hp <= 0) killUnit(state, u);
}

function hurtBase(state: EpochState, side: Side, amount: number) {
  const b = state.bases[side];
  amount *= overtime(state.time);
  b.hp -= amount;
  b.flash = 1;
  // Frapper la base adverse rapporte un peu d'expérience.
  state.bases[side === 0 ? 1 : 0].xp += amount * 0.25;
  if (side === 0) state.trauma = Math.min(1, state.trauma + 0.06);
  state.events.push({ type: 'baseHit', side });
  if (b.hp <= 0 && !state.result) {
    b.hp = 0;
    burst(state, baseZ(side), 0, 100, 60, ['#FFB020', '#FF6B2B', '#FFE14D', '#FFFFFF'], 2.2);
    state.trauma = 1;
    const won = side === 1;
    state.result = { won, time: Math.round(state.time), age: state.bases[0].age, kills: state.kills[0] };
    state.events.push({ type: 'over', won });
  }
}

/** L'ennemi le plus proche devant une troupe (ou une position). */
function nearestEnemy(state: EpochState, side: Side, z: number): Unit | null {
  const dir = dirOf(side);
  let best: Unit | null = null;
  let bestD = Infinity;
  for (const o of state.units) {
    if (o.side === side) continue;
    const d = (o.z - z) * dir;
    if (d > -20 && d < bestD) {
      bestD = d;
      best = o;
    }
  }
  return best;
}

function updateUnits(state: EpochState, dt: number) {
  // Les troupes de tête d'abord, pour que celles de derrière s'alignent derrière elles.
  const sorted = [...state.units].sort((a, b) => (b.z - a.z) * dirOf(a.side));
  for (const u of sorted) {
    if (u.hp <= 0) continue;
    const b = state.bases[u.side];
    const dir = dirOf(u.side);
    const rage = b.rage > 0 ? 1.5 : 1;
    u.cooldown -= dt;
    u.flash = Math.max(0, u.flash - dt * 5);
    u.attack = Math.max(0, u.attack - dt * 4);
    const enemy = nearestEnemy(state, u.side, u.z);
    const enemyDist = enemy ? Math.abs(enemy.z - u.z) : Infinity;
    const baseDist = Math.abs(baseZ(u.side === 0 ? 1 : 0) - u.z) - BASE_REACH;
    let acting = false;
    if (enemy && enemyDist <= u.range) {
      acting = true;
      if (u.cooldown <= 0) {
        u.cooldown = UNITS[u.kind].rate;
        u.attack = 1;
        if (u.kind === 'archer') state.shots.push({ side: u.side, z: u.z + dir * 10, x: u.x, h: 34, targetId: enemy.id, damage: u.damage * rage, speed: SHOT_SPEED, age: u.age, big: false });
        else {
          hurtUnit(state, enemy, u.damage * rage);
          burst(state, enemy.z, enemy.x, 30, 3, ['#FFFFFF', '#FFE14D'], 0.5);
        }
      }
    } else if (baseDist <= u.range) {
      acting = true;
      if (u.cooldown <= 0) {
        u.cooldown = UNITS[u.kind].rate;
        u.attack = 1;
        hurtBase(state, u.side === 0 ? 1 : 0, u.damage * rage);
      }
    }
    if (acting) continue;
    // Bloqué par une troupe alliée juste devant ?
    let blocked = false;
    for (const o of state.units) {
      if (o === u || o.side !== u.side) continue;
      const d = (o.z - u.z) * dir;
      if (d > 0 && d < SPACING) {
        blocked = true;
        break;
      }
    }
    // Ni dépasser un ennemi au contact.
    if (enemy && enemyDist < 22) blocked = true;
    if (!blocked) {
      u.z += dir * u.speed * rage * dt;
      u.walk += dt * (rage > 1 ? 1.5 : 1);
    }
  }
}

function updateShots(state: EpochState, dt: number) {
  for (let i = state.shots.length - 1; i >= 0; i--) {
    const s = state.shots[i];
    const target = state.units.find((u) => u.id === s.targetId);
    if (!target) {
      state.shots.splice(i, 1);
      continue;
    }
    const d = target.z - s.z;
    const step = s.speed * dt;
    if (Math.abs(d) <= step + 6) {
      state.shots.splice(i, 1);
      hurtUnit(state, target, s.damage);
      burst(state, target.z, target.x, 30, s.big ? 8 : 3, ['#FFFFFF', '#FFE14D', '#FF9A5A'], s.big ? 0.9 : 0.5);
      continue;
    }
    s.z += Math.sign(d) * step;
    s.x += (target.x - s.x) * Math.min(1, dt * 6);
    // Trajectoire en cloche
    s.h = 34 + Math.min(60, Math.abs(d) * 0.25);
  }
}

function updateBases(state: EpochState, dt: number) {
  state.bases.forEach((b, i) => {
    const side = i as Side;
    b.gold += incomePerSec(b.age) * dt;
    if (state.time > SUDDEN_DEATH && b.hp > 0) {
      b.hp -= b.maxHp * SUDDEN_DRAIN * dt;
      if (b.hp <= 0) hurtBase(state, side, 1);
    }
    b.special = Math.max(0, b.special - dt);
    b.rage = Math.max(0, b.rage - dt);
    b.flash = Math.max(0, b.flash - dt * 4);
    b.evolving = Math.max(0, b.evolving - dt);
    // Recrutement
    if (b.queue.length) {
      b.queueTimer -= dt;
      if (b.queueTimer <= 0) {
        spawnUnit(state, side, b.queue.shift()!);
        if (b.queue.length) b.queueTimer = UNITS[b.queue[0]].train;
      }
    }
    // Tourelle de la base
    if (b.turret >= 0) {
      b.turretCooldown -= dt;
      const enemy = nearestEnemy(state, side, baseZ(side));
      if (enemy && Math.abs(enemy.z - baseZ(side)) < TURRET.range && b.turretCooldown <= 0) {
        b.turretCooldown = TURRET.rate;
        state.shots.push({ side, z: baseZ(side) + dirOf(side) * 20, x: 0, h: 110, targetId: enemy.id, damage: TURRET.damage * ageStat(b.turret), speed: SHOT_SPEED * 1.2, age: b.turret, big: true });
      }
    }
  });
}

function updateStrikes(state: EpochState, dt: number) {
  for (let i = state.strikes.length - 1; i >= 0; i--) {
    const st = state.strikes[i];
    st.time += dt;
    // Les impacts tombent les uns après les autres pendant la durée de la frappe.
    for (const drop of st.drops) {
      if (drop.done || st.time < drop.t) continue;
      drop.done = true;
      const { z, x } = drop;
      for (const u of [...state.units]) if (u.side !== st.side && Math.abs(u.z - z) < 55) hurtUnit(state, u, SPECIAL.damage * ageStat(st.age));
      burst(state, z, x, 10, 16, st.age >= 4 ? ['#8EC5FF', '#FFFFFF', '#C49AF0'] : ['#FFB020', '#FF6B2B', '#FFE14D', '#5A4A3A'], 1.3);
      state.trauma = Math.min(1, state.trauma + 0.08);
    }
    if (st.drops.every((d) => d.done)) state.strikes.splice(i, 1);
  }
}

function updateCrates(state: EpochState, dt: number) {
  state.crateTimer -= dt;
  if (state.crateTimer <= 0) {
    state.crateTimer = CRATE_INTERVAL * (0.7 + Math.random() * 0.6);
    const bonuses: Crate['bonus'][] = ['gold', 'xp', 'rage', 'heal'];
    state.crates.push({
      id: state.nextId++,
      z: LANE * (0.2 + Math.random() * 0.45),
      x: (Math.random() - 0.5) * LANE_HALF * 2.6,
      h: 320,
      life: CRATE_LIFE,
      bonus: bonuses[Math.floor(Math.random() * bonuses.length)],
    });
  }
  for (let i = state.crates.length - 1; i >= 0; i--) {
    const c = state.crates[i];
    c.h = Math.max(0, c.h - 120 * dt);
    c.life -= dt;
    if (c.life <= 0) state.crates.splice(i, 1);
  }
}

function updateFx(state: EpochState, dt: number) {
  for (let i = state.sparks.length - 1; i >= 0; i--) {
    const p = state.sparks[i];
    p.life -= dt;
    if (p.life <= 0) {
      state.sparks.splice(i, 1);
      continue;
    }
    p.z += p.vz * dt;
    p.x += p.vx * dt;
    p.vh -= 700 * dt;
    p.h = Math.max(0, p.h + p.vh * dt);
  }
  for (let i = state.texts.length - 1; i >= 0; i--) {
    const tx = state.texts[i];
    tx.life -= dt;
    tx.h += 60 * dt;
    if (tx.life <= 0) state.texts.splice(i, 1);
  }
  state.trauma = Math.max(0, state.trauma - dt * 1.6);
}

export function stepEpoch(state: EpochState, dt: number, aiSide: Side[] = [1]) {
  state.time += dt;
  if (!state.result) {
    for (const side of aiSide) aiThink(state, side, dt);
    updateBases(state, dt);
    updateUnits(state, dt);
    updateShots(state, dt);
    updateStrikes(state, dt);
    updateCrates(state, dt);
  }
  updateFx(state, dt);
}
