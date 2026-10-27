import { addTrauma, spawnBurst } from '../../game/systems/effects';
import type { PlayerInput } from '../../game/types';
import { DEMON_GRACE, DEMON_HEALED_RATIO, DEMON_HEAL_RATE, DEMON_HIT_INTERVAL, DEMON_LEVEL_TIME, DEMON_RADIUS, DEMON_RETREAT_RATIO, SURVIVOR_RADIUS, demonStats } from './balance';
import { allDemons, collideRooms, damageDoor, dist, eliminate, exitWaypoint, moveToward, occupiedRooms, pushOutRect, slowAt } from './combat';
import { BRUTE_MULT, CLONE, DASH, DEMON_POWERS, POWER_IDS, REGEN_RATE, ROAR, TOXIC_DPS } from './data';
import { CENTER, doorOutside, doorRect, insideRoom } from './layout';
import type { Demon, DemonPower, RefugeState, Room } from './types';

// Le Démon : piloté par l'ordinateur ou par le joueur, avec des pouvoirs gagnés à chaque niveau,
// et ses doubles temporaires (pouvoir Dédoublement), toujours pilotés par l'ordinateur.

const FEAST_TIME = 8;
/** Distance à la porte pour la frapper (Démon joueur) : large, pour jouer facilement au pouce. */
const REACH = 70;
/** Le Démon joueur est enchaîné à l'autel un peu moins longtemps que l'ordinateur. */
const PLAYER_GRACE = 15;

export function createDemon(level = 1): Demon {
  const st = demonStats(level);
  return {
    id: -1,
    x: CENTER.x,
    y: CENTER.y,
    vx: 0,
    vy: 0,
    hp: st.maxHp,
    maxHp: st.maxHp,
    level,
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
    rise: 0,
    cloneTime: 0,
    dashTime: 0,
    dashX: 0,
    dashY: 0,
    slow: 0,
    poison: { dps: 0, time: 0, roomId: -1 },
  };
}

export const playerControlsDemon = (state: RefugeState) => state.role === 'demon' && !state.demonAI;

/** Temps de chaînes restant avant de pouvoir chasser. */
export function graceLeft(state: RefugeState) {
  const grace = playerControlsDemon(state) ? PLAYER_GRACE : DEMON_GRACE;
  return Math.max(0, grace - (state.time - state.siegeStart));
}

// ---------- Pouvoirs ----------

/** 3 pouvoirs proposés au passage de niveau (ceux qui ne sont pas au maximum). */
function powerOptions(state: RefugeState): DemonPower[] {
  const open = POWER_IDS.filter((p) => (state.powers[p] ?? 0) < DEMON_POWERS[p].max);
  for (let i = open.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [open[i], open[j]] = [open[j], open[i]];
  }
  return open.slice(0, 3);
}

export function chooseDemonPower(state: RefugeState, power: DemonPower) {
  const lv = Math.min(DEMON_POWERS[power].max, (state.powers[power] ?? 0) + 1);
  state.powers[power] = lv;
  state.powerChoice = null;
  state.events.push({ type: 'demonPower', power, level: lv });
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
  const options = powerOptions(state);
  if (!options.length) return;
  // Le joueur choisit (la partie se met en pause) ; l'ordinateur prend au hasard.
  if (playerControlsDemon(state)) state.powerChoice = options;
  else chooseDemonPower(state, options[0]);
}

/** Pouvoir actif prêt ? */
export const powerReady = (state: RefugeState, power: DemonPower) => (state.powers[power] ?? 0) > 0 && (state.powerCooldowns[power] ?? 0) <= 0 && state.demon.hp > 0;

