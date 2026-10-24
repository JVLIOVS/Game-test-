import { spawnText } from '../../game/systems/effects';
import { FX_COLORS } from '../../game/fxColors';
import { ROUNDS } from './balance';
import { ALLY_MAX, BOOST_TIME, CHARACTERS, LUCK_FULL, SHIELD_RATIO, WEAPON, WHEEL, goldPrize, wheelWeight } from './data';
import { cellTaken } from './layout';
import type { AllyKind, ArtifactKind, RefugeState, Room, Survivor, WheelPrize } from './types';

// Roue de fin de manche : chaque survivant encore en vie la fait tourner.
// Mieux on a défendu pendant la manche (zombies tués, Démon blessé ou repoussé, porte en bon état),
// plus on a de chances de tomber sur une case rare.

/** Chance de la manche, entre 0 et 1. */
export function roundLuck(room: Room, s: Survivor) {
  const door = room.door.broken ? 0 : (room.door.hp / room.door.maxHp) * 8;
  return Math.max(0, Math.min(1, (room.roundScore + door + 4) / LUCK_FULL + CHARACTERS[s.character].luck));
}

/** Tirage pondéré : la chance favorise les cases rares. */
export function spinWheel(luck: number): number {
  const weights = WHEEL.map((w) => wheelWeight(w.rarity, luck));
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

function randomArtifact(room: Room, s: Survivor): ArtifactKind {
  const kinds: ArtifactKind[] = ['tesla', 'frost', 'heal'];
  const missing = kinds.filter((k) => !room.artifacts.some((a) => a.kind === k) && !s.inventory.includes(k));
  const pool = missing.length ? missing : kinds;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Compagnon gagné au dernier tirage (pour l'affichage). */
let ally: AllyKind | null = null;

/** Installe un compagnon sur la meilleure case libre (près de la porte). */
function placeAlly(room: Room, kind: AllyKind, round: number) {
  if (room.allies.length >= ALLY_MAX) return false;
  let best = -1;
  let bestRow = -1;
  room.cells.forEach((c, i) => {
    if (!cellTaken(room, i) && c.row > bestRow) {
      bestRow = c.row;
      best = i;
    }
  });
  if (best < 0) return false;
  const c = room.cells[best];
  room.allies.push({ kind, cell: best, x: c.x, y: c.y, cooldown: 0, power: 1 + round * 0.35, anim: 0, aimX: 1 });
  return true;
}

/** Applique le gain ; renvoie l'artefact gagné s'il y en a un. */
function applyPrize(state: RefugeState, room: Room, s: Survivor, prize: WheelPrize): ArtifactKind | null {
  const bonusGold = (k: number) => {
    const g = goldPrize(state.round) * k;
    s.gold += g;
    spawnText(state, s.x, s.y - 70, `+${g}`, FX_COLORS.textWood, { size: 1 });
  };
  switch (prize) {
    case 'gold':
      bonusGold(1);
      return null;
    case 'repair':
      room.door.hp = room.door.maxHp;
      return null;
    case 'ally': {
      // Un compagnon s'installe sur une case libre, près de la porte si possible.
      const kinds: AllyKind[] = ['guard', 'archer', 'banker'];
      const kind = kinds[Math.floor(Math.random() * kinds.length)];
      if (!placeAlly(room, kind, state.round)) {
        bonusGold(1);
        return null;
      }
      ally = kind;
      return null;
    }
    case 'weapon':
      if (s.weapon < WEAPON.damage.length - 1) {
        s.weapon++;
        room.weaponLevel = s.weapon;
      } else bonusGold(1);
      return null;
    case 'storm':
      room.boosts.storm += BOOST_TIME.storm;
      return null;
    case 'shield':
      room.shieldMax = Math.max(room.shieldMax, room.door.maxHp * SHIELD_RATIO);
      room.shield = room.shieldMax;
      return null;
    case 'artifact':
    case 'mega': {
      // L'artefact rejoint le sac : on le pose où l'on veut dans son refuge.
      const kind: ArtifactKind = prize === 'mega' ? 'mega' : randomArtifact(room, s);
      s.inventory.push(kind);
      return kind;
    }
  }
}

/** Fin de manche : tours de roue, puis manche suivante. */
export function endRound(state: RefugeState) {
  for (const s of state.survivors) {
    if (!s.alive || s.roomId === null) continue;
    const room = state.rooms[s.roomId];
    if (room.door.broken) continue;
    const luck = roundLuck(room, s);
    const prize = WHEEL[spinWheel(luck)].prize;
    ally = null;
    const artifact = applyPrize(state, room, s, prize);
    // Le joueur voit sa roue tourner (la partie est en pause pendant ce temps).
    if (s.isPlayer) state.wheel = { id: state.nextId++, prize, artifact, ally, luck, round: state.round };
  }
  for (const room of state.rooms) room.roundScore = 0;
  state.events.push({ type: 'roundEnd', round: state.round });
  state.round = Math.min(ROUNDS, state.round + 1);
  state.roundTimer = state.roundLength;
}
