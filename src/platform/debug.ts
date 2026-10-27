import { Platform } from 'react-native';
import { addStructure } from '../game/systems/build';
import type { GameState } from '../game/types';
import type { EpochState } from '../modes/epoch/types';
import type { RefugeState } from '../modes/refuge/types';
import { LAYOUT, WALL_SIDES, wallSegments } from '../game/world/layout';

/**
 * Raccourcis de test, seulement dans le navigateur, via l'adresse :
 * #nuit (la nuit tombe tout de suite), #riche (200 bois), #nuit-riche (les deux),
 * #cartes (un choix d'atout tout de suite), #boss (le boss arrive tout de suite),
 * #armes (arc, haches et bombes en phase 1), #monde2 … #monde4 (aller directement dans un monde),
 * #equipement (épée, bouclier et armure du monde), #camp (caserne et bûcherons niv. 2),
 * #coffre (un coffre d'arme à côté du héros), #evenement (un micro-événement tout de suite),
 * #phase3 (5 atouts en phase 3), #defense (tours niv. 3, remparts, pièges, catapulte). Combinables : #boss-armes.
 */
export function applyDebugHash(state: GameState) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return state;
  const hash = window.location.hash.toLowerCase();
  if (hash.includes('nuit')) state.cycle.timer = 2;
  if (hash.includes('riche')) state.inventory.wood = 200;
  if (hash.includes('cartes')) state.pendingLevelUps = 1;
  if (hash.includes('armes')) Object.assign(state.perks, { bow: 1, orbit: 1, bomb: 1 });
  const world = /monde(\d)/.exec(hash);
  if (world) {
    state.world = Math.max(0, Number(world[1]) - 1);
    state.padsDirty = true;
  }
  if (hash.includes('camp')) {
    for (const slot of ['barracks', 'lumber'] as const) {
      const p = LAYOUT[slot];
      const s = addStructure(state, slot, slot, state.base.x + p.x, state.base.y + p.y, 2);
      s.pop = 1;
    }
    state.padsDirty = true;
  }
  if (hash.includes('coffre')) {
    state.chests.push({ id: 99999, x: state.hero.x + 60, y: state.hero.y, wood: 0, age: 0, kind: 'weapon', fall: 0 });
  }
  if (hash.includes('evenement')) state.happeningTimer = 2;
  if (hash.includes('phase3')) {
    Object.assign(state.perks, { bow: 3, orbit: 3, bomb: 3, lightning: 3, wolf: 3 });
    state.bossesKilled = 2;
  }
  if (hash.includes('defense')) {
    state.wallLevel = 3;
    const at = (p: { x: number; y: number }) => ({ x: state.base.x + p.x, y: state.base.y + p.y });
    LAYOUT.towers.slice(0, 4).forEach((tw, i) => {
      const p = at(tw);
      addStructure(state, 'tower', tw.slot, p.x, p.y, Math.min(3, i + 1)).pop = 1;
    });
    for (const side of WALL_SIDES) {
      for (const seg of wallSegments(side)) addStructure(state, 'wall', `wall-${side}`, state.base.x + seg.x, state.base.y + seg.y).pop = 1;
    }
    for (const tr of LAYOUT.traps) addStructure(state, 'trap', tr.slot, at(tr).x, at(tr).y).pop = 1;
    const c = LAYOUT.catapults[0];
    addStructure(state, 'catapult', c.slot, at(c).x, at(c).y).pop = 1;
    state.padsDirty = true;
  }
  if (hash.includes('equipement')) {
    const tier = Math.min(state.world + 1, 4);
    state.equipment = { sword: tier, shield: tier, armor: tier };
  }
  if (hash.includes('boss')) {
    Object.assign(state.cycle, { phase: 'night', night: 1, timer: 0, toSpawn: 0, spawnTimer: 0, bossSpawned: false });
    state.roundInWorld = 1;
  }
  return state;
}

/**
 * Mode Refuges, dans le navigateur :
 * #refuge-vitrine : le joueur dans un refuge avec les 4 niveaux de tourelles, des artefacts, un bouclier,
 *   et le Démon qui attaque sa porte. #refuge-roue : siège lancé, la roue tourne au bout de 3 s.
 * #refuge-heros : choix d'un pouvoir de survivant, boutons Gel et Onde de choc.
 * #refuge-demon-vite : rôle Démon, siège lancé, pouvoirs actifs déjà débloqués.
 */
