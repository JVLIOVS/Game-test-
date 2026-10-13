import type { FlyingLog, FloatingText, Particle, Projectile, Zombie } from '../../game/types';

// Mode Refuges : chacun s'enferme dans un refuge, le renforce avec l'or de son générateur,
// et tient face au Démon et aux vagues de zombies. Le dernier trouvé gagne.

export type PadKind = 'door' | 'gen' | 'repair';

/** Personnages jouables : chacun a un talent. */
export type CharacterId = 'mecano' | 'gardien' | 'veinard';

/** Artefacts gagnés à la roue, posés dans les 3 emplacements du refuge. */
export type ArtifactKind = 'mega' | 'tesla' | 'frost' | 'heal';

/** Cases de la roue de fin de manche. */
export type WheelPrize = 'gold' | 'repair' | 'turbo' | 'storm' | 'power' | 'shield' | 'artifact' | 'mega';

/** Pouvoirs du Démon : passifs, ou actifs (bouton). */
export type DemonPower = 'toxic' | 'regen' | 'brute' | 'hide' | 'clone' | 'roar' | 'dash';

export type RefugeRole = 'survivor' | 'demon';

/** Éclair à dessiner (orage, bobine Tesla). */
export interface Zap {
  points: { x: number; y: number }[];
  life: number;
}

export interface RefugePad {
  kind: PadKind;
  /** Position dans le monde. */
  x: number;
  y: number;
  /** Temps passé dessus (achat après un court instant). */
  hold: number;
}

/** Case de construction libre dans un refuge. */
export interface Cell {
  x: number;
  y: number;
  col: number;
  /** Rangée comptée depuis le fond du refuge (0) vers la porte (4). */
  row: number;
}

/** Artefact posé sur une case. */
export interface PlacedArtifact {
  kind: ArtifactKind;
  cell: number;
  cooldown: number;
}

export interface RefugeTurret {
  /** Case occupée. */
  cell: number;
  x: number;
  y: number;
  /** Temps passé dessus (amélioration après un court instant). */
  hold: number;
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
  /** Cases libres où l'on construit ce qu'on veut (tourelles, artefacts). */
  cells: Cell[];
  artifacts: PlacedArtifact[];
  /** Bonus temporaires (secondes restantes) et bouclier magique (points). */
  boosts: { power: number; turbo: number; storm: number; stormCooldown: number };
  shield: number;
  shieldMax: number;
  /** Défenses assourdies par le rugissement du Démon (secondes restantes). */
  stun: number;
  /** Poison des griffes toxiques : dégâts par seconde et durée restante. */
  poison: { dps: number; time: number };
  /** Performance pendant la manche (donne de la chance à la roue). */
  roundScore: number;
  /** Modificateurs du personnage qui occupe le refuge. */
  turretCostMult: number;
  turretRateMult: number;
  doorHpMult: number;
  repairFree: boolean;
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
  character: CharacterId;
  /** Artefacts gagnés à la roue, en attente d'être posés. */
  inventory: ArtifactKind[];
  /** Case vide sous les pieds (le joueur peut y construire). */
  buildCell: number | null;
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
  /** -1 pour le Démon, un autre nombre négatif pour chaque double. */
  id: number;
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
  /** Double temporaire (pouvoir Dédoublement) : temps restant, sinon 0. */
  cloneTime: number;
  /** Ruée en cours (secondes restantes) et direction. */
  dashTime: number;
  dashX: number;
  dashY: number;
  /** Ralentissement subi cette image (totem de givre). */
  slow: number;
}

/** Résultat d'un tour de roue, pour l'affichage. */
export interface WheelSpin {
  /** Identifiant unique de ce tour de roue. */
  id: number;
  prize: WheelPrize;
  /** Artefact obtenu (case artefact). */
  artifact: ArtifactKind | null;
  /** Chance de la manche (0 à 1). */
  luck: number;
  round: number;
}

export type RefugePhase = 'intro' | 'choose' | 'arrival' | 'siege' | 'over';

export type RefugeEvent =
  | { type: 'phase'; phase: 'choose' | 'arrival' | 'siege' }
  | { type: 'bought'; survivorId: number; kind: PadKind | 'turret'; level: number }
  | { type: 'placed'; survivorId: number; kind: ArtifactKind }
  | { type: 'doorHit'; roomId: number }
  | { type: 'doorBroken'; roomId: number }
  | { type: 'eliminated'; survivorId: number; name: string; isPlayer: boolean }
  | { type: 'wave'; wave: number; boss: boolean }
  | { type: 'demonLevel'; level: number }
  | { type: 'demonRetreat' }
  | { type: 'demonKilled' }
  | { type: 'roundEnd'; round: number }
  | { type: 'demonPower'; power: DemonPower; level: number }
  | { type: 'demonActive'; power: DemonPower }
  | { type: 'zombieKilled' }
  | { type: 'over'; won: boolean };

export interface RefugeState {
  time: number;
  /** Le joueur est un survivant (survivors[0]) ou le Démon. */
  role: RefugeRole;
  /** Démon piloté par l'ordinateur (toujours en rôle survivant ; tests en rôle Démon). */
  demonAI: boolean;
  /** Manche en cours (1 à ROUNDS) et temps restant avant la roue. */
  round: number;
  roundTimer: number;
  /** Durée d'une manche (raccourcie pour les tests). */
  roundLength: number;
  /** Roue du joueur en attente d'affichage : la partie est en pause tant qu'elle est là. */
  wheel: WheelSpin | null;
  /** Choix de pouvoir du Démon en attente (rôle Démon) : la partie est en pause. */
  powerChoice: DemonPower[] | null;
  /** Pouvoirs du Démon (niveau de chacun) et recharge des pouvoirs actifs. */
  powers: Partial<Record<DemonPower, number>>;
  powerCooldowns: Partial<Record<DemonPower, number>>;
  /** Tourelles assourdies par le rugissement (secondes restantes). */
  roarTime: number;
  /** Doubles du Démon. */
  clones: Demon[];
  zaps: Zap[];
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
  /** Rôle survivant : rang du joueur. Rôle Démon : nombre de survivants trouvés. */
  result: { won: boolean; rank: number; survivedSeconds: number; found: number } | null;
  // Effets partagés avec le mode Vagues
  particles: Particle[];
  texts: FloatingText[];
  flyingLogs: FlyingLog[];
  trauma: number;
  nextId: number;
  events: RefugeEvent[];
}
