import { FX_COLORS } from '../fxColors';
import type { Animal, AnimalKind, GameState } from '../types';
import { dist, gain, nextId, pushOut } from './common';
import { spawnBurst, spawnText } from './effects';
import { forTreesNear } from '../world/grid';

// Animaux de la forêt : on les chasse pour la nourriture.
// Lapin (rapide, peu de viande), cerf, sanglier (plus de viande, plus solide).

const MAX_ANIMALS = 16;
const RESPAWN = 6;
const MIN_DIST_FROM_BASE = 520;
const FLEE_RANGE = 130;

export const ANIMALS: Record<AnimalKind, { hp: number; speed: number; food: number; radius: number }> = {
  rabbit: { hp: 1, speed: 150, food: 2, radius: 9 },
  deer: { hp: 3, speed: 125, food: 5, radius: 14 },
  boar: { hp: 5, speed: 95, food: 8, radius: 15 },
};

function spawnAnimal(state: GameState) {
  const { map, base } = state;
  for (let tries = 0; tries < 20; tries++) {
    const x = 80 + Math.random() * (map.width - 160);
    const y = 80 + Math.random() * (map.height - 160);
    if (dist(x, y, base.x, base.y) < MIN_DIST_FROM_BASE) continue;
    const r = Math.random();
    const kind: AnimalKind = r < 0.5 ? 'rabbit' : r < 0.82 ? 'deer' : 'boar';
    state.animals.push({
      id: nextId(state),
      kind,
      x,
      y,
      vx: 0,
      vy: 0,
      hp: ANIMALS[kind].hp,
      heading: Math.random() * Math.PI * 2,
      timer: Math.random() * 3,
      walkTime: 0,
      dirX: 1,
      hitFlash: 0,
      claimedBy: null,
    });
    return;
  }
}

/** Un coup sur un animal ; renvoie la nourriture obtenue s'il meurt. */
export function hitAnimal(state: GameState, a: Animal, byHero: boolean): number {
  a.hp -= 1;
  a.hitFlash = 1;
  a.timer = 0;
  if (a.hp > 0) return 0;
  state.animals.splice(state.animals.indexOf(a), 1);
  spawnBurst(state, a.x, a.y, 10, 8, 'dust', FX_COLORS.dust, 0.9);
  const food = ANIMALS[a.kind].food;
  state.events.push({ type: 'animalKilled' });
  if (byHero) gain(state, 'food', food, a.x, a.y - 30);
  else spawnText(state, a.x, a.y - 30, `+${food}`, FX_COLORS.textFood, { size: 0.8 });
  return food;
}

export function updateAnimals(state: GameState, dt: number) {
  state.animalTimer -= dt;
  if (state.animalTimer <= 0 && state.animals.length < MAX_ANIMALS) {
    state.animalTimer = RESPAWN;
    spawnAnimal(state);
  }
  const threats = [state.hero, ...state.units.filter((u) => u.kind === 'hunter')];
  const k = 1 - Math.exp(-5 * dt);
  for (const a of state.animals) {
    a.hitFlash = Math.max(0, a.hitFlash - dt * 5);
    const def = ANIMALS[a.kind];
    let fleeX = 0;
    let fleeY = 0;
    for (const t of threats) {
      const d = dist(a.x, a.y, t.x, t.y);
      if (d < FLEE_RANGE && d > 0) {
        fleeX += (a.x - t.x) / d;
        fleeY += (a.y - t.y) / d;
      }
    }
    let speed = def.speed * 0.25;
    if (fleeX || fleeY) {
      a.heading = Math.atan2(fleeY, fleeX);
      speed = def.speed;
    } else {
      // Promenade : change de direction de temps en temps, et broute.
      a.timer -= dt;
      if (a.timer <= 0) {
        a.timer = 1.5 + Math.random() * 3;
        a.heading += (Math.random() - 0.5) * 2.5;
        if (Math.random() < 0.35) speed = 0;
      }
    }
    a.vx += (Math.cos(a.heading) * speed - a.vx) * k;
    a.vy += (Math.sin(a.heading) * speed - a.vy) * k;
    a.x = Math.min(state.map.width - 30, Math.max(30, a.x + a.vx * dt));
    a.y = Math.min(state.map.height - 30, Math.max(30, a.y + a.vy * dt));
    if (a.x <= 30 || a.x >= state.map.width - 30 || a.y <= 30 || a.y >= state.map.height - 30) a.heading += Math.PI;
    if (Math.abs(a.vx) > 8) a.dirX = a.vx > 0 ? 1 : -1;
    a.walkTime = Math.hypot(a.vx, a.vy) > 15 ? a.walkTime + dt : 0;
    forTreesNear(state.trees, a.x, a.y, (tree) => {
      if (tree.state === 'standing') pushOut(a, def.radius, tree.x, tree.y, tree.radius);
    });
  }
}
