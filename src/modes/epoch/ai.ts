import { DIFFICULTIES, LANE, TURRET_IDS, TURRET_SLOTS, UNIT_KINDS, unitCost, upgradeCost } from './data';
import { buildTurret, buyUpgrade, canEvolve, evolve, skillReady, specialReady, trainUnit, turretOffer, useSkill, useSpecial } from './sim';
import type { EpochState, Side, TurretType, UnitKind, UpgradeId } from './types';

// L'adversaire. Selon la difficulté, il gagne plus ou moins d'or, réfléchit plus ou moins vite,
// tarde plus ou moins à évoluer, et choisit (ou non) les troupes qui contrent les tiennes.
// En Hardcore, la simulation ajuste en plus son or à ta force (voir adapt dans sim.ts).

/** Taille de la prochaine vague de chaque camp. */
const waves = new Map<Side, number>();
/** Instant où l'évolution est devenue possible (pour le retard en facile). */
const evolveSince = new Map<Side, number>();
const timers = new Map<Side, number>();

/** Chaque type de troupe contre un autre : le lourd écrase les fantassins, les fantassins chargent les archers, les archers usent les lourds. */
const COUNTER: Record<UnitKind, UnitKind> = { heavy: 'inf', inf: 'archer', archer: 'heavy' };

export function aiThink(state: EpochState, side: Side, dt: number) {
  const diff = DIFFICULTIES[state.difficulty];
  const timer = (timers.get(side) ?? 0) - dt;
  if (timer > 0) {
    timers.set(side, timer);
    return;
  }
  timers.set(side, diff.think * (0.7 + Math.random() * 0.6));
  if (state.time < 0.05) {
    waves.delete(side);
    evolveSince.delete(side);
  }

  const me = state.bases[side];
  const foe: Side = side === 0 ? 1 : 0;
  if (canEvolve(state, side)) {
    const since = evolveSince.get(side) ?? state.time;
    evolveSince.set(side, since);
    if (state.time - since >= diff.evolveDelay) {
      evolve(state, side);
      evolveSince.delete(side);
    }
  }
  const warmedUp = state.time > diff.warmup;

  const enemies = state.units.filter((u) => u.side === foe);
  const threat = enemies.filter((u) => Math.abs(u.z - (side === 1 ? LANE : 0)) < LANE * 0.4).length;
  const weights: Record<UnitKind, number> = { inf: 0.5, archer: 0.32, heavy: 0.18 };
  if (diff.counters) {
    // Il regarde ton armée et envoie ce qui la contre.
    for (const k of UNIT_KINDS) {
      const victims = enemies.filter((u) => u.kind === COUNTER[k]).length;
      weights[k] += victims * 0.12;
    }
  } else {
    weights.heavy += enemies.filter((u) => u.kind === 'heavy').length * 0.08;
  }
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
  // Tourelles : une place de plus toutes les 90 s environ (il économise pour ça), puis il les améliore dès le niveau Difficile.
  const allowed = Math.min(TURRET_SLOTS, Math.floor((state.time - diff.warmup * 0.5) / 90) + 1);
  const built = me.turrets.filter((t) => t.type !== null).length;
  let saving = false;
  if (built < allowed && state.time > 30) {
    const slot = me.turrets.findIndex((t) => t.type === null);
    // Il varie : un canon contre les groupes, du givre contre les lourds, sinon flèches ou foudre.
    const heavies = enemies.filter((u) => u.kind === 'heavy').length;
    const type: TurretType = enemies.length > 8 ? 'cannon' : heavies > 2 ? 'frost' : TURRET_IDS[(slot * 3) % TURRET_IDS.length];
    const offer = turretOffer(state, side, slot, type);
    if (offer) {
      if (me.gold >= offer.cost) buildTurret(state, side, slot, type);
      else saving = true;
    }
  } else if (diff.counters && warmedUp && built > 0 && me.gold > waveCost * 1.5) {
    const slot = me.turrets.reduce((best, t, i) => (t.type && t.level < me.turrets[best].level ? i : best), 0);
    const offer = turretOffer(state, side, slot);
    if (offer && me.gold - offer.cost > waveCost) buildTurret(state, side, slot);
  }

  if (threat > 0 && me.queue.length < 2) {
    if (!trainUnit(state, side, pick())) trainUnit(state, side, 'inf');
  } else if (!saving && me.gold >= waveCost && me.queue.length === 0) {
    for (let i = 0; i < plan; i++) if (!trainUnit(state, side, pick())) trainUnit(state, side, 'inf');
    waves.delete(side);
  }

  // Améliorations avec l'or en trop (il garde de quoi envoyer une vague).
  if (warmedUp && me.gold > waveCost * (diff.counters ? 1.8 : 2.5)) {
    const order: UpgradeId[] = ['attack', 'armor', 'economy', 'walls'];
    const id = order.reduce((best, u) => (me.upgrades[u] < me.upgrades[best] ? u : best), order[0]);
    if (me.gold - upgradeCost(me.upgrades[id]) > waveCost) buyUpgrade(state, side, id);
  }
  // Compétences : cri de guerre quand ses troupes se battent, soins quand elles sont blessées.
  const mine = state.units.filter((u) => u.side === side);
  const fighting = mine.filter((u) => u.targetId !== null).length;
  if (warmedUp && fighting >= 4 && skillReady(state, side, 'warcry')) useSkill(state, side, 'warcry');
  const hurt = mine.filter((u) => u.hp < u.maxHp * 0.5).length;
  if (warmedUp && (hurt >= 4 || me.hp < me.maxHp * 0.5) && skillReady(state, side, 'heal')) useSkill(state, side, 'heal');

  // Pouvoir : sur le plus gros groupe ennemi.
  if (warmedUp && specialReady(state, side) && enemies.length >= 4) {
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