/** Déclenche un pouvoir actif du Démon (bouton du joueur, ou décision de l'ordinateur). */
export function useDemonPower(state: RefugeState, power: DemonPower) {
  if (state.phase !== 'siege' || !powerReady(state, power) || graceLeft(state) > 0) return false;
  const d = state.demon;
  const lv = state.powers[power]!;
  if (power === 'clone') {
    const k = CLONE.strength[lv];
    const c = createDemon(d.level);
    c.id = -2 - (state.nextId++ % 1000);
    c.x = d.x + 40;
    c.y = d.y + 10;
    c.maxHp = c.hp = Math.round(d.maxHp * k);
    c.damage = Math.round(d.damage * k);
    c.speed = d.speed * 1.05;
    c.rise = 1;
    c.state = 'hunt';
    c.cloneTime = CLONE.time;
    // Le double part vers un autre refuge que le Démon.
    const others = occupiedRooms(state).filter((r) => r.id !== d.targetRoom);
    c.targetRoom = others.length ? others[Math.floor(Math.random() * others.length)].id : null;
    state.clones.push(c);
    spawnBurst(state, c.x, c.y - 40, 25, 30, 'dust', ['#7E3AA3', '#B05BD6', '#2E1228'], 1.6);
    state.powerCooldowns.clone = CLONE.cooldown[lv];
  } else if (power === 'roar') {
    // Assourdit les défenses des refuges proches.
    for (const room of state.rooms) if (dist(room.door.x, room.door.y, d.x, d.y) < ROAR.radius) room.stun = ROAR.time[lv];
    state.roarTime = 1;
    addTrauma(state, 0.6);
    state.powerCooldowns.roar = ROAR.cooldown;
  } else if (power === 'dash') {
    const len = Math.hypot(d.vx, d.vy);
    d.dashX = len > 10 ? d.vx / len : d.dirX;
    d.dashY = len > 10 ? d.vy / len : 0;
    d.dashTime = DASH.time;
    state.powerCooldowns.dash = DASH.cooldown[lv];
  } else {
    return false;
  }
  state.events.push({ type: 'demonActive', power });
  return true;
}

/** L'ordinateur utilise les pouvoirs actifs du Démon quand c'est utile. */
function aiPowers(state: RefugeState) {
  const d = state.demon;
  if (powerReady(state, 'clone') && occupiedRooms(state).length >= 2 && (d.state === 'hunt' || d.state === 'attack')) useDemonPower(state, 'clone');
  if (powerReady(state, 'roar') && d.state === 'attack') useDemonPower(state, 'roar');
  if (powerReady(state, 'dash') && d.state === 'hunt' && d.targetRoom !== null) {
    const spot = doorOutside(state.rooms[d.targetRoom], DEMON_RADIUS);
    if (dist(d.x, d.y, spot.x, spot.y) > 320) useDemonPower(state, 'dash');
  }
}

/** Coup sur une porte, avec la force brute et les griffes toxiques. */
function strikeDoor(state: RefugeState, d: Demon, room: Room) {
  d.attackCooldown = DEMON_HIT_INTERVAL;
  d.lunge = 1;
  damageDoor(state, room, d.damage * BRUTE_MULT[state.powers.brute ?? 0]);
  const toxic = state.powers.toxic ?? 0;
  if (toxic > 0) room.poison = { dps: d.damage * TOXIC_DPS[toxic], time: 5 };
  if (d === state.demon) addTrauma(state, 0.15);
}

// ---------- Ordinateur ----------

function pickTarget(state: RefugeState, d: Demon): number | null {
  let rooms = occupiedRooms(state);
  if (!rooms.length) return null;
  // Les doubles évitent la cible du Démon quand c'est possible.
  const taken = new Set(allDemons(state).filter((o) => o !== d).map((o) => o.targetRoom));
  const free = rooms.filter((r) => !taken.has(r.id));
  if (free.length) rooms = free;
  // Il préfère les refuges les moins défendus, avec une part de hasard.
  const defense = (r: Room) =>
    (r.door.hp + r.shield + r.turrets.reduce((sum, t) => sum + t.level * t.level * 250, 0) + r.artifacts.length * 900) * (0.75 + Math.random() * 0.5);
  rooms.sort((a, b) => defense(a) - defense(b));
  return rooms[0].id;
}

