import { addTrauma, spawnBurst } from '../../game/systems/effects';
import { HERO_TOXIC, allDemons, damageDemon, damageZombie, dist, guards } from './combat';
import { doorOutside } from './layout';
import type { HeroPower, RefugeState, Survivor } from './types';

// Pouvoirs des survivants. Comme le Démon (régénération, griffes toxiques…), chaque survivant
// reçoit un pouvoir au début du siège, puis un nouveau (ou un niveau de plus) régulièrement.
// Le joueur choisit parmi trois ; les robots choisissent seuls et déclenchent leurs pouvoirs actifs.

export const HERO_POWERS: Record<HeroPower, { icon: string; active: boolean; max: number }> = {
  regen: { icon: '💚', active: false, max: 3 },
  toxic: { icon: '☣️', active: false, max: 3 },
  turret: { icon: '🎯', active: false, max: 3 },
  fortune: { icon: '💰', active: false, max: 3 },
  freeze: { icon: '❄️', active: true, max: 3 },
  blast: { icon: '💥', active: true, max: 3 },
};
export const HERO_POWER_IDS = Object.keys(HERO_POWERS) as HeroPower[];
export const HERO_ACTIVE = HERO_POWER_IDS.filter((p) => HERO_POWERS[p].active);

/** Premier pouvoir peu après le début du siège, puis un par minute. */
export const HERO_FIRST = 12;
export const HERO_EVERY = 60;

/** Régénération : part de la porte réparée chaque seconde. */
export const HERO_REGEN = [0, 0.004, 0.007, 0.011];
/** Tourelle vivante : tu tires même assis sur ton trône, plus vite et plus fort. */
export const HERO_TURRET = { rate: [1, 1.25, 1.5, 1.8], damage: [1, 1.1, 1.25, 1.45] };
/** Fortune : or gagné en plus. */
export const HERO_FORTUNE = [1, 1.3, 1.6, 2];
/** Gel : tout ce qui est devant ta porte est figé. */
export const HERO_FREEZE = { time: [0, 2, 3, 4], cooldown: [0, 45, 38, 30] };
/** Onde de choc : gros dégâts et recul des zombies autour de ta porte (le Démon y résiste). */
export const HERO_BLAST = { damage: [0, 140, 260, 420], cooldown: [0, 34, 28, 22], radius: 280, push: 150 };

const level = (s: Survivor, p: HeroPower) => s.powers[p] ?? 0;
export { HERO_TOXIC };

function options(s: Survivor): HeroPower[] {
  const open = HERO_POWER_IDS.filter((p) => level(s, p) < HERO_POWERS[p].max);
  // Mélange, puis trois propositions.
  for (let i = open.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [open[i], open[j]] = [open[j], open[i]];
  }
  return open.slice(0, 3);
}

export function chooseHeroPower(state: RefugeState, s: Survivor, power: HeroPower) {
  const lv = Math.min(HERO_POWERS[power].max, level(s, power) + 1);
  s.powers[power] = lv;
  if (s.isPlayer) state.heroChoice = null;
  state.events.push({ type: 'heroPower', survivorId: s.id, power, level: lv });
}

export const heroReady = (s: Survivor, p: HeroPower) => s.alive && level(s, p) > 0 && (s.powerCooldowns[p] ?? 0) <= 0;

