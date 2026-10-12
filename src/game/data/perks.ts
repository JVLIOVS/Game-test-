import type { CardId, GameState, PerkId } from '../types';

// 8 atouts, 5 emplacements : il faut choisir.
// Tant qu'on a moins de 5 atouts, les cartes proposent des atouts nouveaux ou des évolutions.
// Avec 5 atouts, les cartes ne proposent plus que leurs évolutions (3 phases chacun).
// Chaque phase transforme l'atout (ex. arc → flèches de feu → pluie de flèches).
// La phase n demande d'avoir battu n - 1 boss.
// Après la phase 3, l'atout continue de monter en étoiles (★) : il y a toujours une carte utile.

export const PERK_PHASES = 3;
export const PERK_MAX_LEVEL = PERK_PHASES + 20;
export const PERK_SLOTS = 5;

export const PERK_IDS: PerkId[] = ['bow', 'orbit', 'bomb', 'lightning', 'engineer', 'frost', 'poison', 'wolf'];

export const CARD_ICONS: Record<CardId, string> = {
  bow: '🏹',
  orbit: '🪓',
  bomb: '💣',
  lightning: '⚡',
  engineer: '🔧',
  frost: '❄️',
  poison: '🧪',
  wolf: '🐺',
  heal: '🍖',
  woodBag: '🎒',
};

/** Bosses à battre pour pouvoir prendre cette phase. */
export const bossesRequired = (level: number) => level - 1;

export const ownedPerks = (state: GameState) => PERK_IDS.filter((id) => state.perks[id] > 0);

export function canTake(state: GameState, id: PerkId) {
  const current = state.perks[id];
  if (current === 0 && ownedPerks(state).length >= PERK_SLOTS) return false;
  const next = current + 1;
  return next <= PERK_MAX_LEVEL && state.bossesKilled >= bossesRequired(Math.min(next, PERK_PHASES));
}

/** Phase visible de l'atout (1 à 3). */
export const perkPhase = (level: number) => Math.min(level, PERK_PHASES);
/** Étoiles gagnées après la phase 3. */
export const perkStars = (level: number) => Math.max(0, level - PERK_PHASES);
/** Chaque étoile : +20 % de dégâts et des tirs un peu plus fréquents. */
export const starDamage = (level: number) => 1 + 0.2 * perkStars(level);
export const starRate = (level: number) => 1 + 0.08 * perkStars(level);

/** Tire 3 cartes au hasard parmi les atouts disponibles. */
export function drawCards(state: GameState, count = 3): CardId[] {
  const pool = PERK_IDS.filter((id) => state.mods.perks.includes(id) && canTake(state, id));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const cards: CardId[] = pool.slice(0, count);
  const fallbacks: CardId[] = ['heal', 'woodBag'];
  while (cards.length < count && fallbacks.length) cards.push(fallbacks.shift()!);
  return cards;
}

// Effets chiffrés (index = phase de l'atout, 0 = pas pris).
export const PERK_VALUES = {
  // Phase 2 : flèches de feu qui laissent des flammes. Phase 3 : pluie de flèches en plus.
  bow: { interval: [0, 1.0, 0.85, 0.7], arrows: [0, 1, 2, 3], damage: [0, 16, 22, 30], volley: [0, 0, 0, 10], volleyInterval: 3 },
  // Phase 2 : haches enflammées. Phase 3 : tornade de lames d'or.
  orbit: { count: [0, 1, 2, 4], damage: [0, 14, 20, 30], radius: [0, 62, 72, 90], size: [0, 1, 1.3, 1.5] },
  // Phase 2 : bombes incendiaires. Phase 3 : fragmentation + météore.
  bomb: { interval: [0, 3, 2.5, 2], radius: [0, 70, 85, 95], damage: [0, 30, 42, 50], cluster: [0, 0, 0, 3], meteorInterval: 7 },
  // Phase 2 : éclair en chaîne. Phase 3 : nuage d'orage qui suit le héros.
  lightning: { interval: [0, 2.5, 1.9, 0.9], strikes: [0, 1, 1, 2], chain: [0, 0, 4, 6], damage: [0, 38, 44, 52] },
  // Phase 2 : tourelle portable posée près du héros. Phase 3 : canons explosifs.
  engineer: { towerDamage: [1, 1.35, 1.6, 1.9], arrows: [1, 1, 2, 2], explosive: [0, 0, 0, 1], extraSlots: [0, 1, 1, 2], deployInterval: [0, 0, 12, 9] },
  // Aura de givre : ralentit et blesse ; phase 3 : onde de gel.
  frost: { radius: [0, 95, 125, 165], slow: [0, 0.3, 0.45, 0.6], dps: [0, 5, 9, 14], novaInterval: 5, novaDamage: 45 },
  // Fioles toxiques : nuages de poison ; phase 3 : les zombies empoisonnés explosent en nuage.
  poison: { interval: [0, 3, 2.4, 2], flasks: [0, 1, 2, 3], radius: [0, 55, 70, 80], dps: [0, 10, 15, 20] },
  // Loups compagnons : phase 3, un loup alpha géant.
  wolf: { count: [0, 1, 2, 3], damage: [0, 12, 16, 22] },
};

export const GEM_MAGNET_RADIUS = 110;

export function emptyPerks(): Record<PerkId, number> {
  return { bow: 0, orbit: 0, bomb: 0, lightning: 0, engineer: 0, frost: 0, poison: 0, wolf: 0 };
}
