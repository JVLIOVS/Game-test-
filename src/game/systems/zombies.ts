import {
  BOSS_RADIUS,
  bossStats,
  ZOMBIE_AGGRO_RANGE,
  ZOMBIE_ATTACK_INTERVAL,
  ZOMBIE_RADIUS,
  zombieWave,
} from '../constants';
import { fxRandom } from '../rng';
import type { GameState, Structure } from '../types';
import { damageStructure, getHouse } from './build';
import { dist, nextId, pushOut } from './common';
import { damageHero } from './hero';

const ATTACK_GAP = 8;

function edgePoint(state: GameState) {
  const { width, height } = state.map;
  const side = Math.floor(Math.random() * 4);
  const along = Math.random();
  const x = side === 0 ? along * width : side === 1 ? width - 20 : side === 2 ? along * width : 20;
  const y = side === 0 ? 20 : side === 1 ? along * height : side === 2 ? height - 20 : along * height;
  return { x, y };
}

/** Le boss arrive du côté le plus proche du héros, pour qu'on le voie venir. */
export function spawnBoss(state: GameState, round: number) {
  const st = bossStats(round);
  const { width, height } = state.map;
  const hx = state.hero.x;
  const hy = state.hero.y;
  const candidates = [
    { x: hx, y: 30, d: hy },
    { x: hx, y: height - 30, d: height - hy },
    { x: 30, y: hy, d: hx },
    { x: width - 30, y: hy, d: width - hx },
  ].sort((a, b) => a.d - b.d);
  const { x, y } = candidates[0];
  state.bossAlive = true;
  state.zombies.push({
    id: nextId(state),
    x,
    y,
    vx: 0,
    vy: 0,
    radius: BOSS_RADIUS,
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
    orbitCooldown: 0,
  });
}

export function spawnZombie(state: GameState, night: number) {
  const wave = zombieWave(night);
  const { x, y } = edgePoint(state);
  state.zombies.push({
    id: nextId(state),
    x,
    y,
    vx: 0,
    vy: 0,
    radius: ZOMBIE_RADIUS,
    hp: wave.hp,
    maxHp: wave.hp,
    speed: wave.speed * fxRandom(0.9, 1.1),
    damage: wave.damage,
    attackCooldown: ZOMBIE_ATTACK_INTERVAL,
    lunge: 0,
    hitFlash: 0,
    walkTime: Math.random() * 10,
    variant: Math.floor(Math.random() * 3),
    boss: false,
    orbitCooldown: 0,
  });
}

export function updateZombies(state: GameState, dt: number) {
  const hero = state.hero;
  const house = getHouse(state);
  const k = 1 - Math.exp(-6 * dt);

  for (const z of state.zombies) {
    z.hitFlash = Math.max(0, z.hitFlash - dt * 5);
    z.lunge = Math.max(0, z.lunge - dt * 4);
    z.attackCooldown -= dt;
    z.walkTime += dt;

    const heroDist = hero.dead ? Infinity : dist(z.x, z.y, hero.x, hero.y);
    const target = heroDist < ZOMBIE_AGGRO_RANGE ? hero : house;
    if (target) {
      const d = dist(z.x, z.y, target.x, target.y) || 1;
      z.vx += (((target.x - z.x) / d) * z.speed - z.vx) * k;
      z.vy += (((target.y - z.y) / d) * z.speed - z.vy) * k;
    }
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

    for (const tree of state.trees) {
      if (tree.state === 'standing') pushOut(z, z.radius, tree.x, tree.y, tree.radius);
    }
    let blocker: Structure | null = null;
    for (const s of state.structures) {
      if (pushOut(z, z.radius, s.x, s.y, s.radius) && !blocker) blocker = s;
      else if (!blocker && dist(z.x, z.y, s.x, s.y) < z.radius + s.radius + 2) blocker = s;
    }

    if (z.attackCooldown > 0) continue;
    if (heroDist - z.radius - hero.radius < ATTACK_GAP) {
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
