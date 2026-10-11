// Les mondes (ères). Chaque monde dure 3 manches : mini-boss, mini-boss, gros boss.
// Battre le gros boss fait passer au monde suivant : plus de zombies, plus de tourelles.

export const ROUNDS_PER_WORLD = 3;

export interface WorldDef {
  id: 'farm' | 'kingdom' | 'industry' | 'future';
  ground: { void: string; grass: string; grassDark: string; grassLight: string; tuft: string; dirt: string; dirtDark: string };
  /** Teinte des feuillages. */
  canopy: [string, string, string][];
  roof: [string, string];
  walls: [string, string];
  stake: [string, string];
  /** Accessoire porté par les zombies de ce monde. */
  zombieGear: 'none' | 'helmet' | 'goggles' | 'visor';
}

export const WORLDS: WorldDef[] = [
  {
    id: 'farm',
    ground: { void: '#1E5B3A', grass: '#7BD35A', grassDark: '#6BC24C', grassLight: '#93E06C', tuft: '#58AE3E', dirt: '#D9B77A', dirtDark: '#C9A266' },
    canopy: [
      ['#3FA83A', '#5BC94F', '#8BE05A'],
      ['#2E9447', '#43B25A', '#74D47A'],
      ['#4FA32E', '#6CC23C', '#A6E35C'],
    ],
    roof: ['#F2C94C', '#D9A92E'],
    walls: ['#C88A4E', '#A86D38'],
    stake: ['#C88A4E', '#B87842'],
    zombieGear: 'none',
  },
  {
    id: 'kingdom',
    ground: { void: '#24432F', grass: '#5DB85A', grassDark: '#4FA34E', grassLight: '#74C96E', tuft: '#3E8E45', dirt: '#B9B2A3', dirtDark: '#A39B8B' },
    canopy: [
      ['#2E8A47', '#3FA35A', '#6CC27A'],
      ['#2A7A55', '#3C9668', '#62B88A'],
      ['#4A8A2E', '#5FA33C', '#8FC45C'],
    ],
    roof: ['#4E7BD6', '#3A5FB0'],
    walls: ['#B9C1C6', '#8E979E'],
    stake: ['#9BA5AD', '#C7D0D8'],
    zombieGear: 'helmet',
  },
  {
    id: 'industry',
    ground: { void: '#3A2E2A', grass: '#A9B65A', grassDark: '#96A24C', grassLight: '#BCC86C', tuft: '#7E8A3E', dirt: '#9C7A5E', dirtDark: '#86664C' },
    canopy: [
      ['#7A8A2E', '#93A33C', '#B4C45C'],
      ['#8A6A2E', '#A3823C', '#C4A25C'],
      ['#5E7A2E', '#76933C', '#9AB45C'],
    ],
    roof: ['#8A4A3A', '#6E3A2E'],
    walls: ['#B8573E', '#94442F'],
    stake: ['#6E7A86', '#9AA6B2'],
    zombieGear: 'goggles',
  },
  {
    id: 'future',
    ground: { void: '#141B3A', grass: '#4FB8B0', grassDark: '#3FA39C', grassLight: '#6CD4CC', tuft: '#2E8A84', dirt: '#7E8AB0', dirtDark: '#68749A' },
    canopy: [
      ['#3FA8C8', '#5BC9E0', '#9BE8F5'],
      ['#7A5BD6', '#9A7BEA', '#C2A8FF'],
      ['#2E94A8', '#43B2C2', '#74D4E0'],
    ],
    roof: ['#C2C8E0', '#9AA2C2'],
    walls: ['#E6EAF5', '#B8C0DA'],
    stake: ['#5BE0FF', '#C2F4FF'],
    zombieGear: 'visor',
  },
];

/** Le monde affiché (après le dernier, on reste dans le futur en durcissant). */
export const worldDef = (world: number) => WORLDS[Math.min(world, WORLDS.length - 1)];
