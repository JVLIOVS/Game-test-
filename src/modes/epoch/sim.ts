import {
  AGES,
  AGGRO,
  HEAL_RATIO,
  SKILLS,
  UPGRADES,
  UPGRADE_MAX,
  WARCRY_TIME,
  upgradeCost,
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
  DIFFICULTIES,
  FROST_SLOW,
  TURRET_MAX,
  TURRET_SLOTS,
  TURRET_TYPES,
  turretPrice,
  UNITS,
  ageCost,
  ageStat,
  baseHp,
  incomePerSec,
  overtime,
  unitCost,
} from './data';
import { aiThink } from './ai';
import type { Base, Crate, Difficulty, EpochState, SkillId, Side, TurretType, Unit, UnitKind, UpgradeId } from './types';

// Simulation du mode Époques, indépendante du dessin.

const SHOT_SPEED = 520;
const BASE_REACH = 50;
/** Point de ralliement, taille du groupe et attente maximale. */
const RALLY_Z = 230;
const RALLY_GROUP = 3;
const RALLY_WAIT = 5;

const upgradeMult = (b: Base, id: UpgradeId) => 1 + b.upgrades[id] * UPGRADES.find((u) => u.id === id)!.per;
export const attackMult = (b: Base) => upgradeMult(b, 'attack');
export const armorMult = (b: Base) => upgradeMult(b, 'armor');
export const economyMult = (b: Base) => upgradeMult(b, 'economy');
export const wallsMult = (b: Base) => upgradeMult(b, 'walls');

function makeBase(): Base {
  return {
    hp: baseHp(0),
    maxHp: baseHp(0),
    age: 0,
    xp: 0,
    gold: START_GOLD,
    turrets: Array.from({ length: TURRET_SLOTS }, () => ({ type: null, level: 0, cooldown: 0, fire: 0 })),
    queue: [],
    queueTimer: 0,
    special: 40,
    rage: 0,
    flash: 0,
    evolving: 0,
    upgrades: { attack: 0, armor: 0, economy: 0, walls: 0 },
    skills: { warcry: 12, heal: 20 },
    healing: 0,
  };
}

export interface EpochSetup {
  difficulty: Difficulty;
  /** Camps joués par l'ordinateur (en duel à deux sur le même téléphone : aucun). */
  aiSides: Side[];
}

