import {
  COST,
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
import { FX_COLORS } from '../fxColors';
import type { GameState, Pad, PadAction, Structure, StructureKind } from '../types';
import { LAYOUT, WALL_SIDES, wallPadPosition, wallSegments } from '../world/layout';
import { dist, nextId } from './common';
import { addTrauma, spawnBurst, spawnText } from './effects';

const FEED_START_DELAY = 0.25;

function stats(kind: StructureKind, level: number) {
  switch (kind) {
    case 'house':
      return { radius: HOUSE_RADIUS, hp: HOUSE_HP[level] };
    case 'wall':
      return { radius: WALL_SEGMENT_RADIUS, hp: WALL_HP };
    case 'tower':
      return { radius: TOWER_RADIUS, hp: TOWER_HP };
    case 'workshop':
      return { radius: WORKSHOP_RADIUS, hp: WORKSHOP_HP };
  }
}

export function addStructure(state: GameState, kind: StructureKind, slot: string, x: number, y: number, level = 1) {
  const { radius } = stats(kind, level);
  const hp = Math.round(stats(kind, level).hp * (1 + PERK_VALUES.architect.hpBonus[state.perks.architect]));
  const s: Structure = { id: nextId(state), kind, slot, x, y, radius, hp, maxHp: hp, level, hitFlash: 0, pop: 0, cooldown: 0 };
  state.structures.push(s);
  return s;
}

export const getHouse = (state: GameState) => state.structures.find((s) => s.kind === 'house');

type PadSpec = Pick<Pad, 'id' | 'x' | 'y' | 'cost' | 'action'>;

/** Liste des emplacements disponibles, déduite de l'état de la base. */
function padSpecs(state: GameState): PadSpec[] {
  const { base } = state;
  const at = (p: { x: number; y: number }) => ({ x: base.x + p.x, y: base.y + p.y });
  const specs: PadSpec[] = [];
  const houseLevel = getHouse(state)?.level ?? 1;
  const has = (slot: string) => state.structures.some((s) => s.slot === slot);

  if (houseLevel < HOUSE_MAX_LEVEL) {
    const level = houseLevel + 1;
    specs.push({ id: `house-${level}`, ...at(LAYOUT.houseUpgradePad), cost: COST.house[level], action: { type: 'upgradeHouse', level } });
  }

  if (!has('workshop')) {
    specs.push({ id: 'workshop', ...at(LAYOUT.workshop), cost: COST.workshop, action: { type: 'build', kind: 'workshop', slot: 'workshop' } });
  } else {
    const level = state.hero.axeLevel + 1;
    if (level <= 3 && (level < 3 || houseLevel >= 2)) {
      specs.push({ id: `axe-${level}`, ...at(LAYOUT.axePad), cost: COST.axe[level], action: { type: 'upgradeAxe', level } });
    }
  }

  for (const side of WALL_SIDES) {
    const slot = `wall-${side}`;
    const built = state.structures.filter((s) => s.slot === slot).length;
    const missing = WALL_SEGMENTS_PER_SIDE - built;
    if (missing <= 0) continue;
    const cost = missing === WALL_SEGMENTS_PER_SIDE ? COST.wallSide : missing * 3;
    specs.push({ id: slot, ...at(wallPadPosition(side)), cost, action: { type: 'build', kind: 'wall', slot } });
  }

  for (const t of LAYOUT.towers) {
    if (houseLevel >= t.minHouse && !has(t.slot)) {
      specs.push({ id: t.slot, ...at(t), cost: COST.tower, action: { type: 'build', kind: 'tower', slot: t.slot } });
    }
  }
  return specs;
}

function syncPads(state: GameState) {
  const old = new Map(state.pads.map((p) => [p.id, p]));
  state.pads = padSpecs(state).map((spec) => {
    const prev = old.get(spec.id);
    return {
      ...spec,
      paid: Math.min(prev?.paid ?? 0, spec.cost - 1),
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
      house.maxHp = house.hp = Math.round(HOUSE_HP[action.level] * (1 + PERK_VALUES.architect.hpBonus[state.perks.architect]));
      house.pop = 0;
      spawnBurst(state, house.x, house.y, 40, 20, 'confetti', FX_COLORS.confetti, 1.4);
    }
  } else {
    state.hero.axeLevel = action.level;
  }

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
    if (!onPad || state.inventory.wood <= 0) {
      pad.feedTimer = FEED_START_DELAY;
      continue;
    }
    pad.feedTimer -= dt;
    while (pad.feedTimer <= 0 && state.inventory.wood > 0 && pad.paid < pad.cost) {
      pad.feedTimer += PAD_FEED_INTERVAL;
      state.inventory.wood--;
      pad.paid++;
      pad.pulse = 1;
      state.flyingLogs.push({ fromX: hero.x, fromY: hero.y - 30, toX: pad.x, toY: pad.y, t: 0 });
      state.events.push({ type: 'padFed' });
    }
    if (pad.paid >= pad.cost) {
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
