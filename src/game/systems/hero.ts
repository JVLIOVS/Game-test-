import {
  HERO_ACCEL,
  HERO_MAX_HP,
  HERO_REGEN,
  HERO_REGEN_DELAY,
  HERO_RESPAWN_TIME,
  HERO_SPEED,
} from '../constants';
import { FX_COLORS } from '../fxColors';
import type { GameState, PlayerInput } from '../types';
import { LAYOUT } from '../world/layout';
import { dist, gain, nextId, pushOut } from './common';
import { addTrauma, spawnBurst, spawnText } from './effects';

export function updateHeroMovement(state: GameState, input: PlayerInput, dt: number) {
  const hero = state.hero;
  if (hero.dead) {
    hero.vx = hero.vy = 0;
    return;
  }
  const k = 1 - Math.exp(-HERO_ACCEL * dt);
  hero.vx += (input.moveX * HERO_SPEED - hero.vx) * k;
  hero.vy += (input.moveY * HERO_SPEED - hero.vy) * k;
  hero.x += hero.vx * dt;
  hero.y += hero.vy * dt;

  const speed = Math.hypot(hero.vx, hero.vy);
  if (speed > 15) hero.walkTime += dt * (speed / HERO_SPEED);
  else hero.walkTime = 0;
  if (Math.abs(hero.vx) > 10 && hero.swingTime === 0) hero.dirX = hero.vx > 0 ? 1 : -1;

  for (const tree of state.trees) {
    if (tree.state === 'growing' && tree.timer < 0.3) continue;
    pushOut(hero, hero.radius, tree.x, tree.y, tree.state === 'stump' ? tree.radius * 0.8 : tree.radius);
  }
  // Le héros traverse sa propre palissade, mais pas les bâtiments.
  for (const s of state.structures) {
    if (s.kind !== 'wall') pushOut(hero, hero.radius, s.x, s.y, s.radius);
  }

  const { width, height } = state.map;
  hero.x = Math.min(width - hero.radius, Math.max(hero.radius, hero.x));
  hero.y = Math.min(height - hero.radius, Math.max(hero.radius, hero.y));
}

export function damageHero(state: GameState, amount: number) {
  const hero = state.hero;
  if (hero.dead) return;
  hero.hp -= amount;
  hero.hurtFlash = 1;
  hero.sinceHurt = 0;
  state.events.push({ type: 'heroHurt' });
  addTrauma(state, 0.25);
  spawnText(state, hero.x, hero.y - 50, `-${amount}`, FX_COLORS.textHurt);
  if (hero.hp > 0) return;

  // Mort : tout le bois porté reste dans un coffre, sur place.
  hero.hp = 0;
  hero.dead = true;
  hero.respawnTimer = HERO_RESPAWN_TIME;
  hero.swingTime = 0;
  hero.target = null;
  if (state.inventory.wood > 0) {
    state.chests.push({ id: nextId(state), x: hero.x, y: hero.y, wood: state.inventory.wood, age: 0 });
    state.inventory.wood = 0;
  }
  spawnBurst(state, hero.x, hero.y, 10, 16, 'dust', FX_COLORS.dust, 1.4);
  addTrauma(state, 0.6);
  state.events.push({ type: 'heroDied' });
}

export function updateHeroLife(state: GameState, dt: number) {
  const hero = state.hero;
  hero.hurtFlash = Math.max(0, hero.hurtFlash - dt * 5);

  if (hero.dead) {
    hero.respawnTimer -= dt;
    if (hero.respawnTimer <= 0) {
      hero.dead = false;
      hero.hp = hero.maxHp = HERO_MAX_HP;
      hero.x = state.base.x + LAYOUT.heroSpawn.x;
      hero.y = state.base.y + LAYOUT.heroSpawn.y;
      spawnBurst(state, hero.x, hero.y, 0, 10, 'dust', FX_COLORS.dust, 1);
    }
    return;
  }

  hero.sinceHurt += dt;
  if (hero.sinceHurt > HERO_REGEN_DELAY) hero.hp = Math.min(hero.maxHp, hero.hp + HERO_REGEN * dt);

  // Récupérer un coffre en marchant dessus.
  for (let i = state.chests.length - 1; i >= 0; i--) {
    const c = state.chests[i];
    c.age += dt;
    if (dist(hero.x, hero.y, c.x, c.y) < hero.radius + 18) {
      gain(state, 'wood', c.wood, c.x, c.y - 30);
      spawnBurst(state, c.x, c.y, 10, 14, 'confetti', FX_COLORS.confetti, 1);
      state.chests.splice(i, 1);
    }
  }
}
