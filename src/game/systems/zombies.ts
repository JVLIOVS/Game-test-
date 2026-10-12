import {
  bossStats,
  ZOMBIE_AGGRO_RANGE,
  ZOMBIE_ATTACK_INTERVAL,
  ZOMBIE_RADIUS,
  zombieWave,
} from '../constants';
import { fxRandom } from '../rng';
import type { BossAbility, GameState, Structure, Unit, Zombie, ZombieKind } from '../types';
import { addTrauma } from './effects';
import { forTreesNear } from '../world/grid';
import { damageStructure, getHouse } from './build';
import { dist, nextId, pushOut } from './common';
import { damageHero } from './hero';
import { damageUnit } from './units';
import { FX_COLORS } from '../fxColors';
import { spawnBurst } from './effects';

const ATTACK_GAP = 8;
/** La partie peut se terminer au milieu de la boucle (baraque détruite). */
const isOver = (state: GameState) => state.status === 'gameover';
const SOLDIER_AGGRO_RANGE = 110;
const GOLDEN_LIFETIME = 28;

/** Le zombie doré fuit le héros en zigzaguant, puis disparaît s'il n'est pas attrapé. */
function updateGoldenZombie(state: GameState, z: Zombie, dt: number) {
  const hero = state.hero;
  if (z.walkTime > GOLDEN_LIFETIME) {
    spawnBurst(state, z.x, z.y, 10, 14, 'confetti', FX_COLORS.confetti, 1);
    state.zombies.splice(state.zombies.indexOf(z), 1);
    return;
  }
  const d = dist(z.x, z.y, hero.x, hero.y) || 1;
  const flee = d < 260 ? 1 : 0.25;
  const wobble = Math.sin(z.walkTime * 2.3) * 0.9;
  const ax = ((z.x - hero.x) / d) * flee + Math.cos(z.walkTime * 0.7 + z.id) * (1 - flee) + wobble * -((z.y - hero.y) / d);
  const ay = ((z.y - hero.y) / d) * flee + Math.sin(z.walkTime * 0.7 + z.id) * (1 - flee) + wobble * ((z.x - hero.x) / d);
  const l = Math.hypot(ax, ay) || 1;
  const k = 1 - Math.exp(-4 * dt);
  // Un peu plus lent que le héros quand il fuit : on peut le rattraper.
  const speed = d < 260 ? z.speed : z.speed * 0.5;
  z.vx += ((ax / l) * speed - z.vx) * k;
  z.vy += ((ay / l) * speed - z.vy) * k;
  z.x = Math.min(state.map.width - 30, Math.max(30, z.x + z.vx * dt));
  z.y = Math.min(state.map.height - 30, Math.max(30, z.y + z.vy * dt));
  forTreesNear(state.trees, z.x, z.y, (tree) => {
    if (tree.state === 'standing') pushOut(z, z.radius, tree.x, tree.y, tree.radius);
  });
}

/** Point d'apparition : sur un grand cercle autour de la base (la carte est très grande). */
export function spawnPoint(state: GameState, angle = Math.random() * Math.PI * 2, distance = 850 + Math.random() * 250) {
  const { width, height } = state.map;
  return {
    x: Math.min(width - 30, Math.max(30, state.base.x + Math.cos(angle) * distance)),
    y: Math.min(height - 30, Math.max(30, state.base.y + Math.sin(angle) * distance)),
  };
}

