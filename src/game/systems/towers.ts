import { ARROW_SPEED, TOWER_DAMAGE, TOWER_FIRE_INTERVAL, TOWER_RANGE } from '../constants';
import { PERK_VALUES, damageMult } from '../data/perks';
import type { GameState } from '../types';
import { damageZombie } from './combat';
import { dist } from './common';

const TOWER_TOP = 58;

export function updateTowers(state: GameState, dt: number) {
  for (const s of state.structures) {
    if (s.kind !== 'tower') continue;
    s.cooldown -= dt;
    if (s.cooldown > 0) continue;
    let best = null;
    let bestDist = TOWER_RANGE;
    for (const z of state.zombies) {
      const d = dist(s.x, s.y, z.x, z.y);
      if (d < bestDist) {
        best = z;
        bestDist = d;
      }
    }
    if (!best) continue;
    s.cooldown = TOWER_FIRE_INTERVAL / PERK_VALUES.architect.towerRate[state.perks.architect];
    const sx = s.x;
    const sy = s.y - TOWER_TOP;
    const d = dist(sx, sy, best.x, best.y - 20) || 1;
    state.projectiles.push({
      x: sx,
      y: sy,
      vx: ((best.x - sx) / d) * ARROW_SPEED,
      vy: ((best.y - 20 - sy) / d) * ARROW_SPEED,
      life: 1.2,
      damage: Math.round(TOWER_DAMAGE * damageMult(state)),
      targetId: best.id,
    });
  }

  const ps = state.projectiles;
  for (let i = ps.length - 1; i >= 0; i--) {
    const p = ps[i];
    p.life -= dt;
    const target = state.zombies.find((z) => z.id === p.targetId);
    if (target) {
      // Flèche à tête chercheuse : toujours un coup au but, c'est plus satisfaisant.
      const d = dist(p.x, p.y, target.x, target.y - 20) || 1;
      p.vx = ((target.x - p.x) / d) * ARROW_SPEED;
      p.vy = ((target.y - 20 - p.y) / d) * ARROW_SPEED;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (target && dist(p.x, p.y, target.x, target.y - 20) < target.radius + 6) {
      damageZombie(state, target, p.damage, p.x - p.vx * 0.05, p.y - p.vy * 0.05);
      ps.splice(i, 1);
    } else if (p.life <= 0) {
      ps.splice(i, 1);
    }
  }
}