/** Déclencher un pouvoir actif (gel ou onde de choc) devant la porte de son refuge. */
export function useHeroPower(state: RefugeState, s: Survivor, power: HeroPower) {
  if (state.phase !== 'siege' || !heroReady(s, power) || s.roomId === null) return false;
  const room = state.rooms[s.roomId];
  if (room.door.broken) return false;
  const lv = level(s, power);
  const at = doorOutside(room, 70);
  if (power === 'freeze') {
    room.freeze = HERO_FREEZE.time[lv];
    s.powerCooldowns.freeze = HERO_FREEZE.cooldown[lv];
    spawnBurst(state, at.x, at.y, 60, 30, 'confetti', ['#E0FAFF', '#9EDBFF', '#FFFFFF'], 1.4);
  } else if (power === 'blast') {
    s.powerCooldowns.blast = HERO_BLAST.cooldown[lv];
    state.blasts.push({ x: at.x, y: at.y, t: 0 });
    for (const z of [...state.zombies]) {
      const d = dist(z.x, z.y, at.x, at.y);
      if (d > HERO_BLAST.radius) continue;
      // Les zombies sont projetés loin de la porte.
      const k = HERO_BLAST.push / Math.max(20, d);
      z.x += (z.x - at.x) * k;
      z.y += (z.y - at.y) * k;
      damageZombie(state, z, HERO_BLAST.damage[lv] * (1 + state.wave * 0.12), room);
    }
    spawnBurst(state, at.x, at.y, 40, 40, 'dust', ['#FFB84D', '#FF6B2B', '#FFFFFF'], 1.6);
    if (s.isPlayer) addTrauma(state, 0.5);
  } else {
    return false;
  }
  state.events.push({ type: 'heroActive', roomId: room.id, power });
  return true;
}

/** Les robots déclenchent leurs pouvoirs quand on attaque leur porte. */
function botPowers(state: RefugeState, s: Survivor) {
  if (s.roomId === null) return;
  const room = state.rooms[s.roomId];
  let attackers = 0;
  let demon = false;
  for (const z of state.zombies) if (guards(room, z.x, z.y)) attackers++;
  for (const d of allDemons(state)) if (d.rise >= 1 && guards(room, d.x, d.y)) demon = true;
  if ((demon || attackers >= 5) && heroReady(s, 'freeze')) useHeroPower(state, s, 'freeze');
  else if ((demon || attackers >= 4) && heroReady(s, 'blast')) useHeroPower(state, s, 'blast');
}

export function updateHeroPowers(state: RefugeState, dt: number) {
  for (let i = state.blasts.length - 1; i >= 0; i--) {
    state.blasts[i].t += dt;
    if (state.blasts[i].t > 0.6) state.blasts.splice(i, 1);
  }
  for (const room of state.rooms) {
    room.freeze = Math.max(0, room.freeze - dt);
    if (room.owner === null) continue;
    const owner = state.survivors[room.owner];
    const regen = level(owner, 'regen');
    if (regen && owner.alive && !room.door.broken && room.stun <= 0) room.door.hp = Math.min(room.door.maxHp, room.door.hp + room.door.maxHp * HERO_REGEN[regen] * dt);
  }
  // Poison des tirs toxiques
  for (const z of [...state.zombies]) {
    if (z.poisonTime <= 0) continue;
    z.poisonTime -= dt;
    damageZombie(state, z, z.poison * dt, state.rooms[state.zombieRoom[z.id]] ?? null, true);
  }
  for (const d of allDemons(state)) {
    if (d.poison.time <= 0) continue;
    d.poison.time -= dt;
    damageDemon(state, d, d.poison.dps * dt, state.rooms[d.poison.roomId] ?? null, true);
  }
  if (state.phase !== 'siege') return;
  for (const s of state.survivors) {
    if (!s.alive) continue;
    for (const p of HERO_ACTIVE) if (s.powerCooldowns[p]) s.powerCooldowns[p] = Math.max(0, s.powerCooldowns[p]! - dt);
    if (!s.isPlayer) botPowers(state, s);
  }
  state.heroTimer -= dt;
  if (state.heroTimer > 0) return;
  state.heroTimer = HERO_EVERY;
  for (const s of state.survivors) {
    if (!s.alive) continue;
    const opts = options(s);
    if (!opts.length) continue;
    if (s.isPlayer) state.heroChoice = opts;
    else chooseHeroPower(state, s, opts[Math.floor(Math.random() * opts.length)]);
  }
}