export function applyRefugeDebugHash(state: RefugeState) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return state;
  const hash = window.location.hash.toLowerCase();
  const fast = hash.includes('vitrine') || hash.includes('roue') || hash.includes('vite') || hash.includes('roi') || hash.includes('devore') || hash.includes('heros');
  if (!fast) return state;
  // Tout le monde est déjà dans un refuge, le siège commence.
  state.survivors.forEach((s, i) => {
    const room = state.rooms[(i + 1) % state.rooms.length];
    room.owner = s.id;
    s.roomId = room.id;
    s.x = room.gen.x;
    s.y = room.gen.y + 20;
  });
  state.phase = 'siege';
  state.phaseTimer = 400;
  state.siegeStart = -100;
  state.demon.rise = 1;
  if (hash.includes('roue')) state.roundLength = 10;
  state.roundTimer = hash.includes('roue') ? 3 : 60;
  // #refuge-heros : le choix d'un pouvoir de survivant arrive au bout de 2 s ; ceux d'avant sont déjà là.
  if (hash.includes('heros')) {
    state.heroTimer = 2;
    state.survivors[0].powers = { freeze: 1, blast: 2, regen: 1 };
  }
  // #refuge-roi : la partie se termine au bout de 4 s (cinématique de la couronne).
  if (hash.includes('roi')) state.phaseTimer = 4;
  // #refuge-devore : un survivant se fait dévorer tout de suite (petit cadre en bas).
  if (hash.includes('devore')) {
    state.survivors[2].alive = false;
    state.eliminations = 1;
    state.survivors[2].eliminatedAt = 1;
    state.devours = [{ survivorId: 2, t: -1.5 }];
  }
  if (hash.includes('vite')) {
    state.siegeStart = state.time - 14;
    state.powers = { clone: 1, roar: 1, dash: 1 };
    state.demon.levelTimer = 6;
    return state;
  }
  if (!hash.includes('vitrine')) return state;
  const room = state.rooms[1];
  state.survivors[0].gold = 500;
  // 4 tourelles de niveaux 1 à 4 près de la porte, 3 artefacts posés, 1 dans le sac.
  const cellOf = (col: number, row: number) => room.cells.findIndex((c) => c.col === col && c.row === row);
  [cellOf(0, 4), cellOf(1, 3), cellOf(4, 3), cellOf(5, 4)].forEach((cell, i) => {
    const c = room.cells[cell];
    room.turrets.push({ cell, x: c.x, y: c.y, hold: 0, level: i + 1, cooldown: 0, angle: Math.PI / 2, beamTo: null });
  });
  room.artifacts = [
    { kind: 'mega', cell: cellOf(2, 3), cooldown: 0 },
    { kind: 'tesla', cell: cellOf(0, 1), cooldown: 0 },
    { kind: 'frost', cell: cellOf(5, 1), cooldown: 0 },
  ];
  state.survivors[0].inventory = ['heal'];
  // Trois compagnons (garde, archère, banquier) près de la porte
  (['guard', 'archer', 'banker'] as const).forEach((kind, i) => {
    const [col, row] = [[1, 4], [4, 4], [3, 3]][i];
    const cell = cellOf(col, row);
    const c = room.cells[cell];
    if (c) room.allies.push({ kind, cell, x: c.x, y: c.y, cooldown: 0, power: 1.5, anim: 0, aimX: 1 });
  });
  room.door.level = 3;
  room.door.maxHp = room.door.hp = 3300;
  room.shieldMax = room.shield = 2000;
  const d = state.demon;
  d.level = 3;
  d.state = 'hunt';
  d.targetRoom = room.id;
  d.x = room.door.x + 150;
  d.y = room.door.y + 160;
  return state;
}

/**
 * Mode Époques, dans le navigateur : #epoque-age3 (commencer à l'époque 3, ou 1 à 5),
 * #epoque-caisse (une caisse tombe tout de suite), #epoque-riche (beaucoup d'or), #epoque-pouvoir (pouvoir prêt), #epoque-tourelles (tourelles construites), #epoque-xp (évolution prête).
 */
export function applyEpochDebugHash(state: EpochState) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return state;
  const hash = window.location.hash.toLowerCase();
  const age = /age(\d)/.exec(hash);
  if (age) {
    const a = Math.max(0, Math.min(4, Number(age[1]) - 1));
    for (const b of state.bases) {
      b.age = a;
      b.maxHp = b.hp = 1200 + a * 800;
    }
  }
  if (hash.includes('caisse')) state.crateTimer = 1;
  if (hash.includes('riche')) state.bases[0].gold = 5000;
  if (hash.includes('pouvoir')) state.bases[0].special = 0;
  if (hash.includes('xp')) state.bases[0].xp = 1e6;
  if (hash.includes('tourelles')) {
    // Les 4 tourelles de chaque camp, à des niveaux différents
    const types = ['arrow', 'cannon', 'frost', 'lightning'] as const;
    for (const b of state.bases) b.turrets.forEach((t, i) => Object.assign(t, { type: types[i], level: 1 + (i % 3) }));
  }
  return state;
}
