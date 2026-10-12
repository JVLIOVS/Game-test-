import { FIRST_DAY_LENGTH, HERO_MAX_HP, HERO_RADIUS } from './constants';
import { addStructure, updatePads, updateStructures } from './systems/build';
import { updateHeroActions } from './systems/combat';
import { updateCycle } from './systems/cycle';
import { updateEffects } from './systems/effects';
import { updateHeroLife, updateHeroMovement } from './systems/hero';
import { updateTowers } from './systems/towers';
import { updateTrees } from './systems/trees';
import { updateZombies } from './systems/zombies';
import { emptyPerks } from './data/perks';
import { updateGems } from './systems/progression';
import { updateWeapons } from './systems/weapons';
import { updateSlashes } from './systems/combat';
import { updateChests, updateHappenings } from './systems/happenings';
import { updateUnits } from './systems/units';
import { updateAnimals } from './systems/animals';
import { updateQuests } from './systems/quests';
import type { GameState, PlayerInput, RunModifiers } from './types';
import { DEFAULT_BONUSES } from '../meta/upgrades';
import { LAYOUT } from './world/layout';
import { MAP, generateMap } from './world/map';

export function createGame(mods: RunModifiers = DEFAULT_BONUSES): GameState {
  const base = { x: MAP.width / 2, y: MAP.height / 2 };
  const { trees, decor } = generateMap(MAP, base);
  const state: GameState = {
    time: 0,
    mods,
    rerolls: mods.rerolls,
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
    bombs: [],
    bolts: [],
    gems: [],
    chests: [],
    perks: emptyPerks(),
    weaponTimers: { bow: 0, volley: 0, bomb: 0, meteor: 0, lightning: 0, orbitAngle: 0, deploy: 0, nova: 0, poison: 0, tick: 0 },
    hazards: [],
    enemyShots: [],
    skyDrops: [],
    pets: [],
    turrets: [],
    novas: [],
    choice: null,
    pendingLevelUps: 0,
    bossesKilled: 0,
    bossAlive: false,
    world: 0,
    roundInWorld: 0,
    equipment: { sword: 0, shield: 0, armor: 0 },
    units: [],
    quests: [],
    questsDone: 0,
    animals: [],
    animalTimer: 0,
    wallLevel: 1,
    slashes: [],
    happeningTimer: 30,
    weaponOffer: null,
    barracksTimer: 0,
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
      hp: Math.round(HERO_MAX_HP * mods.hpMult),
      maxHp: Math.round(HERO_MAX_HP * mods.hpMult),
      hurtFlash: 0,
      sinceHurt: 0,
      dead: false,
      respawnTimer: 0,
      axeLevel: 1,
      level: 1,
      xp: 0,
      weapon: { type: 'sword', forge: 0 },
      comboSide: 1,
    },
    inventory: { wood: mods.startWood, stone: 0, food: 0 },
    cycle: { phase: 'day', timer: FIRST_DAY_LENGTH, night: 0, toSpawn: 0, spawnTimer: 0, bossSpawned: false, hordeAngles: [], darkness: 0 },
    particles: [],
    texts: [],
    flyingLogs: [],
    trauma: 0,
    nextId: 10000,
    stats: { zombiesKilled: 0, built: 0, bossesKilled: 0, woodGathered: 0 },
    events: [],
  };
  // Héritage : un atout au hasard dès le départ.
  if (mods.startingPerk) {
    const owned = mods.perks[Math.floor(Math.random() * mods.perks.length)];
    if (owned) state.perks[owned] = 1;
  }
  const house = addStructure(state, 'house', 'house', base.x + LAYOUT.house.x, base.y + LAYOUT.house.y, 1);
  house.pop = 1;
  return state;
}

/** Avance la simulation d'un pas. Pur TypeScript, sans dépendance au rendu. */
export function step(state: GameState, input: PlayerInput, dt: number) {
  // Pause pendant le choix d'une carte.
  if (state.choice || state.weaponOffer) return;
  state.time += dt;
  if (state.status === 'playing') {
    updateCycle(state, dt);
    updateHeroMovement(state, input, dt);
    updateHeroLife(state, dt);
    updateHeroActions(state, dt);
    updatePads(state, dt);
    updateZombies(state, dt);
    updateTowers(state, dt);
    updateWeapons(state, dt);
    updateGems(state, dt);
    updateUnits(state, dt);
    updateAnimals(state, dt);
    updateHappenings(state, dt);
    updateChests(state, dt);
    updateSlashes(state, dt);
    updateQuests(state);
    updateStructures(state, dt);
  }
  updateTrees(state, dt);
  updateEffects(state, dt);
}
