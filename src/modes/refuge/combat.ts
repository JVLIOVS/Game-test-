import { addTrauma, spawnBurst, spawnText } from '../../game/systems/effects';
import { FX_COLORS } from '../../game/fxColors';
import type { Zombie } from '../../game/types';
import { DEMON_ARMOR, TURRET_GUARD, ZOMBIE_BOUNTY } from './balance';
import { FROST_SLOW, GUARD, HIDE_MULT } from './data';
import { doorOutside, doorRect, insideRoom } from './layout';
import type { Demon, Rect, RefugeState, Room, Survivor } from './types';

// Outils partagés du mode Refuges : déplacements, collisions, dégâts, éliminations, fin de partie.

export const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

/** Repousse un cercle hors d'un rectangle ; renvoie true en cas de contact. */
export function pushOutRect(m: { x: number; y: number }, r: number, rc: Rect) {
  const nx = Math.max(rc.x, Math.min(m.x, rc.x + rc.w));
  const ny = Math.max(rc.y, Math.min(m.y, rc.y + rc.h));
  const dx = m.x - nx;
  const dy = m.y - ny;
  const d = Math.hypot(dx, dy);
  if (d >= r) return false;
  if (d < 0.001) {
    // Centre dans le rectangle : on sort par le côté le plus proche.
    const left = m.x - rc.x;
    const right = rc.x + rc.w - m.x;
    const top = m.y - rc.y;
    const bottom = rc.y + rc.h - m.y;
    const min = Math.min(left, right, top, bottom);
    if (min === left) m.x = rc.x - r;
    else if (min === right) m.x = rc.x + rc.w + r;
    else if (min === top) m.y = rc.y - r;
    else m.y = rc.y + rc.h + r;
    return true;
  }
  m.x = nx + (dx / d) * r;
  m.y = ny + (dy / d) * r;
  return true;
}

/** Refuges encore habités (cibles possibles). */
export const occupiedRooms = (state: RefugeState) =>
  state.rooms.filter((r) => r.owner !== null && state.survivors[r.owner].alive && !r.door.broken);

/** Le Démon et ses doubles encore en vie. */
export const allDemons = (state: RefugeState) => (state.demon.hp > 0 ? [state.demon, ...state.clones] : state.clones);

/** Zone défendue par un refuge : devant sa porte, ou à l'intérieur. */
export function guards(room: Room, x: number, y: number) {
  const g = doorOutside(room, 70);
  return dist(x, y, g.x, g.y) < TURRET_GUARD || insideRoom(room, x, y);
}

/** Ralentissement du totem de givre à cet endroit. */
export function slowAt(state: RefugeState, x: number, y: number) {
  for (const room of state.rooms) {
    if (room.stun > 0 || room.owner === null || !state.survivors[room.owner].alive) continue;
    if (room.artifacts.some((a) => a.kind === 'frost') && guards(room, x, y)) return FROST_SLOW;
  }
  return 0;
}

export function moveToward(m: { x: number; y: number; vx: number; vy: number; walkTime: number; dirX: 1 | -1 }, tx: number, ty: number, speed: number, dt: number) {
  const d = dist(m.x, m.y, tx, ty);
  const k = 1 - Math.exp(-6 * dt);
  const vx = d > 4 ? ((tx - m.x) / d) * speed : 0;
  const vy = d > 4 ? ((ty - m.y) / d) * speed : 0;
  m.vx += (vx - m.vx) * k;
  m.vy += (vy - m.vy) * k;
  m.x += m.vx * dt;
  m.y += m.vy * dt;
  if (Math.abs(m.vx) > 8) m.dirX = m.vx > 0 ? 1 : -1;
  m.walkTime = Math.hypot(m.vx, m.vy) > 15 ? m.walkTime + dt : 0;
  return d;
}

/** Collisions avec les refuges : murs toujours, porte tant qu'elle tient. */
export function collideRooms(state: RefugeState, m: { x: number; y: number }, r: number, throughDoors = false) {
  for (const room of state.rooms) {
    for (const w of room.walls) pushOutRect(m, r, w);
    if (!throughDoors && !room.door.broken) pushOutRect(m, r, doorRect(room));
  }
  m.x = Math.max(r, Math.min(state.width - r, m.x));
  m.y = Math.max(r, Math.min(state.height - r, m.y));
}

/** S'il est dans un refuge, il faut d'abord en ressortir par la porte (cassée). */
export function exitWaypoint(state: RefugeState, m: { x: number; y: number }, radius: number) {
  for (const room of state.rooms) {
    if (insideRoom(room, m.x, m.y, -4)) return doorOutside(room, radius + 20);
  }
  return null;
}

/** Dégâts sur une porte : le bouclier magique encaisse d'abord. */
export function damageDoor(state: RefugeState, room: Room, amount: number, quiet = false) {
  if (room.door.broken) return;
  // Chaque garde dans la chambre fait encaisser moins de dégâts à la porte.
  const guards = room.allies.filter((a) => a.kind === 'guard').length;
  if (guards) amount *= Math.max(0.4, 1 - GUARD.block * guards);
  if (room.shield > 0) {
    const absorbed = Math.min(room.shield, amount);
    room.shield -= absorbed;
    amount -= absorbed;
    if (room.shield <= 0) {
      room.shieldMax = 0;
      spawnBurst(state, room.door.x, room.door.y, 20, 16, 'confetti', ['#6FB7F0', '#E0FAFF'], 1.2);
    }
    if (amount <= 0) return;
  }
  room.door.hp -= amount;
  if (!quiet) {
    room.door.hitFlash = 1;
    spawnBurst(state, room.door.x, room.door.y, 10, 3, 'chip', FX_COLORS.chips, 0.7);
    state.events.push({ type: 'doorHit', roomId: room.id });
  }
  if (room.door.hp > 0) return;
  room.door.hp = 0;
  room.door.broken = true;
  room.shield = 0;
  room.shieldMax = 0;
  spawnBurst(state, room.door.x, room.door.y, 10, 18, 'chip', FX_COLORS.chips, 1.5);
  addTrauma(state, 0.4);
  state.events.push({ type: 'doorBroken', roomId: room.id });
}

