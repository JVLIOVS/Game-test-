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
  /** Arbre doré (événement) : beaucoup plus de bois et des gemmes. */
  golden: boolean;
  /** Ouvrier en train de le couper (pour ne pas être deux sur le même arbre). */
  claimedBy: number | null;
}

export interface Decor {
  x: number;
  y: number;
  kind: 'tuft' | 'flower' | 'pebble' | 'patch';
  variant: number;
  size: number;
}

export type StructureKind = 'house' | 'wall' | 'tower' | 'workshop' | 'barracks' | 'lumber' | 'lodge' | 'trap' | 'catapult';

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
  | { type: 'upgradeStructure'; slot: string; level: number }
  | { type: 'upgradeWalls'; level: number }
  | { type: 'forge'; level: number };

export type AnimalKind = 'rabbit' | 'deer' | 'boar';

export type QuestKind = 'zombies' | 'trees' | 'animals' | 'build' | 'gems' | 'boss';

/** Mission en cours de partie. */
export interface Quest {
  id: number;
  kind: QuestKind;
  target: number;
  progress: number;
  rewardWood: number;
  rewardFood: number;
  rewardGems: number;
}

/** Animal de la forêt : se chasse pour la nourriture. */
export interface Animal {
  id: number;
  kind: AnimalKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  heading: number;
  timer: number;
  walkTime: number;
  dirX: 1 | -1;
  hitFlash: number;
  /** Chasseur qui le vise (pour ne pas être deux sur le même). */
  claimedBy: number | null;
}

/** Arme principale du héros : chaque type tue différemment. */
export type WeaponType = 'sword' | 'spear' | 'hammer' | 'daggers';

export interface MainWeapon {
  type: WeaponType;
  /** Niveau de forge (amélioré avec du bois à la forge, sans limite). */
  forge: number;
}

/** Ouvrier (récolte le bois) ou soldat (défend la base). */
export interface Unit {
  id: number;
  kind: 'worker' | 'soldier' | 'hunter';
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  state: 'idle' | 'toTree' | 'chop' | 'return' | 'hide' | 'fight';
  targetId: number | null;
  carry: number;
  timer: number;
  walkTime: number;
  dirX: 1 | -1;
  hitFlash: number;
  /** Poste de garde (soldats). */
  post: number;
}

/** Trace visuelle d'un coup d'arme (arc d'épée, onde de marteau...). */
export interface Slash {
  x: number;
  y: number;
  angle: number;
  kind: WeaponType;
  life: number;
  maxLife: number;
  size: number;
}

export type HappeningKind = 'crate' | 'goldenTree' | 'ambush' | 'gemRain' | 'goldenZombie';

/** Emplacement de construction : le héros s'y arrête et y dépose son bois. */
export interface Pad {
  id: string;
  x: number;
  y: number;
  cost: number;
  paid: number;
  /** Nourriture demandée en plus du bois (0 si aucune). */
  foodCost: number;
  foodPaid: number;
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
  target: { kind: 'tree' | 'zombie' | 'animal'; id: number } | null;
  hp: number;
  maxHp: number;
  hurtFlash: number;
  sinceHurt: number;
  dead: boolean;
  respawnTimer: number;
  axeLevel: number;
  level: number;
  xp: number;
  weapon: MainWeapon;
  /** Alternance gauche/droite des dagues. */
  comboSide: number;
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
  /** Boss de fin de manche : plus gros, plus lent, plus fort. */
  boss: boolean;
  /** Taille du boss : mini (manches 1 et 2) ou gros (manche 3). */
  bossSize: 'none' | 'mini' | 'big';
  /** Temps avant que les haches tournoyantes puissent le refrapper. */
  orbitCooldown: number;
  /** Zombie doré (événement) : rapide, fuit, porte une arme. */
  golden: boolean;
  /** Cible du zombie quand il s'en prend à un soldat. */
  unitTargetId: number | null;
  /** Zombie d'embuscade : il chasse le héros au lieu d'attaquer la base. */
  hunter: boolean;
  /** Marcheur, coureur (rapide et fragile) ou brute (lente et costaude). */
  kind: ZombieKind;
  /** Ralentissement (aura de givre), 0..1. */
  slow: number;
  /** Dégâts de poison restants par seconde, et durée. */
  poison: number;
  poisonTime: number;
}

export interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  damage: number;
  targetId: number;
  /** Apparence : flèche de tour, ou phase de l'arc (1 bois, 2 feu, 3 glace). */
  style: 'tower' | 'bolt' | 'magic' | 'bow1' | 'bow2' | 'bow3' | 'cannon';
  /** Rayon d'explosion à l'impact (0 = aucune). */
  splash: number;
}

/** Bombe lancée en cloche, qui explose à l'arrivée. */
export interface Bomb {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  t: number;
  duration: number;
  radius: number;
  damage: number;
  /** Phase de l'atout (change l'apparence). */
  phase: number;
  /** Petites bombes secondaires à l'explosion (phase 3). */
  cluster: number;
  /** Rocher de catapulte (dessin différent). */
  boulder?: boolean;
}

/** Éclair (effet visuel ; les dégâts sont appliqués tout de suite). */
export interface Bolt {
  x: number;
  y: number;
  life: number;
  seed: number;
  phase: number;
  /** Éclair en chaîne : les points touchés après le premier. */
  chain: { x: number; y: number }[];
}

/** Zone au sol qui blesse les zombies : flammes ou nuage toxique. */
export interface Hazard {
  x: number;
  y: number;
  radius: number;
  life: number;
  maxLife: number;
  kind: 'fire' | 'toxic';
  dps: number;
}

