import { PAD_RADIUS } from './balance';
import { guards } from './combat';
import { cellTaken, doorOutside, roomCenter } from './layout';
import { buildTurret, newTurretCost, padOffer, placeArtifact, turretOffer } from './sim';
import type { ArtifactKind, RefugePad, RefugeState, Room, Survivor } from './types';

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
  // Choix au hasard : d'une partie à l'autre, ce ne sont jamais les mêmes refuges qui restent libres.
  const room = free[Math.floor(Math.random() * free.length)];
  s.path = [doorOutside(room, 50), roomCenter(room)];
}

function score(state: RefugeState, s: Survivor, pad: RefugePad): number {
  const room = state.rooms[s.roomId!];
  const sinceSiege = state.time - state.siegeStart;
  const underAttack = state.demon.targetRoom === room.id;
  const hpRatio = room.door.hp / room.door.maxHp;
  switch (pad.kind) {
    case 'repair':
      return hpRatio < 0.45 ? 120 : -1;
    case 'door':
      return 45 + (underAttack ? 40 : 0) + (1 - hpRatio) * 25 - room.door.level * 4;
    case 'gen':
      return (sinceSiege < 160 ? 60 : 20) - room.gen.level * 9;
    case 'weapon':
      return 34 - room.weaponLevel * 6;
  }
}

/** Case libre préférée : tourelles près de la porte et dans les coins, artefacts au centre. */
function bestCell(room: Room, forArtifact: boolean): number | null {
  let best: number | null = null;
  let bestScore = -Infinity;
  room.cells.forEach((c, i) => {
    if (cellTaken(room, i)) return;
    const edge = Math.min(c.col, 5 - c.col);
    const sc = forArtifact ? c.row * 2 - Math.abs(c.col - 2.5) * 3 : c.row * 3 - edge * 2;
    if (sc > bestScore) {
      bestScore = sc;
      best = i;
    }
  });
  return best;
}

/** Ce que le robot est en train d'aller faire sur une case. */
const plans = new WeakMap<Survivor, { cell: number; artifact: ArtifactKind | null }>();

export function botThink(state: RefugeState, s: Survivor, dt: number) {
  s.thinkTimer -= dt;

  if (s.roomId === null) {
    if (s.thinkTimer > 0) return; // temps de réaction au top départ
    const aimed = aimedRoom(state, s);
    if (!aimed || aimed.owner !== null) chooseRoom(state, s);
    const next = s.path[0];
    if (!next) return;
    if (Math.hypot(s.x - next.x, s.y - next.y) < 18 && s.path.length > 1) s.path.shift();
    s.goal = s.path[0];
    return;
  }
  if (state.phase !== 'siege') return;
  const room = state.rooms[s.roomId];

  // Arrivé sur la case prévue : on construit ou on pose l'artefact.
  const plan = plans.get(s);
  if (plan && s.buildCell === plan.cell) {
    if (plan.artifact) placeArtifact(state, s, plan.cell, plan.artifact);
    else buildTurret(state, s, plan.cell);
    plans.delete(s);
    s.thinkTimer = 0;
  }
  if (s.thinkTimer > 0) return;
  s.thinkTimer = THINK_INTERVAL;
  plans.delete(s);

  // Un artefact dans le sac passe avant tout.
  if (s.inventory.length) {
    const cell = bestCell(room, true);
    if (cell !== null) {
      plans.set(s, { cell, artifact: s.inventory[0] });
      s.goal = { x: room.cells[cell].x, y: room.cells[cell].y };
      return;
    }
  }

  const underAttack = state.demon.targetRoom === room.id;
  let goal: { x: number; y: number } | null = null;
  let bestScore = 0;
  const consider = (sc: number, x: number, y: number) => {
    if (sc > bestScore) {
      bestScore = sc;
      goal = { x, y };
      return true;
    }
    return false;
  };
  for (const pad of room.pads) {
    const offer = padOffer(room, pad);
    if (offer && s.gold >= offer.cost) consider(score(state, s, pad), pad.x, pad.y);
  }
  for (const t of room.turrets) {
    const offer = turretOffer(room, t);
    if (offer && s.gold >= offer.cost) consider(44 - t.level * 7 + (underAttack ? 10 : 0), t.x, t.y);
  }
  const cost = newTurretCost(room);
  if (cost !== null && s.gold >= cost && room.turrets.length < 5) {
    const cell = bestCell(room, false);
    if (cell !== null && consider(54 - room.turrets.length * 7 + (underAttack ? 10 : 0), room.cells[cell].x, room.cells[cell].y)) plans.set(s, { cell, artifact: null });
  }
  if (goal) {
    s.goal = goal;
    return;
  }
  // Des ennemis à la porte : il quitte son trône pour tirer lui-même. Sinon, il reste assis pour l'or.
  const attackers = state.zombies.filter((z) => guards(room, z.x, z.y)).length + (guards(room, state.demon.x, state.demon.y) ? 3 : 0);
  const front = room.pads.find((p) => p.kind === 'weapon')!;
  s.goal = attackers >= 3 ? { x: front.x + (room.doorSide === 'bottom' ? 0 : 0), y: front.y + (room.doorSide === 'bottom' ? -40 : 40) } : { x: room.gen.x, y: room.gen.y + PAD_RADIUS * 0.3 };
}
