import { addTrauma, spawnBurst, spawnText, updateEffects } from '../../game/systems/effects';
import { FX_COLORS } from '../../game/fxColors';
import type { PlayerInput, Zombie, ZombieKind } from '../../game/types';
import {
  ARENA_H,
  ARENA_W,
  BUY_HOLD,
  CHOOSE_TIME,
  DEMON_ARMOR,
  DEMON_GRACE,
  DEMON_HEALED_RATIO,
  DEMON_HEAL_RATE,
  DEMON_HIT_INTERVAL,
  DEMON_LEVEL_TIME,
  DEMON_RADIUS,
  DEMON_RETREAT_RATIO,
  DOOR_COST,
  DOOR_HP,
  GEN_COST,
  GEN_INCOME,
  OFF_GEN_RATIO,
  PAD_RADIUS,
  REPAIR_COOLDOWN,
  REPAIR_COST,
  REPAIR_RATIO,
  SIEGE_TIME,
  START_GOLD,
  SURVIVOR_RADIUS,
  SURVIVOR_SPEED,
  TURRET,
  TURRET_COST,
  WAVE_INTERVAL,
  ZOMBIE_BOUNTY,
  demonStats,
  waveSize,
  zombieDamage,
  zombieHp,
} from './balance';
import { botThink } from './ai';
import { CENTER, createRooms, doorOutside, doorRect, insideRoom, roomCenter } from './layout';
import type { Demon, RefugePad, RefugeState, Rect, Room, Survivor } from './types';

const BOT_NAMES = ['Léo', 'Mia', 'Sam', 'Inès', 'Tom'];
const SHIRTS = ['#FF7A3D', '#4E7BD6', '#B05BD6', '#4FB8B0', '#E0533D', '#7BD35A'];
const ARROW_SPEED = 620;
const ZOMBIE_REACH = 30;
const FEAST_TIME = 8;

const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

