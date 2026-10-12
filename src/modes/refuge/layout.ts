import { ARENA_H, ARENA_W, DOOR_GAP, DOOR_HP, ROOM_H, ROOM_W, WALL } from './balance';
import type { Rect, Room } from './types';

// 8 refuges : 4 en haut (porte vers le bas), 4 en bas (porte vers le haut),
// autour d'une grande place centrale où rôdent le Démon et les zombies.

const COLUMNS = [40, 400, 760, 1120];
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
  const turretSpots = [at(48, 46), at(ROOM_W - 48, 46), at(48, ROOM_H - 46), at(ROOM_W - 48, ROOM_H - 46)];
  // Générateur au fond ; ses améliorations et la réparation au milieu ; la porte devant.
  const gen = at(ROOM_W / 2, 52);
  const genPad = at(ROOM_W / 2 - 52, ROOM_H / 2);
  const repair = at(ROOM_W / 2 + 52, ROOM_H / 2);
  const doorPad = at(ROOM_W / 2, ROOM_H - 52);
  return {
    id,
    inner,
    doorSide,
    door: { x: cx, y: frontY + WALL / 2, level: 1, hp: DOOR_HP[1], maxHp: DOOR_HP[1], hitFlash: 0, broken: false },
    gen: { ...gen, level: 1, spin: 0 },
    turrets: turretSpots.map((p) => ({ ...p, level: 0, cooldown: 0, angle: doorSide === 'bottom' ? Math.PI / 2 : -Math.PI / 2, beamTo: null })),
    pads: [
      { kind: 'gen', ...genPad, slot: -1, hold: 0 },
      { kind: 'door', ...doorPad, slot: -1, hold: 0 },
      { kind: 'repair', ...repair, slot: -1, hold: 0 },
      ...turretSpots.map((p, i) => ({ kind: 'turret' as const, x: p.x, y: p.y, slot: i, hold: 0 })),
    ],
    repairCooldown: 0,
    owner: null,
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

export const roomCenter = (room: Room) => ({ x: room.inner.x + room.inner.w / 2, y: room.inner.y + room.inner.h / 2 });
