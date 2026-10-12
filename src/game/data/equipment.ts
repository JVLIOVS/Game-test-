import type { EquipSlot, GameState } from '../types';

// Les 3 équipements (et leurs skins) : gagnés sur les boss de chaque monde.
// Manche 1 → épée, manche 2 → bouclier, manche 3 (gros boss) → armure.
// Le palier suit le monde : bois/cuir à la ferme, fer au royaume, etc.

export const EQUIP_ORDER: EquipSlot[] = ['sword', 'shield', 'armor'];

export const EQUIP_ICONS: Record<EquipSlot, string> = { sword: '🗡️', shield: '🛡️', armor: '🥋' };

/** Couleur de chaque palier (1 = ferme … 4 = futur). */
export const EQUIP_TIER_COLORS = ['#000000', '#B8733A', '#C7D0D8', '#FFD25A', '#5BE0FF'];

export const equipStats = (state: GameState) => {
  const e = state.equipment;
  return {
    /** Puissance : multiplicateur de dégâts de toutes les armes. */
    damage: 1 + 0.25 * e.sword,
    /** Défense : part des dégâts reçus qui est bloquée. */
    block: Math.min(0.6, 0.15 * e.shield),
    /** Agilité : vitesse de course. */
    speed: (1 + 0.07 * e.armor) * state.mods.speedMult,
    /** Petit bonus de l'armure : points de vie en plus. */
    hpBonus: 25 * e.armor,
  };
};

export const damageMult = (state: GameState) => equipStats(state).damage * state.mods.damageMult;

/** Vie maximale du héros : base × progression permanente + bonus d'armure. */
export const heroMaxHp = (state: GameState, base: number) => Math.round(base * state.mods.hpMult) + equipStats(state).hpBonus;
