import { PAD_RADIUS } from './balance';
import { doorOutside, roomCenter } from './layout';
import { padOffer } from './sim';
import type { RefugePad, RefugeState, Room, Survivor } from './types';

// Robots survivants : choisissent un refuge, puis investissent leur or avec bon sens
// (générateur tôt, tourelles, porte quand le Démon approche, réparation en urgence).

const THINK_INTERVAL = 0.4;

/** Refuge visé par un robot (dernier point de son chemin). */
const aimedRoom = (state: RefugeState, s: Survivor): Room | undefined => {
  const end = s.path[s.path.length - 1];
  return end ? state.rooms.find((r) => roomCenter(r).x === end.x && roomCenter(r).y === end.y) : undefined;
};

function chooseRoom(state: RefugeState, s: Survivor) {
  const aimed = new Set(state.survivors.filter((o) => o !== s).map((o) => aimedRoom(state, o)?.id));
  const free = state.rooms.filter((r) => r.owner === null && !aimed.has(r.id));
  if (!free.length) return;
  free.sort((a, b) => Math.hypot(s.x - roomCenter(a).x, s.y - roomCenter(a).y) - Math.hypot(s.x - roomCenter(b).x, s.y - roomCenter(b).y));
  // Le plus souvent le plus proche, parfois un autre : les robots ne jouent pas tous pareil.
  const room = free[Math.random() < 0.6 ? 0 : Math.floor(Math.random() * Math.min(3, free.length))];
  s.path = [doorOutside(room, 50), roomCenter(room)];
}

function score(state: RefugeState, s: Survivor, pad: RefugePad): number {
  const room = state.rooms[s.roomId!];
  const sinceSiege = state.time - 20;
  const underAttack = state.demon.targetRoom === room.id;
  const hpRatio = room.door.hp / room.door.maxHp;
  switch (pad.kind) {
    case 'repair':
      return hpRatio < 0.45 ? 120 : -1;
    case 'door':
      return 45 + (underAttack ? 40 : 0) + (1 - hpRatio) * 25 - room.door.level * 4;
    case 'gen':
      return (sinceSiege < 160 ? 60 : 20) - room.gen.level * 9;
    case 'turret': {
      const t = room.turrets[pad.slot];
      return (t.level === 0 ? 52 : 44) - t.level * 7 + (underAttack ? 10 : 0);
    }
  }
}

export function botThink(state: RefugeState, s: Survivor, dt: number) {
  s.thinkTimer -= dt;

  if (s.roomId === null) {
    const aimed = aimedRoom(state, s);
    if (!aimed || aimed.owner !== null) chooseRoom(state, s);
    const next = s.path[0];
    if (!next) return;
    if (Math.hypot(s.x - next.x, s.y - next.y) < 18 && s.path.length > 1) s.path.shift();
    s.goal = s.path[0];
    return;
  }

  if (state.phase !== 'siege' || s.thinkTimer > 0) return;
  s.thinkTimer = THINK_INTERVAL;
  const room = state.rooms[s.roomId];
  let best: RefugePad | null = null;
  let bestScore = 0;
  for (const pad of room.pads) {
    const offer = padOffer(room, pad);
    if (!offer || s.gold < offer.cost) continue;
    const sc = score(state, s, pad);
    if (sc > bestScore) {
      bestScore = sc;
      best = pad;
    }
  }
  // Rien d'intéressant à acheter : on reste sur le générateur pour gagner plus d'or.
  s.goal = best ? { x: best.x, y: best.y } : { x: room.gen.x, y: room.gen.y + PAD_RADIUS * 0.3 };
}
