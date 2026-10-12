import {
  bossStats,
  ZOMBIE_AGGRO_RANGE,
  ZOMBIE_ATTACK_INTERVAL,
  ZOMBIE_RADIUS,
  zombieWave,
} from '../constants';
import { fxRandom } from '../rng';
import type { GameState, Structure, Unit, Zombie, ZombieKind } from '../types';
import { forTreesNear } from '../world/grid';
import { damageStructure, getHouse } from './build';
import { dist, nextId, pushOut } from './common';
import { damageHero } from './hero';
import { damageUnit } from './units';
import { FX_COLORS } from '../fxColors';
import { spawnBurst } from './effects';

const ATTACK_GAP = 8;
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
    hp: st.hp,
    maxHp: st.hp,
    speed: st.speed,
    damage: st.damage,
    attackCooldown: ZOMBIE_ATTACK_INTERVAL,
    lunge: 0,
    hitFlash: 0,
    walkTime: 0,
    variant: 0,
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
};

/** Composition des vagues : coureurs à partir de la nuit 2, brutes à partir de la nuit 3. */
function pickKind(night: number): ZombieKind {
  const r = Math.random();
  if (night >= 3 && r < 0.12 + Math.min(0.1, night * 0.01)) return 'brute';
  if (night >= 2 && r < 0.4) return 'runner';
  return 'walker';
}

export function spawnZombie(state: GameState, night: number, at?: { x: number; y: number }, kind: ZombieKind = pickKind(night)) {
  const wave = zombieWave(night, state.world);
  const k = KIND_STATS[kind];
  const { x, y } = at ?? spawnPoint(state);
  const hp = Math.round(wave.hp * k.hp);
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
    if (target) {
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

    if (z.attackCooldown > 0) continue;
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
      if (state.status === 'gameover') return;
    }
  }
}
