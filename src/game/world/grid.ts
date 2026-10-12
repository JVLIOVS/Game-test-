import type { Tree } from '../types';

// Grille spatiale pour les arbres (ils ne bougent pas) : avec des centaines de zombies,
// on ne teste que les arbres des cases voisines au lieu de toute la forêt.

const CELL = 128;
const grids = new WeakMap<Tree[], Map<number, Tree[]>>();
const key = (cx: number, cy: number) => cx * 4096 + cy;

function gridFor(trees: Tree[]) {
  let g = grids.get(trees);
  if (!g) {
    g = new Map();
    for (const t of trees) {
      const k = key(Math.floor(t.x / CELL), Math.floor(t.y / CELL));
      const bucket = g.get(k);
      if (bucket) bucket.push(t);
      else g.set(k, [t]);
    }
    grids.set(trees, g);
  }
  return g;
}

/** Appelle fn pour chaque arbre proche du point (cases voisines). */
export function forTreesNear(trees: Tree[], x: number, y: number, fn: (t: Tree) => void) {
  const g = gridFor(trees);
  const cx = Math.floor(x / CELL);
  const cy = Math.floor(y / CELL);
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const bucket = g.get(key(cx + dx, cy + dy));
      if (bucket) for (const t of bucket) fn(t);
    }
  }
}
