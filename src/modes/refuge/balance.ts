// Équilibrage du mode Refuges.

export const ARENA_W = 1700;
export const ARENA_H = 1580;
export const ROOM_W = 360;
export const ROOM_H = 300;
export const WALL = 18;
/** Grille de construction : 6 × 5 cases de 60. */
export const CELL = 60;
export const GRID_COLS = ROOM_W / CELL;
export const GRID_ROWS = ROOM_H / CELL;
/** Nombre maximum de tourelles par refuge. */
export const MAX_TURRETS = 8;
export const DOOR_GAP = 78;

/** Compte à rebours de départ, course aux refuges, puis arrivée du Démon (mini-cinématique). */
export const INTRO_TIME = 3;
export const CHOOSE_TIME = 20;
export const ARRIVAL_TIME = 4.2;
export const SIEGE_TIME = 7 * 60;
/** Le siège est découpé en manches ; à la fin de chacune, chaque survivant fait tourner la roue. */
export const ROUND_TIME = 60;
export const ROUNDS = SIEGE_TIME / ROUND_TIME;

export const SURVIVOR_SPEED = 200;
export const SURVIVOR_RADIUS = 14;
export const PAD_RADIUS = 26;
export const BUY_HOLD = 0.35;

/** Porte : vie et coût par niveau (le niveau 1 est offert). */
export const DOOR_HP = [0, 600, 1500, 3300, 6800, 13000];
export const DOOR_COST = [0, 0, 60, 180, 450, 1100];
/** Générateur : or par seconde et coût par niveau. */
export const GEN_INCOME = [0, 3, 6, 10, 15, 22, 32];
export const GEN_COST = [0, 0, 50, 140, 350, 800, 1800];
/** Hors du générateur, on ne gagne qu'une partie de l'or : il faut choisir où se tenir. */
export const OFF_GEN_RATIO = 0.4;
/** Tourelles : arbalète → double arbalète → canon → laser. */
export const TURRET_COST = [0, 40, 120, 320, 800];
export const TURRET = [
  null,
  { damage: 11, interval: 0.8, shots: 1, splash: 0, range: 290 },
  { damage: 18, interval: 0.6, shots: 2, splash: 0, range: 310 },
  { damage: 48, interval: 1.3, shots: 1, splash: 55, range: 330 },
  { damage: 10, interval: 0.1, shots: 1, splash: 0, range: 350 },
] as const;
/** Une tourelle ne défend que l'entrée de son propre refuge : aucun refuge n'est avantagé par ses voisins. */
export const TURRET_GUARD = 210;
export const REPAIR_COST = 30;
export const REPAIR_RATIO = 0.35;
export const REPAIR_COOLDOWN = 20;

/** Démon : se renforce avec le temps et à chaque survivant trouvé. */
export const demonStats = (level: number) => ({
  maxHp: Math.round(2600 * Math.pow(1.5, level - 1)),
  damage: Math.round(26 * Math.pow(1.36, level - 1)),
  speed: 120 + level * 4,
});
export const DEMON_RADIUS = 30;
export const DEMON_LEVEL_TIME = 50;
/** Répit au début du siège : le temps de poser ses premières défenses. */
export const DEMON_GRACE = 25;
export const START_GOLD = 40;
export const DEMON_HIT_INTERVAL = 0.9;
export const DEMON_RETREAT_RATIO = 0.3;
/** Le Démon encaisse mieux les tourelles qu'un zombie (dégâts subis × ce ratio). */
export const DEMON_ARMOR = 0.6;
export const DEMON_HEAL_RATE = 0.1;
export const DEMON_HEALED_RATIO = 0.85;

/** Vagues de zombies : de plus en plus nombreuses, avec des mini-boss. */
export const WAVE_INTERVAL = 35;
export const waveSize = (wave: number) => 6 + wave * 3;
export const zombieHp = (wave: number) => 30 + wave * 14;
export const zombieDamage = (wave: number) => 8 + wave * 2;
export const ZOMBIE_BOUNTY = (wave: number) => 4 + wave;

/** Âmes gagnées en mode Refuges : temps tenu, classement, zombies, victoire. */
export const refugeSouls = (r: { survivedSeconds: number; rank: number; zombiesKilled: number; won: boolean }) =>
  Math.floor(r.survivedSeconds / 6) + (7 - r.rank) * 8 + Math.floor(r.zombiesKilled / 15) + (r.won ? 30 : 0);