export function damageZombie(state: RefugeState, z: Zombie, amount: number, room: Room | null) {
  z.hp -= amount;
  z.hitFlash = 1;
  // Seuls les gros coups affichent un chiffre : trop de textes ralentissent l'affichage.
  if (amount >= 30) spawnText(state, z.x, z.y - 40, `${Math.round(amount)}`, FX_COLORS.textDamage, { size: 0.85 });
  if (z.hp > 0) return;
  const i = state.zombies.indexOf(z);
  if (i < 0) return;
  state.zombies.splice(i, 1);
  delete state.zombieRoom[z.id];
  state.zombiesKilled++;
  spawnBurst(state, z.x, z.y, 15, z.boss ? 30 : 10, 'goo', FX_COLORS.goo, z.boss ? 1.8 : 1.1);
  // Prime en or (et points de chance) pour le refuge qui a tué le zombie.
  if (room && room.owner !== null) {
    const owner = state.survivors[room.owner];
    const bounty = ZOMBIE_BOUNTY(state.wave) * (z.boss ? 15 : 1);
    owner.gold += bounty;
    room.roundScore += z.boss ? 10 : 1;
    if (owner.isPlayer) spawnText(state, z.x, z.y - 60, `+${bounty}`, FX_COLORS.textWood, { size: 0.8 });
  }
  state.events.push({ type: 'zombieKilled' });
}

export function damageDemon(state: RefugeState, d: Demon, amount: number, room: Room | null) {
  if (d.hp <= 0) return;
  amount = Math.max(1, Math.round(amount * DEMON_ARMOR * HIDE_MULT[state.powers.hide ?? 0]));
  d.hp -= amount;
  if (room) room.roundScore += amount / 40;
  // Seuls les gros coups le font clignoter (sinon le laser le laisserait tout blanc).
  if (amount >= 15) d.hitFlash = 1;
  if (amount >= 40) spawnText(state, d.x, d.y - 90, `${amount}`, FX_COLORS.textBoss, { size: 0.9 });
  if (d.hp > 0) return;
  d.hp = 0;
  if (d !== state.demon) {
    // Un double se dissipe en fumée.
    spawnBurst(state, d.x, d.y - 40, 25, 24, 'dust', ['#7E3AA3', '#B05BD6', '#2E1228'], 1.4);
    return;
  }
  spawnBurst(state, d.x, d.y, 30, 50, 'goo', ['#3B2A5C', '#C2352B', '#FFB020'], 2.2);
  spawnBurst(state, d.x, d.y, 30, 40, 'confetti', FX_COLORS.confetti, 2);
  addTrauma(state, 1);
  state.events.push({ type: 'demonKilled' });
  finish(state);
}

export function eliminate(state: RefugeState, s: Survivor) {
  s.alive = false;
  state.eliminations++;
  s.eliminatedAt = state.eliminations;
  spawnBurst(state, s.x, s.y, 20, 24, 'goo', ['#C2352B', '#8A1E1E', '#FF5A5A'], 1.4);
  addTrauma(state, 0.7);
  state.events.push({ type: 'eliminated', survivorId: s.id, name: s.name, isPlayer: s.isPlayer });
  // Petit cadre en bas de l'écran : on le voit se faire dévorer (une seule à la fois, la plus récente).
  state.devours = [{ survivorId: s.id, t: 0 }];
  if (state.survivors.every((o) => !o.alive)) finish(state);
}

export function finish(state: RefugeState) {
  if (state.phase === 'over') return;
  const found = state.eliminations;
  let won: boolean;
  let rank: number;
  if (state.role === 'demon') {
    // Le Démon gagne s'il trouve tout le monde avant la fin.
    won = state.survivors.every((s) => !s.alive);
    rank = won ? 1 : 2;
  } else {
    const player = state.survivors[0];
    // Rang : 1 si on a survécu ou si on a été le dernier trouvé, sinon selon l'ordre d'élimination.
    rank = player.alive ? 1 : state.survivors.length - player.eliminatedAt + 1;
    won = rank === 1;
  }
  // Le vainqueur reçoit sa couronne : toi si tu as gagné, sinon le survivant le mieux protégé, ou le Démon.
  const alive = state.survivors.filter((s) => s.alive);
  let winner = -1;
  if (state.role === 'survivor' && won) winner = 0;
  else if (state.role === 'survivor' || !won) {
    const best = alive.sort((a, b) => (b.roomId !== null ? state.rooms[b.roomId].door.hp : 0) - (a.roomId !== null ? state.rooms[a.roomId].door.hp : 0))[0];
    winner = best ? best.id : -1;
  }
  if (state.demon.hp <= 0 && winner === -1) winner = alive[0]?.id ?? 0;
  state.finale = { winner, t: 0 };
  state.phase = 'over';
  state.wheel = null;
  state.powerChoice = null;
  state.result = { won, rank, survivedSeconds: Math.round(state.time), found };
  state.events.push({ type: 'over', won });
}
