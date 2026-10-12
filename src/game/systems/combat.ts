import {
  AXE_SPEED,
  BOSS_GEMS,
  BOSS_GEM_VALUE,
  BOSS_WOOD,
  HARVEST_REACH,
  SWING_COOLDOWN,
  SWING_DURATION,
  SWING_HIT_AT,
  ZOMBIE_WOOD_DROP,
} from '../constants';
import { damageMult } from '../data/equipment';
import { WEAPONS, forgeMult } from '../data/weapons';
import { FX_COLORS } from '../fxColors';
import type { GameState, Zombie } from '../types';
import { dist, gain, nextId } from './common';
import { addTrauma, spawnBurst, spawnText } from './effects';
import { dropGems } from './progression';
import { hitTree } from './trees';
import { onZombieDeath } from './weapons';
import { hitAnimal } from './animals';

export function damageZombie(state: GameState, z: Zombie, amount: number, fromX: number, fromY: number, knockback = 260, crit = false) {
  z.hp -= amount;
  z.hitFlash = 1;
  const d = dist(z.x, z.y, fromX, fromY) || 1;
  const knock = z.boss ? knockback * 0.15 : knockback;
  z.vx += ((z.x - fromX) / d) * knock;
  z.vy += ((z.y - fromY) / d) * knock;
  if (knockback > 0 || crit || amount >= 10) spawnText(state, z.x, z.y - (z.boss ? 80 : 40), crit ? `${amount}!` : `${amount}`, crit ? FX_COLORS.textCrit : z.boss ? FX_COLORS.textBoss : FX_COLORS.textDamage, { size: crit ? 1.35 : 1 });
  spawnBurst(state, z.x, z.y, 20, 5, 'goo', FX_COLORS.goo, 0.8);
  state.events.push({ type: 'zombieHit' });
  if (z.hp > 0) return;

  const i = state.zombies.indexOf(z);
  if (i < 0) return;
  state.zombies.splice(i, 1);
  onZombieDeath(state, z);
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
  if (z.golden) {
    // Le zombie doré lâche un coffre d'arme.
    state.chests.push({ id: nextId(state), x: z.x, y: z.y, wood: 0, age: 0, kind: 'weapon', fall: 0 });
    dropGems(state, z.x, z.y, 6, 2);
    spawnBurst(state, z.x, z.y, 20, 24, 'confetti', FX_COLORS.confetti, 1.5);
    addTrauma(state, 0.4);
    state.events.push({ type: 'zombieKilled' });
    return;
  }
  spawnBurst(state, z.x, z.y, 15, 16, 'goo', FX_COLORS.goo, 1.3);
  spawnBurst(state, z.x, z.y, 0, 6, 'dust', FX_COLORS.dust, 1);
  addTrauma(state, 0.18);
  dropGems(state, z.x, z.y, 1, 1);
  if (Math.random() < 0.5) gain(state, 'wood', ZOMBIE_WOOD_DROP, z.x, z.y - 60);
  state.events.push({ type: 'zombieKilled' });
}