function aiDemon(state: RefugeState, d: Demon, dt: number) {
  const isClone = d !== state.demon;
  const speed = d.speed * (1 - d.slow);
  if (!isClone && d.state !== 'retreat' && d.state !== 'heal' && d.hp < d.maxHp * DEMON_RETREAT_RATIO) {
    // Il fuit : le refuge qu'il attaquait a tenu bon.
    if (d.targetRoom !== null) state.rooms[d.targetRoom].roundScore += 15;
    d.state = 'retreat';
    d.targetRoom = null;
    state.events.push({ type: 'demonRetreat' });
  }

  switch (d.state) {
    case 'retreat':
    case 'heal': {
      const exit = exitWaypoint(state, d, DEMON_RADIUS);
      if (exit) {
        moveToward(d, exit.x, exit.y, speed * 1.2, dt);
        break;
      }
      const dd = moveToward(d, CENTER.x, CENTER.y, speed * 1.2, dt);
      if (dd < 20) {
        d.state = 'heal';
        d.hp = Math.min(d.maxHp, d.hp + d.maxHp * DEMON_HEAL_RATE * dt);
        if (graceLeft(state) <= 0 && d.hp >= d.maxHp * DEMON_HEALED_RATIO) d.state = 'hunt';
      }
      break;
    }
    case 'hunt': {
      if (d.targetRoom === null || state.rooms[d.targetRoom].door.broken || !occupiedRooms(state).some((r) => r.id === d.targetRoom)) {
        d.targetRoom = pickTarget(state, d);
        if (d.targetRoom === null) break;
      }
      const room = state.rooms[d.targetRoom];
      const exit = exitWaypoint(state, d, DEMON_RADIUS);
      if (exit) {
        moveToward(d, exit.x, exit.y, speed, dt);
        break;
      }
      const spot = doorOutside(room, DEMON_RADIUS + 6);
      if (moveToward(d, spot.x, spot.y, speed, dt) < 12) d.state = 'attack';
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
      if (d.attackCooldown <= 0) strikeDoor(state, d, room);
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
      moveToward(d, tx, ty, speed * 1.3, dt);
      if (dist(d.x, d.y, victim.x, victim.y) < DEMON_RADIUS + SURVIVOR_RADIUS + 6) devour(state, d, victim.id);
      break;
    }
  }
}

function devour(state: RefugeState, d: Demon, survivorId: number) {
  eliminate(state, state.survivors[survivorId]);
  // Il se repaît : un peu de vie, puis une pause avant de chasser à nouveau.
  d.hp = Math.min(d.maxHp, d.hp + d.maxHp * 0.2);
  d.attackCooldown = d === state.demon && playerControlsDemon(state) ? 1 : FEAST_TIME;
  d.state = 'feast';
  d.targetRoom = null;
}

// ---------- Joueur ----------

function playerDemon(state: RefugeState, d: Demon, input: PlayerInput, dt: number) {
  const chained = graceLeft(state) > 0;
  const speed = chained ? 0 : d.speed * 1.05 * (1 - d.slow);
  const k = 1 - Math.exp(-10 * dt);
  d.vx += (input.moveX * speed - d.vx) * k;
  d.vy += (input.moveY * speed - d.vy) * k;
  d.x += d.vx * dt;
  d.y += d.vy * dt;
  if (Math.abs(d.vx) > 8) d.dirX = d.vx > 0 ? 1 : -1;
  d.walkTime = Math.hypot(d.vx, d.vy) > 15 ? d.walkTime + dt : 0;

  // Sur l'autel, il reprend des forces.
  const onAltar = dist(d.x, d.y, CENTER.x, CENTER.y) < 70;
  if (onAltar && d.hp < d.maxHp) {
    d.hp = Math.min(d.maxHp, d.hp + d.maxHp * DEMON_HEAL_RATE * dt);
    d.state = 'heal';
  } else {
    d.state = 'hunt';
  }
  if (chained) return;

  // Frappe automatique de la porte la plus proche, à portée.
  let best: Room | null = null;
  let bestD = REACH;
  for (const room of occupiedRooms(state)) {
    // Distance au bord de la porte (et pas à son centre)
    const r = doorRect(room);
    const nx = Math.max(r.x, Math.min(d.x, r.x + r.w));
    const ny = Math.max(r.y, Math.min(d.y, r.y + r.h));
    const dd = dist(d.x, d.y, nx, ny) - DEMON_RADIUS;
    if (dd < bestD) {
      bestD = dd;
      best = room;
    }
  }
  if (best) {
    // Il se cale devant la porte s'il ne bouge pas.
    if (Math.hypot(input.moveX, input.moveY) < 0.2) {
      const spot = doorOutside(best, DEMON_RADIUS + 6);
      d.x += (spot.x - d.x) * Math.min(1, dt * 4);
      d.y += (spot.y - d.y) * Math.min(1, dt * 4);
    }
    d.state = 'attack';
    d.targetRoom = best.id;
    d.dirX = best.door.x >= d.x ? 1 : -1;
    if (d.attackCooldown <= 0) strikeDoor(state, d, best);
  }
  // Dans un refuge à la porte cassée : il attrape l'occupant.
  for (const s of state.survivors) {
    if (s.alive && dist(d.x, d.y, s.x, s.y) < DEMON_RADIUS + SURVIVOR_RADIUS + 10) {
      devour(state, d, s.id);
      break;
    }
  }
}

