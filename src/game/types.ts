// Types partagés de la simulation. Aucune dépendance au rendu ni à React :
// la simulation doit pouvoir tourner ailleurs (serveur, tests, raids V2).

export interface Vec2 {
  x: number;
  y: number;
}

export type ResourceId = 'wood' | 'stone' | 'food';
export type Inventory = Record<ResourceId, number>;

export interface MapDef {
  width: number;
  height: number;
  seed: number;
  treeCount: number;
}

export type TreeState = 'standing' | 'falling' | 'stump' | 'growing';

export interface Tree {
  id: number;
  x: number;
  y: number;
  /** Rayon de collision du tronc. */
  radius: number;
  hp: number;
  maxHp: number;
  state: TreeState;
  /** Chronomètre de l'état courant (chute, repousse...). */
  timer: number;
  /** 0..1, secousse quand on le frappe. */
  shake: number;
  fallDir: 1 | -1;
  variant: number;
  size: number;
}

export interface Decor {
  x: number;
  y: number;
  kind: 'tuft' | 'flower' | 'pebble' | 'patch';
  variant: number;
  size: number;
}

export type StructureKind = 'house' | 'wall' | 'tower' | 'workshop';

export interface Structure {
  id: number;
  kind: StructureKind;
  /** Emplacement d'origine (ex. "wall-N", "tower-1") : sert à savoir quoi reconstruire. */
  slot: string;
  x: number;
  y: number;
  radius: number;
  hp: number;
  maxHp: number;
  level: number;
  /** 0..1, flash blanc quand il est frappé. */
  hitFlash: number;
  /** 0..1, animation d'apparition. */
  pop: number;
  /** Tours : temps avant le prochain tir. */
  cooldown: number;
}

export type PadAction =
  | { type: 'build'; kind: Exclude<StructureKind, 'house'>; slot: string }
  | { type: 'upgradeHouse'; level: number }
  | { type: 'upgradeAxe'; level: number };

/** Emplacement de construction : le héros s'y arrête et y dépose son bois. */
export interface Pad {
  id: string;
  x: number;
  y: number;
  cost: number;
  paid: number;
  action: PadAction;
  feedTimer: number;
  /** 0..1, pulsation à chaque dépôt. */
  pulse: number;
}

export interface Hero {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  /** 1 = regarde à droite, -1 = à gauche. */
  dirX: 1 | -1;
  walkTime: number;
  /** > 0 pendant un coup de hache. */
  swingTime: number;
  swingCooldown: number;
  swingHitDone: boolean;
  target: { kind: 'tree' | 'zombie'; id: number } | null;
  hp: number;
  maxHp: number;
  hurtFlash: number;
  sinceHurt: number;
  dead: boolean;
  respawnTimer: number;
  axeLevel: number;
}

export interface Zombie {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  attackCooldown: number;
  /** 0..1, élan de l'attaque (animation). */
  lunge: number;
  hitFlash: number;
  walkTime: number;
  variant: number;
}

export interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  damage: number;
  targetId: number;
}

/** Coffre laissé à la mort du héros, avec tout ce qu'il portait. */
export interface Chest {
  id: number;
  x: number;
  y: number;
  wood: number;
  age: number;
}

export type ParticleKind = 'chip' | 'leaf' | 'dust' | 'goo' | 'confetti';

/** Particule "2.5D" : x/y au sol, z en hauteur pour les rebonds. */
export interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rot: number;
  vrot: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  kind: ParticleKind;
}

export interface FloatingText {
  x: number;
  y: number;
  z: number;
  vz: number;
  life: number;
  maxLife: number;
  text: string;
  color: string;
  /** Affiche une petite bûche à côté (gain de bois). */
  log: boolean;
  size: number;
}

/** Bûche qui vole du héros vers un emplacement (purement visuel). */
export interface FlyingLog {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  t: number;
}

export interface Cycle {
  phase: 'day' | 'night';
  /** Jour : secondes restantes. Nuit : secondes écoulées. */
  timer: number;
  /** Numéro de la dernière nuit commencée (0 avant la première). */
  night: number;
  toSpawn: number;
  spawnTimer: number;
  /** 0 = plein jour, 1 = nuit noire. */
  darkness: number;
}

export type GameEvent =
  | { type: 'treeHit' }
  | { type: 'treeFelled' }
  | { type: 'resourceGained'; resource: ResourceId; amount: number }
  | { type: 'padFed' }
  | { type: 'built'; action: PadAction }
  | { type: 'zombieHit' }
  | { type: 'zombieKilled' }
  | { type: 'heroHurt' }
  | { type: 'heroDied' }
  | { type: 'structureHit' }
  | { type: 'structureDestroyed'; kind: StructureKind }
  | { type: 'nightStart'; night: number }
  | { type: 'dayStart'; day: number }
  | { type: 'gameOver' };

export interface GameState {
  time: number;
  status: 'playing' | 'gameover';
  map: MapDef;
  /** Centre de la base (position de la baraque). */
  base: Vec2;
  trees: Tree[];
  decor: Decor[];
  structures: Structure[];
  pads: Pad[];
  padsDirty: boolean;
  zombies: Zombie[];
  projectiles: Projectile[];
  chests: Chest[];
  hero: Hero;
  inventory: Inventory;
  cycle: Cycle;
  particles: Particle[];
  texts: FloatingText[];
  flyingLogs: FlyingLog[];
  /** "Trauma" de secousse d'écran, 0..1. */
  trauma: number;
  nextId: number;
  stats: { zombiesKilled: number; built: number };
  /** Événements produits pendant le dernier pas, consommés par l'interface. */
  events: GameEvent[];
}

export interface PlayerInput {
  /** Direction voulue, longueur 0..1. */
  moveX: number;
  moveY: number;
}
