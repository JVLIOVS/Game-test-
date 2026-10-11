import { Platform } from 'react-native';
import { addStructure } from '../game/systems/build';
import type { GameState } from '../game/types';
import { LAYOUT } from '../game/world/layout';

/**
 * Raccourcis de test, seulement dans le navigateur, via l'adresse :
 * #nuit (la nuit tombe tout de suite), #riche (200 bois), #nuit-riche (les deux),
 * #cartes (un choix d'atout tout de suite), #boss (le boss arrive tout de suite),
 * #armes (arc, haches et bombes en phase 1), #monde2 … #monde4 (aller directement dans un monde),
 * #equipement (épée, bouclier et armure du monde), #camp (caserne et bûcherons niv. 2),
 * #coffre (un coffre d'arme à côté du héros), #evenement (un micro-événement tout de suite). Combinables : #boss-armes.
 */
export function applyDebugHash(state: GameState) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return state;
  const hash = window.location.hash.toLowerCase();
  if (hash.includes('nuit')) state.cycle.timer = 2;
  if (hash.includes('riche')) state.inventory.wood = 200;
  if (hash.includes('cartes')) state.pendingLevelUps = 1;
  if (hash.includes('armes')) Object.assign(state.perks, { bow: 1, orbit: 1, bomb: 1 });
  const world = /monde(\d)/.exec(hash);
  if (world) {
    state.world = Math.max(0, Number(world[1]) - 1);
    state.padsDirty = true;
  }
  if (hash.includes('camp')) {
    for (const slot of ['barracks', 'lumber'] as const) {
      const p = LAYOUT[slot];
      const s = addStructure(state, slot, slot, state.base.x + p.x, state.base.y + p.y, 2);
      s.pop = 1;
    }
    state.padsDirty = true;
  }
  if (hash.includes('coffre')) {
    state.chests.push({ id: 99999, x: state.hero.x + 60, y: state.hero.y, wood: 0, age: 0, kind: 'weapon', fall: 0 });
  }
  if (hash.includes('evenement')) state.happeningTimer = 2;
  if (hash.includes('equipement')) {
    const tier = Math.min(state.world + 1, 4);
    state.equipment = { sword: tier, shield: tier, armor: tier };
  }
  if (hash.includes('boss')) {
    Object.assign(state.cycle, { phase: 'night', night: 1, timer: 0, toSpawn: 0, spawnTimer: 0, bossSpawned: false });
    state.roundInWorld = 1;
  }
  return state;
}