/** Le boss arrive du côté le plus proche du héros, pour qu'on le voie venir. */
export function spawnBoss(state: GameState, round: number, size: 'mini' | 'big') {
  const st = bossStats(round, size);
  const kind: ZombieKind = 'brute';
  const threat = 1 + threatLevel(state);
  const toward = Math.atan2(state.hero.y - state.base.y, state.hero.x - state.base.x);
  const { x, y } = spawnPoint(state, toward, 750);
  state.bossAlive = true;
  state.zombies.push({
    id: nextId(state),
    x,
    y,
    vx: 0,
    vy: 0,
    radius: st.radius,
    hp: Math.round(st.hp * threat),
    maxHp: Math.round(st.hp * threat),
    speed: st.speed,
    damage: st.damage,
    attackCooldown: ZOMBIE_ATTACK_INTERVAL,
    lunge: 0,
    hitFlash: 0,
    walkTime: 0,
    variant: 0,
    ability: { state: 'walk', kind: 'charge', timer: 0, cooldown: 3, angle: 0, hitIds: [] },
    boss: true,
    bossSize: size,
    orbitCooldown: 0,
    golden: false,
    unitTargetId: null,
    hunter: false,
    kind,
    slow: 0,
    poison: 0,
    poisonTime: 0,
  });
}

const KIND_STATS: Record<ZombieKind, { hp: number; speed: number; damage: number; radius: number }> = {
  walker: { hp: 1, speed: 1, damage: 1, radius: ZOMBIE_RADIUS },
  runner: { hp: 0.55, speed: 1.75, damage: 0.6, radius: 11 },
  brute: { hp: 3.2, speed: 0.62, damage: 2.2, radius: 18 },
  armored: { hp: 2.6, speed: 0.85, damage: 1.3, radius: 15 },
  spitter: { hp: 0.8, speed: 0.9, damage: 0.8, radius: 12 },
};

/** Composition des vagues : coureurs à partir de la nuit 2, brutes à partir de la nuit 3. */
function pickKind(night: number): ZombieKind {
  const r = Math.random();
  if (night >= 3 && r < 0.12 + Math.min(0.1, night * 0.01)) return 'brute';
  if (night >= 3 && r < 0.24) return 'spitter';
  if (night >= 2 && r < 0.34) return 'armored';
  if (night >= 2 && r < 0.6) return 'runner';
  return 'walker';
}

// ---------- Attaques spéciales des boss ----------
// Chaque attaque est annoncée au sol (zone rouge) avant de frapper : on peut l'esquiver.

export const WINDUP = { charge: 0.95, slam: 1.05, summon: 0.75, spit: 0.65 } as const;
const CHARGE_SPEED = 560;
const CHARGE_TIME = 0.7;
export const CHARGE_LENGTH = CHARGE_SPEED * CHARGE_TIME;
export const slamRadius = (z: Zombie) => (z.bossSize === 'big' ? 190 : 140);
const SHOT_SPEED = 300;

function startAbility(state: GameState, z: Zombie, tx: number, ty: number) {
  const a = z.ability!;
  const big = z.bossSize === 'big';
  const d = dist(z.x, z.y, tx, ty);
  const options: BossAbility['kind'][] = d < 170 ? ['slam', 'slam', 'summon'] : d > 280 ? ['charge', 'charge', 'summon'] : ['charge', 'slam', 'summon'];
  if (big) options.push('spit', d > 200 ? 'spit' : 'slam');
  a.kind = options[Math.floor(Math.random() * options.length)];
  a.state = 'windup';
  a.timer = WINDUP[a.kind];
  a.angle = Math.atan2(ty - z.y, tx - z.x);
  a.hitIds = [];
  state.events.push({ type: 'bossTelegraph' });
}

