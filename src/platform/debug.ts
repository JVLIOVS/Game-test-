import { Platform } from 'react-native';
import type { GameState } from '../game/types';

/**
 * Raccourcis de test, seulement dans le navigateur, via l'adresse :
 * #nuit (la nuit tombe tout de suite), #riche (200 bois), #nuit-riche (les deux).
 */
export function applyDebugHash(state: GameState) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return state;
  const hash = window.location.hash.toLowerCase();
  if (hash.includes('nuit')) state.cycle.timer = 2;
  if (hash.includes('riche')) state.inventory.wood = 200;
  return state;
}
