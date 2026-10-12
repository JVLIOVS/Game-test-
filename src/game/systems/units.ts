import { STRUCTURE_MAX_LEVEL } from '../constants';
import { worldDef } from '../data/worlds';
import { FX_COLORS } from '../fxColors';
import type { GameState, Unit } from '../types';
import { getHouse, structureLevel } from './build';
import { dist, gain, nextId, pushOut } from './common';
import { damageZombie } from './combat';
import { spawnBurst, spawnText } from './effects';
import { hitTree } from './trees';
import { hitAnimal } from './animals';
import { forTreesNear } from '../world/grid';

// Habitants du camp, produits par les bâtiments :
// - ouvriers (cabane de bûcherons) : coupent des arbres et rapportent le bois ;
// - soldats (caserne) : gardent la base et attaquent les zombies qui approchent.

const WORKERS_PER_LEVEL = [0, 2, 3, 5];
const HUNTERS_PER_LEVEL = [0, 2, 3, 4];
const HUNTER_SPEED = 130;
const HUNTER_RANGE = 150;
const HUNTER_SHOT_INTERVAL = 1.2;
const SOLDIERS_PER_LEVEL = [0, 2, 4, 6];
const WORKER_SPEED = 115;
const WORKER_CARRY = 4;
const WORKER_CHOP_INTERVAL = 1.1;
const SOLDIER_SPEED = 135;
const SOLDIER_RANGE = 360; // distance à la base dans laquelle ils interviennent
const SOLDIER_REACH = 20;
const SOLDIER_ATTACK_INTERVAL = 0.8;
const SOLDIER_RESPAWN = 8;
const GUARD_RADIUS = 150;
const UNIT_RADIUS = 10;

export const maxSoldiers = (state: GameState) => SOLDIERS_PER_LEVEL[Math.min(STRUCTURE_MAX_LEVEL, structureLevel(state, 'barracks'))];
export const maxWorkers = (state: GameState) => WORKERS_PER_LEVEL[Math.min(STRUCTURE_MAX_LEVEL, structureLevel(state, 'lumber'))];
export const maxHunters = (state: GameState) => HUNTERS_PER_LEVEL[Math.min(STRUCTURE_MAX_LEVEL, structureLevel(state, 'lodge'))];
const soldierDamage = (state: GameState) => 9 + 4 * structureLevel(state, 'barracks') + 3 * state.world;
const soldierHp = (state: GameState) => 50 + 25 * structureLevel(state, 'barracks') + 20 * state.world;

function spawnUnit(state: GameState, kind: Unit['kind'], fromSlot: string) {
  const from = state.structures.find((s) => s.slot === fromSlot);
  if (!from) return;
  const hp = kind === 'soldier' ? soldierHp(state) : 40;
  const posts = state.units.filter((u) => u.kind === kind).map((u) => u.post);
  let post = 0;
  while (posts.includes(post)) post++;
  state.units.push({
    id: nextId(state),
    kind,
    x: from.x,
    y: from.y + from.radius + 6,
    vx: 0,
    vy: 0,
    hp,
    maxHp: hp,
    state: kind === 'soldier' ? 'idle' : 'toTree',
    targetId: null,
    carry: 0,
    timer: 0,
    walkTime: 0,
    dirX: 1,
    hitFlash: 0,
    post,
  });
  spawnBurst(state, from.x, from.y + from.radius, 0, 6, 'dust', FX_COLORS.dust, 0.8);
  state.events.push({ type: 'unitSpawned', kind });
}

function moveToward(u: Unit, x: number, y: number, speed: number, dt: number) {
  const d = dist(u.x, u.y, x, y);
  const k = 1 - Math.exp(-8 * dt);
  const tx = d > 4 ? ((x - u.x) / d) * speed : 0;
  const ty = d > 4 ? ((y - u.y) / d) * speed : 0;
  u.vx += (tx - u.vx) * k;
  u.vy += (ty - u.vy) * k;
  u.x += u.vx * dt;
  u.y += u.vy * dt;
  if (Math.abs(u.vx) > 8) u.dirX = u.vx > 0 ? 1 : -1;
  if (Math.hypot(u.vx, u.vy) > 15) u.walkTime += dt;
  else u.walkTime = 0;
  return d;
}

