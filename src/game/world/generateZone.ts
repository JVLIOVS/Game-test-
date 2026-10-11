import { TREE_HP } from '../constants';
import { createRng } from '../rng';
import type { Decor, Tree, ZoneDef, ZoneState } from '../types';

const SPAWN_CLEARING = 140;
const EDGE_MARGIN = 50;

export function generateZone(def: ZoneDef): ZoneState {
  const rng = createRng(def.seed);
  const trees: Tree[] = [];
  let id = 1;
  let attempts = 0;

  while (trees.length < def.treeCount && attempts < def.treeCount * 40) {
    attempts++;
    const x = rng.range(EDGE_MARGIN, def.width - EDGE_MARGIN);
    const y = rng.range(EDGE_MARGIN + 40, def.height - EDGE_MARGIN);
    if (Math.hypot(x - def.spawn.x, y - def.spawn.y) < SPAWN_CLEARING) continue;
    const size = rng.range(0.85, 1.2);
    const minDist = 70 * size;
    if (trees.some((t) => Math.hypot(t.x - x, t.y - y) < minDist)) continue;
    trees.push({
      id: id++,
      x,
      y,
      radius: 13 * size,
      hp: TREE_HP,
      maxHp: TREE_HP,
      state: 'standing',
      timer: 0,
      shake: 0,
      fallDir: 1,
      variant: rng.int(0, 2),
      size,
    });
  }

  const decor: Decor[] = [];
  const decorCount = Math.round((def.width * def.height) / 9000);
  for (let i = 0; i < decorCount; i++) {
    const roll = rng.next();
    decor.push({
      x: rng.range(0, def.width),
      y: rng.range(0, def.height),
      kind: roll < 0.2 ? 'patch' : roll < 0.6 ? 'tuft' : roll < 0.85 ? 'flower' : 'pebble',
      variant: rng.int(0, 3),
      size: rng.range(0.7, 1.3),
    });
  }
  // Les grandes taches d'herbe se dessinent en premier.
  decor.sort((a, b) => (a.kind === 'patch' ? 0 : 1) - (b.kind === 'patch' ? 0 : 1));

  return { def, trees, decor };
}
