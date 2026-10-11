import { FX_COLORS } from '../fxColors';
import type { GameState, ResourceId } from '../types';
import { spawnText } from './effects';

export const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

export function nextId(state: GameState) {
  return state.nextId++;
}

export function gain(state: GameState, resource: ResourceId, amount: number, x: number, y: number) {
  state.inventory[resource] += amount;
  state.events.push({ type: 'resourceGained', resource, amount });
  spawnText(state, x, y, `+${amount}`, FX_COLORS.textWood, { log: resource === 'wood' });
}

/** Repousse un cercle mobile hors d'un cercle fixe. Renvoie true s'il y avait contact. */
export function pushOut(
  mover: { x: number; y: number },
  moverRadius: number,
  ox: number,
  oy: number,
  oRadius: number,
): boolean {
  const dx = mover.x - ox;
  const dy = mover.y - oy;
  const d = Math.hypot(dx, dy);
  const r = moverRadius + oRadius;
  if (d >= r) return false;
  if (d < 0.0001) {
    mover.x += r;
    return true;
  }
  mover.x = ox + (dx / d) * r;
  mover.y = oy + (dy / d) * r;
  return true;
}
