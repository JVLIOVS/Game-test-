// Réglages d'équilibrage. Tout ce qui se règle "au feeling" est ici.

// Héros
export const HERO_SPEED = 190; // unités / seconde
export const HERO_ACCEL = 14; // réactivité du joystick
export const HERO_RADIUS = 14;
export const HERO_MAX_HP = 100;
export const HERO_REGEN = 6; // PV / s après quelques secondes sans coup
export const HERO_REGEN_DELAY = 3;
export const HERO_RESPAWN_TIME = 3;

// Coups de hache (arbres et zombies)
export const SWING_DURATION = 0.32;
export const SWING_HIT_AT = 0.16;
export const SWING_COOLDOWN = 0.12;
export const HARVEST_REACH = 26; // distance bord à bord pour frapper un arbre
/** Par niveau de hache (index 1..3). */
export const AXE_SPEED = [0, 1, 1.2, 1.45];

// Arbres
export const TREE_HP = 4;
export const WOOD_PER_HIT = 1;
export const WOOD_FELL_BONUS = 2;
export const TREE_FALL_TIME = 0.55;
export const TREE_REGROW_TIME = 25;
export const TREE_GROW_TIME = 0.6;

// Base
export const BASE_CLEARING = 440; // pas d'arbre autour de la base
export const WALL_RING_RADIUS = 240;
export const WALL_SEGMENTS_PER_SIDE = 5;
export const WALL_SEGMENT_RADIUS = 34;
export const WALL_HP = 70;
export const HOUSE_RADIUS = 44;
export const HOUSE_MAX_LEVEL = 4;
export const HOUSE_HP = [0, 250, 400, 600, 850];
export const TOWER_RADIUS = 22;
export const TOWER_HP = 150;
export const TOWER_RANGE = 250;
export const TOWER_FIRE_INTERVAL = 0.85;
export const TOWER_DAMAGE = 14;
export const ARROW_SPEED = 650;
export const WORKSHOP_RADIUS = 30;
export const WORKSHOP_HP = 160;

// Coûts en bois
export const COST = {
  house: [0, 0, 25, 60, 120],
  wallSide: 12,
  tower: 30,
  workshop: 15,
  barracks: [0, 30, 60, 110],
  lumber: [0, 20, 45, 90],
};
export const BARRACKS_RADIUS = 30;
export const BARRACKS_HP = 200;
export const LUMBER_RADIUS = 30;
export const LUMBER_HP = 160;
export const STRUCTURE_MAX_LEVEL = 3;

export const PAD_RADIUS = 32;
export const PAD_FEED_INTERVAL = 0.06; // une bûche toutes les 60 ms

// Cycle jour / nuit
export const FIRST_DAY_LENGTH = 55;
export const DAY_LENGTH = 40;
export const NIGHT_SPAWN_SPREAD = 12; // les zombies arrivent sur 12 s

// Zombies (la nuit n renforce chaque valeur)
/** Vague de la nuit n (comptée depuis le début) dans le monde w (0 = ferme) : chaque monde est une invasion plus massive. */
export const zombieWave = (night: number, world: number) => ({
  count: 4 + night * 3 + world * 5,
  hp: Math.round((26 + night * 9) * (1 + world * 0.3)),
  speed: Math.min(95, 52 + night * 3),
  damage: 7 + night + world * 2,
});
export const ZOMBIE_RADIUS = 13;
export const ZOMBIE_AGGRO_RANGE = 150;
export const ZOMBIE_ATTACK_INTERVAL = 1;
export const ZOMBIE_WOOD_DROP = 2;

export const GRAVITY = 900;
export const MAX_PARTICLES = 260;

// Progression pendant la partie (XP → niveaux → cartes)
export const xpToNext = (level: number) => 4 + level * 3;
export const GEM_PICKUP_RADIUS = 18;
export const GEM_PULL_SPEED = 520;

// Boss de fin de manche
export const bossStats = (round: number, size: 'mini' | 'big') => {
  const k = size === 'big' ? 2.2 : 1;
  return {
    hp: Math.round((140 + (round - 1) * 170) * k),
    speed: (size === 'big' ? 38 : 44) + Math.min(20, round * 2),
    damage: Math.round((12 + round * 4) * (size === 'big' ? 1.4 : 1)),
    radius: size === 'big' ? 30 : 22,
    scale: size === 'big' ? 2.3 : 1.6,
  };
};
export const BOSS_GEMS = 12;
export const BOSS_GEM_VALUE = 3;
export const BOSS_WOOD = (round: number) => 10 + round * 5;
