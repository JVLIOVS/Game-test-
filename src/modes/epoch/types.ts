// Mode Époques : deux camps face à face sur un même chemin. On envoie des troupes
// (fantassin, archer, troupe lourde) et on fait évoluer son camp de la préhistoire jusqu'à l'espace.

export type Side = 0 | 1; // 0 = toi (en bas, près de la caméra), 1 = l'adversaire (au loin)
export type UnitKind = 'inf' | 'archer' | 'heavy';

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
  range: number;
  speed: number;
  cooldown: number;
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
}

export interface Base {
  hp: number;
  maxHp: number;
  age: number;
  xp: number;
  gold: number;
  /** Tourelle de la base : époque à laquelle elle a été achetée (-1 = aucune). */
  turret: number;
  turretCooldown: number;
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
  | { type: 'over'; won: boolean };

export interface EpochState {
  time: number;
  bases: [Base, Base];
  units: Unit[];
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
