import type { PerkId, WeaponType } from '../game/types';

// Progression permanente : chaque partie rapporte des âmes, qui débloquent pour toujours
// des améliorations, des armes et des atouts. C'est ce qui donne envie de relancer une partie.

export type MetaUpgradeId = 'vitality' | 'power' | 'swiftness' | 'wisdom' | 'stockpile' | 'foundations' | 'reroll' | 'legacy';

export interface MetaUpgradeDef {
  id: MetaUpgradeId;
  icon: string;
  maxLevel: number;
  /** Coût en âmes du niveau n (1 = premier achat). */
  cost: (level: number) => number;
}

export const META_UPGRADES: MetaUpgradeDef[] = [
  { id: 'vitality', icon: '❤️', maxLevel: 5, cost: (n) => 20 + n * 25 },
  { id: 'power', icon: '💪', maxLevel: 5, cost: (n) => 25 + n * 30 },
  { id: 'swiftness', icon: '👟', maxLevel: 3, cost: (n) => 20 + n * 25 },
  { id: 'wisdom', icon: '📖', maxLevel: 5, cost: (n) => 20 + n * 25 },
  { id: 'stockpile', icon: '🪵', maxLevel: 5, cost: (n) => 15 + n * 20 },
  { id: 'foundations', icon: '🏠', maxLevel: 5, cost: (n) => 20 + n * 25 },
  { id: 'reroll', icon: '🎲', maxLevel: 3, cost: (n) => 40 + n * 40 },
  { id: 'legacy', icon: '🎁', maxLevel: 1, cost: () => 150 },
];

/** Armes et atouts à débloquer (les autres sont disponibles dès le début). */
export const WEAPON_UNLOCKS: { id: WeaponType; cost: number }[] = [
  { id: 'spear', cost: 60 },
  { id: 'hammer', cost: 90 },
  { id: 'daggers', cost: 120 },
];
export const PERK_UNLOCKS: { id: PerkId; cost: number }[] = [
  { id: 'frost', cost: 70 },
  { id: 'poison', cost: 90 },
  { id: 'wolf', cost: 110 },
];

export const STARTING_WEAPONS: WeaponType[] = ['sword'];
export const STARTING_PERKS: PerkId[] = ['bow', 'orbit', 'bomb', 'lightning', 'engineer'];

/** Tout ce qui est gardé d'une partie à l'autre. */
export interface MetaSave {
  version: 1;
  souls: number;
  upgrades: Record<MetaUpgradeId, number>;
  weapons: WeaponType[];
  perks: PerkId[];
  best: { world: number; night: number; kills: number };
  runs: number;
}

export function emptyMeta(): MetaSave {
  return {
    version: 1,
    souls: 0,
    upgrades: { vitality: 0, power: 0, swiftness: 0, wisdom: 0, stockpile: 0, foundations: 0, reroll: 0, legacy: 0 },
    weapons: [...STARTING_WEAPONS],
    perks: [...STARTING_PERKS],
    best: { world: 0, night: 0, kills: 0 },
    runs: 0,
  };
}

/** Bonus appliqués au début de chaque partie. */
export interface RunBonuses {
  hpMult: number;
  damageMult: number;
  speedMult: number;
  xpMult: number;
  startWood: number;
  houseHpMult: number;
  rerolls: number;
  startingPerk: boolean;
  weapons: WeaponType[];
  perks: PerkId[];
}

export function runBonuses(meta: MetaSave): RunBonuses {
  const u = meta.upgrades;
  return {
    hpMult: 1 + 0.12 * u.vitality,
    damageMult: 1 + 0.1 * u.power,
    speedMult: 1 + 0.05 * u.swiftness,
    xpMult: 1 + 0.12 * u.wisdom,
    startWood: 15 * u.stockpile,
    houseHpMult: 1 + 0.15 * u.foundations,
    rerolls: u.reroll,
    startingPerk: u.legacy > 0,
    weapons: meta.weapons,
    perks: meta.perks,
  };
}

export const DEFAULT_BONUSES: RunBonuses = runBonuses(emptyMeta());

/** Âmes gagnées à la fin d'une partie. */
export function soulsEarned(r: { kills: number; bosses: number; nights: number; world: number; quests: number }) {
  return Math.floor(r.kills / 12) + r.bosses * 12 + r.nights * 4 + r.world * 25 + r.quests * 2;
}