export function createEpoch(setup: EpochSetup = { difficulty: 'normal', aiSides: [1] }): EpochState {
  return {
    time: 0,
    difficulty: setup.difficulty,
    aiSides: setup.aiSides,
    aiBoost: 1,
    bolts: [],
    bases: [makeBase(), makeBase()],
    units: [],
    corpses: [],
    slashes: [],
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

/** Prochain achat sur un emplacement de tourelle : construire (type au choix) ou améliorer. */
export function turretOffer(state: EpochState, side: Side, slot: number, type?: TurretType) {
  const b = state.bases[side];
  const t = b.turrets[slot];
  if (!t) return null;
  if (t.type === null) return type ? { cost: turretPrice(type, 1, b.age), level: 1 } : null;
  if (t.level >= TURRET_MAX) return null;
  return { cost: turretPrice(t.type, t.level + 1, b.age), level: t.level + 1 };
}

/** Construire une tourelle sur un emplacement vide, ou améliorer celle qui y est. */
export function buildTurret(state: EpochState, side: Side, slot: number, type?: TurretType) {
  if (state.result) return false;
  const b = state.bases[side];
  const t = b.turrets[slot];
  const offer = turretOffer(state, side, slot, type);
  if (!t || !offer || b.gold < offer.cost) return false;
  b.gold -= offer.cost;
  if (t.type === null) t.type = type!;
  t.level = offer.level;
  burst(state, baseZ(side) + dirOf(side) * 20, (slot % 2 ? 1 : -1) * 90, 120, 20, ['#FFD25A', '#FFFFFF', '#FF9A5A'], 1);
  state.events.push({ type: 'turret', side, slot, level: t.level });
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
  b.maxHp = baseHp(b.age) * wallsMult(b);
  b.hp = Math.min(b.maxHp, b.hp + (b.maxHp - before) + b.maxHp * 0.15);
  b.evolving = 1.6;
  burst(state, baseZ(side) + dirOf(side) * 30, 0, 80, 40, ['#FFFFFF', '#8EC5FF', '#E6C8FF', '#FFD25A'], 1.6);
  state.trauma = Math.min(1, state.trauma + (side === 0 ? 0.5 : 0.2));
  state.events.push({ type: 'evolve', side, age: b.age });
  return true;
}

export const canUpgrade = (state: EpochState, side: Side, id: UpgradeId) => {
  const b = state.bases[side];
  return !state.result && b.upgrades[id] < UPGRADE_MAX && b.gold >= upgradeCost(b.upgrades[id]);
};

/** Acheter un niveau d'amélioration (attaque, armure, économie, remparts). */
export function buyUpgrade(state: EpochState, side: Side, id: UpgradeId) {
  if (!canUpgrade(state, side, id)) return false;
  const b = state.bases[side];
  b.gold -= upgradeCost(b.upgrades[id]);
  b.upgrades[id]++;
  if (id === 'walls') {
    // Remparts : la base gagne tout de suite les points de vie en plus.
    const before = b.maxHp;
    b.maxHp = baseHp(b.age) * wallsMult(b);
    b.hp += b.maxHp - before;
  }
  burst(state, baseZ(side) + dirOf(side) * 30, 0, 80, 16, ['#FFD25A', '#FFFFFF'], 0.9);
  state.events.push({ type: 'upgrade', side, id, level: b.upgrades[id] });
  return true;
}

export const skillReady = (state: EpochState, side: Side, skill: SkillId) => !state.result && state.bases[side].skills[skill] <= 0;

/** Cri de guerre (toutes tes troupes enragées) ou soins (troupes et base). */
export function useSkill(state: EpochState, side: Side, skill: SkillId) {
  if (!skillReady(state, side, skill)) return false;
  const b = state.bases[side];
  b.skills[skill] = SKILLS[skill].cooldown;
  if (skill === 'warcry') {
    b.rage = Math.max(b.rage, WARCRY_TIME);
  } else {
    for (const u of state.units) if (u.side === side) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * HEAL_RATIO);
    b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.06);
    b.healing = 1.2;
    for (const u of state.units) if (u.side === side) burst(state, u.z, u.x, 40, 4, ['#7BD35A', '#C8F5A0', '#FFFFFF'], 0.6);
  }
  state.events.push({ type: 'skill', side, skill });
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
    hp: def.hp * k * armorMult(b),
    maxHp: def.hp * k * armorMult(b),
    damage: def.damage * k,
    range: def.range,
    radius: def.radius,
    speed: def.speed * (1 + b.age * 0.04),
    cooldown: 0.3,
    targetId: null,
    aimX: 0,
    aimZ: 0,
    rally: 0,
    slow: 0,
    walk: Math.random() * 10,
    attack: 0,
    flash: 0,
  };
  state.units.push(u);
  state.events.push({ type: 'spawn', side, kind });
}

function killUnit(state: EpochState, u: Unit, srcAge: number) {
  const i = state.units.indexOf(u);
  if (i < 0) return;
  state.units.splice(i, 1);
  // La troupe tombe à la renverse avant de disparaître.
  if (state.corpses.length > 30) state.corpses.shift();
  state.corpses.push({ unit: u, t: 0, style: srcAge });
  const killer: Side = u.side === 0 ? 1 : 0;
  const cost = unitCost(u.kind, u.age);
  const kb = state.bases[killer];
  kb.gold += cost * KILL_GOLD * economyMult(kb);
  kb.xp += cost * KILL_XP;
  state.kills[killer]++;
  burst(state, u.z, u.x, 30, u.kind === 'heavy' ? 26 : 14, u.side === 0 ? ['#4E7BD6', '#8EC5FF', '#FFFFFF'] : ['#E0533D', '#FF9A7A', '#FFFFFF'], u.kind === 'heavy' ? 1.4 : 1);
  if (killer === 0) floatText(state, u.z, u.x, `+${Math.round(cost * KILL_GOLD)}`, '#FFD25A');
  state.events.push({ type: 'kill', side: killer, age: u.age });
}

