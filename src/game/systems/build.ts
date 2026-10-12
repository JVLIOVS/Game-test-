import {
  CATAPULT_HP,
  CATAPULT_RADIUS,
  FOOD_COST,
  LODGE_HP,
  LODGE_RADIUS,
  TOWER_HP_BY_LEVEL,
  TOWER_UPGRADE_COST,
  TRAP_RADIUS,
  WALL_HP_BY_LEVEL,
  WALL_UPGRADE_COST,
  BARRACKS_HP,
  BARRACKS_RADIUS,
  COST,
  LUMBER_HP,
  LUMBER_RADIUS,
  STRUCTURE_MAX_LEVEL,
  HOUSE_HP,
  HOUSE_MAX_LEVEL,
  HOUSE_RADIUS,
  PAD_FEED_INTERVAL,
  PAD_RADIUS,
  TOWER_HP,
  TOWER_RADIUS,
  WALL_HP,
  WALL_SEGMENTS_PER_SIDE,
  WALL_SEGMENT_RADIUS,
  WORKSHOP_HP,
  WORKSHOP_RADIUS,
} from '../constants';
import { PERK_VALUES } from '../data/perks';
import { forgeCost } from '../data/weapons';
import { WORLDS } from '../data/worlds';
import { FX_COLORS } from '../fxColors';
import type { GameState, Pad, PadAction, Structure, StructureKind } from '../types';
import { LAYOUT, WALL_SIDES, wallPadPosition, wallSegments } from '../world/layout';
import { dist, nextId } from './common';
import { addTrauma, spawnBurst, spawnText } from './effects';

const FEED_START_DELAY = 0.25;

function stats(kind: StructureKind, level: number, wallLevel = 1) {
  switch (kind) {
    case 'house':
      return { radius: HOUSE_RADIUS, hp: HOUSE_HP[level] };
    case 'wall':
      return { radius: WALL_SEGMENT_RADIUS, hp: WALL_HP_BY_LEVEL[wallLevel] ?? WALL_HP };
    case 'tower':
      return { radius: TOWER_RADIUS, hp: TOWER_HP_BY_LEVEL[level] ?? TOWER_HP };
    case 'lodge':
      return { radius: LODGE_RADIUS, hp: LODGE_HP + (level - 1) * 60 };
    case 'trap':
      return { radius: TRAP_RADIUS, hp: 9999 };
    case 'catapult':
      return { radius: CATAPULT_RADIUS, hp: CATAPULT_HP };
    case 'workshop':
      return { radius: WORKSHOP_RADIUS, hp: WORKSHOP_HP };
    case 'barracks':
      return { radius: BARRACKS_RADIUS, hp: BARRACKS_HP + (level - 1) * 80 };
    case 'lumber':
      return { radius: LUMBER_RADIUS, hp: LUMBER_HP + (level - 1) * 60 };
  }
}

export const structureLevel = (state: GameState, slot: string) => state.structures.find((s) => s.slot === slot)?.level ?? 0;

export function addStructure(state: GameState, kind: StructureKind, slot: string, x: number, y: number, level = 1) {
  const { radius, hp } = stats(kind, level, state.wallLevel);
  const s: Structure = { id: nextId(state), kind, slot, x, y, radius, hp, maxHp: hp, level, hitFlash: 0, pop: 0, cooldown: 0 };
  state.structures.push(s);
  return s;
}

export const getHouse = (state: GameState) => state.structures.find((s) => s.kind === 'house');

type PadSpec = Pick<Pad, 'id' | 'x' | 'y' | 'cost' | 'action'> & { foodCost?: number };

/** Les éléments qu'on traverse (pièges au sol, pieux pour le héros). */
export const isWalkable = (s: Structure) => s.kind === 'trap';

