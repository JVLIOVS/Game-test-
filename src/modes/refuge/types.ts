import type { FlyingLog, FloatingText, Particle, Projectile, Zombie } from '../../game/types';

// Mode Refuges : chacun s'enferme dans un refuge, le renforce avec l'or de son générateur,
// et tient face au Démon et aux vagues de zombies. Le dernier trouvé gagne.

export type PadKind = 'door' | 'gen' | 'turret' | 'repair';

export interface RefugePad {
  kind: PadKind;
  /** Position dans le monde. */
  x: number;
  y: number;
  /** Tourelle concernée (pour kind = 'turret'). */
  slot: number;
  /** Temps passé dessus (achat après un court instant). */
  hold: number;
}

export interface RefugeTurret {
  x: number;
  y: number;
  /** 0 = emplacement vide. */
  level: number;
  cooldown: number;
  angle: number;
  /** Rayon laser : cible actuelle, pour le dessin. */
  beamTo: { x: number; y: number } | null;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Room {
  id: number;
  /** Intérieur du refuge. */
  inner: Rect;
  /** La porte donne vers le haut ou vers le bas de l'arène. */
  doorSide: 'top' | 'bottom';
  door: { x: number; y: number; level: number; hp: number; maxHp: number; hitFlash: number; broken: boolean };
  gen: { x: number; y: number; level: number; spin: number };
  turrets: RefugeTurret[];
  pads: RefugePad[];
  repairCooldown: number;
  owner: number | null;
  /** Murs (rectangles pleins) ; la porte est gérée à part. */
  walls: Rect[];
}

export interface Survivor {
  id: number;
  name: string;
  isPlayer: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  dirX: 1 | -1;
  walkTime: number;
  roomId: number | null;
  alive: boolean;
  gold: number;
  shirt: string;
  /** Robots : emplacement visé, chemin (entrée puis intérieur du refuge) et prochaine réflexion. */
  goal: { x: number; y: number } | null;
  path: { x: number; y: number }[];
  thinkTimer: number;
  hurtFlash: number;
  /** Ordre d'élimination (1 = premier trouvé). */
  eliminatedAt: number;
}

export type DemonState = 'hunt' | 'attack' | 'devour' | 'feast' | 'retreat' | 'heal';

export interface Demon {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  level: number;
  damage: number;
  speed: number;
  state: DemonState;
  targetRoom: number | null;
  attackCooldown: number;
  levelTimer: number;
  hitFlash: number;
  lunge: number;
  walkTime: number;
  dirX: 1 | -1;
  /** Apparition : 0 = encore sous l'autel, 1 = présent. */
  rise: number;
}

export type RefugePhase = 'intro' | 'choose' | 'arrival' | 'siege' | 'over';

export type RefugeEvent =
  | { type: 'phase'; phase: 'choose' | 'arrival' | 'siege' }
  | { type: 'bought'; survivorId: number; kind: PadKind; level: number }
  | { type: 'doorHit'; roomId: number }
  | { type: 'doorBroken'; roomId: number }
  | { type: 'eliminated'; survivorId: number; name: string; isPlayer: boolean }
  | { type: 'wave'; wave: number; boss: boolean }
  | { type: 'demonLevel'; level: number }
  | { type: 'demonRetreat' }
  | { type: 'demonKilled' }
  | { type: 'zombieKilled' }
  | { type: 'over'; won: boolean };

export interface RefugeState {
  time: number;
  /** Compte à rebours, course aux refuges, arrivée du Démon, siège. */
  phase: RefugePhase;
  /** Temps restant de la phase en cours. */
  phaseTimer: number;
  width: number;
  height: number;
  rooms: Room[];
  survivors: Survivor[];
  demon: Demon;
  zombies: Zombie[];
  projectiles: Projectile[];
  wave: number;
  waveTimer: number;
  zombiesKilled: number;
  /** Refuge assigné à chaque zombie (répartition équitable entre les joueurs). */
  zombieRoom: Record<number, number>;
  /** Instant où le siège a commencé. */
  siegeStart: number;
  /** Nombre d'éliminations (pour le classement). */
  eliminations: number;
  result: { won: boolean; rank: number; survivedSeconds: number } | null;
  // Effets partagés avec le mode Vagues
  particles: Particle[];
  texts: FloatingText[];
  flyingLogs: FlyingLog[];
  trauma: number;
  nextId: number;
  events: RefugeEvent[];
}
