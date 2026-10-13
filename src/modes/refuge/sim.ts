import { addTrauma, spawnBurst, updateEffects } from '../../game/systems/effects';
import { FX_COLORS } from '../../game/fxColors';
import type { PlayerInput, Zombie, ZombieKind } from '../../game/types';
import {
  ARENA_H,
  ARENA_W,
  ARRIVAL_TIME,
  BUY_HOLD,
  CELL,
  CHOOSE_TIME,
  DOOR_COST,
  DOOR_HP,
  GEN_COST,
  GEN_INCOME,
  INTRO_TIME,
  MAX_TURRETS,
  OFF_GEN_RATIO,
  PAD_RADIUS,
  REPAIR_COOLDOWN,
  REPAIR_COST,
  REPAIR_RATIO,
  ROUND_TIME,
  ROUNDS,
  SIEGE_TIME,
  START_GOLD,
  SURVIVOR_RADIUS,
  SURVIVOR_SPEED,
  TURRET_COST,
  WAVE_INTERVAL,
  waveSize,
  zombieDamage,
  zombieHp,
} from './balance';
import { botThink } from './ai';
import { collideRooms, damageDoor, dist, finish, occupiedRooms, pushOutRect, slowAt } from './combat';
import { CHARACTERS, CHARACTER_IDS } from './data';
import { updateDefenses } from './defense';
import { createDemon, updateDemons } from './demon';
import { CENTER, cellTaken, createRooms, doorOutside, doorRect, facingAngle, insideRoom, roomCenter } from './layout';
import type { ArtifactKind, CharacterId, RefugePad, RefugeRole, RefugeState, RefugeTurret, Room, Survivor } from './types';
import { endRound } from './wheel';

const BOT_NAMES = ['Léo', 'Mia', 'Sam', 'Inès', 'Tom', 'Zoé'];
const SHIRTS = ['#FF7A3D', '#4E7BD6', '#B05BD6', '#4FB8B0', '#E0533D', '#7BD35A'];
const ZOMBIE_REACH = 30;

export interface RefugeSetup {
  role: RefugeRole;
  /** Personnage du joueur (rôle survivant). */
  character: CharacterId;
  /** Démon piloté par l'ordinateur même en rôle Démon (tests automatiques). */
  demonAI?: boolean;
}