/** Nombre de tourelles autorisées : baraque niv. 2 et 3, +2 par monde, +atout Ingénieur. */
export function towerSlots(state: GameState, houseLevel: number) {
  const fromHouse = (houseLevel >= 2 ? 1 : 0) + (houseLevel >= 3 ? 1 : 0);
  const fromWorlds = 2 * Math.min(state.world, WORLDS.length - 1);
  const fromPerk = PERK_VALUES.engineer.extraSlots[Math.min(3, state.perks.engineer)];
  return Math.min(LAYOUT.towers.length, fromHouse + fromWorlds + fromPerk);
}

/** Liste des emplacements disponibles, déduite de l'état de la base. */
function padSpecs(state: GameState): PadSpec[] {
  const { base } = state;
  const at = (p: { x: number; y: number }) => ({ x: base.x + p.x, y: base.y + p.y });
  const specs: PadSpec[] = [];
  const houseLevel = getHouse(state)?.level ?? 1;
  const has = (slot: string) => state.structures.some((s) => s.slot === slot);

  if (houseLevel < HOUSE_MAX_LEVEL) {
    const level = houseLevel + 1;
    specs.push({
      id: `house-${level}`,
      ...at(LAYOUT.houseUpgradePad),
      cost: COST.house[level],
      foodCost: FOOD_COST.house[level],
      action: { type: 'upgradeHouse', level },
    });
  }

  // Forge : améliore l'arme principale, sans limite (le bois sert toujours).
  if (!has('workshop')) {
    specs.push({ id: 'workshop', ...at(LAYOUT.workshop), cost: COST.workshop, action: { type: 'build', kind: 'workshop', slot: 'workshop' } });
  } else {
    const level = state.hero.weapon.forge + 1;
    specs.push({ id: `forge-${level}`, ...at(LAYOUT.axePad), cost: forgeCost(level), action: { type: 'forge', level } });
  }

  // Caserne (soldats), bûcherons (bois) et pavillon de chasse (nourriture) : 3 niveaux chacun.
  const producers = [
    { slot: 'barracks', kind: 'barracks' as const, pos: LAYOUT.barracks, up: LAYOUT.barracksUpgradePad, costs: COST.barracks, food: FOOD_COST.barracks },
    { slot: 'lumber', kind: 'lumber' as const, pos: LAYOUT.lumber, up: LAYOUT.lumberUpgradePad, costs: COST.lumber, food: FOOD_COST.lumber },
    { slot: 'lodge', kind: 'lodge' as const, pos: LAYOUT.lodge, up: LAYOUT.lodgeUpgradePad, costs: COST.lodge, food: FOOD_COST.lodge },
  ];
  for (const p of producers) {
    const level = structureLevel(state, p.slot);
    if (level === 0) {
      specs.push({ id: p.slot, ...at(p.pos), cost: p.costs[1], action: { type: 'build', kind: p.kind, slot: p.slot } });
    } else if (level < STRUCTURE_MAX_LEVEL) {
      specs.push({
        id: `${p.slot}-${level + 1}`,
        ...at(p.up),
        cost: p.costs[level + 1],
        foodCost: p.food[level + 1],
        action: { type: 'upgradeStructure', slot: p.slot, level: level + 1 },
      });
    }
  }

  // Palissade : pieux → mur de pierre → rempart (dès qu'un côté est construit).
  if (state.wallLevel < STRUCTURE_MAX_LEVEL && state.structures.some((s) => s.kind === 'wall')) {
    const level = state.wallLevel + 1;
    specs.push({
      id: `walls-${level}`,
      ...at(LAYOUT.wallUpgradePad),
      cost: WALL_UPGRADE_COST[level],
      foodCost: FOOD_COST.walls[level],
      action: { type: 'upgradeWalls', level },
    });
  }

  // Pièges à pointes (dès le début) et catapultes (baraque niv. 2).
  for (const t of LAYOUT.traps) {
    if (!has(t.slot)) specs.push({ id: t.slot, ...at(t), cost: COST.trap, action: { type: 'build', kind: 'trap', slot: t.slot } });
  }
  for (const c of LAYOUT.catapults) {
    if (houseLevel >= 2 && state.world >= c.minWorld && !has(c.slot)) {
      specs.push({ id: c.slot, ...at(c), cost: COST.catapult, action: { type: 'build', kind: 'catapult', slot: c.slot } });
    }
  }

  // Amélioration de chaque tour : bois → pierre → cristal.
  for (const tower of state.structures) {
    if (tower.kind !== 'tower' || tower.level >= STRUCTURE_MAX_LEVEL) continue;
    const level = tower.level + 1;
    specs.push({
      id: `${tower.slot}-${level}`,
      x: tower.x,
      y: tower.y + 64,
      cost: TOWER_UPGRADE_COST[level],
      foodCost: FOOD_COST.tower[level],
      action: { type: 'upgradeStructure', slot: tower.slot, level },
    });
  }

  for (const side of WALL_SIDES) {
    const slot = `wall-${side}`;
    const built = state.structures.filter((s) => s.slot === slot).length;
    const missing = WALL_SEGMENTS_PER_SIDE - built;
    if (missing <= 0) continue;
    const cost = missing === WALL_SEGMENTS_PER_SIDE ? COST.wallSide : Math.ceil((missing * COST.wallSide) / WALL_SEGMENTS_PER_SIDE);
    specs.push({ id: slot, ...at(wallPadPosition(side)), cost, action: { type: 'build', kind: 'wall', slot } });
  }

  for (const t of LAYOUT.towers.slice(0, towerSlots(state, houseLevel))) {
    if (!has(t.slot)) {
      specs.push({ id: t.slot, ...at(t), cost: COST.tower, action: { type: 'build', kind: 'tower', slot: t.slot } });
    }
  }
  return specs;
}