function updateWorker(state: GameState, u: Unit, dt: number) {
  const house = getHouse(state);
  if (!house) return;
  // La nuit, les ouvriers rentrent se mettre à l'abri.
  if (state.cycle.phase === 'night' && u.state !== 'hide') {
    if (u.targetId !== null) {
      const tree = state.trees.find((t) => t.id === u.targetId);
      if (tree && tree.claimedBy === u.id) tree.claimedBy = null;
    }
    u.state = 'hide';
    u.targetId = null;
  }
  if (u.state === 'hide') {
    const d = moveToward(u, house.x, house.y + house.radius + 4, WORKER_SPEED * 1.3, dt);
    if (d < 12 && u.carry > 0) {
      gain(state, 'wood', u.carry, house.x, house.y - 70);
      u.carry = 0;
    }
    if (state.cycle.phase === 'day') u.state = 'toTree';
    return;
  }

  if (u.state === 'return') {
    const d = moveToward(u, house.x, house.y + house.radius + 4, WORKER_SPEED, dt);
    if (d < 14) {
      gain(state, 'wood', u.carry, house.x, house.y - 70);
      u.carry = 0;
      u.state = 'toTree';
    }
    return;
  }

  let tree = u.targetId !== null ? state.trees.find((t) => t.id === u.targetId) : undefined;
  if (!tree || tree.state !== 'standing') {
    // Arbre libre le plus proche du camp.
    let best = null;
    let bestD = Infinity;
    for (const t of state.trees) {
      if (t.state !== 'standing' || (t.claimedBy !== null && t.claimedBy !== u.id)) continue;
      const d = dist(t.x, t.y, house.x, house.y) + dist(t.x, t.y, u.x, u.y) * 0.5;
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    if (!best) return;
    tree = best;
    tree.claimedBy = u.id;
    u.targetId = tree.id;
    u.state = 'toTree';
  }

  const reach = tree.radius + UNIT_RADIUS + 6;
  if (dist(u.x, u.y, tree.x, tree.y) > reach) {
    moveToward(u, tree.x - u.dirX * 2, tree.y + 4, WORKER_SPEED, dt);
    return;
  }
  u.vx = u.vy = 0;
  u.walkTime = 0;
  u.state = 'chop';
  u.dirX = tree.x >= u.x ? 1 : -1;
  u.timer += dt;
  if (u.timer >= WORKER_CHOP_INTERVAL) {
    u.timer = 0;
    u.carry += hitTree(state, tree, 'worker', u.x);
    if (tree.state !== 'standing' || u.carry >= WORKER_CARRY) {
      if (tree.claimedBy === u.id) tree.claimedBy = null;
      u.targetId = null;
      u.state = 'return';
    }
  }
}

/** Chasseur : traque un animal, le tire à l'arc et rapporte la viande au camp. */
function updateHunter(state: GameState, u: Unit, dt: number) {
  const house = getHouse(state);
  if (!house) return;
  const release = () => {
    const a = state.animals.find((an) => an.id === u.targetId);
    if (a && a.claimedBy === u.id) a.claimedBy = null;
    u.targetId = null;
  };
  if (state.cycle.phase === 'night' && u.state !== 'hide') {
    release();
    u.state = 'hide';
  }
  if (u.state === 'hide' || u.state === 'return') {
    const d = moveToward(u, house.x + 20, house.y + house.radius + 4, HUNTER_SPEED * (u.state === 'hide' ? 1.3 : 1), dt);
    if (d < 14 && u.carry > 0) {
      gain(state, 'food', u.carry, house.x, house.y - 70);
      u.carry = 0;
      if (u.state === 'return') u.state = 'toTree';
    }
    if (u.state === 'hide' && state.cycle.phase === 'day') u.state = 'toTree';
    return;
  }
  let prey = u.targetId !== null ? state.animals.find((a) => a.id === u.targetId) : undefined;
  if (!prey) {
    let bestD = Infinity;
    for (const a of state.animals) {
      if (a.claimedBy !== null && a.claimedBy !== u.id) continue;
      const d = dist(a.x, a.y, u.x, u.y);
      if (d < bestD) {
        bestD = d;
        prey = a;
      }
    }
    if (!prey) {
      moveToward(u, house.x + 60, house.y + 80, HUNTER_SPEED * 0.5, dt);
      return;
    }
    prey.claimedBy = u.id;
    u.targetId = prey.id;
  }
  const d = dist(u.x, u.y, prey.x, prey.y);
  u.timer = Math.max(0, u.timer - dt);
  if (d > HUNTER_RANGE) {
    moveToward(u, prey.x, prey.y, HUNTER_SPEED, dt);
    return;
  }
  u.vx *= 0.85;
  u.vy *= 0.85;
  u.walkTime = 0;
  u.state = 'chop';
  u.dirX = prey.x >= u.x ? 1 : -1;
  if (u.timer <= 0) {
    u.timer = HUNTER_SHOT_INTERVAL;
    const angle = Math.atan2(prey.y - u.y, prey.x - u.x);
    state.slashes.push({ x: u.x, y: u.y - 20, angle, kind: 'spear', life: 0.15, maxLife: 0.15, size: d });
    const food = hitAnimal(state, prey, false);
    if (food > 0) {
      u.carry += food;
      u.targetId = null;
      u.state = 'return';
    }
  }
}

function updateSoldier(state: GameState, u: Unit, dt: number) {
  const { base } = state;
  // Cible : le zombie le plus proche de la base, s'il est dans la zone de garde.
  let target = u.targetId !== null ? state.zombies.find((z) => z.id === u.targetId) : undefined;
  if (!target || dist(target.x, target.y, base.x, base.y) > SOLDIER_RANGE + 60) {
    target = undefined;
    let bestD = Infinity;
    for (const z of state.zombies) {
      if (dist(z.x, z.y, base.x, base.y) > SOLDIER_RANGE) continue;
      const d = dist(z.x, z.y, u.x, u.y);
      if (d < bestD) {
        bestD = d;
        target = z;
      }
    }
    u.targetId = target?.id ?? null;
  }

  u.timer = Math.max(0, u.timer - dt);
  if (!target) {
    u.state = 'idle';
    const count = Math.max(1, maxSoldiers(state));
    const a = (u.post / count) * Math.PI * 2 + Math.PI / 2;
    moveToward(u, base.x + Math.cos(a) * GUARD_RADIUS, base.y + Math.sin(a) * GUARD_RADIUS * 0.85, SOLDIER_SPEED * 0.7, dt);
    return;
  }
  u.state = 'fight';
  const d = dist(u.x, u.y, target.x, target.y);
  if (d > target.radius + UNIT_RADIUS + SOLDIER_REACH) {
    moveToward(u, target.x, target.y, SOLDIER_SPEED, dt);
    return;
  }
  u.vx *= 0.8;
  u.vy *= 0.8;
  u.dirX = target.x >= u.x ? 1 : -1;
  if (u.timer <= 0) {
    u.timer = SOLDIER_ATTACK_INTERVAL;
    damageZombie(state, target, soldierDamage(state), u.x, u.y);
  }
}

export function damageUnit(state: GameState, u: Unit, amount: number) {
  u.hp -= amount;
  u.hitFlash = 1;
  spawnText(state, u.x, u.y - 34, `-${amount}`, FX_COLORS.textHurt, { size: 0.75 });
  if (u.hp > 0) return;
  state.units.splice(state.units.indexOf(u), 1);
  spawnBurst(state, u.x, u.y, 8, 10, 'dust', FX_COLORS.dust, 1);
}

export function updateUnits(state: GameState, dt: number) {
  // Production : un soldat toutes les 8 s jusqu'au maximum, les ouvriers tout de suite.
  const soldiers = state.units.filter((u) => u.kind === 'soldier').length;
  if (soldiers < maxSoldiers(state)) {
    state.barracksTimer -= dt;
    if (state.barracksTimer <= 0) {
      state.barracksTimer = SOLDIER_RESPAWN;
      spawnUnit(state, 'soldier', 'barracks');
    }
  } else {
    state.barracksTimer = Math.min(state.barracksTimer, 2);
  }
  const workers = state.units.filter((u) => u.kind === 'worker').length;
  if (workers < maxWorkers(state)) spawnUnit(state, 'worker', 'lumber');
  const hunters = state.units.filter((u) => u.kind === 'hunter').length;
  if (hunters < maxHunters(state)) spawnUnit(state, 'hunter', 'lodge');

  for (const u of [...state.units]) {
    u.hitFlash = Math.max(0, u.hitFlash - dt * 5);
    if (u.kind === 'worker') updateWorker(state, u, dt);
    else if (u.kind === 'hunter') updateHunter(state, u, dt);
    else updateSoldier(state, u, dt);
    forTreesNear(state.trees, u.x, u.y, (tree) => {
      if (tree.state === 'standing' && tree.id !== u.targetId) pushOut(u, UNIT_RADIUS, tree.x, tree.y, tree.radius);
    });
    for (const s of state.structures) {
      if (s.kind !== 'wall' && s.kind !== 'house' && s.kind !== 'trap') pushOut(u, UNIT_RADIUS, s.x, s.y, s.radius);
    }
  }
}

/** Couleur de casque des soldats selon le monde (pour le rendu). */
export const soldierHelmet = (state: GameState) => worldDef(state.world).stake[0];