// ---------- Mise à jour ----------

function tick(state: RefugeState, d: Demon, dt: number) {
  d.hitFlash = Math.max(0, d.hitFlash - dt * 8);
  d.lunge = Math.max(0, d.lunge - dt * 3);
  d.attackCooldown -= dt;
  d.slow = slowAt(state, d.x, d.y);
  // Figé par le pouvoir Gel d'un survivant : il ne frappe plus.
  if (d.slow > 0.9) d.attackCooldown = Math.max(d.attackCooldown, 0.2);
  const regen = state.powers.regen ?? 0;
  if (regen > 0 && d.hp > 0) d.hp = Math.min(d.maxHp, d.hp + d.maxHp * REGEN_RATE[regen] * dt);
}

/** Ruée : il fonce en ligne droite. */
function dashMove(state: RefugeState, d: Demon, dt: number) {
  d.dashTime -= dt;
  const v = d.speed * DASH.speed;
  d.x += d.dashX * v * dt;
  d.y += d.dashY * v * dt;
  d.vx = d.dashX * v * 0.3;
  d.vy = d.dashY * v * 0.3;
  if (Math.random() < dt * 40) spawnBurst(state, d.x, d.y - 20, 0, 1, 'dust', ['#2E1228', '#7E3AA3'], 1);
}

export function updateDemons(state: RefugeState, input: PlayerInput, dt: number) {
  const d = state.demon;
  for (const p of POWER_IDS) if (state.powerCooldowns[p]) state.powerCooldowns[p] = Math.max(0, state.powerCooldowns[p]! - dt);
  state.roarTime = Math.max(0, state.roarTime - dt * 1.5);

  if (d.hp > 0) {
    tick(state, d, dt);
    // Il se renforce avec le temps.
    d.levelTimer -= dt;
    if (d.levelTimer <= 0) levelUpDemon(state);
    if (d.dashTime > 0) dashMove(state, d, dt);
    else if (playerControlsDemon(state)) playerDemon(state, d, input, dt);
    else {
      aiDemon(state, d, dt);
      aiPowers(state);
    }
    // Il traverse les portes cassées mais pas les murs.
    if (d.state === 'devour') for (const room of state.rooms) for (const w of room.walls) pushOutRect(d, DEMON_RADIUS, w);
    else collideRooms(state, d, DEMON_RADIUS);
  }

  for (const c of [...state.clones]) {
    c.cloneTime -= dt;
    if (c.cloneTime <= 0 || c.hp <= 0) {
      if (c.hp > 0) spawnBurst(state, c.x, c.y - 40, 25, 20, 'dust', ['#7E3AA3', '#B05BD6', '#2E1228'], 1.2);
      state.clones.splice(state.clones.indexOf(c), 1);
      continue;
    }
    tick(state, c, dt);
    aiDemon(state, c, dt);
    if (c.state === 'devour') for (const room of state.rooms) for (const w of room.walls) pushOutRect(c, DEMON_RADIUS, w);
    else collideRooms(state, c, DEMON_RADIUS);
  }
}