function syncPads(state: GameState) {
  const old = new Map(state.pads.map((p) => [p.id, p]));
  state.pads = padSpecs(state).map((spec) => {
    const prev = old.get(spec.id);
    const foodCost = spec.foodCost ?? 0;
    return {
      ...spec,
      foodCost,
      foodPaid: Math.min(prev?.foodPaid ?? 0, foodCost),
      paid: Math.min(prev?.paid ?? 0, spec.cost - (foodCost > 0 ? 0 : 1)),
      feedTimer: prev?.feedTimer ?? FEED_START_DELAY,
      pulse: prev?.pulse ?? 0,
    };
  });
  state.padsDirty = false;
}

function complete(state: GameState, pad: Pad) {
  const { base } = state;
  const action: PadAction = pad.action;
  if (action.type === 'build') {
    if (action.kind === 'wall') {
      const side = action.slot.split('-')[1] as (typeof WALL_SIDES)[number];
      for (const p of wallSegments(side)) {
        const x = base.x + p.x;
        const y = base.y + p.y;
        const exists = state.structures.some((s) => s.slot === action.slot && dist(s.x, s.y, x, y) < 5);
        if (!exists) addStructure(state, 'wall', action.slot, x, y);
      }
    } else {
      addStructure(state, action.kind, action.slot, pad.x, pad.y);
    }
  } else if (action.type === 'upgradeHouse') {
    const house = getHouse(state);
    if (house) {
      house.level = action.level;
      house.maxHp = house.hp = HOUSE_HP[action.level];
      house.pop = 0;
      spawnBurst(state, house.x, house.y, 40, 20, 'confetti', FX_COLORS.confetti, 1.4);
    }
  } else if (action.type === 'upgradeStructure') {
    const s = state.structures.find((st) => st.slot === action.slot);
    if (s) {
      s.level = action.level;
      s.maxHp = s.hp = stats(s.kind, s.level).hp;
      s.pop = 0;
      spawnBurst(state, s.x, s.y, 50, 24, 'confetti', FX_COLORS.confetti, 1.4);
    }
  } else if (action.type === 'upgradeWalls') {
    state.wallLevel = action.level;
    for (const s of state.structures) {
      if (s.kind !== 'wall') continue;
      s.maxHp = s.hp = stats('wall', 1, state.wallLevel).hp;
      s.pop = 0;
    }
  } else {
    state.hero.weapon.forge = action.level;
  }
  // La cabane de bûcherons fournit aussi une meilleure hache au héros.
  state.hero.axeLevel = Math.min(3, 1 + structureLevel(state, 'lumber'));

  state.stats.built++;
  state.padsDirty = true;
  spawnBurst(state, pad.x, pad.y, 20, 22, 'confetti', FX_COLORS.confetti, 1.2);
  spawnBurst(state, pad.x, pad.y, 0, 8, 'dust', FX_COLORS.dust, 1);
  addTrauma(state, 0.3);
  state.events.push({ type: 'built', action });
}