/** Renvoie true quand l'attaque contrôle les déplacements du boss. */
function updateBossAbility(state: GameState, z: Zombie, dt: number, house: Structure | undefined): boolean {
  const a = z.ability!;
  const hero = state.hero;
  const big = z.bossSize === 'big';
  a.cooldown -= dt;
  switch (a.state) {
    case 'walk': {
      if (a.cooldown > 0) return false;
      const target = !hero.dead && dist(z.x, z.y, hero.x, hero.y) < 520 ? hero : house;
      if (!target) return false;
      startAbility(state, z, target.x, target.y);
      return true;
    }
    case 'windup': {
      z.vx *= 0.8;
      z.vy *= 0.8;
      a.timer -= dt;
      if (a.timer > 0) return true;
      if (a.kind === 'charge') {
        a.state = 'charge';
        a.timer = CHARGE_TIME;
        return true;
      }
      if (a.kind === 'slam') {
        const r = slamRadius(z);
        if (!hero.dead && dist(z.x, z.y, hero.x, hero.y) < r + hero.radius) {
          damageHero(state, Math.round(z.damage * 1.3));
          const d = dist(z.x, z.y, hero.x, hero.y) || 1;
          hero.vx += ((hero.x - z.x) / d) * 700;
          hero.vy += ((hero.y - z.y) / d) * 700;
        }
        for (const s of [...state.structures]) {
          if (s.kind !== 'trap' && dist(z.x, z.y, s.x, s.y) < r + s.radius) damageStructure(state, s, Math.round(z.damage * (big ? 2 : 1.2)));
        }
        state.novas.push({ x: z.x, y: z.y, radius: r, life: 0.5, maxLife: 0.5, kind: 'slam' });
        spawnBurst(state, z.x, z.y, 0, 18, 'dust', FX_COLORS.dust, 2);
        addTrauma(state, 0.6);
      } else if (a.kind === 'summon') {
        const n = big ? 8 : 5;
        for (let i = 0; i < n; i++) {
          const ang = (i / n) * Math.PI * 2;
          spawnZombie(state, Math.max(1, state.cycle.night), { x: z.x + Math.cos(ang) * 60, y: z.y + Math.sin(ang) * 60 }, 'runner');
        }
        state.novas.push({ x: z.x, y: z.y, radius: 90, life: 0.5, maxLife: 0.5, kind: 'summon' });
      } else {
        const n = big ? 5 : 3;
        for (let i = 0; i < n; i++) {
          const ang = a.angle + (i - (n - 1) / 2) * 0.22;
          state.enemyShots.push({ x: z.x, y: z.y - 40, vx: Math.cos(ang) * SHOT_SPEED, vy: Math.sin(ang) * SHOT_SPEED, life: 2.2, damage: Math.round(z.damage * 0.8), big: true });
        }
      }
      a.state = 'recover';
      a.timer = 0.7;
      return true;
    }
    case 'charge': {
      a.timer -= dt;
      z.vx = Math.cos(a.angle) * CHARGE_SPEED;
      z.vy = Math.sin(a.angle) * CHARGE_SPEED;
      if (!hero.dead && !a.hitIds.includes(-1) && dist(z.x, z.y, hero.x, hero.y) < z.radius + hero.radius + 10) {
        a.hitIds.push(-1);
        damageHero(state, Math.round(z.damage * 1.6));
        hero.vx += Math.cos(a.angle) * 800;
        hero.vy += Math.sin(a.angle) * 800;
      }
      for (const s of [...state.structures]) {
        if (s.kind === 'trap' || a.hitIds.includes(s.id)) continue;
        if (dist(z.x, z.y, s.x, s.y) < z.radius + s.radius + 6) {
          a.hitIds.push(s.id);
          damageStructure(state, s, Math.round(z.damage * (big ? 3 : 1.6)));
          addTrauma(state, 0.4);
        }
      }
      if (Math.random() < 0.5) spawnBurst(state, z.x, z.y, 0, 1, 'dust', FX_COLORS.dust, 0.6);
      if (a.timer <= 0) {
        a.state = 'recover';
        a.timer = 0.8;
      }
      return true;
    }
    case 'recover': {
      z.vx *= 0.85;
      z.vy *= 0.85;
      a.timer -= dt;
      if (a.timer <= 0) {
        a.state = 'walk';
        a.cooldown = big ? 3 : 4;
      }
      return true;
    }
  }
}

