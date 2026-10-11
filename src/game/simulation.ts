import { FIRST_DAY_LENGTH, HERO_MAX_HP, HERO_RADIUS } from './constants';
import { addStructure, updatePads, updateStructures } from './systems/build';
import { updateHeroActions } from './systems/combat';
import { updateCycle } from './systems/cycle';
import { updateEffects } from './systems/effects';
import { updateHeroLife, updateHeroMovement } from './systems/hero';
import { updateTowers } from './systems/towers';
import { updateTrees } from './systems/trees';
import { updateZombies } from './systems/zombies';
import type { GameState, PlayerInput } from './types';
import { LAYOUT } from './world/layout';
import { MAP, generateMap } from './world/map';

export function createGame(): GameState {
  const base = { x: MAP.width / 2, y: MAP.height / 2 };
  const { trees, decor } = generateMap(MAP, base);
  const state: GameState = {
    time: 0,
    status: 'playing',
    map: MAP,
    base,
    trees,
    decor,
    structures: [],
    pads: [],
    padsDirty: true,
    zombies: [],
    projectiles: [],
    chests: [],
    hero: {
      x: base.x + LAYOUT.heroSpawn.x,
      y: base.y + LAYOUT.heroSpawn.y,
      vx: 0,
      vy: 0,
      radius: HERO_RADIUS,
      dirX: 1,
      walkTime: 0,
      swingTime: 0,
      swingCooldown: 0,
      swingHitDone: false,
      target: null,
      hp: HERO_MAX_HP,
      maxHp: HERO_MAX_HP,
      hurtFlash: 0,
      sinceHurt: 0,
      dead: false,
      respawnTimer: 0,
      axeLevel: 1,
    },
    inventory: { wood: 0, stone: 0, food: 0 },
    cycle: { phase: 'day', timer: FIRST_DAY_LENGTH, night: 0, toSpawn: 0, spawnTimer: 0, darkness: 0 },
    particles: [],
    texts: [],
    flyingLogs: [],
    trauma: 0,
    nextId: 10000,
    stats: { zombiesKilled: 0, built: 0 },
    events: [],
  };
  const house = addStructure(state, 'house', 'house', base.x + LAYOUT.house.x, base.y + LAYOUT.house.y, 1);
  house.pop = 1;
  return state;
}

/** Avance la simulation d'un pas. Pur TypeScript, sans dépendance au rendu. */
export function step(state: GameState, input: PlayerInput, dt: number) {
  state.time += dt;
  if (state.status === 'playing') {
    updateCycle(state, dt);
    updateHeroMovement(state, input, dt);
    updateHeroLife(state, dt);
    updateHeroActions(state, dt);
    updatePads(state, dt);
    updateZombies(state, dt);
    updateTowers(state, dt);
    updateStructures(state, dt);
  }
  updateTrees(state, dt);
  updateEffects(state, dt);
}