export function updatePads(state: GameState, dt: number) {
  if (state.padsDirty) syncPads(state);
  const hero = state.hero;

  for (const pad of state.pads) {
    pad.pulse = Math.max(0, pad.pulse - dt * 6);
    const onPad = !hero.dead && dist(hero.x, hero.y, pad.x, pad.y) < PAD_RADIUS + 4;
    const needWood = pad.paid < pad.cost && state.inventory.wood > 0;
    const needFood = pad.foodPaid < pad.foodCost && state.inventory.food > 0;
    if (!onPad || (!needWood && !needFood)) {
      pad.feedTimer = FEED_START_DELAY;
      continue;
    }
    pad.feedTimer -= dt;
    while (pad.feedTimer <= 0) {
      const wood = pad.paid < pad.cost && state.inventory.wood > 0;
      const food = pad.foodPaid < pad.foodCost && state.inventory.food > 0;
      if (!wood && !food) break;
      pad.feedTimer += PAD_FEED_INTERVAL;
      if (wood) {
        state.inventory.wood--;
        pad.paid++;
      }
      if (food) {
        state.inventory.food--;
        pad.foodPaid++;
      }
      pad.pulse = 1;
      state.flyingLogs.push({ fromX: hero.x, fromY: hero.y - 30, toX: pad.x, toY: pad.y, t: 0, food: !wood });
      state.events.push({ type: 'padFed' });
    }
    if (pad.paid >= pad.cost && pad.foodPaid >= pad.foodCost) {
      complete(state, pad);
      break; // la liste va être recalculée
    }
  }
}

export function damageStructure(state: GameState, s: Structure, amount: number) {
  s.hp -= amount;
  s.hitFlash = 1;
  state.events.push({ type: 'structureHit' });
  spawnBurst(state, s.x, s.y, 20, 3, 'chip', FX_COLORS.chips, 0.7);
  if (s.hp > 0) return;

  if (s.kind === 'house') {
    s.hp = 0;
    state.status = 'gameover';
    addTrauma(state, 1);
    spawnBurst(state, s.x, s.y, 30, 30, 'chip', FX_COLORS.chips, 1.6);
    state.events.push({ type: 'gameOver' });
    return;
  }
  state.structures.splice(state.structures.indexOf(s), 1);
  state.padsDirty = true;
  spawnBurst(state, s.x, s.y, 20, 14, 'chip', FX_COLORS.chips, 1.3);
  spawnBurst(state, s.x, s.y, 0, 6, 'dust', FX_COLORS.dust, 1);
  addTrauma(state, 0.25);
  state.events.push({ type: 'structureDestroyed', kind: s.kind });
}

export function updateStructures(state: GameState, dt: number) {
  for (const s of state.structures) {
    s.hitFlash = Math.max(0, s.hitFlash - dt * 5);
    s.pop = Math.min(1, s.pop + dt / 0.45);
  }
}

export function repairAll(state: GameState) {
  for (const s of state.structures) {
    if (s.hp < s.maxHp) spawnText(state, s.x, s.y - 40, '+', '#7BD35A');
    s.hp = s.maxHp;
  }
}
