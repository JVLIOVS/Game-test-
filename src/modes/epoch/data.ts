import type { UnitKind } from './types';

// Équilibrage et contenu du mode Époques.

/** Longueur du chemin entre les deux bases. */
export const LANE = 2000;
/** Largeur du chemin (décalage latéral des troupes). */
export const LANE_HALF = 70;

export const AGES = 5;
export const AGE_ICONS = ['🦴', '🏰', '💣', '🪖', '🚀'];

/** XP nécessaire pour passer à l'époque suivante (index = époque actuelle). */
export const EVOLVE_XP = [380, 1200, 3300, 8500];

/** Décor et couleurs de chaque époque. */
export const AGE_THEMES = [
  { sky: ['#FF9A5A', '#FFD27A'], ground: '#9C7A4A', lane: '#B89060', side: '#5E8A3A', prop: '#3F6B2A', far: '#7A4A3A' },
  { sky: ['#6FA8DC', '#CFE8FF'], ground: '#6E9A4A', lane: '#A89878', side: '#4E7A3A', prop: '#2E5A2A', far: '#6E7A96' },
  { sky: ['#8A7AA0', '#F2D0A0'], ground: '#7A8A5A', lane: '#9A8A70', side: '#5A6A3A', prop: '#4A3A2A', far: '#5A4E6E' },
  { sky: ['#5A6E86', '#B8C8D8'], ground: '#5E6A5A', lane: '#6E6E74', side: '#4E5A4A', prop: '#3A3F4C', far: '#3E4A5E' },
  { sky: ['#0E0A2A', '#3A1E6E'], ground: '#3A2E5E', lane: '#4E4A7A', side: '#2E2648', prop: '#7E5AD6', far: '#1A1440' },
] as const;

interface UnitDef {
  hp: number;
  damage: number;
  /** Secondes entre deux attaques. */
  rate: number;
  range: number;
  speed: number;
  cost: number;
  /** Temps de recrutement. */
  train: number;
}

/** Statistiques à la préhistoire ; chaque époque les multiplie. */
export const UNITS: Record<UnitKind, UnitDef> = {
  inf: { hp: 70, damage: 13, rate: 1, range: 26, speed: 55, cost: 15, train: 0.9 },
  archer: { hp: 42, damage: 9, rate: 1.2, range: 170, speed: 50, cost: 25, train: 1.2 },
  heavy: { hp: 320, damage: 32, rate: 1.4, range: 34, speed: 38, cost: 90, train: 2.6 },
};
export const UNIT_KINDS: UnitKind[] = ['inf', 'archer', 'heavy'];
/** Icônes des troupes à chaque époque (fantassin, archer, lourd). */
export const UNIT_ICONS: Record<UnitKind, string>[] = [
  { inf: '🦴', archer: '🪨', heavy: '🦕' },
  { inf: '⚔️', archer: '🏹', heavy: '🐴' },
  { inf: '🔱', archer: '🎯', heavy: '💣' },
  { inf: '🪖', archer: '🎯', heavy: '🚜' },
  { inf: '⚡', archer: '🔫', heavy: '🤖' },
];

/** Chaque époque : troupes bien plus solides, et plus chères. */
export const ageStat = (age: number) => Math.pow(2.3, age);
export const ageCost = (age: number) => Math.pow(2.1, age);
export const unitCost = (kind: UnitKind, age: number) => Math.round(UNITS[kind].cost * ageCost(age));

/** Base : plus solide à chaque époque. */
export const baseHp = (age: number) => 1200 + age * 800;
/** Tourelle de la base. */
export const turretCost = (age: number) => Math.round(160 * ageCost(age));
export const TURRET = { damage: 16, rate: 1.1, range: 380 };

/** Or gagné sans rien faire, et en éliminant une troupe ennemie (part de son prix). */
export const incomePerSec = (age: number) => 4 * Math.pow(1.7, age);
export const KILL_GOLD = 0.8;
export const KILL_XP = 1.3;
export const START_GOLD = 120;
export const QUEUE_MAX = 5;

/** Pouvoir spécial de l'époque : une frappe sur une zone du chemin. */
export const SPECIAL = { cooldown: 45, radius: 180, hits: 14, duration: 2.2, damage: 70 };
export const SPECIAL_ICONS = ['☄️', '🏹', '💣', '✈️', '🛰️'];

/** Prolongation : après 6 minutes, troupes et coups sur les bases se renforcent chaque minute. */
export const OVERTIME_START = 360;
export const overtime = (time: number) => 1 + (Math.max(0, time - OVERTIME_START) / 60) * 0.6;
/** Mort subite : après 7 minutes, les deux bases s'effritent (part des PV max par seconde). */
export const SUDDEN_DEATH = 390;
export const SUDDEN_DRAIN = 0.01;

/** Caisses de ravitaillement : une de temps en temps, à toucher pour la récupérer. */
export const CRATE_INTERVAL = 22;
export const CRATE_LIFE = 12;
export const RAGE_TIME = 10;
