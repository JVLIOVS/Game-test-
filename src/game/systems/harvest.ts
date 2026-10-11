import {
  HARVEST_REACH,
  SWING_COOLDOWN,
  SWING_DURATION,
  SWING_HIT_AT,
  TREE_FALL_TIME,
  TREE_GROW_TIME,
  TREE_HP,
  TREE_REGROW_TIME,
  WOOD_FELL_BONUS,
  WOOD_PER_HIT,
} from '../constants';
import type { GameState, ResourceId, Tree } from '../types';
import { FX_COLORS as COLORS } from '../fxColors';
import { addTrauma, spawnBurst, spawnText } from './effects';

function findTarget(state: GameState): Tree | null {
  const hero = state.hero;
  let best: Tree | null = null;
  let bestDist = Infinity;
  for (const tree of state.zone.trees) {
    if (tree.state !== 'standing') continue;
    const d = Math.hypot(tree.x - hero.x, tree.y - hero.y) - tree.radius - hero.radius;
    if (d < HARVEST_REACH && d < bestDist) {
      best = tree;
      bestDist = d;
    }
  }
  return best;
}

function gain(state: GameState, resource: ResourceId, amount: number, x: number, y: number) {
  state.inventory[resource] += amount;
  state.events.push({ type: 'resourceGained', resource, amount });
  spawnText(state, x, y, `+${amount}`, COLORS.textWood);
}

function hitTree(state: GameState, tree: Tree) {
  tree.hp -= 1;
  tree.shake = 1;
  const chipZ = 18;
  spawnBurst(state, tree.x, tree.y + 2, chipZ, 6, 'chip', COLORS.chips, 1);
  spawnBurst(state, tree.x, tree.y, 55 * tree.size, 3, 'leaf', COLORS.leaves, 0.6);
  state.events.push({ type: 'treeHit', treeId: tree.id });
  addTrauma(state, 0.12);
  gain(state, 'wood', WOOD_PER_HIT, tree.x, tree.y - 30);

  if (tree.hp <= 0) {
    tree.state = 'falling';
    tree.timer = 0;
    tree.fallDir = tree.x >= state.hero.x ? 1 : -1;
    state.events.push({ type: 'treeFelled', treeId: tree.id });
    addTrauma(state, 0.35);
    spawnBurst(state, tree.x, tree.y, 60 * tree.size, 14, 'leaf', COLORS.leaves, 1.1);
    gain(state, 'wood', WOOD_FELL_BONUS, tree.x, tree.y - 50);
  }
}

export function updateHarvest(state: GameState, dt: number) {
  const hero = state.hero;
  hero.swingCooldown = Math.max(0, hero.swingCooldown - dt);

  if (hero.swingTime > 0) {
    hero.swingTime += dt;
    const target = state.zone.trees.find((t) => t.id === hero.targetTreeId);
    if (!hero.swingHitDone && hero.swingTime >= SWING_HIT_AT) {
      hero.swingHitDone = true;
      if (target && target.state === 'standing') hitTree(state, target);
    }
    if (hero.swingTime >= SWING_DURATION) {
      hero.swingTime = 0;
      hero.swingCooldown = SWING_COOLDOWN;
      hero.targetTreeId = null;
    }
  } else if (hero.swingCooldown === 0) {
    const target = findTarget(state);
    if (target) {
      hero.swingTime = 0.0001;
      hero.swingHitDone = false;
      hero.targetTreeId = target.id;
      hero.dirX = target.x >= hero.x ? 1 : -1;
    }
  }
}

export function updateTrees(state: GameState, dt: number) {
  for (const tree of state.zone.trees) {
    tree.shake = Math.max(0, tree.shake - dt * 4);
    if (tree.state === 'standing') continue;
    tree.timer += dt;
    if (tree.state === 'falling' && tree.timer >= TREE_FALL_TIME) {
      tree.state = 'stump';
      tree.timer = 0;
      const landX = tree.x + tree.fallDir * 45 * tree.size;
      spawnBurst(state, landX, tree.y, 0, 10, 'dust', COLORS.dust, 1.2);
      addTrauma(state, 0.2);
    } else if (tree.state === 'stump' && tree.timer >= TREE_REGROW_TIME) {
      tree.state = 'growing';
      tree.timer = 0;
    } else if (tree.state === 'growing' && tree.timer >= TREE_GROW_TIME) {
      tree.state = 'standing';
      tree.timer = 0;
      tree.hp = TREE_HP;
    }
  }
}
