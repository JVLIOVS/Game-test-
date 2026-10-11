import type { CardId, GameState, PerkId } from '../types';

// Les atouts : 4 armes automatiques et 6 bonus. Chacun a 3 évolutions.
// L'évolution n demande d'avoir battu n - 1 boss : on ne peut pas tout
// maxer dès la première manche, chaque boss ouvre un nouveau palier.

export const PERK_MAX_LEVEL = 3;

export interface PerkDef {
  kind: 'weapon' | 'bonus';
  icon: string;
}

export const PERKS: Record<PerkId, PerkDef> = {
  bow: { kind: 'weapon', icon: '🏹' },
  orbit: { kind: 'weapon', icon: '🪓' },
  bomb: { kind: 'weapon', icon: '💣' },
  lightning: { kind: 'weapon', icon: '⚡' },
  vigor: { kind: 'bonus', icon: '❤️' },
  swift: { kind: 'bonus', icon: '👟' },
  strength: { kind: 'bonus', icon: '💪' },
  magnet: { kind: 'bonus', icon: '🧲' },
  lumberjack: { kind: 'bonus', icon: '🪵' },
  architect: { kind: 'bonus', icon: '🏰' },
};

export const PERK_IDS = Object.keys(PERKS) as PerkId[];

export const CARD_ICONS: Record<CardId, string> = {
  ...Object.fromEntries(PERK_IDS.map((id) => [id, PERKS[id].icon])),
  heal: '🍖',
  woodBag: '🎒',
} as Record<CardId, string>;

/** Bosses à battre pour pouvoir prendre ce niveau. */
export const bossesRequired = (level: number) => level - 1;

export function canTake(state: GameState, id: PerkId) {
  const next = state.perks[id] + 1;
  return next <= PERK_MAX_LEVEL && state.bossesKilled >= bossesRequired(next);
}

/** Tire 3 cartes au hasard parmi les atouts disponibles. */
export function drawCards(state: GameState, count = 3): CardId[] {
  const pool = PERK_IDS.filter((id) => canTake(state, id));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const cards: CardId[] = pool.slice(0, count);
  const fallbacks: CardId[] = ['heal', 'woodBag'];
  while (cards.length < count && fallbacks.length) cards.push(fallbacks.shift()!);
  return cards;
}

// Effets chiffrés (index = niveau de l'atout, 0 = pas pris).
export const PERK_VALUES = {
  bow: { interval: [0, 1.1, 0.95, 0.8], arrows: [0, 1, 2, 3], damage: 16 },
  orbit: { count: [0, 1, 2, 3], damage: [0, 14, 18, 24], radius: 62 },
  bomb: { interval: [0, 3.2, 2.6, 2], radius: [0, 70, 85, 100], damage: [0, 30, 40, 55] },
  lightning: { interval: [0, 2.6, 2.2, 1.8], strikes: [0, 1, 2, 3], damage: 38 },
  vigor: { hpBonus: [0, 30, 60, 100] },
  swift: { speedBonus: [0, 0.12, 0.24, 0.36] },
  strength: { damageBonus: [0, 0.2, 0.4, 0.65] },
  magnet: { radius: [70, 120, 170, 240] },
  lumberjack: { woodPerHit: [1, 2, 2, 3], fellBonus: [2, 2, 4, 5] },
  architect: { hpBonus: [0, 0.3, 0.6, 1], towerRate: [1, 1.2, 1.4, 1.7] },
};

export const damageMult = (state: GameState) => 1 + PERK_VALUES.strength.damageBonus[state.perks.strength];

export function emptyPerks(): Record<PerkId, number> {
  return Object.fromEntries(PERK_IDS.map((id) => [id, 0])) as Record<PerkId, number>;
}
