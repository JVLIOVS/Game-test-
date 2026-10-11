import { WALL_RING_RADIUS, WALL_SEGMENTS_PER_SIDE } from '../constants';
import type { Vec2 } from '../types';

// Plan de la base : positions relatives au centre (la baraque).

export const WALL_SIDES = ['N', 'E', 'S', 'W'] as const;
export type WallSide = (typeof WALL_SIDES)[number];

const SIDE_ANGLE: Record<WallSide, number> = { N: -90, E: 0, S: 90, W: 180 };
const deg = (d: number) => (d * Math.PI) / 180;

/** Positions des pieux d'un côté de la palissade (cercle complet quand les 4 côtés sont bâtis). */
export function wallSegments(side: WallSide): Vec2[] {
  const step = 360 / (WALL_SIDES.length * WALL_SEGMENTS_PER_SIDE);
  const start = SIDE_ANGLE[side] - step * ((WALL_SEGMENTS_PER_SIDE - 1) / 2);
  const out: Vec2[] = [];
  for (let i = 0; i < WALL_SEGMENTS_PER_SIDE; i++) {
    const a = deg(start + i * step);
    out.push({ x: Math.cos(a) * WALL_RING_RADIUS, y: Math.sin(a) * WALL_RING_RADIUS });
  }
  return out;
}

/** Emplacement pour bâtir un côté de palissade : à l'extérieur de l'enceinte. */
export function wallPadPosition(side: WallSide): Vec2 {
  const a = deg(SIDE_ANGLE[side]);
  const r = WALL_RING_RADIUS + 58;
  return { x: Math.cos(a) * r, y: Math.sin(a) * r };
}

export const LAYOUT = {
  house: { x: 0, y: 0 },
  houseUpgradePad: { x: 0, y: 112 },
  workshop: { x: -130, y: 20 },
  axePad: { x: -130, y: 112 },
  /** Emplacements de tourelles, débloqués un par un (baraque, mondes, atout Ingénieur). */
  towers: [
    { slot: 'tower-1', x: 130, y: -85 },
    { slot: 'tower-2', x: -120, y: -110 },
    { slot: 'tower-3', x: 190, y: 20 },
    { slot: 'tower-4', x: -190, y: -40 },
    { slot: 'tower-5', x: -70, y: 190 },
    { slot: 'tower-6', x: 145, y: 135 },
  ],
  heroSpawn: { x: 70, y: 165 },
} as const;