/** Coup de l'arme principale : chaque type a sa façon de toucher. */
function strike(state: GameState, target: Zombie) {
  const hero = state.hero;
  const w = hero.weapon;
  const def = WEAPONS[w.type];
  const base = def.damage * forgeMult(w.forge) * damageMult(state);
  const angle = Math.atan2(target.y - hero.y, target.x - hero.x);
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const hit = (z: Zombie, fromX = hero.x, fromY = hero.y) => {
    const crit = Math.random() < def.crit;
    if (crit) state.events.push({ type: 'crit' });
    damageZombie(state, z, Math.round(base * (crit ? 2.2 : 1)), fromX, fromY, def.knockback, crit);
  };
  const fx = (x: number, y: number, size: number, life: number) =>
    state.slashes.push({ x, y, angle, kind: w.type, life, maxLife: life, size });

  switch (w.type) {
    case 'sword': {
      // Large arc : tous les zombies devant le héros.
      const reach = def.reach + hero.radius + 14 + w.forge * 2;
      for (const z of [...state.zombies]) {
        const zx = z.x - hero.x;
        const zy = z.y - hero.y;
        const d = Math.hypot(zx, zy);
        if (d - z.radius < reach && (zx * dx + zy * dy) / (d || 1) > -0.2) hit(z);
      }
      fx(hero.x, hero.y - 22, reach, 0.2);
      break;
    }
    case 'spear': {
      // Estoc : transperce toute la ligne.
      const len = def.reach + hero.radius + 30 + w.forge * 4;
      for (const z of [...state.zombies]) {
        const zx = z.x - hero.x;
        const zy = z.y - hero.y;
        const along = zx * dx + zy * dy;
        const across = Math.abs(zx * dy - zy * dx);
        if (along > -5 && along < len + z.radius && across < z.radius + 12) hit(z);
      }
      fx(hero.x, hero.y - 22, len, 0.16);
      break;
    }
    case 'hammer': {
      // Frappe au sol : onde de choc tout autour du point d'impact.
      const ix = hero.x + dx * 28;
      const iy = hero.y + dy * 22;
      const radius = 62 + w.forge * 5;
      for (const z of [...state.zombies]) if (dist(ix, iy, z.x, z.y) < radius + z.radius) hit(z, ix, iy);
      fx(ix, iy, radius, 0.35);
      spawnBurst(state, ix, iy, 0, 12, 'dust', FX_COLORS.dust, 1.6);
      addTrauma(state, 0.28);
      break;
    }
    case 'daggers': {
      // Rafale rapide sur une seule cible, souvent critique.
      hit(target);
      hero.comboSide = -hero.comboSide;
      fx(target.x, target.y - 20, 16, 0.12);
      break;
    }
  }
}

/** Le héros frappe automatiquement : les zombies d'abord (arme principale), sinon l'arbre le plus proche (hache). */
export function updateHeroActions(state: GameState, dt: number) {
  const hero = state.hero;
  if (hero.dead) return;
  hero.swingCooldown = Math.max(0, hero.swingCooldown - dt);
  const fighting = hero.target?.kind === 'zombie' || hero.target?.kind === 'animal';
  const speed = fighting ? WEAPONS[hero.weapon.type].speed : AXE_SPEED[hero.axeLevel];

  if (hero.swingTime > 0) {
    hero.swingTime += dt * speed;
    if (!hero.swingHitDone && hero.swingTime >= SWING_HIT_AT) {
      hero.swingHitDone = true;
      const target = hero.target;
      if (target?.kind === 'zombie') {
        const z = state.zombies.find((zz) => zz.id === target.id);
        const reach = WEAPONS[hero.weapon.type].reach;
        if (z && dist(hero.x, hero.y, z.x, z.y) - z.radius - hero.radius < reach + 14) strike(state, z);
      } else if (target?.kind === 'tree') {
        const tree = state.trees.find((t) => t.id === target.id);
        if (tree && tree.state === 'standing') hitTree(state, tree);
      } else if (target?.kind === 'animal') {
        const a = state.animals.find((an) => an.id === target.id);
        if (a && dist(hero.x, hero.y, a.x, a.y) < hero.radius + 50) hitAnimal(state, a, true);
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

  const reach = WEAPONS[hero.weapon.type].reach;
  let best: { kind: 'tree' | 'zombie' | 'animal'; id: number; x: number } | null = null;
  let bestDist = Infinity;
  for (const z of state.zombies) {
    const d = dist(hero.x, hero.y, z.x, z.y) - z.radius - hero.radius;
    if (d < reach && d < bestDist) {
      best = { kind: 'zombie', id: z.id, x: z.x };
      bestDist = d;
    }
  }
  if (!best) {
    for (const a of state.animals) {
      const d = dist(hero.x, hero.y, a.x, a.y) - hero.radius;
      if (d < 34 && d < bestDist) {
        best = { kind: 'animal', id: a.id, x: a.x };
        bestDist = d;
      }
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

export function updateSlashes(state: GameState, dt: number) {
  for (let i = state.slashes.length - 1; i >= 0; i--) {
    state.slashes[i].life -= dt;
    if (state.slashes[i].life <= 0) state.slashes.splice(i, 1);
  }
}
