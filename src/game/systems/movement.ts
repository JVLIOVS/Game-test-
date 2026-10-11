import { HERO_ACCEL, HERO_SPEED } from '../constants';
import type { GameState, PlayerInput } from '../types';

export function updateHeroMovement(state: GameState, input: PlayerInput, dt: number) {
  const hero = state.hero;
  const targetVx = input.moveX * HERO_SPEED;
  const targetVy = input.moveY * HERO_SPEED;
  const k = 1 - Math.exp(-HERO_ACCEL * dt);
  hero.vx += (targetVx - hero.vx) * k;
  hero.vy += (targetVy - hero.vy) * k;

  hero.x += hero.vx * dt;
  hero.y += hero.vy * dt;

  const speed = Math.hypot(hero.vx, hero.vy);
  if (speed > 15) hero.walkTime += dt * (speed / HERO_SPEED);
  else hero.walkTime = 0;
  if (Math.abs(hero.vx) > 10 && hero.swingTime === 0) hero.dirX = hero.vx > 0 ? 1 : -1;

  // Collisions avec les troncs (et souches).
  for (const tree of state.zone.trees) {
    if (tree.state === 'growing' && tree.timer < 0.3) continue;
    const r = hero.radius + (tree.state === 'stump' ? tree.radius * 0.8 : tree.radius);
    const dx = hero.x - tree.x;
    const dy = hero.y - tree.y;
    const d = Math.hypot(dx, dy);
    if (d < r && d > 0.0001) {
      hero.x = tree.x + (dx / d) * r;
      hero.y = tree.y + (dy / d) * r;
    }
  }

  // Bords du micro-monde (plus tard : sortie vers la zone voisine).
  const { width, height } = state.zone.def;
  hero.x = Math.min(width - hero.radius, Math.max(hero.radius, hero.x));
  hero.y = Math.min(height - hero.radius, Math.max(hero.radius, hero.y));
}