export function createRefuge(setup: RefugeSetup = { role: 'survivor', character: 'mecano' }): RefugeState {
  const rooms = createRooms();
  const survivors: Survivor[] = Array.from({ length: 6 }, (_, i) => {
    const isPlayer = setup.role === 'survivor' && i === 0;
    const character = isPlayer ? setup.character : CHARACTER_IDS[Math.floor(Math.random() * CHARACTER_IDS.length)];
    // Tout le monde part du centre, serré autour de l'autel encore scellé.
    const a = (i / 6) * Math.PI * 2 + Math.PI / 2;
    return {
      id: i,
      name: isPlayer ? 'Toi' : BOT_NAMES[setup.role === 'survivor' ? i - 1 : i],
      isPlayer,
      x: CENTER.x + Math.cos(a) * 84,
      y: CENTER.y + Math.sin(a) * 84,
      vx: 0,
      vy: 0,
      dirX: 1,
      walkTime: 0,
      roomId: null,
      alive: true,
      gold: START_GOLD + CHARACTERS[character].gold,
      shirt: isPlayer ? CHARACTERS[character].shirt : SHIRTS[i],
      character,
      inventory: [],
      buildCell: null,
      goal: null,
      path: [],
      // Petit temps de réaction après le top départ, différent pour chaque robot.
      thinkTimer: 0.15 + Math.random() * 0.45,
      hurtFlash: 0,
      eliminatedAt: 0,
    };
  });
  return {
    time: 0,
    role: setup.role,
    demonAI: setup.role === 'survivor' || !!setup.demonAI,
    phase: 'intro',
    phaseTimer: INTRO_TIME,
    width: ARENA_W,
    height: ARENA_H,
    rooms,
    survivors,
    demon: createDemon(),
    clones: [],
    zombies: [],
    projectiles: [],
    zaps: [],
    wave: 0,
    waveTimer: 25,
    round: 1,
    roundTimer: ROUND_TIME,
    roundLength: ROUND_TIME,
    wheel: null,
    powerChoice: null,
    powers: {},
    powerCooldowns: {},
    roarTime: 0,
    zombiesKilled: 0,
    zombieRoom: {},
    siegeStart: 0,
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

/** Le survivant joué, s'il y en a un. */
export const playerSurvivor = (state: RefugeState) => (state.role === 'survivor' ? state.survivors[0] : null);

// ---------- Achats ----------

/** Prochain achat possible sur un emplacement : coût, ou null si au maximum / indisponible. */
export function padOffer(room: Room, pad: RefugePad): { cost: number; level: number } | null {
  switch (pad.kind) {
    case 'door':
      return room.door.level < DOOR_HP.length - 1 ? { cost: DOOR_COST[room.door.level + 1], level: room.door.level + 1 } : null;
    case 'gen':
      return room.gen.level < GEN_INCOME.length - 1 ? { cost: GEN_COST[room.gen.level + 1], level: room.gen.level + 1 } : null;
    case 'repair':
      return room.repairCooldown <= 0 && room.door.hp < room.door.maxHp ? { cost: room.repairFree ? 0 : REPAIR_COST, level: 0 } : null;
  }
}

function buy(state: RefugeState, s: Survivor, room: Room, pad: RefugePad) {
  const offer = padOffer(room, pad);
  if (!offer || s.gold < offer.cost) return;
  s.gold -= offer.cost;
  if (pad.kind === 'door') {
    const before = room.door.maxHp;
    room.door.level = offer.level;
    room.door.maxHp = Math.round(DOOR_HP[offer.level] * room.doorHpMult);
    room.door.hp += room.door.maxHp - before;
  } else if (pad.kind === 'gen') {
    room.gen.level = offer.level;
  } else {
    room.door.hp = Math.min(room.door.maxHp, room.door.hp + room.door.maxHp * REPAIR_RATIO);
    room.repairCooldown = room.repairFree ? REPAIR_COOLDOWN / 2 : REPAIR_COOLDOWN;
  }
  spawnBurst(state, pad.x, pad.y, 20, 14, 'confetti', FX_COLORS.confetti, 1);
  state.events.push({ type: 'bought', survivorId: s.id, kind: pad.kind, level: offer.level });
}

/** Amélioration d'une tourelle posée : coût, ou null au niveau maximum. */
export function turretOffer(room: Room, t: RefugeTurret): { cost: number; level: number } | null {
  return t.level < TURRET_COST.length - 1 ? { cost: Math.round(TURRET_COST[t.level + 1] * room.turretCostMult), level: t.level + 1 } : null;
}

/** Prix d'une nouvelle tourelle, ou null si le refuge en a déjà le maximum. */
export function newTurretCost(room: Room): number | null {
  return room.turrets.length < MAX_TURRETS ? Math.round(TURRET_COST[1] * room.turretCostMult) : null;
}

function upgradeTurret(state: RefugeState, s: Survivor, room: Room, t: RefugeTurret) {
  const offer = turretOffer(room, t);
  if (!offer || s.gold < offer.cost) return;
  s.gold -= offer.cost;
  t.level = offer.level;
  spawnBurst(state, t.x, t.y, 20, 14, 'confetti', FX_COLORS.confetti, 1);
  state.events.push({ type: 'bought', survivorId: s.id, kind: 'turret', level: t.level });
}

/** Construire une tourelle sur une case libre de son refuge. */
export function buildTurret(state: RefugeState, s: Survivor, cell: number) {
  if (s.roomId === null || state.phase !== 'siege') return false;
  const room = state.rooms[s.roomId];
  const cost = newTurretCost(room);
  if (cost === null || s.gold < cost || cellTaken(room, cell) || !room.cells[cell]) return false;
  s.gold -= cost;
  const c = room.cells[cell];
  // Pour l'améliorer, il faudra s'en écarter puis revenir dessus.
  room.turrets.push({ cell, x: c.x, y: c.y, hold: -1e9, level: 1, cooldown: 0, angle: facingAngle(room), beamTo: null });
  spawnBurst(state, c.x, c.y, 20, 18, 'confetti', FX_COLORS.confetti, 1.1);
  state.events.push({ type: 'bought', survivorId: s.id, kind: 'turret', level: 1 });
  return true;
}

/** Poser un artefact gagné à la roue sur une case libre. */
export function placeArtifact(state: RefugeState, s: Survivor, cell: number, kind: ArtifactKind) {
  if (s.roomId === null) return false;
  const room = state.rooms[s.roomId];
  const i = s.inventory.indexOf(kind);
  if (i < 0 || cellTaken(room, cell) || !room.cells[cell]) return false;
  s.inventory.splice(i, 1);
  room.artifacts.push({ kind, cell, cooldown: 0 });
  const c = room.cells[cell];
  spawnBurst(state, c.x, c.y, 30, 30, 'confetti', FX_COLORS.confetti, 1.5);
  state.events.push({ type: 'placed', survivorId: s.id, kind });
  return true;
}

// ---------- Survivants ----------

/** Prendre un refuge : la porte se ferme derrière soi, et le talent du personnage s'applique. */
function claimRoom(state: RefugeState, s: Survivor, room: Room) {
  const c = CHARACTERS[s.character];
  room.owner = s.id;
  s.roomId = room.id;
  room.turretCostMult = c.turretCostMult;
  room.turretRateMult = c.turretRateMult;
  room.doorHpMult = c.doorHpMult;
  room.repairFree = c.repairFree;
  room.door.maxHp = room.door.hp = Math.round(DOOR_HP[room.door.level] * c.doorHpMult);
  spawnBurst(state, room.door.x, room.door.y, 0, 8, 'dust', FX_COLORS.dust, 0.8);
}

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
  for (const r of state.rooms) {
    if (r.owner === null && insideRoom(r, s.x, s.y, 8)) {
      claimRoom(state, s, r);
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
    s.gold += GEN_INCOME[room.gen.level] * (onGen ? 1 : OFF_GEN_RATIO) * (room.boosts.turbo > 0 ? 2 : 1) * dt;
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
    // Rester sur une tourelle l'améliore.
    for (const t of room.turrets) {
      if (dist(s.x, s.y, t.x, t.y) < PAD_RADIUS) t.hold += dt;
      else t.hold = 0;
      if (t.hold >= BUY_HOLD) {
        t.hold = -0.6;
        upgradeTurret(state, s, room, t);
      }
    }
    // Case vide sous les pieds : on peut y construire.
    s.buildCell = null;
    room.cells.forEach((c, i) => {
      if (s.buildCell === null && Math.abs(s.x - c.x) < CELL / 2 && Math.abs(s.y - c.y) < CELL / 2 && !cellTaken(room, i)) s.buildCell = i;
    });
  }
}

// ---------- Phases ----------

/** Fin du choix : ceux qui n'ont pas de refuge sont placés dans le plus proche libre, puis le Démon surgit. */
function startArrival(state: RefugeState) {
  state.phase = 'arrival';
  state.phaseTimer = ARRIVAL_TIME;
  for (const s of state.survivors) {
    if (s.roomId !== null) continue;
    const free = state.rooms
      .filter((r) => r.owner === null)
      .sort((a, b) => dist(s.x, s.y, roomCenter(a).x, roomCenter(a).y) - dist(s.x, s.y, roomCenter(b).x, roomCenter(b).y))[0];
    if (!free) continue;
    claimRoom(state, s, free);
    const c = roomCenter(free);
    s.x = c.x;
    s.y = c.y;
  }
  state.events.push({ type: 'phase', phase: 'arrival' });
}

/** Mini-cinématique : le sol tremble, l'autel s'ouvre et le Démon en sort. */
function updateArrival(state: RefugeState, dt: number) {
  const d = state.demon;
  const p = 1 - state.phaseTimer / ARRIVAL_TIME;
  // Il reste sous terre la première seconde, puis s'élève.
  d.rise = Math.max(0, Math.min(1, (p - 0.3) / 0.55));
  state.trauma = Math.max(state.trauma, p < 0.85 ? 0.25 + p * 0.3 : 0);
  if (Math.random() < dt * 30) {
    const a = Math.random() * Math.PI * 2;
    spawnBurst(state, CENTER.x + Math.cos(a) * 50, CENTER.y + Math.sin(a) * 30, 0, 1, 'goo', ['#C2352B', '#FF7A3D', '#3B2A5C'], 1.2);
  }
  if (state.phaseTimer <= 0) startSiege(state);
}

function startSiege(state: RefugeState) {
  state.phase = 'siege';
  state.phaseTimer = SIEGE_TIME;
  state.siegeStart = state.time;
  state.round = 1;
  state.roundTimer = state.roundLength;
  state.demon.rise = 1;
  spawnBurst(state, CENTER.x, CENTER.y, 40, 40, 'goo', ['#C2352B', '#FF7A3D', '#FFB020'], 2);
  addTrauma(state, 0.9);
  state.events.push({ type: 'phase', phase: 'siege' });
}

// ---------- Zombies ----------

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

function spawnWave(state: RefugeState) {
  state.wave++;
  const w = state.wave;
  const boss = w % 4 === 0;
  const n = waveSize(w);
  // Chaque refuge habité reçoit sa part de la vague, dans un ordre mélangé.
  const targets = occupiedRooms(state).map((r) => r.id);
  if (!targets.length) return;
  for (let i = targets.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [targets[i], targets[j]] = [targets[j], targets[i]];
  }
  const perRoom = Math.max(2, Math.round(n / 4));
  for (let i = 0; i < perRoom * targets.length; i++) {
    const roomId = targets[i % targets.length];
    // Ils arrivent par le côté de l'arène le plus proche de leur cible.
    const left = state.rooms[roomId].door.x < CENTER.x;
    const x = left ? 30 : state.width - 30;
    const y = CENTER.y + (Math.random() - 0.5) * 300;
    const r = Math.random();
    const kind: ZombieKind = w >= 3 && r < 0.15 ? 'brute' : w >= 2 && r < 0.45 ? 'runner' : 'walker';
    const hpMult = kind === 'brute' ? 3 : kind === 'runner' ? 0.6 : 1;
    const speedMult = kind === 'brute' ? 0.65 : kind === 'runner' ? 1.7 : 1;
    const z = makeZombie(state, x, y, kind, Math.round(zombieHp(w) * hpMult), Math.round(zombieDamage(w) * (kind === 'brute' ? 2 : 1)), 60 * speedMult);
    state.zombies.push(z);
    state.zombieRoom[z.id] = roomId;
  }
  if (boss) {
    const z = makeZombie(state, CENTER.x, CENTER.y, 'brute', zombieHp(w) * 14, zombieDamage(w) * 4, 50, true);
    state.zombies.push(z);
    state.zombieRoom[z.id] = targets[0];
  }
  state.events.push({ type: 'wave', wave: w, boss });
}

function updateZombies(state: RefugeState, dt: number) {
  for (const z of [...state.zombies]) {
    z.hitFlash = Math.max(0, z.hitFlash - dt * 5);
    z.lunge = Math.max(0, z.lunge - dt * 4);
    z.walkTime += dt;
    z.attackCooldown -= dt;
    z.slow = slowAt(state, z.x, z.y);
    // Chaque zombie garde son refuge cible ; s'il tombe, il en choisit un autre au hasard.
    let room: Room | null = state.rooms[state.zombieRoom[z.id]] ?? null;
    if (!room || room.owner === null || !state.survivors[room.owner].alive || room.door.broken) {
      const open = occupiedRooms(state);
      if (!open.length) continue;
      room = open[Math.floor(Math.random() * open.length)];
      state.zombieRoom[z.id] = room.id;
    }
    const spot = doorOutside(room, z.radius + 4);
    const d = dist(z.x, z.y, spot.x, spot.y);
    const speed = z.speed * (1 - z.slow);
    if (d > ZOMBIE_REACH) {
      const k = 1 - Math.exp(-6 * dt);
      z.vx += (((spot.x - z.x) / d) * speed - z.vx) * k;
      z.vy += (((spot.y - z.y) / d) * speed - z.vy) * k;
    } else {
      z.vx *= 0.8;
      z.vy *= 0.8;
      if (z.attackCooldown <= 0) {
        z.attackCooldown = 1 / (1 - z.slow * 0.5);
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

// ---------- Boucle ----------

/** En pause pendant la roue du joueur ou son choix de pouvoir (rôle Démon). */
const isOver = (state: RefugeState) => state.phase === 'over';

export const isPaused = (state: RefugeState) => state.wheel !== null || state.powerChoice !== null;

export function stepRefuge(state: RefugeState, input: PlayerInput, dt: number) {
  if (isPaused(state)) return;
  state.time += dt;
  if (state.phase !== 'over') {
    state.phaseTimer -= dt;
    if (state.phase === 'intro') {
      // Compte à rebours : tout le monde attend le top départ.
      if (state.phaseTimer <= 0) {
        state.phase = 'choose';
        state.phaseTimer = CHOOSE_TIME;
        state.events.push({ type: 'phase', phase: 'choose' });
      }
      updateEffects(state, dt);
      return;
    }
    if (state.phase === 'choose' && (state.phaseTimer <= 0 || state.survivors.every((s) => s.roomId !== null))) startArrival(state);
    if (state.phase === 'arrival') updateArrival(state, dt);
    if (state.phase === 'siege') {
      state.waveTimer -= dt;
      if (state.waveTimer <= 0) {
        state.waveTimer = WAVE_INTERVAL;
        spawnWave(state);
      }
      state.roundTimer -= dt;
      if (state.phaseTimer <= 0) finish(state);
      else if (state.roundTimer <= 0 && state.round < ROUNDS) endRound(state);
    }
    // (la fin a pu être déclenchée juste au-dessus)
    if (!isOver(state)) {
      updateSurvivors(state, input, dt);
      if (state.phase === 'siege') {
        updateDemons(state, input, dt);
        updateZombies(state, dt);
      }
      updateDefenses(state, dt);
    }
  }
  updateEffects(state, dt);
}
