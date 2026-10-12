import { WEAPON_TYPES } from '../data/weapons';
import { FX_COLORS } from '../fxColors';
import type { GameState, HappeningKind } from '../types';
import { dist, gain, nextId } from './common';
import { spawnBurst } from './effects';
import { dropGems } from './progression';
import { spawnZombie } from './zombies';

// Micro-événements : toutes les 25 à 40 secondes, quelque chose se passe.

/** Le premier événement arrive 30 s après le début (voir createGame). */
const MIN_DELAY = 25;
const MAX_DELAY = 40;

const DAY_POOL: HappeningKind[] = ['crate', 'goldenTree', 'ambush', 'gemRain', 'goldenZombie', 'crate', 'goldenTree'];
const NIGHT_POOL: HappeningKind[] = ['crate', 'gemRain', 'goldenZombie'];

function pointNearHero(state: GameState, minD: number, maxD: number) {
  const { hero, map } = state;
  const a = Math.random() * Math.PI * 2;
  const d = minD + Math.random() * (maxD - minD);
  return {
    x: Math.min(map.width - 60, Math.max(60, hero.x + Math.cos(a) * d)),
    y: Math.min(map.height - 60, Math.max(60, hero.y + Math.sin(a) * d)),
    angle: a,
  };
}

export function triggerHappening(state: GameState, kind: HappeningKind) {
  const { hero } = state;
  switch (kind) {
    case 'crate': {
      const p = pointNearHero(state, 250, 600);
      state.chests.push({ id: nextId(state), x: p.x, y: p.y, wood: 20 + 10 * state.world, age: 0, kind: 'crate', fall: 420 });
      break;
    }
    case 'goldenTree': {
      const candidates = state.trees.filter((t) => {
        const d = dist(t.x, t.y, hero.x, hero.y);
        return t.state === 'standing' && !t.golden && d > 200 && d < 700;
      });
      if (!candidates.length) return triggerHappening(state, 'gemRain');
      const tree = candidates[Math.floor(Math.random() * candidates.length)];
      tree.golden = true;
      tree.hp = 8;
      spawnBurst(state, tree.x, tree.y, 60, 16, 'confetti', FX_COLORS.confetti, 1);
      break;
    }
    case 'ambush': {
      const p = pointNearHero(state, 430, 520);
      const count = 4 + state.world * 2;
      const before = state.zombies.length;
      for (let i = 0; i < count; i++) spawnZombie(state, Math.max(1, state.cycle.night));
      // Les zombies de l'embuscade arrivent tous du même côté.
      for (const z of state.zombies.slice(before)) {
        z.x = Math.min(state.map.width - 30, Math.max(30, p.x + (Math.random() - 0.5) * 140));
        z.y = Math.min(state.map.height - 30, Math.max(30, p.y + (Math.random() - 0.5) * 140));
        z.hunter = true;
      }
      break;
    }
    case 'gemRain': {
      for (let i = 0; i < 16; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 70 + Math.random() * 170;
        dropGems(state, hero.x + Math.cos(a) * r, hero.y + Math.sin(a) * r * 0.8, 1, 1 + Math.floor(Math.random() * 2));
      }
      spawnBurst(state, hero.x, hero.y, 120, 24, 'confetti', [FX_COLORS.gem, '#C77DFF', '#FFFFFF'], 1.2);
      break;
    }
    case 'goldenZombie': {
      const p = pointNearHero(state, 380, 480);
      spawnZombie(state, Math.max(1, state.cycle.night));
      const z = state.zombies[state.zombies.length - 1];
      z.x = p.x;
      z.y = p.y;
      z.golden = true;
      z.hp = z.maxHp = 60 + 40 * state.world;
      z.speed = 150;
      z.damage = 0;
      z.walkTime = 0;
      break;
    }
  }
  state.events.push({ type: 'happening', kind });
}

export function updateHappenings(state: GameState, dt: number) {
  state.happeningTimer -= dt;
  if (state.happeningTimer > 0) return;
  state.happeningTimer = MIN_DELAY + Math.random() * (MAX_DELAY - MIN_DELAY);
  // Pas d'embuscade avant d'avoir passé une première nuit.
  const pool = (state.cycle.phase === 'day' ? DAY_POOL : NIGHT_POOL).filter((k) => k !== 'ambush' || state.cycle.night >= 1);
  triggerHappening(state, pool[Math.floor(Math.random() * pool.length)]);
}

/** Coffres au sol : chute des caisses larguées, ramassage au contact. */
export function updateChests(state: GameState, dt: number) {
  const hero = state.hero;
  for (let i = state.chests.length - 1; i >= 0; i--) {
    const c = state.chests[i];
    c.age += dt;
    if (c.fall > 0) {
      c.fall = Math.max(0, c.fall - dt * 520);
      if (c.fall === 0) spawnBurst(state, c.x, c.y, 0, 12, 'dust', FX_COLORS.dust, 1.4);
      continue;
    }
    if (hero.dead || dist(hero.x, hero.y, c.x, c.y) > hero.radius + 20) continue;
    state.chests.splice(i, 1);
    spawnBurst(state, c.x, c.y, 10, 16, 'confetti', FX_COLORS.confetti, 1.1);
    if (c.kind === 'weapon') {
      // Seules les armes débloquées (progression permanente) peuvent sortir du coffre.
      const others = WEAPON_TYPES.filter((w) => w !== hero.weapon.type && state.mods.weapons.includes(w));
      if (others.length) {
        state.weaponOffer = others[Math.floor(Math.random() * others.length)];
        state.events.push({ type: 'weaponFound' });
      } else {
        gain(state, 'wood', 30 + 10 * state.world, c.x, c.y - 30);
        dropGems(state, c.x, c.y, 6, 2);
      }
    } else {
      gain(state, 'wood', c.wood, c.x, c.y - 30);
      if (c.kind === 'crate') dropGems(state, c.x, c.y, 4, 2);
    }
  }
}

/** Réponse au coffre d'arme : prendre la nouvelle arme, ou la fondre contre du bois. */
export function resolveWeaponOffer(state: GameState, take: boolean) {
  const offer = state.weaponOffer;
  if (!offer) return;
  const hero = state.hero;
  if (take) hero.weapon.type = offer;
  else gain(state, 'wood', 15 + 5 * state.world, hero.x, hero.y - 60);
  spawnBurst(state, hero.x, hero.y, 30, 14, 'confetti', FX_COLORS.confetti, 1);
  state.weaponOffer = null;
}
