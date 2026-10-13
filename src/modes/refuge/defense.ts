import { spawnBurst } from '../../game/systems/effects';
import { FX_COLORS } from '../../game/fxColors';
import { DEMON_RADIUS, TURRET } from './balance';
import { allDemons, damageDemon, damageDoor, damageZombie, dist, guards } from './combat';
import { HEAL_RATE, MEGA, STORM, TESLA } from './data';
import type { Demon, RefugeState, Room } from './types';

// Défenses des refuges : tourelles, artefacts (méga-tourelle, bobine Tesla, givre, soin),
// bonus de la roue (puissance, orage, bouclier), poison des griffes du Démon.

const ARROW_SPEED = 620;

interface Target {
  x: number;
  y: number;
  id: number;
}

/** Ennemis devant la porte d'un refuge : zombies, Démon et doubles. */
function enemiesNear(state: RefugeState, room: Room): Target[] {
  const out: Target[] = [];
  for (const z of state.zombies) if (guards(room, z.x, z.y)) out.push({ x: z.x, y: z.y, id: z.id });
  for (const d of allDemons(state)) if (d.rise >= 1 && guards(room, d.x, d.y)) out.push({ x: d.x, y: d.y, id: d.id });
  return out;
}

const findDemon = (state: RefugeState, id: number): Demon | undefined => allDemons(state).find((d) => d.id === id);

function hit(state: RefugeState, id: number, amount: number, room: Room) {
  if (id < 0) {
    const d = findDemon(state, id);
    if (d) damageDemon(state, d, amount, room);
  } else {
    const z = state.zombies.find((zz) => zz.id === id);
    if (z) damageZombie(state, z, amount, room);
  }
}

/** Éclair en zigzag, pour le dessin. */
function zap(state: RefugeState, x1: number, y1: number, x2: number, y2: number) {
  const points = [{ x: x1, y: y1 }];
  const n = 6;
  for (let i = 1; i < n; i++) {
    const t = i / n;
    points.push({ x: x1 + (x2 - x1) * t + (Math.random() - 0.5) * 26, y: y1 + (y2 - y1) * t + (Math.random() - 0.5) * 26 });
  }
  points.push({ x: x2, y: y2 });
  state.zaps.push({ points, life: 0.25 });
}

function updateRoom(state: RefugeState, room: Room, dt: number) {
  room.repairCooldown = Math.max(0, room.repairCooldown - dt);
  room.door.hitFlash = Math.max(0, room.door.hitFlash - dt * 5);
  room.gen.spin += dt * (1 + room.gen.level * 0.6) * (room.boosts.turbo > 0 ? 2.5 : 1);
  room.stun = Math.max(0, room.stun - dt);
  room.boosts.power = Math.max(0, room.boosts.power - dt);
  room.boosts.turbo = Math.max(0, room.boosts.turbo - dt);
  room.boosts.storm = Math.max(0, room.boosts.storm - dt);
  // Poison des griffes toxiques
  if (room.poison.time > 0) {
    room.poison.time -= dt;
    damageDoor(state, room, room.poison.dps * dt, true);
  }
  const active = room.owner !== null && state.survivors[room.owner].alive && !room.door.broken;
  if (!active) return;
  // Totem de soin
  if (room.artifacts.includes('heal') && room.stun <= 0) room.door.hp = Math.min(room.door.maxHp, room.door.hp + room.door.maxHp * HEAL_RATE * dt);
}