/** Projectile qui tombe du ciel : flèche de la pluie de flèches ou météore. */
export interface SkyDrop {
  x: number;
  y: number;
  t: number;
  duration: number;
  radius: number;
  damage: number;
  kind: 'arrow' | 'meteor';
}

/** Loup compagnon (atout). */
export interface Pet {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  targetId: number | null;
  cooldown: number;
  alpha: boolean;
  walkTime: number;
  dirX: 1 | -1;
  bite: number;
}

/** Tourelle portable posée par l'atout Ingénieur. */
export interface Turret {
  x: number;
  y: number;
  life: number;
  cooldown: number;
  pop: number;
}

/** Effet visuel circulaire (onde de gel, hurlement...). */
export interface Nova {
  x: number;
  y: number;
  radius: number;
  life: number;
  maxLife: number;
  kind: 'frost' | 'howl' | 'meteor';
}

/** Gemme d'expérience laissée par un zombie. */
export interface Gem {
  id: number;
  x: number;
  y: number;
  value: number;
  /** Attirée par le héros. */
  pulled: boolean;
  age: number;
}

export type PerkId = 'bow' | 'orbit' | 'bomb' | 'lightning' | 'engineer' | 'frost' | 'poison' | 'wolf';

export type ZombieKind = 'walker' | 'runner' | 'brute';

export type EquipSlot = 'sword' | 'shield' | 'armor';

/** Carte proposée au passage de niveau. */
export type CardId = PerkId | 'heal' | 'woodBag';

/** Coffre laissé à la mort du héros, avec tout ce qu'il portait. */
/** Coffre au sol : bois perdu à la mort, caisse larguée, ou coffre d'arme. */
export interface Chest {
  id: number;
  x: number;
  y: number;
  wood: number;
  age: number;
  kind: 'death' | 'crate' | 'weapon';
  /** Caisse larguée : hauteur restante pendant la chute. */
  fall: number;
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
  /** Morceau de viande au lieu d'une bûche. */
  food?: boolean;
}

export interface Cycle {
  phase: 'day' | 'night';
  /** Jour : secondes restantes. Nuit : secondes écoulées. */
  timer: number;
  /** Numéro de la dernière nuit commencée (0 avant la première). */
  night: number;
  toSpawn: number;
  spawnTimer: number;
  bossSpawned: boolean;
  /** Directions d'où arrivent les hordes cette nuit. */
  hordeAngles: number[];
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
  | { type: 'gameOver' }
  | { type: 'levelUp'; level: number }
  | { type: 'gemPicked' }
  | { type: 'bossSpawn'; round: number }
  | { type: 'bossKilled'; round: number }
  | { type: 'roundCleared'; round: number }
  | { type: 'bombExploded' }
  | { type: 'lightning' }
  | { type: 'equipGained'; slot: EquipSlot; tier: number }
  | { type: 'happening'; kind: HappeningKind }
  | { type: 'weaponFound' }
  | { type: 'unitSpawned'; kind: Unit['kind'] }
  | { type: 'crit' }
  | { type: 'animalKilled' }
  | { type: 'questDone'; kind: QuestKind }
  | { type: 'worldAdvance'; world: number };

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
  bombs: Bomb[];
  bolts: Bolt[];
  gems: Gem[];
  chests: Chest[];
  /** Niveau de chaque atout (0 = pas pris). */
  perks: Record<PerkId, number>;
  /** Chronomètres des armes automatiques. */
  weaponTimers: {
    bow: number;
    volley: number;
    bomb: number;
    meteor: number;
    lightning: number;
    orbitAngle: number;
    deploy: number;
    nova: number;
    poison: number;
    tick: number;
  };
  hazards: Hazard[];
  skyDrops: SkyDrop[];
  pets: Pet[];
  turrets: Turret[];
  novas: Nova[];
  /** Cartes proposées en ce moment (le jeu est en pause tant qu'on n'a pas choisi). */
  choice: CardId[] | null;
  /** Passages de niveau en attente de choix. */
  pendingLevelUps: number;
  bossesKilled: number;
  bossAlive: boolean;
  /** Monde actuel (0 = ferme). */
  world: number;
  /** Manche dans le monde (1..3), 0 avant la première nuit du monde. */
  roundInWorld: number;
  /** Palier de chaque équipement (0 = pas encore gagné). */
  equipment: Record<EquipSlot, number>;
  units: Unit[];
  quests: Quest[];
  questsDone: number;
  animals: Animal[];
  animalTimer: number;
  /** Niveau de la palissade (1 pieux, 2 pierre, 3 rempart). */
  wallLevel: number;
  slashes: Slash[];
  /** Temps avant le prochain micro-événement. */
  happeningTimer: number;
  /** Arme trouvée dans un coffre : le jeu attend qu'on choisisse de la prendre ou non. */
  weaponOffer: WeaponType | null;
  /** Production de la caserne (temps avant le prochain soldat). */
  barracksTimer: number;
  hero: Hero;
  inventory: Inventory;
  cycle: Cycle;
  particles: Particle[];
  texts: FloatingText[];
  flyingLogs: FlyingLog[];
  /** "Trauma" de secousse d'écran, 0..1. */
  trauma: number;
  nextId: number;
  stats: { zombiesKilled: number; built: number; bossesKilled: number; woodGathered: number };
  /** Événements produits pendant le dernier pas, consommés par l'interface. */
  events: GameEvent[];
}

export interface PlayerInput {
  /** Direction voulue, longueur 0..1. */
  moveX: number;
  moveY: number;
}
