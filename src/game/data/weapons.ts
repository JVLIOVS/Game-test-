import type { WeaponType } from '../types';

// Armes principales du héros. Chacune a sa façon de tuer :
// - épée : large coup en arc qui touche tous les zombies devant ;
// - lance : estoc très long qui transperce une ligne de zombies ;
// - marteau : lent, frappe le sol et repousse tout autour ;
// - dagues : très rapides, sur une seule cible, avec des coups critiques.

export const WEAPON_TYPES: WeaponType[] = ['sword', 'spear', 'hammer', 'daggers'];

export const WEAPON_ICONS: Record<WeaponType, string> = {
  sword: '⚔️',
  spear: '🔱',
  hammer: '🔨',
  daggers: '🗡️',
};

export interface WeaponDef {
  damage: number;
  /** Portée (bord à bord) pour déclencher et toucher. */
  reach: number;
  /** Vitesse du coup (1 = normal). */
  speed: number;
  knockback: number;
  crit: number;
}

export const WEAPONS: Record<WeaponType, WeaponDef> = {
  sword: { damage: 14, reach: 34, speed: 1, knockback: 260, crit: 0.05 },
  spear: { damage: 13, reach: 64, speed: 1.1, knockback: 180, crit: 0.05 },
  hammer: { damage: 26, reach: 40, speed: 0.65, knockback: 520, crit: 0 },
  daggers: { damage: 8, reach: 26, speed: 2.1, knockback: 90, crit: 0.25 },
};

/** Bonus de dégâts de la forge : +22 % par niveau, sans limite. */
export const forgeMult = (forge: number) => 1 + 0.22 * forge;
/** Coût en bois du niveau de forge suivant. */
export const forgeCost = (nextLevel: number) => 18 + nextLevel * 14;
