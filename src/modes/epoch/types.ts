// Mode Époques : deux camps face à face sur un même chemin. On envoie des troupes
// (fantassin, archer, troupe lourde) et on fait évoluer son camp de la préhistoire jusqu'à l'espace.

export type Side = 0 | 1; // 0 = toi (en bas, près de la caméra), 1 = l'adversaire (au loin)
export type UnitKind = 'inf' | 'archer' | 'heavy';
/** Améliorations achetées en cours de partie. */
export type UpgradeId = 'attack' | 'armor' | 'economy' | 'walls';
/** Compétences à déclencher (en plus du pouvoir de l'époque). */
export type SkillId = 'warcry' | 'heal';
/** Tourelles de base : flèches (rapide), canon (zone), givre (ralentit), foudre (en chaîne). */
export type TurretType = 'arrow' | 'cannon' | 'frost' | 'lightning';
/** Niveau de l'adversaire. Hardcore : il s'adapte à ta force pour rester très dur. */
export type Difficulty = 'easy' | 'normal' | 'hard' | 'hardcore';

export interface TurretSlot {
  type: TurretType | null;
  /** 1 à 3 */
  level: number;
  cooldown: number;
  /** Animation de tir. */
  fire: number;
}

export interface Unit {
  id: number;
  side: Side;
  kind: UnitKind;
  /** Époque de la troupe (elle garde son allure même si son camp évolue ensuite). */
  age: number;
  /** Position le long du chemin : 0 = ta base, LANE = base adverse. */
  z: number;
  /** Décalage latéral (pour que les troupes ne soient pas toutes alignées). */
  x: number;
  hp: number;
  maxHp: number;
  damage: number;
  /** Portée au-delà du contact (petite au corps à corps, grande pour les archers). */
  range: number;
  /** Taille au sol (pour le contact et pour ne pas se chevaucher). */
  radius: number;
  speed: number;
  cooldown: number;
  /** Cible actuelle (troupe ennemie), et direction du dernier coup (pour l'élan). */
  targetId: number | null;
  aimX: number;
  aimZ: number;
  /** Ralentissement (tourelle de givre), en secondes restantes. */
  slow: number;
  /** En attente au point de ralliement (temps d'attente), avant de partir en groupe. */
  rally: number | null;
  /** Animation : marche, coup porté, éclat quand on est touché. */
  walk: number;
  attack: number;
  flash: number;
}

export interface Shot {
  side: Side;
  z: number;
  x: number;
  h: number;
  targetId: number;
  damage: number;
  speed: number;
  /** Apparence : pierre, flèche, balle, obus, laser… selon l'époque. */
  age: number;
  /** Tir de tourelle (plus gros) ou de troupe. */
  big: boolean;
  /** Tourelles : dégâts de zone (canon), ralentissement (givre), et type pour le dessin. */
  splash?: number;
  slow?: number;
  kind?: TurretType;
}

/** Éclair de la tourelle de foudre, pour le dessin. */
export interface Bolt {
  z1: number;
  x1: number;
  h1: number;
  z2: number;
  x2: number;
  h2: number;
  life: number;
}

export interface Base {
  hp: number;
  maxHp: number;
  age: number;
  xp: number;
  gold: number;
  /** 4 emplacements de tourelles sur la base. */
  turrets: TurretSlot[];
  /** File de recrutement. */
  queue: UnitKind[];
  queueTimer: number;
  /** Pouvoir spécial (pluie de météores, frappe aérienne…) : temps de recharge restant. */
  special: number;
  /** Bonus de rage (troupes plus rapides et plus fortes) : temps restant. */
  rage: number;
  flash: number;
  /** Évolution en cours (animation de tourbillon du temps). */
  evolving: number;
  upgrades: Record<UpgradeId, number>;
  /** Recharge des compétences. */
  skills: Record<SkillId, number>;
  /** Soin en cours (halo vert sur les troupes). */
  healing: number;
}

/** Troupe tombée au combat (animation de chute). */
export interface Corpse {
  unit: Unit;
  t: number;
  /** Façon d'être éliminé, selon l'époque de l'arme : assommé, tranché, enfumé, soufflé, désintégré. */
  style: number;
}

/** Trace d'un coup au corps à corps. */
export interface Slash {
  z: number;
  x: number;
  life: number;
  side: Side;
}

/** Caisse de ravitaillement tombée sur le champ de bataille : à toucher pour la récupérer. */
export interface Crate {
  id: number;
  z: number;
  x: number;
  /** Hauteur (elle descend en parachute). */
  h: number;
  life: number;
  bonus: 'gold' | 'xp' | 'rage' | 'heal';
}

/** Frappe spéciale en cours (météores, flèches, obus, bombes, laser). */
export interface Strike {
  side: Side;
  age: number;
  z: number;
  time: number;
  /** Impacts prévus (position et instant), pour que le dessin tombe au bon endroit. */
  drops: { z: number; x: number; t: number; done: boolean }[];
}

export interface Spark {
  z: number;
  x: number;
  h: number;
  vz: number;
  vx: number;
  vh: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

export interface FloatText {
  z: number;
  x: number;
  h: number;
  text: string;
  color: string;
  life: number;
}

export type EpochEvent =
  | { type: 'spawn'; side: Side; kind: UnitKind }
  | { type: 'kill'; side: Side; age: number }
  | { type: 'baseHit'; side: Side }
  | { type: 'evolve'; side: Side; age: number }
  | { type: 'special'; side: Side; age: number }
  | { type: 'crate'; bonus: Crate['bonus'] }
  | { type: 'skill'; side: Side; skill: SkillId }
  | { type: 'attack'; side: Side; kind: UnitKind | 'turret'; age: number }
  | { type: 'turret'; side: Side; slot: number; level: number }
  | { type: 'impact'; age: number }
  | { type: 'upgrade'; side: Side; id: UpgradeId; level: number }
  | { type: 'over'; won: boolean };

export interface EpochState {
  time: number;
  difficulty: Difficulty;
  /** Camps joués par l'ordinateur. */
  aiSides: Side[];
  bolts: Bolt[];
  /** Hardcore : multiplicateur de l'adversaire, recalculé selon ta force. */
  aiBoost: number;
  bases: [Base, Base];
  units: Unit[];
  corpses: Corpse[];
  slashes: Slash[];
  shots: Shot[];
  strikes: Strike[];
  crates: Crate[];
  sparks: Spark[];
  texts: FloatText[];
  trauma: number;
  nextId: number;
  crateTimer: number;
  /** Temps avant la prochaine décision de l'adversaire. */
  aiTimer: number;
  kills: [number, number];
  result: { won: boolean; time: number; age: number; kills: number } | null;
  events: EpochEvent[];
}