function hurtUnit(state: EpochState, u: Unit, amount: number, srcAge: number) {
  u.hp -= amount;
  u.flash = 1;
  if (u.hp <= 0) killUnit(state, u, srcAge);
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

/** L'ennemi le plus proche devant une position (pour la tourelle de base). */
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

const dist2 = (a: { z: number; x: number }, b: { z: number; x: number }) => Math.hypot(a.z - b.z, a.x - b.x);

/** Cible d'une troupe : l'ennemi le plus proche qu'elle repère, en gardant sa cible tant qu'elle vit. */
function pickTarget(state: EpochState, u: Unit): Unit | null {
  const dir = dirOf(u.side);
  const current = u.targetId !== null ? state.units.find((o) => o.id === u.targetId) : undefined;
  if (current && dist2(u, current) < AGGRO * 1.2) return current;
  let best: Unit | null = null;
  let bestD = AGGRO;
  for (const o of state.units) {
    if (o.side === u.side) continue;
    // Pas d'ennemi loin derrière soi.
    if ((o.z - u.z) * dir < -60) continue;
    const d = dist2(u, o);
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  u.targetId = best ? best.id : null;
  return best;
}

function strike(state: EpochState, u: Unit, target: Unit, mult: number) {
  u.cooldown = UNITS[u.kind].rate;
  u.attack = 1;
  state.events.push({ type: 'attack', side: u.side, kind: u.kind, age: u.age });
  const d = dist2(u, target) || 1;
  u.aimX = (target.x - u.x) / d;
  u.aimZ = (target.z - u.z) / d;
  if (u.kind === 'archer') {
    state.shots.push({ side: u.side, z: u.z + u.aimZ * 10, x: u.x + u.aimX * 10, h: 34, targetId: target.id, damage: u.damage * mult, speed: SHOT_SPEED, age: u.age, big: false });
    if (u.age >= 2) burst(state, u.z + u.aimZ * 18, u.x + u.aimX * 18, 34, 4, ['#FFE14D', '#FFFFFF'], 0.4);
    return;
  }
  hurtUnit(state, target, u.damage * mult, u.age);
  // Trace du coup, à mi-chemin entre les deux combattants
  if (state.slashes.length > 24) state.slashes.shift();
  state.slashes.push({ z: (u.z + target.z) / 2, x: (u.x + target.x) / 2, life: 0.25, side: u.side });
  burst(state, target.z, target.x, 30, u.kind === 'heavy' ? 8 : 4, ['#FFFFFF', '#FFE14D'], u.kind === 'heavy' ? 0.9 : 0.5);
}

/** Départ groupé : dès que 3 troupes attendent, ou que la première attend depuis trop longtemps. */
function releaseRally(state: EpochState) {
  for (const side of [0, 1] as Side[]) {
    const waiting = state.units.filter((u) => u.side === side && u.rally !== null);
    if (!waiting.length) continue;
    if (waiting.length >= RALLY_GROUP || waiting.some((u) => u.rally! > RALLY_WAIT)) for (const u of waiting) u.rally = null;
  }
}

function updateUnits(state: EpochState, dt: number) {
  releaseRally(state);
  for (const u of [...state.units]) {
    if (u.hp <= 0) continue;
    const b = state.bases[u.side];
    const dir = dirOf(u.side);
    const rage = b.rage > 0 ? 1.5 : 1;
    const mult = rage * attackMult(b);
    u.cooldown -= dt;
    u.flash = Math.max(0, u.flash - dt * 5);
    u.attack = Math.max(0, u.attack - dt * 4);
    const target = pickTarget(state, u);
    let mz = 0;
    let mx = 0;
    if (target) {
      const d = dist2(u, target);
      const reach = u.radius + target.radius + u.range;
      if (d <= reach) {
        if (u.cooldown <= 0) strike(state, u, target, mult);
      } else {
        // Il fonce droit sur sa cible, en largeur comme en profondeur.
        mz = (target.z - u.z) / d;
        mx = (target.x - u.x) / d;
      }
    } else if (u.rally !== null) {
      // Point de ralliement devant la base : on attend les copains.
      u.rally += dt;
      const rz = baseZ(u.side) + dir * RALLY_Z;
      const d = Math.abs(rz - u.z);
      if (d > 8) mz = Math.sign(rz - u.z);
    } else {
      const baseDist = Math.abs(baseZ(u.side === 0 ? 1 : 0) - u.z) - BASE_REACH;
      if (baseDist <= u.range + u.radius) {
        if (u.cooldown <= 0) {
          u.cooldown = UNITS[u.kind].rate;
          u.attack = 1;
          u.aimX = 0;
          u.aimZ = dir;
          hurtBase(state, u.side === 0 ? 1 : 0, u.damage * mult);
        }
      } else {
        mz = dir;
        // Il revient doucement vers sa file pour ne pas sortir du chemin.
        mx = Math.max(-0.4, Math.min(0.4, -u.x / (LANE_HALF * 4)));
      }
    }
    u.slow = Math.max(0, u.slow - dt);
    if (mz || mx) {
      const sp = u.speed * rage * (u.slow > 0 ? 1 - FROST_SLOW : 1) * dt;
      u.z += mz * sp;
      u.x += mx * sp;
      u.walk += dt * (rage > 1 ? 1.5 : 1);
    }
    // Les alliés s'écartent les uns des autres au lieu de se superposer.
    for (const o of state.units) {
      if (o === u) continue;
      const d = dist2(u, o);
      const min = u.radius + o.radius + (o.side === u.side ? 2 : 0);
      if (d < min && d > 0.01) {
        const push = (min - d) * (o.side === u.side ? 0.5 : 0.35);
        u.z += ((u.z - o.z) / d) * push;
        u.x += ((u.x - o.x) / d) * push;
      }
    }
    u.x = Math.max(-LANE_HALF * 1.5, Math.min(LANE_HALF * 1.5, u.x));
    u.z = Math.max(20, Math.min(LANE - 20, u.z));
  }
  for (let i = state.corpses.length - 1; i >= 0; i--) {
    state.corpses[i].t += dt;
    if (state.corpses[i].t > 1.4) state.corpses.splice(i, 1);
  }
  for (let i = state.slashes.length - 1; i >= 0; i--) {
    state.slashes[i].life -= dt;
    if (state.slashes[i].life <= 0) state.slashes.splice(i, 1);
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
    // Le tir file droit sur sa cible.
    const d = dist2(s, target);
    const step = s.speed * dt;
    if (d <= step + target.radius * 0.6) {
      state.shots.splice(i, 1);
      hurtUnit(state, target, s.damage, s.age);
      if (s.slow) target.slow = Math.max(target.slow, s.slow);
      if (s.splash) for (const o of [...state.units]) if (o !== target && o.side === target.side && dist2(o, target) < s.splash) hurtUnit(state, o, s.damage * 0.6, s.age);
      burst(state, target.z, target.x, 30, s.big ? 8 : 3, ['#FFFFFF', '#FFE14D', '#FF9A5A'], s.big ? 0.9 : 0.5);
      continue;
    }
    s.z += ((target.z - s.z) / d) * step;
    s.x += ((target.x - s.x) / d) * step;
    // Trajectoire en cloche
    s.h = 30 + Math.min(70, d * 0.3);
  }
}

function updateBases(state: EpochState, dt: number) {
  state.bases.forEach((b, i) => {
    const side = i as Side;
    // L'ordinateur gagne un peu moins d'or que toi.
    // L'ordinateur gagne plus ou moins d'or selon la difficulté (et s'adapte en Hardcore).
    const aiMult = state.aiSides.includes(side) ? DIFFICULTIES[state.difficulty].income * state.aiBoost : 1;
    b.gold += incomePerSec(b.age) * economyMult(b) * aiMult * dt;
    b.skills.warcry = Math.max(0, b.skills.warcry - dt);
    b.skills.heal = Math.max(0, b.skills.heal - dt);
    b.healing = Math.max(0, b.healing - dt);
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
    // Tourelles de la base
    b.turrets.forEach((t, i) => {
      t.fire = Math.max(0, t.fire - dt * 3);
      if (!t.type) return;
      const def = TURRET_TYPES[t.type];
      t.cooldown -= dt;
      if (t.cooldown > 0) return;
      const enemy = nearestEnemy(state, side, baseZ(side));
      if (!enemy || Math.abs(enemy.z - baseZ(side)) > def.range) return;
      t.cooldown = def.rate;
      t.fire = 1;
      const damage = def.damage * ageStat(b.age) * wallsMult(b) * (1 + 0.6 * (t.level - 1));
      const from = { z: baseZ(side) + dirOf(side) * 20, x: (i % 2 ? 1 : -1) * (i < 2 ? 70 : 120) };
      state.events.push({ type: 'attack', side, kind: 'turret', age: b.age });
      if (t.type === 'lightning') {
        // Éclair en chaîne, instantané
        const targets = state.units.filter((u) => u.side !== side).sort((a, c) => dist2(a, enemy) - dist2(c, enemy)).slice(0, (def.chain ?? 1) + t.level - 1);
        let prev = { ...from, h: 140 };
        for (const u of targets) {
          state.bolts.push({ z1: prev.z, x1: prev.x, h1: prev.h, z2: u.z, x2: u.x, h2: 30, life: 0.25 });
          prev = { z: u.z, x: u.x, h: 30 };
          hurtUnit(state, u, damage, b.age);
        }
        return;
      }
      state.shots.push({
        side,
        z: from.z,
        x: from.x,
        h: 120,
        targetId: enemy.id,
        damage,
        speed: SHOT_SPEED * (t.type === 'cannon' ? 0.8 : 1.2),
        age: b.age,
        big: true,
        splash: def.splash,
        slow: def.slow,
        kind: t.type,
      });
    });
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
      state.events.push({ type: 'impact', age: st.age });
      for (const u of [...state.units]) if (u.side !== st.side && Math.abs(u.z - z) < 55) hurtUnit(state, u, SPECIAL.damage * ageStat(st.age), st.age);
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
  for (let i = state.bolts.length - 1; i >= 0; i--) {
    state.bolts[i].life -= dt;
    if (state.bolts[i].life <= 0) state.bolts.splice(i, 1);
  }
}

/** Force d'un camp : époque, armée sur le terrain, améliorations, tourelles et base. */
export function strength(state: EpochState, side: Side) {
  const b = state.bases[side];
  const army = state.units.filter((u) => u.side === side).reduce((sum, u) => sum + unitCost(u.kind, u.age) * (u.hp / u.maxHp), 0);
  const upgrades = Object.values(b.upgrades).reduce((a, c) => a + c, 0);
  const turrets = b.turrets.reduce((a, t) => a + (t.type ? t.level : 0), 0);
  return (army + b.gold * 0.5) / ageCost(b.age) + b.age * 400 + upgrades * 60 + turrets * 50 + (b.hp / b.maxHp) * 150;
}

/** Hardcore : l'adversaire se renforce quand tu prends l'avantage, et lâche un peu quand il écrase. */
function adapt(state: EpochState, dt: number) {
  if (state.difficulty !== 'hardcore' || state.aiSides.length !== 1) return;
  const ai = state.aiSides[0];
  const ratio = strength(state, ai === 1 ? 0 : 1) / Math.max(1, strength(state, ai));
  const target = Math.max(0.95, Math.min(2.2, ratio * 1.15));
  state.aiBoost += (target - state.aiBoost) * Math.min(1, dt * 0.25);
}

export function stepEpoch(state: EpochState, dt: number) {
  state.time += dt;
  if (!state.result) {
    adapt(state, dt);
    for (const side of state.aiSides) aiThink(state, side, dt);
    updateBases(state, dt);
    updateUnits(state, dt);
    updateShots(state, dt);
    updateStrikes(state, dt);
    updateCrates(state, dt);
  }
  updateFx(state, dt);
}
