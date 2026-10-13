import { ARENA_H, ARENA_W, CELL, DOOR_GAP, DOOR_HP, GRID_COLS, GRID_ROWS, ROOM_H, ROOM_W, WALL } from './balance';
import type { Cell, Rect, Room } from './types';

// 8 refuges : 4 en haut (porte vers le bas), 4 en bas (porte vers le haut),
// autour d'une grande place centrale où rôdent le Démon et les zombies.

const COLUMNS = [40, 460, 880, 1300];
const TOP_Y = 80;
const BOTTOM_Y = ARENA_H - 80 - ROOM_H;

export const CENTER = { x: ARENA_W / 2, y: ARENA_H / 2 };

function makeRoom(id: number, x: number, y: number, doorSide: 'top' | 'bottom'): Room {
  const inner: Rect = { x, y, w: ROOM_W, h: ROOM_H };
  const cx = x + ROOM_W / 2;
  const frontY = doorSide === 'bottom' ? y + ROOM_H : y - WALL;
  const backY = doorSide === 'bottom' ? y - WALL : y + ROOM_H;
  const walls: Rect[] = [
    { x: x - WALL, y: backY, w: ROOM_W + WALL * 2, h: WALL },
    { x: x - WALL, y: y - WALL, w: WALL, h: ROOM_H + WALL * 2 },
    { x: x + ROOM_W, y: y - WALL, w: WALL, h: ROOM_H + WALL * 2 },
    { x: x - WALL, y: frontY, w: ROOM_W / 2 + WALL - DOOR_GAP / 2, h: WALL },
    { x: cx + DOOR_GAP / 2, y: frontY, w: ROOM_W / 2 + WALL - DOOR_GAP / 2, h: WALL },
  ];
  // Repères locaux : "avant" = côté porte, "fond" = côté opposé.
  const back = doorSide === 'bottom' ? y : y + ROOM_H;
  const inward = doorSide === 'bottom' ? 1 : -1; // du fond vers l'avant
  const at = (lx: number, fromBack: number) => ({ x: x + lx, y: back + fromBack * inward });
  // Grille de 6 × 5 cases. Réservé : générateur au fond, ses améliorations et la réparation juste devant, la porte.
  const cellAt = (col: number, row: number) => at(CELL / 2 + col * CELL, CELL / 2 + row * CELL);
  const reserved = (col: number, row: number) => (col === 2 || col === 3) && (row === 0 || row === 1 || row === GRID_ROWS - 1);
  const cells: Cell[] = [];
  for (let row = 0; row < GRID_ROWS; row++) for (let col = 0; col < GRID_COLS; col++) if (!reserved(col, row)) cells.push({ ...cellAt(col, row), col, row });
  const gen = at(ROOM_W / 2, 32);
  const genPad = cellAt(2, 1);
  const repair = cellAt(3, 1);
  const doorPad = at(ROOM_W / 2, CELL / 2 + (GRID_ROWS - 1) * CELL);
  return {
    id,
    inner,
    doorSide,
    door: { x: cx, y: frontY + WALL / 2, level: 1, hp: DOOR_HP[1], maxHp: DOOR_HP[1], hitFlash: 0, broken: false },
    gen: { ...gen, level: 1, spin: 0 },
    turrets: [],
    pads: [
      { kind: 'gen', ...genPad, hold: 0 },
      { kind: 'door', ...doorPad, hold: 0 },
      { kind: 'repair', ...repair, hold: 0 },
    ],
    repairCooldown: 0,
    owner: null,
    cells,
    artifacts: [],
    boosts: { power: 0, turbo: 0, storm: 0, stormCooldown: 0 },
    shield: 0,
    shieldMax: 0,
    stun: 0,
    poison: { dps: 0, time: 0 },
    roundScore: 0,
    turretCostMult: 1,
    turretRateMult: 1,
    doorHpMult: 1,
    repairFree: false,
    walls,
  };
}

export function createRooms(): Room[] {
  const rooms: Room[] = [];
  COLUMNS.forEach((x, i) => rooms.push(makeRoom(i, x, TOP_Y, 'bottom')));
  COLUMNS.forEach((x, i) => rooms.push(makeRoom(4 + i, x, BOTTOM_Y, 'top')));
  return rooms;
}

/** Rectangle de la porte (bloque le passage tant qu'elle tient, sauf pendant le choix du refuge). */
export function doorRect(room: Room): Rect {
  return { x: room.door.x - DOOR_GAP / 2, y: room.door.y - WALL / 2, w: DOOR_GAP, h: WALL };
}

/** Point devant la porte, côté place centrale (là où se placent les attaquants). */
export function doorOutside(room: Room, distance: number) {
  const dir = room.doorSide === 'bottom' ? 1 : -1;
  return { x: room.door.x, y: room.door.y + dir * (WALL / 2 + distance) };
}

export const insideRoom = (room: Room, x: number, y: number, margin = 0) =>
  x > room.inner.x + margin && x < room.inner.x + room.inner.w - margin && y > room.inner.y + margin && y < room.inner.y + room.inner.h - margin;

/** Angle de départ des tourelles : vers la porte. */
export const facingAngle = (room: Room) => (room.doorSide === 'bottom' ? Math.PI / 2 : -Math.PI / 2);

/** Une case est-elle occupée (tourelle ou artefact) ? */
export const cellTaken = (room: Room, cell: number) => room.turrets.some((t) => t.cell === cell) || room.artifacts.some((a) => a.cell === cell);

export const roomCenter = (room: Room) => ({ x: room.inner.x + room.inner.w / 2, y: room.inner.y + room.inner.h / 2 });