/** Repousse un cercle hors d'un rectangle ; renvoie true en cas de contact. */
function pushOutRect(m: { x: number; y: number }, r: number, rc: Rect) {
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

export function createRefuge(): RefugeState {
  const rooms = createRooms();
  const survivors: Survivor[] = Array.from({ length: 6 }, (_, i) => {
    const a = (i / 6) * Math.PI * 2;
    return {
      id: i,
      name: i === 0 ? 'Toi' : BOT_NAMES[i - 1],
      isPlayer: i === 0,
      x: CENTER.x + Math.cos(a) * 60,
      y: CENTER.y + Math.sin(a) * 40,
      vx: 0,
      vy: 0,
      dirX: 1,
      walkTime: 0,
      roomId: null,
      alive: true,
      gold: START_GOLD,
      shirt: SHIRTS[i],
      goal: null,
      path: [],
      thinkTimer: 0.5 + Math.random(),
      hurtFlash: 0,
      eliminatedAt: 0,
    };
  });
  const st = demonStats(1);
  const demon: Demon = {
    x: CENTER.x,
    y: CENTER.y,
    vx: 0,
    vy: 0,
    hp: st.maxHp,
    maxHp: st.maxHp,
    level: 1,
    damage: st.damage,
    speed: st.speed,
    state: 'heal',
    targetRoom: null,
    attackCooldown: 0,
    levelTimer: DEMON_LEVEL_TIME,
    hitFlash: 0,
    lunge: 0,
    walkTime: 0,
    dirX: 1,
  };
  return {
    time: 0,
    phase: 'choose',
    phaseTimer: CHOOSE_TIME,
    width: ARENA_W,
    height: ARENA_H,
    rooms,
    survivors,
    demon,
    zombies: [],
    projectiles: [],
    wave: 0,
    waveTimer: 25,
    zombiesKilled: 0,
    eliminations: 0,
    result: null,
    particles: [],
    texts: [],
    flyingLogs: [],
    trauma: 0,
    nextId: 1000,
    events: [],
  };
}

// ---------- Achats ----------

/** Prochain achat possible sur un emplacement : coût, ou null si au maximum / indisponible. */
export function padOffer(room: Room, pad: RefugePad): { cost: number; level: number } | null {
  switch (pad.kind) {
    case 'door':
      return room.door.level < DOOR_HP.length - 1 ? { cost: DOOR_COST[room.door.level + 1], level: room.door.level + 1 } : null;
    case 'gen':
      return room.gen.level < GEN_INCOME.length - 1 ? { cost: GEN_COST[room.gen.level + 1], level: room.gen.level + 1 } : null;
    case 'turret': {
      const t = room.turrets[pad.slot];
      return t.level < TURRET_COST.length - 1 ? { cost: TURRET_COST[t.level + 1], level: t.level + 1 } : null;
    }
    case 'repair':
      return room.repairCooldown <= 0 && room.door.hp < room.door.maxHp ? { cost: REPAIR_COST, level: 0 } : null;
  }
}

function buy(state: RefugeState, s: Survivor, room: Room, pad: RefugePad) {
  const offer = padOffer(room, pad);
  if (!offer || s.gold < offer.cost) return;
  s.gold -= offer.cost;
  if (pad.kind === 'door') {
    const before = room.door.maxHp;
    room.door.level = offer.level;
    room.door.maxHp = DOOR_HP[offer.level];
    room.door.hp += room.door.maxHp - before;
  } else if (pad.kind === 'gen') {
    room.gen.level = offer.level;
  } else if (pad.kind === 'turret') {
    room.turrets[pad.slot].level = offer.level;
  } else {
    room.door.hp = Math.min(room.door.maxHp, room.door.hp + room.door.maxHp * REPAIR_RATIO);
    room.repairCooldown = REPAIR_COOLDOWN;
  }
  spawnBurst(state, pad.x, pad.y, 20, 14, 'confetti', FX_COLORS.confetti, 1);
  state.events.push({ type: 'bought', survivorId: s.id, kind: pad.kind, level: offer.level });
}

// ---------- Survivants ----------

function moveSurvivor(state: RefugeState, s: Survivor, mx: number, my: number, dt: number) {
  const k = 1 - Math.exp(-14 * dt);
  s.vx += (mx * SURVIVOR_SPEED - s.vx) * k;
  s.vy += (my * SURVIVOR_SPEED - s.vy) * k;
  s.x += s.vx * dt;
  s.y += s.vy * dt;
  const speed = Math.hypot(s.vx, s.vy);
  s.walkTime = speed > 15 ? s.walkTime + dt : 0;
  if (Math.abs(s.vx) > 10) s.dirX = s.vx > 0 ? 1 : -1;

  const room = s.roomId !== null ? state.rooms[s.roomId] : null;
  if (room) {
    // Enfermé dans son refuge.
    s.x = Math.max(room.inner.x + SURVIVOR_RADIUS, Math.min(room.inner.x + room.inner.w - SURVIVOR_RADIUS, s.x));
    s.y = Math.max(room.inner.y + SURVIVOR_RADIUS, Math.min(room.inner.y + room.inner.h - SURVIVOR_RADIUS, s.y));
    return;
  }
  for (const r of state.rooms) {
    for (const w of r.walls) pushOutRect(s, SURVIVOR_RADIUS, w);
    // Une porte se referme sur un refuge déjà pris.
    if (r.owner !== null) pushOutRect(s, SURVIVOR_RADIUS, doorRect(r));
  }
  s.x = Math.max(SURVIVOR_RADIUS, Math.min(state.width - SURVIVOR_RADIUS, s.x));
  s.y = Math.max(SURVIVOR_RADIUS, Math.min(state.height - SURVIVOR_RADIUS, s.y));
  // Entrer dans un refuge libre le réserve : la porte se ferme derrière soi.
  for (const r of state.rooms) {
    if (r.owner === null && insideRoom(r, s.x, s.y, 8)) {
      r.owner = s.id;
      s.roomId = r.id;
      spawnBurst(state, r.door.x, r.door.y, 0, 8, 'dust', FX_COLORS.dust, 0.8);
      break;
    }
  }
}

function updateSurvivors(state: RefugeState, input: PlayerInput, dt: number) {
  for (const s of state.survivors) {
    if (!s.alive) continue;
    s.hurtFlash = Math.max(0, s.hurtFlash - dt * 4);
    let mx = 0;
    let my = 0;
    if (s.isPlayer) {
      mx = input.moveX;
      my = input.moveY;
    } else {
      botThink(state, s, dt);
      if (s.goal) {
        const d = dist(s.x, s.y, s.goal.x, s.goal.y);
        if (d > 6) {
          mx = (s.goal.x - s.x) / d;
          my = (s.goal.y - s.y) / d;
        }
      }
    }
    moveSurvivor(state, s, mx, my, dt);
    if (s.roomId === null || state.phase !== 'siege') continue;
    const room = state.rooms[s.roomId];
    // Or du générateur : tout l'or si on se tient dessus, une partie sinon.
    const onGen = dist(s.x, s.y, room.gen.x, room.gen.y) < PAD_RADIUS + 6;
    s.gold += GEN_INCOME[room.gen.level] * (onGen ? 1 : OFF_GEN_RATIO) * dt;
    for (const pad of room.pads) {
      if (dist(s.x, s.y, pad.x, pad.y) < PAD_RADIUS) {
        pad.hold += dt;
      } else {
        pad.hold = 0;
        continue;
      }
      if (pad.hold >= BUY_HOLD) {
        pad.hold = -0.6; // petite pause avant un éventuel second achat
        buy(state, s, room, pad);
      }
    }
  }
}

/** Fin du choix : ceux qui n'ont pas de refuge sont placés dans le plus proche libre. */
function startSiege(state: RefugeState) {
  state.phase = 'siege';
  state.phaseTimer = SIEGE_TIME;
  for (const s of state.survivors) {
    if (s.roomId !== null) continue;
    const free = state.rooms
      .filter((r) => r.owner === null)
      .sort((a, b) => dist(s.x, s.y, roomCenter(a).x, roomCenter(a).y) - dist(s.x, s.y, roomCenter(b).x, roomCenter(b).y))[0];
    if (!free) continue;
    free.owner = s.id;
    s.roomId = free.id;
    const c = roomCenter(free);
    s.x = c.x;
    s.y = c.y;
  }
  state.events.push({ type: 'phase', phase: 'siege' });
}

function eliminate(state: RefugeState, s: Survivor) {
  s.alive = false;
  state.eliminations++;
  s.eliminatedAt = state.eliminations;
  spawnBurst(state, s.x, s.y, 20, 24, 'goo', ['#C2352B', '#8A1E1E', '#FF5A5A'], 1.4);
  addTrauma(state, 0.7);
  state.events.push({ type: 'eliminated', survivorId: s.id, name: s.name, isPlayer: s.isPlayer });
}

// ---------- Ennemis ----------

function makeZombie(state: RefugeState, x: number, y: number, kind: ZombieKind, hp: number, damage: number, speed: number, boss = false): Zombie {
  return {
    id: state.nextId++,
    x,
    y,
    vx: 0,
    vy: 0,
    radius: boss ? 26 : kind === 'brute' ? 18 : kind === 'runner' ? 11 : 13,
    hp,
    maxHp: hp,
    speed,
    damage,
    attackCooldown: 1,
    lunge: 0,
    hitFlash: 0,
    walkTime: Math.random() * 10,
    variant: Math.floor(Math.random() * 3),
    ability: null,
    boss,
    bossSize: boss ? 'mini' : 'none',
    orbitCooldown: 0,
    golden: false,
    unitTargetId: null,
    hunter: false,
    kind,
    slow: 0,
    poison: 0,
    poisonTime: 0,
  };
}

/** Refuges encore habités (cibles possibles). */
const occupiedRooms = (state: RefugeState) =>
  state.rooms.filter((r) => r.owner !== null && state.survivors[r.owner].alive && !r.door.broken);

function spawnWave(state: RefugeState) {
  state.wave++;
  const w = state.wave;
  const boss = w % 4 === 0;
  const n = waveSize(w);
  for (let i = 0; i < n; i++) {
    const left = i % 2 === 0;
    const x = left ? 30 : state.width - 30;
    const y = CENTER.y + (Math.random() - 0.5) * 300;
    const r = Math.random();
    const kind: ZombieKind = w >= 3 && r < 0.15 ? 'brute' : w >= 2 && r < 0.45 ? 'runner' : 'walker';
    const hpMult = kind === 'brute' ? 3 : kind === 'runner' ? 0.6 : 1;
    const speedMult = kind === 'brute' ? 0.65 : kind === 'runner' ? 1.7 : 1;
    state.zombies.push(makeZombie(state, x, y, kind, Math.round(zombieHp(w) * hpMult), Math.round(zombieDamage(w) * (kind === 'brute' ? 2 : 1)), 60 * speedMult));
  }
  if (boss) state.zombies.push(makeZombie(state, CENTER.x, 30, 'brute', zombieHp(w) * 14, zombieDamage(w) * 4, 50, true));
  state.events.push({ type: 'wave', wave: w, boss });
}

function damageDoor(state: RefugeState, room: Room, amount: number) {
  if (room.door.broken) return;
  room.door.hp -= amount;
  room.door.hitFlash = 1;
  spawnBurst(state, room.door.x, room.door.y, 10, 3, 'chip', FX_COLORS.chips, 0.7);
  state.events.push({ type: 'doorHit', roomId: room.id });
  if (room.door.hp > 0) return;
  room.door.hp = 0;
  room.door.broken = true;
  spawnBurst(state, room.door.x, room.door.y, 10, 18, 'chip', FX_COLORS.chips, 1.5);
  addTrauma(state, 0.4);
  state.events.push({ type: 'doorBroken', roomId: room.id });
}

function damageZombie(state: RefugeState, z: Zombie, amount: number, room: Room | null) {
  z.hp -= amount;
  z.hitFlash = 1;
  if (amount >= 8) spawnText(state, z.x, z.y - 40, `${amount}`, FX_COLORS.textDamage, { size: 0.85 });
  if (z.hp > 0) return;
  const i = state.zombies.indexOf(z);
  if (i < 0) return;
  state.zombies.splice(i, 1);
  state.zombiesKilled++;
  spawnBurst(state, z.x, z.y, 15, z.boss ? 30 : 10, 'goo', FX_COLORS.goo, z.boss ? 1.8 : 1.1);
  // Prime en or pour le refuge dont la tourelle a tué le zombie.
  if (room && room.owner !== null) {
    const owner = state.survivors[room.owner];
    const bounty = ZOMBIE_BOUNTY(state.wave) * (z.boss ? 15 : 1);
    owner.gold += bounty;
    spawnText(state, z.x, z.y - 60, `+${bounty}`, FX_COLORS.textWood, { size: 0.8 });
  }
  state.events.push({ type: 'zombieKilled' });
}

function damageDemon(state: RefugeState, amount: number) {
  const d = state.demon;
  if (d.hp <= 0) return;
  amount = Math.max(1, Math.round(amount * DEMON_ARMOR));
  d.hp -= amount;
  d.hitFlash = 1;
  if (amount >= 10) spawnText(state, d.x, d.y - 90, `${amount}`, FX_COLORS.textBoss, { size: 0.9 });
  if (d.hp > 0) return;
  d.hp = 0;
  spawnBurst(state, d.x, d.y, 30, 50, 'goo', ['#3B2A5C', '#C2352B', '#FFB020'], 2.2);
  spawnBurst(state, d.x, d.y, 30, 40, 'confetti', FX_COLORS.confetti, 2);
  addTrauma(state, 1);
  state.events.push({ type: 'demonKilled' });
  finish(state);
}

function moveToward(m: { x: number; y: number; vx: number; vy: number; walkTime: number; dirX: 1 | -1 }, tx: number, ty: number, speed: number, dt: number) {
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
function collideRooms(state: RefugeState, m: { x: number; y: number }, r: number) {
  for (const room of state.rooms) {
    for (const w of room.walls) pushOutRect(m, r, w);
    if (!room.door.broken) pushOutRect(m, r, doorRect(room));
  }
  m.x = Math.max(r, Math.min(state.width - r, m.x));
  m.y = Math.max(r, Math.min(state.height - r, m.y));
}

/** S'il est dans un refuge, le Démon doit d'abord en ressortir par la porte (cassée). */
function exitWaypoint(state: RefugeState, m: { x: number; y: number }) {
  for (const room of state.rooms) {
    if (insideRoom(room, m.x, m.y, -4)) return doorOutside(room, DEMON_RADIUS + 20);
  }
  return null;
}

function pickTarget(state: RefugeState): number | null {
  const rooms = occupiedRooms(state);
  if (!rooms.length) return null;
  // Le Démon préfère les refuges les moins défendus (porte + tourelles), avec une part de hasard.
  const defense = (r: Room) => (r.door.hp + r.turrets.reduce((sum, t) => sum + t.level * t.level * 250, 0)) * (0.75 + Math.random() * 0.5);
  rooms.sort((a, b) => defense(a) - defense(b));
  return rooms[0].id;
}

function updateDemon(state: RefugeState, dt: number) {
  const d = state.demon;
  d.hitFlash = Math.max(0, d.hitFlash - dt * 5);
  d.lunge = Math.max(0, d.lunge - dt * 3);
  d.attackCooldown -= dt;

  // Il se renforce avec le temps.
  d.levelTimer -= dt;
  if (d.levelTimer <= 0) levelUpDemon(state);

  if (d.state !== 'retreat' && d.state !== 'heal' && d.hp < d.maxHp * DEMON_RETREAT_RATIO) {
    d.state = 'retreat';
    d.targetRoom = null;
    state.events.push({ type: 'demonRetreat' });
  }

  switch (d.state) {
    case 'retreat':
    case 'heal': {
      const exit = exitWaypoint(state, d);
      if (exit) {
        moveToward(d, exit.x, exit.y, d.speed * 1.2, dt);
        break;
      }
      const dd = moveToward(d, CENTER.x, CENTER.y, d.speed * 1.2, dt);
      if (dd < 20) {
        d.state = 'heal';
        d.hp = Math.min(d.maxHp, d.hp + d.maxHp * DEMON_HEAL_RATE * dt);
        const graceOver = SIEGE_TIME - state.phaseTimer > DEMON_GRACE;
        if (state.phase === 'siege' && graceOver && d.hp >= d.maxHp * DEMON_HEALED_RATIO) d.state = 'hunt';
      }
      break;
    }
    case 'hunt': {
      if (d.targetRoom === null || state.rooms[d.targetRoom].door.broken || !occupiedRooms(state).some((r) => r.id === d.targetRoom)) {
        d.targetRoom = pickTarget(state);
        if (d.targetRoom === null) break;
      }
      const room = state.rooms[d.targetRoom];
      const exit = exitWaypoint(state, d);
      if (exit) {
        moveToward(d, exit.x, exit.y, d.speed, dt);
        break;
      }
      const spot = doorOutside(room, DEMON_RADIUS + 6);
      if (moveToward(d, spot.x, spot.y, d.speed, dt) < 12) d.state = 'attack';
      break;
    }
    case 'attack': {
      const room = d.targetRoom !== null ? state.rooms[d.targetRoom] : null;
      if (!room || room.owner === null || !state.survivors[room.owner].alive) {
        d.state = 'hunt';
        d.targetRoom = null;
        break;
      }
      d.vx *= 0.8;
      d.vy *= 0.8;
      d.dirX = room.door.x >= d.x ? 1 : -1;
      if (room.door.broken) {
        d.state = 'devour';
        break;
      }
      if (d.attackCooldown <= 0) {
        d.attackCooldown = DEMON_HIT_INTERVAL;
        d.lunge = 1;
        damageDoor(state, room, d.damage);
        addTrauma(state, 0.15);
      }
      break;
    }
    case 'feast': {
      d.vx *= 0.8;
      d.vy *= 0.8;
      if (d.attackCooldown <= 0) d.state = 'hunt';
      break;
    }
    case 'devour': {
      const room = d.targetRoom !== null ? state.rooms[d.targetRoom] : null;
      const victim = room && room.owner !== null ? state.survivors[room.owner] : null;
      if (!room || !victim || !victim.alive) {
        d.state = 'hunt';
        d.targetRoom = null;
        break;
      }
      // Passe la porte puis fonce sur l'occupant.
      const inside = insideRoom(room, d.x, d.y);
      const tx = inside ? victim.x : room.door.x;
      const ty = inside ? victim.y : room.door.y + (room.doorSide === 'bottom' ? -40 : 40);
      moveToward(d, tx, ty, d.speed * 1.3, dt);
      if (dist(d.x, d.y, victim.x, victim.y) < DEMON_RADIUS + SURVIVOR_RADIUS + 6) {
        eliminate(state, victim);
        // Il se repaît : un peu de vie, puis une pause avant de chasser à nouveau.
        d.hp = Math.min(d.maxHp, d.hp + d.maxHp * 0.2);
        d.attackCooldown = FEAST_TIME;
        d.state = 'feast';
        d.targetRoom = null;
      }
      break;
    }
  }
  // Le Démon traverse les portes cassées mais pas les murs.
  if (d.state !== 'devour') collideRooms(state, d, DEMON_RADIUS);
  else for (const room of state.rooms) for (const w of room.walls) pushOutRect(d, DEMON_RADIUS, w);
}

function levelUpDemon(state: RefugeState) {
  const d = state.demon;
  d.level++;
  d.levelTimer = DEMON_LEVEL_TIME;
  const st = demonStats(d.level);
  const ratio = d.hp / d.maxHp;
  d.maxHp = st.maxHp;
  d.hp = Math.min(d.maxHp, d.maxHp * ratio + d.maxHp * 0.3);
  d.damage = st.damage;
  d.speed = st.speed;
  state.events.push({ type: 'demonLevel', level: d.level });
}

function updateZombies(state: RefugeState, dt: number) {
  for (const z of [...state.zombies]) {
    z.hitFlash = Math.max(0, z.hitFlash - dt * 5);
    z.lunge = Math.max(0, z.lunge - dt * 4);
    z.walkTime += dt;
    z.attackCooldown -= dt;
    // Chaque zombie vise la porte habitée la plus proche.
    let room: Room | null = null;
    let best = Infinity;
    for (const r of occupiedRooms(state)) {
      const dd = dist(z.x, z.y, r.door.x, r.door.y);
      if (dd < best) {
        best = dd;
        room = r;
      }
    }
    if (!room) continue;
    const spot = doorOutside(room, z.radius + 4);
    const d = dist(z.x, z.y, spot.x, spot.y);
    if (d > ZOMBIE_REACH) {
      const k = 1 - Math.exp(-6 * dt);
      z.vx += (((spot.x - z.x) / d) * z.speed - z.vx) * k;
      z.vy += (((spot.y - z.y) / d) * z.speed - z.vy) * k;
    } else {
      z.vx *= 0.8;
      z.vy *= 0.8;
      if (z.attackCooldown <= 0) {
        z.attackCooldown = 1;
        z.lunge = 1;
        damageDoor(state, room, z.damage);
      }
    }
    z.x += z.vx * dt;
    z.y += z.vy * dt;
    for (const o of state.zombies) {
      if (o === z) continue;
      const dx = z.x - o.x;
      const dy = z.y - o.y;
      const dd = Math.hypot(dx, dy);
      const r = z.radius + o.radius;
      if (dd < r && dd > 0.001) {
        z.x += (dx / dd) * (r - dd) * 0.5;
        z.y += (dy / dd) * (r - dd) * 0.5;
      }
    }
    collideRooms(state, z, z.radius);
  }
}

// ---------- Tourelles ----------

function updateTurrets(state: RefugeState, dt: number) {
  const demon = state.demon;
  for (const room of state.rooms) {
    room.repairCooldown = Math.max(0, room.repairCooldown - dt);
    room.door.hitFlash = Math.max(0, room.door.hitFlash - dt * 5);
    room.gen.spin += dt * (1 + room.gen.level * 0.6);
    const active = room.owner !== null && state.survivors[room.owner].alive;
    for (const t of room.turrets) {
      t.beamTo = null;
      if (!active || t.level === 0) continue;
      const def = TURRET[t.level]!;
      t.cooldown -= dt;
      // Cible la plus proche : zombie ou Démon.
      let target: { x: number; y: number; id: number } | null = null;
      let best: number = def.range;
      for (const z of state.zombies) {
        const d = dist(t.x, t.y, z.x, z.y);
        if (d < best) {
          best = d;
          target = { x: z.x, y: z.y, id: z.id };
        }
      }
      if (demon.hp > 0 && dist(t.x, t.y, demon.x, demon.y) < best) target = { x: demon.x, y: demon.y, id: -1 };
      if (!target) continue;
      t.angle = Math.atan2(target.y - t.y, target.x - t.x);
      if (t.level === 4) t.beamTo = { x: target.x, y: target.y - 20 };
      if (t.cooldown > 0) continue;
      t.cooldown = def.interval;
      if (t.level === 4) {
        // Laser : dégâts continus, sans projectile.
        if (target.id === -1) damageDemon(state, def.damage);
        else {
          const z = state.zombies.find((zz) => zz.id === target!.id);
          if (z) damageZombie(state, z, def.damage, room);
        }
        continue;
      }
      for (let i = 0; i < def.shots; i++) {
        const spread = (i - (def.shots - 1) / 2) * 0.12;
        const a = t.angle + spread;
        state.projectiles.push({
          x: t.x,
          y: t.y - 20,
          vx: Math.cos(a) * ARROW_SPEED,
          vy: Math.sin(a) * ARROW_SPEED,
          life: 1,
          damage: def.damage,
          targetId: target.id,
          style: t.level === 3 ? 'cannon' : t.level === 2 ? 'bolt' : 'tower',
          splash: def.splash,
          roomId: room.id,
        });
      }
    }
  }

  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    const p = state.projectiles[i];
    p.life -= dt;
    const target = p.targetId === -1 ? (demon.hp > 0 ? demon : null) : state.zombies.find((z) => z.id === p.targetId);
    if (target) {
      const d = dist(p.x, p.y, target.x, target.y - 20) || 1;
      p.vx = ((target.x - p.x) / d) * ARROW_SPEED;
      p.vy = ((target.y - 20 - p.y) / d) * ARROW_SPEED;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const room = p.roomId !== undefined ? state.rooms[p.roomId] : null;
    if (target && dist(p.x, p.y, target.x, target.y - 20) < (p.targetId === -1 ? DEMON_RADIUS : 16)) {
      state.projectiles.splice(i, 1);
      if (p.splash > 0) {
        for (const z of [...state.zombies]) if (dist(z.x, z.y, target.x, target.y) < p.splash + z.radius) damageZombie(state, z, Math.round(p.damage * 0.6), room);
        spawnBurst(state, target.x, target.y, 10, 12, 'goo', FX_COLORS.fire, 1.2);
      }
      if (p.targetId === -1) damageDemon(state, p.damage);
      else {
        const z = state.zombies.find((zz) => zz.id === p.targetId);
        if (z) damageZombie(state, z, p.damage, room);
      }
    } else if (p.life <= 0) {
      state.projectiles.splice(i, 1);
    }
  }
}

// ---------- Fin de partie ----------

function finish(state: RefugeState) {
  if (state.phase === 'over') return;
  const player = state.survivors[0];
  // Rang : 1 si on a survécu ou si on a été le dernier trouvé, sinon selon l'ordre d'élimination.
  const rank = player.alive ? 1 : state.survivors.length - player.eliminatedAt + 1;
  const won = rank === 1;
  state.phase = 'over';
  state.result = { won, rank, survivedSeconds: Math.round(state.time) };
  state.events.push({ type: 'over', won });
}

export function stepRefuge(state: RefugeState, input: PlayerInput, dt: number) {
  state.time += dt;
  if (state.phase !== 'over') {
    state.phaseTimer -= dt;
    if (state.phase === 'choose' && (state.phaseTimer <= 0 || state.survivors.every((s) => s.roomId !== null))) startSiege(state);
    if (state.phase === 'siege') {
      state.waveTimer -= dt;
      if (state.waveTimer <= 0) {
        state.waveTimer = WAVE_INTERVAL;
        spawnWave(state);
      }
      if (state.phaseTimer <= 0) finish(state);
    }
    updateSurvivors(state, input, dt);
    updateDemon(state, dt);
    updateZombies(state, dt);
    updateTurrets(state, dt);
    if (state.phase === 'siege' && state.survivors.every((s) => !s.alive)) finish(state);
  }
  updateEffects(state, dt);
}
