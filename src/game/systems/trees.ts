import { TREE_FALL_TIME, TREE_GROW_TIME, TREE_HP, TREE_REGROW_TIME, WOOD_FELL_BONUS, WOOD_PER_HIT } from '../constants';
import { FX_COLORS } from '../fxColors';
import type { GameState, Tree } from '../types';
import { gain } from './common';
import { addTrauma, spawnBurst } from './effects';

export function hitTree(state: GameState, tree: Tree) {
  tree.hp -= 1;
  tree.shake = 1;
  spawnBurst(state, tree.x, tree.y + 2, 18, 6, 'chip', FX_COLORS.chips, 1);
  spawnBurst(state, tree.x, tree.y, 55 * tree.size, 3, 'leaf', FX_COLORS.leaves, 0.6);
  state.events.push({ type: 'treeHit' });
  addTrauma(state, 0.12);
  gain(state, 'wood', WOOD_PER_HIT, tree.x, tree.y - 30);

  if (tree.hp <= 0) {
    tree.state = 'falling';
    tree.timer = 0;
    tree.fallDir = tree.x >= state.hero.x ? 1 : -1;
    state.events.push({ type: 'treeFelled' });
    addTrauma(state, 0.35);
    spawnBurst(state, tree.x, tree.y, 60 * tree.size, 14, 'leaf', FX_COLORS.leaves, 1.1);
    gain(state, 'wood', WOOD_FELL_BONUS, tree.x, tree.y - 50);
  }
}

export function updateTrees(state: GameState, dt: number) {
  for (const tree of state.trees) {
    tree.shake = Math.max(0, tree.shake - dt * 4);
    if (tree.state === 'standing') continue;
    tree.timer += dt;
    if (tree.state === 'falling' && tree.timer >= TREE_FALL_TIME) {
      tree.state = 'stump';
      tree.timer = 0;
      const landX = tree.x + tree.fallDir * 45 * tree.size;
      spawnBurst(state, landX, tree.y, 0, 10, 'dust', FX_COLORS.dust, 1.2);
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