/** Crachats : volent tout droit et blessent le héros ou le premier bâtiment touché. */
function updateEnemyShots(state: GameState, dt: number) {
  const hero = state.hero;
  for (let i = state.enemyShots.length - 1; i >= 0; i--) {
    const s = state.enemyShots[i];
    s.life -= dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    let hit = false;
    if (!hero.dead && dist(s.x, s.y, hero.x, hero.y - 20) < hero.radius + (s.big ? 14 : 9)) {
      damageHero(state, s.damage);
      hit = true;
    } else {
      for (const st of state.structures) {
        if (st.kind === 'trap' || dist(s.x, s.y + 20, st.x, st.y) > st.radius + 6) continue;
        damageStructure(state, st, s.damage);
        hit = true;
        break;
      }
    }
    if (hit) spawnBurst(state, s.x, s.y + 20, 10, 6, 'goo', FX_COLORS.goo, 0.8);
    if (hit || s.life <= 0) state.enemyShots.splice(i, 1);
  }
}

/**
 * Difficulté qui suit la puissance du joueur : plus tes défenses, tes atouts et ton arme
 * sont développés, plus les zombies sont résistants. On ne peut jamais « survoler » la partie.
 */
export function threatLevel(state: GameState) {
  let towers = 0;
  for (const s of state.structures) if (s.kind === 'tower' || s.kind === 'catapult') towers += s.level;
  let perks = 0;
  for (const v of Object.values(state.perks)) perks += v;
  const soldiers = state.units.filter((u) => u.kind === 'soldier').length;
  return towers * 0.07 + perks * 0.035 + state.hero.weapon.forge * 0.04 + state.hero.level * 0.02 + (state.wallLevel - 1) * 0.08 + soldiers * 0.03;
}

export function spawnZombie(state: GameState, night: number, at?: { x: number; y: number }, kind: ZombieKind = pickKind(night)) {
  const wave = zombieWave(night, state.world);
  const k = KIND_STATS[kind];
  const { x, y } = at ?? spawnPoint(state);
  const hp = Math.round(wave.hp * k.hp * (1 + threatLevel(state)));
  state.zombies.push({
    id: nextId(state),
    x,
    y,
    vx: 0,
    vy: 0,
    radius: k.radius,
    hp,
    maxHp: hp,
    speed: wave.speed * k.speed * fxRandom(0.9, 1.1),
    damage: Math.round(wave.damage * k.damage),
    attackCooldown: ZOMBIE_ATTACK_INTERVAL,
    lunge: 0,
    hitFlash: 0,
    walkTime: Math.random() * 10,
    variant: Math.floor(Math.random() * 3),
    ability: null,
    boss: false,
    bossSize: 'none',
    orbitCooldown: 0,
    golden: false,
    unitTargetId: null,
    hunter: false,
    kind,
    slow: 0,
    poison: 0,
    poisonTime: 0,
  });
}

