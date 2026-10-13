import type { ArtifactKind, CharacterId, DemonPower, WheelPrize } from './types';

// Contenu du mode Refuges : personnages, roue de fin de manche, artefacts, pouvoirs du Démon.

export interface CharacterDef {
  icon: string;
  shirt: string;
  /** Tourelles moins chères et plus rapides. */
  turretCostMult: number;
  turretRateMult: number;
  /** Porte plus solide, réparation gratuite. */
  doorHpMult: number;
  repairFree: boolean;
  /** Chance en plus à la roue (0 à 1) et or de départ en plus. */
  luck: number;
  gold: number;
}

export const CHARACTERS: Record<CharacterId, CharacterDef> = {
  mecano: { icon: '🔧', shirt: '#FF9F1C', turretCostMult: 0.7, turretRateMult: 1.2, doorHpMult: 1, repairFree: false, luck: 0, gold: 0 },
  gardien: { icon: '🛡️', shirt: '#4E7BD6', turretCostMult: 1, turretRateMult: 1, doorHpMult: 1.4, repairFree: true, luck: 0, gold: 0 },
  veinard: { icon: '🍀', shirt: '#4FB86A', turretCostMult: 1, turretRateMult: 1, doorHpMult: 1, repairFree: false, luck: 0.4, gold: 70 },
};
export const CHARACTER_IDS = Object.keys(CHARACTERS) as CharacterId[];

/** Les 8 cases de la roue, dans l'ordre d'affichage. */
export const WHEEL: { prize: WheelPrize; icon: string; color: string; rarity: 0 | 1 | 2 }[] = [
  { prize: 'gold', icon: '💰', color: '#FFD25A', rarity: 0 },
  { prize: 'storm', icon: '⚡', color: '#5B8DEF', rarity: 1 },
  { prize: 'repair', icon: '🔨', color: '#7BD35A', rarity: 0 },
  { prize: 'shield', icon: '🛡️', color: '#6FB7F0', rarity: 1 },
  { prize: 'turbo', icon: '⚙️', color: '#F2A93B', rarity: 0 },
  { prize: 'artifact', icon: '🔮', color: '#B05BD6', rarity: 2 },
  { prize: 'power', icon: '💪', color: '#FF7A5A', rarity: 1 },
  { prize: 'mega', icon: '🗼', color: '#E0533D', rarity: 2 },
];
/** Poids de base par rareté ; la chance déplace les poids vers les cases rares. */
export const wheelWeight = (rarity: 0 | 1 | 2, luck: number) => (rarity === 0 ? 3 * (1 - luck * 0.6) : rarity === 1 ? 2 * (1 + luck) : 0.8 * (1 + luck * 3.5));

export const BOOST_TIME = { power: 40, turbo: 60, storm: 22 };
export const STORM = { damage: 45, interval: 0.5 };
export const SHIELD_RATIO = 0.6;
export const goldPrize = (round: number) => 80 + round * 50;
/** Points de performance pour une chance de 100 % sur une manche. */
export const LUCK_FULL = 40;

export const ARTIFACTS: Record<ArtifactKind, { icon: string; color: string }> = {
  mega: { icon: '🗼', color: '#E0533D' },
  tesla: { icon: '⚡', color: '#5B8DEF' },
  frost: { icon: '❄️', color: '#6FB7F0' },
  heal: { icon: '💚', color: '#7BD35A' },
};
/** Méga-tourelle : canon lourd à tir rapide. */
export const MEGA = { damage: 70, interval: 0.55, splash: 60, range: 380 };
/** Bobine Tesla : éclair en chaîne. */
export const TESLA = { damage: 38, interval: 1.1, chain: 4 };
/** Totem de givre : ralentit tout ce qui approche de la porte. */
export const FROST_SLOW = 0.5;
/** Totem de soin : la porte se répare toute seule (part des PV max par seconde). */
export const HEAL_RATE = 0.015;

export const DEMON_POWERS: Record<DemonPower, { icon: string; active: boolean; max: number }> = {
  toxic: { icon: '🧪', active: false, max: 3 },
  regen: { icon: '💚', active: false, max: 3 },
  brute: { icon: '🦾', active: false, max: 3 },
  hide: { icon: '🪨', active: false, max: 3 },
  clone: { icon: '👥', active: true, max: 3 },
  roar: { icon: '📣', active: true, max: 3 },
  dash: { icon: '💨', active: true, max: 3 },
};
export const POWER_IDS = Object.keys(DEMON_POWERS) as DemonPower[];
export const ACTIVE_POWERS = POWER_IDS.filter((p) => DEMON_POWERS[p].active);

/** Effets par niveau de pouvoir (index = niveau). */
export const TOXIC_DPS = [0, 0.25, 0.45, 0.7]; // × dégâts du Démon, par seconde, pendant 5 s
export const REGEN_RATE = [0, 0.012, 0.022, 0.035]; // part des PV max par seconde
export const BRUTE_MULT = [1, 1.25, 1.5, 1.8];
export const HIDE_MULT = [1, 0.85, 0.72, 0.6]; // dégâts subis
export const CLONE = { time: 30, cooldown: [0, 70, 60, 50], strength: [0, 0.45, 0.6, 0.75] };
export const ROAR = { time: [0, 3, 4.5, 6], cooldown: 25, radius: 340 };
export const DASH = { time: 0.45, speed: 3.2, cooldown: [0, 9, 7, 5] };
