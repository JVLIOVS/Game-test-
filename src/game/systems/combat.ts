import {
  ATTACK_REACH,
  AXE_DAMAGE,
  AXE_SPEED,
  HARVEST_REACH,
  SWING_COOLDOWN,
  SWING_DURATION,
  SWING_HIT_AT,
  BOSS_GEMS,
  BOSS_GEM_VALUE,
  BOSS_WOOD,
  ZOMBIE_WOOD_DROP,
} from '../constants';
import { damageMult } from '../data/perks';
import { FX_COLORS } from '../fxColors';
import type { GameState, Zombie } from '../types';
import { dist, gain } from './common';
import { addTrauma, spawnBurst, spawnText } from './effects';
import { dropGems } from './progression';
import { hitTree } from './trees';

export function damageZombie(state: GameState, z: Zombie, amount: number, fromX: number, fromY: number) {
  z.hp -= amount;
  z.hitFlash = 1;
  const d = dist(z.x, z.y, fromX, fromY) || 1;
  const knock = z.boss ? 40 : 260;
  z.vx += ((z.x - fromX) / d) * knock;
  z.vy += ((z.y - fromY) / d) * knock;
  spawnText(state, z.x, z.y - (z.boss ? 80 : 40), `${amount}`, z.boss ? FX_COLORS.textBoss : FX_COLORS.textDamage);
  spawnBurst(state, z.x, z.y, 20, 5, 'goo', FX_COLORS.goo, 0.8);
  state.events.push({ type: 'zombieHit' });
  if (z.hp > 0) return;

  const i = state.zombies.indexOf(z);
  if (i >= 0) state.zombies.splice(i, 1);
  state.stats.zombiesKilled++;
  if (z.boss) {
    const round = state.cycle.night;
    state.bossAlive = false;
    state.bossesKilled++;
    state.stats.bossesKilled++;
    spawnBurst(state, z.x, z.y, 30, 40, 'goo', FX_COLORS.goo, 2);
    spawnBurst(state, z.x, z.y, 30, 30, 'confetti', FX_COLORS.confetti, 1.8);
    spawnBurst(state, z.x, z.y, 0, 14, 'dust', FX_COLORS.dust, 2);
    addTrauma(state, 0.9);
    dropGems(state, z.x, z.y, BOSS_GEMS, BOSS_GEM_VALUE);
    gain(state, 'wood', BOSS_WOOD(round), z.x, z.y - 90);
    state.events.push({ type: 'bossKilled', round });
    return;
  }
  spawnBurst(state, z.x, z.y, 15, 16, 'goo', FX_COLORS.goo, 1.3);
  spawnBurst(state, z.x, z.y, 0, 6, 'dust', FX_COLORS.dust, 1);
  addTrauma(state, 0.18);
  dropGems(state, z.x, z.y, 1, 1);
  if (Math.random() < 0.5) gain(state, 'wood', ZOMBIE_WOOD_DROP, z.x, z.y - 60);
  state.events.push({ type: 'zombieKilled' });
}

/** Le héros frappe automatiquement : les zombies d'abord, sinon l'arbre le plus proche. */
export function updateHeroActions(state: GameState, dt: number) {
  const hero = state.hero;
  if (hero.dead) return;
  const speed = AXE_SPEED[hero.axeLevel];
  hero.swingCooldown = Math.max(0, hero.swingCooldown - dt);

  if (hero.swingTime > 0) {
    hero.swingTime += dt * speed;
    if (!hero.swingHitDone && hero.swingTime >= SWING_HIT_AT) {
      hero.swingHitDone = true;
      const target = hero.target;
      if (target?.kind === 'zombie') {
        const z = state.zombies.find((zz) => zz.id === target.id);
        if (z && dist(hero.x, hero.y, z.x, z.y) - z.radius - hero.radius < ATTACK_REACH + 12) {
          damageZombie(state, z, Math.round(AXE_DAMAGE[hero.axeLevel] * damageMult(state)), hero.x, hero.y);
        }
      } else if (target?.kind === 'tree') {
        const tree = state.trees.find((t) => t.id === target.id);
        if (tree && tree.state === 'standing') hitTree(state, tree);
      }
    }
    if (hero.swingTime >= SWING_DURATION) {
      hero.swingTime = 0;
      hero.swingCooldown = SWING_COOLDOWN / speed;
      hero.target = null;
    }
    return;
  }
  if (hero.swingCooldown > 0) return;

  let best: { kind: 'tree' | 'zombie'; id: number; x: number } | null = null;
  let bestDist = Infinity;
  for (const z of state.zombies) {
    const d = dist(hero.x, hero.y, z.x, z.y) - z.radius - hero.radius;
    if (d < ATTACK_REACH && d < bestDist) {
      best = { kind: 'zombie', id: z.id, x: z.x };
      bestDist = d;
    }
  }
  if (!best) {
    for (const tree of state.trees) {
      if (tree.state !== 'standing') continue;
      const d = dist(hero.x, hero.y, tree.x, tree.y) - tree.radius - hero.radius;
      if (d < HARVEST_REACH && d < bestDist) {
        best = { kind: 'tree', id: tree.id, x: tree.x };
        bestDist = d;
      }
    }
  }
  if (best) {
    hero.swingTime = 0.0001;
    hero.swingHitDone = false;
    hero.target = { kind: best.kind, id: best.id };
    hero.dirX = best.x >= hero.x ? 1 : -1;
  }
}