export function updateZombies(state: GameState, dt: number) {
  updateEnemyShots(state, dt);
  if (isOver(state)) return;
  const hero = state.hero;
  const house = getHouse(state);
  const k = 1 - Math.exp(-6 * dt);

  for (const z of [...state.zombies]) {
    z.hitFlash = Math.max(0, z.hitFlash - dt * 5);
    z.lunge = Math.max(0, z.lunge - dt * 4);
    z.attackCooldown -= dt;
    z.walkTime += dt;

    if (z.golden) {
      updateGoldenZombie(state, z, dt);
      continue;
    }

    const heroDist = hero.dead ? Infinity : dist(z.x, z.y, hero.x, hero.y);
    // Les soldats proches attirent aussi les zombies.
    let soldier: Unit | null = null;
    let soldierDist = SOLDIER_AGGRO_RANGE;
    for (const u of state.units) {
      if (u.kind !== 'soldier') continue;
      const d = dist(z.x, z.y, u.x, u.y);
      if (d < soldierDist) {
        soldierDist = d;
        soldier = u;
      }
    }
    const chaseSoldier = soldier && soldierDist < heroDist;
    const target = chaseSoldier ? soldier : heroDist < ZOMBIE_AGGRO_RANGE || (z.hunter && !hero.dead) ? hero : house;
    z.poisonTime = Math.max(0, z.poisonTime - dt);
    const overridden = z.ability ? updateBossAbility(state, z, dt, house) : false;
    if (isOver(state)) return;
    // Le cracheur s'arrête à distance pour tirer.
    const spitting = z.kind === 'spitter' && target && dist(z.x, z.y, target.x, target.y) < 190;
    if (spitting && target) {
      z.vx *= 0.85;
      z.vy *= 0.85;
      if (z.attackCooldown <= 0) {
        z.attackCooldown = 2.2;
        z.lunge = 1;
        const d = dist(z.x, z.y, target.x, target.y) || 1;
        state.enemyShots.push({ x: z.x, y: z.y - 30, vx: ((target.x - z.x) / d) * SHOT_SPEED, vy: ((target.y - z.y) / d) * SHOT_SPEED, life: 1.6, damage: z.damage, big: false });
      }
    } else if (!overridden && target) {
      const d = dist(z.x, z.y, target.x, target.y) || 1;
      const speed = z.speed * (1 - z.slow);
      z.vx += (((target.x - z.x) / d) * speed - z.vx) * k;
      z.vy += (((target.y - z.y) / d) * speed - z.vy) * k;
    }
    // Le ralentissement (givre, pièges) est réappliqué à chaque image par sa source.
    z.slow = 0;
    z.x += z.vx * dt;
    z.y += z.vy * dt;

    // Les zombies se bousculent au lieu de se superposer.
    for (const o of state.zombies) {
      if (o === z) continue;
      const dx = z.x - o.x;
      const dy = z.y - o.y;
      const d = Math.hypot(dx, dy);
      const r = z.radius + o.radius;
      if (d < r && d > 0.001) {
        // Le boss pousse les autres sans bouger.
        const share = z.boss ? 0 : o.boss ? 1 : 0.5;
        const push = r - d;
        z.x += (dx / d) * push * share;
        z.y += (dy / d) * push * share;
        o.x -= (dx / d) * push * (1 - share);
        o.y -= (dy / d) * push * (1 - share);
      }
    }

    forTreesNear(state.trees, z.x, z.y, (tree) => {
      if (tree.state !== 'standing' || !pushOut(z, z.radius, tree.x, tree.y, tree.radius)) return;
      if (z.boss || z.kind === 'brute') {
        // Les boss et les brutes renversent les arbres sur leur passage.
        tree.state = 'falling';
        tree.timer = 0;
        tree.claimedBy = null;
        tree.golden = false;
        tree.fallDir = tree.x >= z.x ? 1 : -1;
        spawnBurst(state, tree.x, tree.y, 40, 8, 'leaf', FX_COLORS.leaves, 1);
        return;
      }
      // Les autres contournent l'arbre au lieu de rester coincés.
      const dx = z.x - tree.x;
      const dy = z.y - tree.y;
      const d = Math.hypot(dx, dy) || 1;
      const side = z.id % 2 === 0 ? 1 : -1;
      z.x += (-dy / d) * side * z.speed * dt * 0.8;
      z.y += (dx / d) * side * z.speed * dt * 0.8;
    });
    let blocker: Structure | null = null;
    for (const s of state.structures) {
      if (s.kind === 'trap') continue;
      if (pushOut(z, z.radius, s.x, s.y, s.radius) && !blocker) blocker = s;
      else if (!blocker && dist(z.x, z.y, s.x, s.y) < z.radius + s.radius + 2) blocker = s;
    }

    if (z.attackCooldown > 0 || spitting) continue;
    if (chaseSoldier && soldier && soldierDist - z.radius - 10 < ATTACK_GAP) {
      z.attackCooldown = ZOMBIE_ATTACK_INTERVAL;
      z.lunge = 1;
      damageUnit(state, soldier, z.damage);
    } else if (heroDist - z.radius - hero.radius < ATTACK_GAP) {
      z.attackCooldown = ZOMBIE_ATTACK_INTERVAL;
      z.lunge = 1;
      damageHero(state, z.damage);
    } else if (blocker) {
      z.attackCooldown = ZOMBIE_ATTACK_INTERVAL;
      z.lunge = 1;
      damageStructure(state, blocker, z.damage);
      if (isOver(state)) return;
    }
  }
}