function updateRoomDefenses(state: RefugeState, room: Room, dt: number) {
  const alive = room.owner !== null && state.survivors[room.owner].alive;
  for (const t of room.turrets) t.beamTo = null;
  if (!alive || room.stun > 0) return;
  const mult = room.boosts.power > 0 ? 2 : 1;
  const enemies = enemiesNear(state, room);

  // Orage : la foudre tombe sur les ennemis devant la porte.
  if (room.boosts.storm > 0) {
    room.boosts.stormCooldown -= dt;
    if (room.boosts.stormCooldown <= 0 && enemies.length) {
      room.boosts.stormCooldown = STORM.interval;
      const e = enemies[Math.floor(Math.random() * enemies.length)];
      zap(state, e.x + (Math.random() - 0.5) * 60, e.y - 340, e.x, e.y - 20);
      spawnBurst(state, e.x, e.y - 10, 10, 8, 'confetti', ['#FFFFFF', '#5BE0FF', '#FFE14D'], 1);
      hit(state, e.id, STORM.damage * mult, room);
    }
  }
  if (!enemies.length) {
    for (let i = 0; i < 3; i++) room.artifactCooldowns[i] = Math.max(0, room.artifactCooldowns[i] - dt);
    for (const t of room.turrets) t.cooldown -= dt;
    return;
  }

  // Tourelles : cible la plus proche dans la zone de la porte.
  for (const t of room.turrets) {
    if (t.level === 0) continue;
    const def = TURRET[t.level]!;
    t.cooldown -= dt * room.turretRateMult;
    let target: Target | null = null;
    let best: number = def.range;
    for (const e of enemies) {
      const d = dist(t.x, t.y, e.x, e.y);
      if (d < best) {
        best = d;
        target = e;
      }
    }
    if (!target) continue;
    t.angle = Math.atan2(target.y - t.y, target.x - t.x);
    if (t.level === 4) t.beamTo = { x: target.x, y: target.y - 20 };
    if (t.cooldown > 0) continue;
    t.cooldown = def.interval;
    if (t.level === 4) {
      // Laser : dégâts continus, sans projectile.
      hit(state, target.id, def.damage * mult, room);
      continue;
    }
    for (let i = 0; i < def.shots; i++) {
      const a = t.angle + (i - (def.shots - 1) / 2) * 0.12;
      state.projectiles.push({
        x: t.x,
        y: t.y - 20,
        vx: Math.cos(a) * ARROW_SPEED,
        vy: Math.sin(a) * ARROW_SPEED,
        life: 1,
        damage: def.damage * mult,
        targetId: target.id,
        style: t.level === 3 ? 'cannon' : t.level === 2 ? 'bolt' : 'tower',
        splash: def.splash,
        roomId: room.id,
      });
    }
  }

  // Artefacts
  room.artifacts.forEach((kind, i) => {
    room.artifactCooldowns[i] -= dt;
    if (!kind || room.artifactCooldowns[i] > 0) return;
    const spot = room.artifactSpots[i];
    if (kind === 'mega') {
      const target = enemies.reduce<Target | null>((b, e) => (!b || dist(spot.x, spot.y, e.x, e.y) < dist(spot.x, spot.y, b.x, b.y) ? e : b), null);
      if (!target || dist(spot.x, spot.y, target.x, target.y) > MEGA.range) return;
      room.artifactCooldowns[i] = MEGA.interval;
      state.projectiles.push({
        x: spot.x,
        y: spot.y - 30,
        vx: 0,
        vy: 0,
        life: 1.2,
        damage: MEGA.damage * mult,
        targetId: target.id,
        style: 'cannon',
        splash: MEGA.splash,
        roomId: room.id,
      });
    } else if (kind === 'tesla') {
      // Éclair en chaîne de l'un à l'autre
      room.artifactCooldowns[i] = TESLA.interval;
      let from = { x: spot.x, y: spot.y - 34 };
      const left = [...enemies];
      for (let n = 0; n < TESLA.chain && left.length; n++) {
        left.sort((a, b) => dist(from.x, from.y, a.x, a.y) - dist(from.x, from.y, b.x, b.y));
        const e = left.shift()!;
        zap(state, from.x, from.y, e.x, e.y - 20);
        hit(state, e.id, TESLA.damage * mult, room);
        from = { x: e.x, y: e.y - 20 };
      }
    }
  });
}

function updateProjectiles(state: RefugeState, dt: number) {
  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    const p = state.projectiles[i];
    p.life -= dt;
    const target = p.targetId < 0 ? findDemon(state, p.targetId) : state.zombies.find((z) => z.id === p.targetId);
    if (target) {
      const d = dist(p.x, p.y, target.x, target.y - 20) || 1;
      p.vx = ((target.x - p.x) / d) * ARROW_SPEED;
      p.vy = ((target.y - 20 - p.y) / d) * ARROW_SPEED;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const room = p.roomId !== undefined ? state.rooms[p.roomId] : null;
    if (target && room && dist(p.x, p.y, target.x, target.y - 20) < (p.targetId < 0 ? DEMON_RADIUS : 16)) {
      state.projectiles.splice(i, 1);
      if (p.splash > 0) {
        for (const z of [...state.zombies]) if (z.id !== p.targetId && dist(z.x, z.y, target.x, target.y) < p.splash + z.radius) damageZombie(state, z, Math.round(p.damage * 0.6), room);
        spawnBurst(state, target.x, target.y, 10, 12, 'goo', FX_COLORS.fire, 1.2);
      }
      hit(state, p.targetId, p.damage, room);
    } else if (p.life <= 0 || !target) {
      state.projectiles.splice(i, 1);
    }
  }
}

export function updateDefenses(state: RefugeState, dt: number) {
  for (const room of state.rooms) updateRoom(state, room, dt);
  if (state.phase === 'siege') for (const room of state.rooms) updateRoomDefenses(state, room, dt);
  updateProjectiles(state, dt);
  for (let i = state.zaps.length - 1; i >= 0; i--) {
    state.zaps[i].life -= dt;
    if (state.zaps[i].life <= 0) state.zaps.splice(i, 1);
  }
}
