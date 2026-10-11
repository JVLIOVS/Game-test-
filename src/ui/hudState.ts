import type { GameState } from '../game/types';
import { getHouse } from '../game/systems/build';

/** Ce que l'interface React affiche. Recalculé à chaque image, transmis seulement s'il change. */
export interface HudState {
  wood: number;
  heroHp: number;
  heroDead: boolean;
  respawnIn: number;
  houseHp: number;
  phase: 'day' | 'night';
  dayTimer: number;
  night: number;
  zombiesLeft: number;
  status: 'playing' | 'gameover';
  nightsSurvived: number;
  zombiesKilled: number;
}

export function readHud(state: GameState): HudState {
  const house = getHouse(state);
  const c = state.cycle;
  return {
    wood: state.inventory.wood,
    heroHp: Math.round((state.hero.hp / state.hero.maxHp) * 50) / 50,
    heroDead: state.hero.dead,
    respawnIn: Math.ceil(state.hero.respawnTimer),
    houseHp: house ? Math.round((house.hp / house.maxHp) * 50) / 50 : 0,
    phase: c.phase,
    dayTimer: Math.ceil(c.timer),
    night: c.night,
    zombiesLeft: state.zombies.length + c.toSpawn,
    status: state.status,
    nightsSurvived: Math.max(0, c.phase === 'day' ? c.night : c.night - 1),
    zombiesKilled: state.stats.zombiesKilled,
  };
}

export function sameHud(a: HudState, b: HudState) {
  for (const k in a) if (a[k as keyof HudState] !== b[k as keyof HudState]) return false;
  return true;
}
