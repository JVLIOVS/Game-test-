import {
  ARROW_SPEED,
  CATAPULT_DAMAGE,
  CATAPULT_INTERVAL,
  CATAPULT_RANGE,
  TOWER_DAMAGE,
  TOWER_FIRE_INTERVAL,
  TOWER_RANGE,
  TRAP_DPS,
} from '../constants';
import { damageMult } from '../data/equipment';
import { PERK_VALUES, perkPhase, starDamage } from '../data/perks';
import type { GameState, Zombie } from '../types';
import { damageZombie } from './combat';
import { dist } from './common';
import { explode } from './weapons';

const TOWER_TOP = 58;

// Tours : 3 niveaux bien différents.
// 1. Tour d'archer en bois : une flèche.
// 2. Tour de pierre avec baliste : 2 carreaux, plus de dégâts et de portée.
// 3. Tour de cristal : orbes magiques qui explosent, très longue portée.
const LEVEL = [
  null,
  { shots: 1, damage: 1, range: 0, splash: 0, interval: 1 },
  { shots: 2, damage: 1.6, range: 40, splash: 0, interval: 0.85 },
  { shots: 2, damage: 2.4, range: 90, splash: 55, interval: 0.75 },
] as const;

/** Portée d'une tour selon son niveau (pour l'affichage aussi). */
export const towerRange = (level: number) => TOWER_RANGE + (LEVEL[Math.min(3, level)]?.range ?? 0);

function targetsFrom(state: GameState, x: number, y: number, range: number, count: number, minRange = 0): Zombie[] {
  return state.zombies
    .map((z) => ({ z, d: dist(x, y, z.x, z.y) }))
    .filter((e) => e.d < range && e.d >= minRange)
    .sort((a, b) => a.d - b.d)
    .slice(0, count)
    .map((e) => e.z);
}

let trapTick = 0;

export function updateTowers(state: GameState, dt: number) {
  const eng = perkPhase(state.perks.engineer);
  const engArrows = PERK_VALUES.engineer.arrows[eng] - 1;
  const explosive = PERK_VALUES.engineer.explosive[eng] > 0;
  const baseDamage = TOWER_DAMAGE * PERK_VALUES.engineer.towerDamage[eng] * damageMult(state) * starDamage(state.perks.engineer);
  const worldBoost = 1 + 0.35 * state.world;

  trapTick += dt;
  const trapNow = trapTick >= 0.25;
  if (trapNow) trapTick = 0;

  for (const s of state.structures) {
    if (s.kind === 'trap') {
      // Pièges à pointes : blessent et ralentissent ce qui marche dessus.
      if (!trapNow) continue;
      for (const z of [...state.zombies]) {
        if (dist(s.x, s.y, z.x, z.y) > s.radius + z.radius) continue;
        z.slow = Math.max(z.slow, 0.35);
        damageZombie(state, z, Math.max(1, Math.round(TRAP_DPS * worldBoost * 0.25)), s.x, s.y, 0);
      }
      continue;
    }

    if (s.kind === 'catapult') {
      s.cooldown -= dt;
      if (s.cooldown > 0) continue;
      const [z] = targetsFrom(state, s.x, s.y, CATAPULT_RANGE, 1, 120);
      if (!z) continue;
      s.cooldown = CATAPULT_INTERVAL;
      state.bombs.push({
        fromX: s.x,
        fromY: s.y - 40,
        toX: z.x + z.vx * 0.9,
        toY: z.y + z.vy * 0.9,
        t: 0,
        duration: 0.95,
        radius: 75,
        damage: Math.round(CATAPULT_DAMAGE * worldBoost * damageMult(state)),
        phase: 1,
        cluster: 0,
        boulder: true,
      });
      continue;
    }

    if (s.kind !== 'tower') continue;
    const lv = LEVEL[Math.min(3, s.level)]!;
    s.cooldown -= dt;
    if (s.cooldown > 0) continue;
    const targets = targetsFrom(state, s.x, s.y, towerRange(s.level), lv.shots + engArrows);
    if (!targets.length) continue;
    s.cooldown = TOWER_FIRE_INTERVAL * lv.interval;
    const style = s.level >= 3 ? 'magic' : explosive ? 'cannon' : s.level >= 2 ? 'bolt' : 'tower';
    for (const z of targets) {
      const sx = s.x;
      const sy = s.y - TOWER_TOP - (s.level - 1) * 12;
      const d = dist(sx, sy, z.x, z.y - 20) || 1;
      state.projectiles.push({
        x: sx,
        y: sy,
        vx: ((z.x - sx) / d) * ARROW_SPEED,
        vy: ((z.y - 20 - sy) / d) * ARROW_SPEED,
        life: 1.3,
        damage: Math.round(baseDamage * lv.damage * worldBoost),
        targetId: z.id,
        style,
        splash: Math.max(lv.splash, explosive ? 45 : 0),
      });
    }
  }

  const ps = state.projectiles;
  for (let i = ps.length - 1; i >= 0; i--) {
    const p = ps[i];
    p.life -= dt;
    const target = state.zombies.find((z) => z.id === p.targetId);
    if (target) {
      // Tête chercheuse : toujours un coup au but, c'est plus satisfaisant.
      const d = dist(p.x, p.y, target.x, target.y - 20) || 1;
      p.vx = ((target.x - p.x) / d) * ARROW_SPEED;
      p.vy = ((target.y - 20 - p.y) / d) * ARROW_SPEED;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (target && dist(p.x, p.y, target.x, target.y - 20) < target.radius + 6) {
      ps.splice(i, 1);
      if (p.splash > 0) explode(state, target.x, target.y, p.splash, Math.round(p.damage * 0.5), false);
      if (state.zombies.includes(target)) damageZombie(state, target, p.damage, p.x - p.vx * 0.05, p.y - p.vy * 0.05);
    } else if (p.life <= 0) {
      ps.splice(i, 1);
    }
  }
}
