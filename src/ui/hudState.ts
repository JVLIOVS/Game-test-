import { xpToNext } from '../game/constants';
import { ownedPerks } from '../game/data/perks';
import { worldDef } from '../game/data/worlds';
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
  level: number;
  xpRatio: number;
  /** Vie du boss (0..1), ou -1 s'il n'y en a pas. */
  bossHp: number;
  bossesKilled: number;
  /** Cartes proposées, séparées par des virgules ("" si aucun choix). */
  choice: string;
  /** Niveau actuel de chaque carte proposée, dans le même ordre. */
  choiceLevels: string;
  worldId: string;
  /** Manche en cours (la nuit) ou à venir (le jour), de 1 à 3. */
  round: number;
  /** Atouts possédés : "bow:2,orbit:1". */
  slots: string;
  sword: number;
  shield: number;
  armor: number;
}

export function readHud(state: GameState): HudState {
  const house = getHouse(state);
  const c = state.cycle;
  const boss = state.zombies.find((z) => z.boss);
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
    level: state.hero.level,
    xpRatio: Math.round((state.hero.xp / xpToNext(state.hero.level)) * 50) / 50,
    bossHp: boss ? Math.round((boss.hp / boss.maxHp) * 100) / 100 : -1,
    bossesKilled: state.bossesKilled,
    choice: state.choice ? state.choice.join(',') : '',
    choiceLevels: state.choice
      ? state.choice.map((c) => (c === 'heal' || c === 'woodBag' ? 0 : state.perks[c])).join(',')
      : '',
    worldId: worldDef(state.world).id,
    round: c.phase === 'night' ? state.roundInWorld : state.roundInWorld + 1,
    slots: ownedPerks(state)
      .map((id) => `${id}:${state.perks[id]}`)
      .join(','),
    sword: state.equipment.sword,
    shield: state.equipment.shield,
    armor: state.equipment.armor,
  };
}

export function sameHud(a: HudState, b: HudState) {
  for (const k in a) if (a[k as keyof HudState] !== b[k as keyof HudState]) return false;
  return true;
}
