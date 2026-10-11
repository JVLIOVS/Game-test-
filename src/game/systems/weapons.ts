import { ARROW_SPEED } from '../constants';
import { PERK_VALUES, damageMult } from '../data/perks';
import { FX_COLORS } from '../fxColors';
import type { GameState, Zombie } from '../types';
import { damageZombie } from './combat';
import { dist } from './common';
import { addTrauma, spawnBurst } from './effects';

const BOW_RANGE = 280;
const BOMB_RANGE = 300;
const LIGHTNING_RANGE = 340;
const ORBIT_HIT_COOLDOWN = 0.45;
const ORBIT_SPIN = 3.6; // tours par seconde × 2π

function nearestZombies(state: GameState, x: number, y: number, range: number, count: number): Zombie[] {
  return state.zombies
    .map((z) => ({ z, d: dist(x, y, z.x, z.y) }))
    .filter((e) => e.d < range)
    .sort((a, b) => a.d - b.d)
    .slice(0, count)
    .map((e) => e.z);
}

/** Positions des haches tournoyantes autour du héros. */
export function orbitPositions(state: GameState) {
  const n = PERK_VALUES.orbit.count[state.perks.orbit];
  const out: { x: number; y: number; angle: number }[] = [];
  const hero = state.hero;
  for (let i = 0; i < n; i++) {
    const a = state.weaponTimers.orbitAngle + (i / n) * Math.PI * 2;
    out.push({ x: hero.x + Math.cos(a) * PERK_VALUES.orbit.radius, y: hero.y - 20 + Math.sin(a) * PERK_VALUES.orbit.radius * 0.75, angle: a });
  }
  return out;
}

export function updateWeapons(state: GameState, dt: number) {
  const hero = state.hero;
  const p = state.perks;
  const timers = state.weaponTimers;
  const mult = damageMult(state);
  timers.orbitAngle += dt * ORBIT_SPIN;
  for (const z of state.zombies) z.orbitCooldown = Math.max(0, z.orbitCooldown - dt);
  const armed = !hero.dead;

  // Arc : flèches à tête chercheuse sur les zombies les plus proches.
  if (armed && p.bow > 0) {
    timers.bow -= dt;
    if (timers.bow <= 0) {
      const targets = nearestZombies(state, hero.x, hero.y, BOW_RANGE, PERK_VALUES.bow.arrows[p.bow]);
      if (targets.length) {
        timers.bow = PERK_VALUES.bow.interval[p.bow];
        for (const z of targets) {
          const sx = hero.x;
          const sy = hero.y - 30;
          const d = dist(sx, sy, z.x, z.y - 20) || 1;
          state.projectiles.push({
            x: sx,
            y: sy,
            vx: ((z.x - sx) / d) * ARROW_SPEED,
            vy: ((z.y - 20 - sy) / d) * ARROW_SPEED,
            life: 1.2,
            damage: Math.round(PERK_VALUES.bow.damage * mult),
            targetId: z.id,
          });
        }
      }
    }
  }

  // Haches tournoyantes : touchent tout ce qu'elles croisent.
  if (armed && p.orbit > 0) {
    const damage = Math.round(PERK_VALUES.orbit.damage[p.orbit] * mult);
    for (const o of orbitPositions(state)) {
      for (const z of [...state.zombies]) {
        if (z.orbitCooldown > 0) continue;
        if (dist(o.x, o.y, z.x, z.y - 20) < z.radius + 16) {
          z.orbitCooldown = ORBIT_HIT_COOLDOWN;
          damageZombie(state, z, damage, hero.x, hero.y);
        }
      }
    }
  }

  // Bombes : lancées en cloche sur un zombie, explosion de zone.
  if (armed && p.bomb > 0) {
    timers.bomb -= dt;
    if (timers.bomb <= 0) {
      const [z] = nearestZombies(state, hero.x, hero.y, BOMB_RANGE, 1);
      if (z) {
        timers.bomb = PERK_VALUES.bomb.interval[p.bomb];
        state.bombs.push({
          fromX: hero.x,
          fromY: hero.y - 30,
          toX: z.x + z.vx * 0.5,
          toY: z.y + z.vy * 0.5,
          t: 0,
          duration: 0.55,
          radius: PERK_VALUES.bomb.radius[p.bomb],
          damage: Math.round(PERK_VALUES.bomb.damage[p.bomb] * mult),
        });
      }
    }
  }
  for (let i = state.bombs.length - 1; i >= 0; i--) {
    const b = state.bombs[i];
    b.t += dt / b.duration;
    if (b.t < 1) continue;
    state.bombs.splice(i, 1);
    for (const z of [...state.zombies]) {
      if (dist(b.toX, b.toY, z.x, z.y) < b.radius + z.radius) damageZombie(state, z, b.damage, b.toX, b.toY);
    }
    spawnBurst(state, b.toX, b.toY, 10, 22, 'goo', FX_COLORS.fire, 1.5);
    spawnBurst(state, b.toX, b.toY, 0, 10, 'dust', FX_COLORS.dust, 1.6);
    addTrauma(state, 0.3);
    state.events.push({ type: 'bombExploded' });
  }

  // Éclair : frappe au hasard les zombies à portée.
  if (armed && p.lightning > 0) {
    timers.lightning -= dt;
    if (timers.lightning <= 0) {
      const inRange = state.zombies.filter((z) => dist(hero.x, hero.y, z.x, z.y) < LIGHTNING_RANGE);
      if (inRange.length) {
        timers.lightning = PERK_VALUES.lightning.interval[p.lightning];
        const count = Math.min(inRange.length, PERK_VALUES.lightning.strikes[p.lightning]);
        for (let k = 0; k < count; k++) {
          const z = inRange.splice(Math.floor(Math.random() * inRange.length), 1)[0];
          state.bolts.push({ x: z.x, y: z.y, life: 0.25, seed: Math.random() * 1000 });
          spawnBurst(state, z.x, z.y, 5, 6, 'goo', ['#FFFFFF', '#BFE9FF', '#FFE14D'], 1);
          damageZombie(state, z, Math.round(PERK_VALUES.lightning.damage * mult), z.x, z.y - 1);
        }
        addTrauma(state, 0.15);
        state.events.push({ type: 'lightning' });
      }
    }
  }
  for (let i = state.bolts.length - 1; i >= 0; i--) {
    state.bolts[i].life -= dt;
    if (state.bolts[i].life <= 0) state.bolts.splice(i, 1);
  }
}
