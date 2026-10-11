import { HERO_RADIUS } from './constants';
import { updateEffects } from './systems/effects';
import { updateHarvest, updateTrees } from './systems/harvest';
import { updateHeroMovement } from './systems/movement';
import type { GameState, PlayerInput } from './types';
import { generateZone } from './world/generateZone';
import { START_ZONE_ID, ZONES } from './world/zones';

export function createGame(): GameState {
  const def = ZONES[START_ZONE_ID];
  return {
    time: 0,
    zone: generateZone(def),
    hero: {
      x: def.spawn.x,
      y: def.spawn.y,
      vx: 0,
      vy: 0,
      radius: HERO_RADIUS,
      dirX: 1,
      walkTime: 0,
      swingTime: 0,
      swingCooldown: 0,
      swingHitDone: false,
      targetTreeId: null,
    },
    inventory: { wood: 0, stone: 0, food: 0 },
    particles: [],
    texts: [],
    trauma: 0,
    events: [],
  };
}

/** Avance la simulation d'un pas fixe. Pur TypeScript, sans dépendance au rendu. */
export function step(state: GameState, input: PlayerInput, dt: number) {
  state.time += dt;
  updateHeroMovement(state, input, dt);
  updateHarvest(state, dt);
  updateTrees(state, dt);
  updateEffects(state, dt);
}
