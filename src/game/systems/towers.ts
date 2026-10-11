import { ARROW_SPEED, TOWER_DAMAGE, TOWER_FIRE_INTERVAL, TOWER_RANGE } from '../constants';
import { damageMult } from '../data/equipment';
import { PERK_VALUES, perkPhase, starDamage } from '../data/perks';
import type { GameState, Zombie } from '../types';
import { damageZombie } from './combat';
import { dist } from './common';
import { explode } from './weapons';

const TOWER_TOP = 58;

export function updateTowers(state: GameState, dt: number) {
  const eng = perkPhase(state.perks.engineer);
  const shots = PERK_VALUES.engineer.arrows[eng];
  const explosive = PERK_VALUES.engineer.explosive[eng] > 0;
  const damage = Math.round(TOWER_DAMAGE * PERK_VALUES.engineer.towerDamage[eng] * damageMult(state) * starDamage(state.perks.engineer));

  for (const s of state.structures) {
    if (s.kind !== 'tower') continue;
    s.cooldown -= dt;
    if (s.cooldown > 0) continue;
    const targets: Zombie[] = state.zombies
      .map((z) => ({ z, d: dist(s.x, s.y, z.x, z.y) }))
      .filter((e) => e.d < TOWER_RANGE)
      .sort((a, b) => a.d - b.d)
      .slice(0, shots)
      .map((e) => e.z);
    if (!targets.length) continue;
    s.cooldown = TOWER_FIRE_INTERVAL;
    for (const z of targets) {
      const sx = s.x;
      const sy = s.y - TOWER_TOP;
      const d = dist(sx, sy, z.x, z.y - 20) || 1;
      state.projectiles.push({
        x: sx,
        y: sy,
        vx: ((z.x - sx) / d) * ARROW_SPEED,
        vy: ((z.y - 20 - sy) / d) * ARROW_SPEED,
        life: 1.2,
        damage,
        targetId: z.id,
        style: explosive ? 'cannon' : 'tower',
        splash: explosive ? 45 : 0,
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
