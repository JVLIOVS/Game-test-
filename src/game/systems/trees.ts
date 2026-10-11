import { TREE_FALL_TIME, TREE_GROW_TIME, TREE_HP, TREE_REGROW_TIME, WOOD_FELL_BONUS, WOOD_PER_HIT } from '../constants';
import { FX_COLORS } from '../fxColors';
import type { GameState, Tree } from '../types';
import { dist, gain } from './common';
import { addTrauma, spawnBurst } from './effects';
import { dropGems } from './progression';

const GOLDEN_WOOD_PER_HIT = 3;
const GOLDEN_FELL_WOOD = 12;
const GOLDEN_FELL_GEMS = 6;

/**
 * Coup de hache sur un arbre.
 * Le héros gagne le bois tout de suite ; un ouvrier le garde sur lui et le rapporte au camp.
 * Renvoie le bois produit par ce coup.
 */
export function hitTree(state: GameState, tree: Tree, by: 'hero' | 'worker' = 'hero', fromX = state.hero.x): number {
  const hero = by === 'hero';
  tree.hp -= 1;
  tree.shake = 1;
  spawnBurst(state, tree.x, tree.y + 2, 18, hero ? 6 : 3, 'chip', tree.golden ? FX_COLORS.confetti : FX_COLORS.chips, hero ? 1 : 0.6);
  let wood = tree.golden ? GOLDEN_WOOD_PER_HIT : WOOD_PER_HIT;
  if (hero) {
    spawnBurst(state, tree.x, tree.y, 55 * tree.size, 3, 'leaf', FX_COLORS.leaves, 0.6);
    state.events.push({ type: 'treeHit' });
    addTrauma(state, 0.12);
    gain(state, 'wood', wood, tree.x, tree.y - 30);
  }

  if (tree.hp <= 0) {
    tree.state = 'falling';
    tree.timer = 0;
    tree.claimedBy = null;
    tree.fallDir = tree.x >= fromX ? 1 : -1;
    spawnBurst(state, tree.x, tree.y, 60 * tree.size, hero ? 14 : 6, 'leaf', FX_COLORS.leaves, 1.1);
    const bonus = tree.golden ? GOLDEN_FELL_WOOD : WOOD_FELL_BONUS;
    if (tree.golden) {
      dropGems(state, tree.x, tree.y, GOLDEN_FELL_GEMS, 2);
      spawnBurst(state, tree.x, tree.y, 60, 20, 'confetti', FX_COLORS.confetti, 1.4);
      tree.golden = false;
    }
    if (hero) {
      state.events.push({ type: 'treeFelled' });
      addTrauma(state, 0.35);
      gain(state, 'wood', bonus, tree.x, tree.y - 50);
    } else {
      wood += bonus;
    }
  }
  return wood;
}

export function updateTrees(state: GameState, dt: number) {
  const hero = state.hero;
  for (const tree of state.trees) {
    tree.shake = Math.max(0, tree.shake - dt * 4);
    if (tree.state === 'standing') continue;
    tree.timer += dt;
    if (tree.state === 'falling' && tree.timer >= TREE_FALL_TIME) {
      tree.state = 'stump';
      tree.timer = 0;
      const landX = tree.x + tree.fallDir * 45 * tree.size;
      spawnBurst(state, landX, tree.y, 0, 10, 'dust', FX_COLORS.dust, 1.2);
      if (dist(tree.x, tree.y, hero.x, hero.y) < 400) addTrauma(state, 0.2);
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
