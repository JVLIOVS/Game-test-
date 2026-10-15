import { LANE, UNIT_KINDS, turretCost, unitCost } from './data';
import { buyTurret, canEvolve, evolve, specialReady, trainUnit, useSpecial } from './sim';
import type { EpochState, Side, UnitKind } from './types';

// L'adversaire : il évolue dès qu'il peut, recrute un mélange de troupes adapté à ce qu'il voit,
// achète une tourelle quand il a de l'avance, et lance son pouvoir sur les groupes ennemis.

const THINK = 0.7;
/** Taille de la prochaine vague de chaque camp. */
const waves = new Map<Side, number>();

export function aiThink(state: EpochState, side: Side, dt: number) {
  state.aiTimer -= dt;
  if (state.aiTimer > 0 && side === 1) return;
  if (side === 1) state.aiTimer = THINK * (0.7 + Math.random() * 0.6);
  else if (Math.random() > dt / THINK) return;

  const me = state.bases[side];
  const foe: Side = side === 0 ? 1 : 0;
  if (canEvolve(state, side)) evolve(state, side);

  const enemies = state.units.filter((u) => u.side === foe);
  // Menace : des ennemis approchent de sa base.
  const threat = enemies.filter((u) => Math.abs(u.z - (side === 1 ? LANE : 0)) < LANE * 0.4).length;
  // Plus l'ennemi aligne de troupes lourdes, plus il en faut aussi.
  const heavyFoes = enemies.filter((u) => u.kind === 'heavy').length;
  const weights: Record<UnitKind, number> = { inf: 0.5, archer: 0.32, heavy: 0.18 + heavyFoes * 0.08 };
  const pick = (): UnitKind => {
    let r = Math.random() * (weights.inf + weights.archer + weights.heavy);
    for (const k of UNIT_KINDS) {
      r -= weights[k];
      if (r <= 0) return k;
    }
    return 'inf';
  };
  // Il attaque par vagues : il économise, puis envoie un groupe d'un coup. Il se défend tout de suite si on l'attaque.
  const plan = waves.get(side) ?? 2 + Math.floor(Math.random() * 3);
  waves.set(side, plan);
  const waveCost = plan * unitCost('inf', me.age) * 1.4;
  if (threat > 0 && me.queue.length < 2) {
    if (!trainUnit(state, side, pick())) trainUnit(state, side, 'inf');
  } else if (me.gold >= waveCost && me.queue.length === 0) {
    for (let i = 0; i < plan; i++) if (!trainUnit(state, side, pick())) trainUnit(state, side, 'inf');
    waves.delete(side);
  }
  if (me.turret < me.age && me.gold > turretCost(me.age) * 1.4) buyTurret(state, side);

  // Pouvoir : sur le plus gros groupe ennemi.
  if (specialReady(state, side) && enemies.length >= 4) {
    let bestZ = 0;
    let bestCount = 0;
    for (const e of enemies) {
      const n = enemies.filter((o) => Math.abs(o.z - e.z) < 160).length;
      if (n > bestCount) {
        bestCount = n;
        bestZ = e.z;
      }
    }
    const nearMe = side === 1 ? bestZ > LANE * 0.35 : bestZ < LANE * 0.65;
    if (bestCount >= 4 && nearMe) useSpecial(state, side, bestZ);
  }
}
