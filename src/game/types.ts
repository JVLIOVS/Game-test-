// Types partagés de la simulation. Aucune dépendance au rendu ni à React :
// la simulation doit pouvoir tourner ailleurs (serveur, tests, raids V2).

export interface Vec2 {
  x: number;
  y: number;
}

export type ResourceId = 'wood' | 'stone' | 'food';
export type Inventory = Record<ResourceId, number>;

export type ZoneKind = 'wild' | 'home';

/** Définition statique d'un micro-monde (une "map" avec des bords). */
export interface ZoneDef {
  id: string;
  kind: ZoneKind;
  nameKey: string;
  width: number;
  height: number;
  seed: number;
  treeCount: number;
  spawn: Vec2;
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

export interface ZoneState {
  def: ZoneDef;
  trees: Tree[];
  decor: Decor[];
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
  targetTreeId: number | null;
}

export type ParticleKind = 'chip' | 'leaf' | 'dust' | 'spark';

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
}

export type GameEvent =
  | { type: 'treeHit'; treeId: number }
  | { type: 'treeFelled'; treeId: number }
  | { type: 'resourceGained'; resource: ResourceId; amount: number };

export interface GameState {
  time: number;
  zone: ZoneState;
  hero: Hero;
  inventory: Inventory;
  particles: Particle[];
  texts: FloatingText[];
  /** "Trauma" de secousse d'écran, 0..1. */
  trauma: number;
  /** Événements produits pendant le dernier pas, consommés par l'interface. */
  events: GameEvent[];
}

export interface PlayerInput {
  /** Direction voulue, longueur 0..1. */
  moveX: number;
  moveY: number;
}
