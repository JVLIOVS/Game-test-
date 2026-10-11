// Fait jouer un robot simple pour vérifier les règles et l'équilibrage.
// Lancer : npx tsx scripts/botPlaytest.ts
import { createGame, step } from '../src/game/simulation';
import { chooseCard } from '../src/game/systems/progression';
import { resolveWeaponOffer } from '../src/game/systems/happenings';
import type { GameState, PlayerInput } from '../src/game/types';

const DT = 1 / 60;
const MINUTES = Number(process.argv[2] ?? 8);

function moveTo(state: GameState, x: number, y: number): PlayerInput {
  const dx = x - state.hero.x;
  const dy = y - state.hero.y;
  const d = Math.hypot(dx, dy);
  return d < 6 ? { moveX: 0, moveY: 0 } : { moveX: dx / d, moveY: dy / d };
}

function bot(state: GameState): PlayerInput {
  const { hero } = state;
  // La nuit : rester près de la baraque et frapper les zombies proches.
  if (state.cycle.phase === 'night') {
    const z = state.zombies
      .map((zz) => ({ zz, d: Math.hypot(zz.x - state.base.x, zz.y - state.base.y) }))
      .sort((a, b) => a.d - b.d)[0];
    if (z && z.d < 320) return moveTo(state, z.zz.x, z.zz.y);
    return moveTo(state, state.base.x, state.base.y + 150);
  }
  if (state.chests.length) return moveTo(state, state.chests[0].x, state.chests[0].y);
  const pad = [...state.pads].sort((a, b) => a.cost - a.paid - (b.cost - b.paid))[0];
  if (pad && state.inventory.wood >= pad.cost - pad.paid) return moveTo(state, pad.x, pad.y);
  const tree = state.trees
    .filter((t) => t.state === 'standing')
    .sort((a, b) => Math.hypot(a.x - hero.x, a.y - hero.y) - Math.hypot(b.x - hero.x, b.y - hero.y))[0];
  return tree ? moveTo(state, tree.x, tree.y) : { moveX: 0, moveY: 0 };
}

const state = createGame();
const counts: Record<string, number> = {};
const log: string[] = [];
for (let i = 0; i < (MINUTES * 60) / DT && state.status === 'playing'; i++) {
  if (state.choice) {
    const card = state.choice[Math.floor(Math.random() * state.choice.length)];
    log.push(`${state.time.toFixed(0).padStart(4)}s niveau ${state.hero.level} → carte ${card} (choix : ${state.choice.join(', ')})`);
    chooseCard(state, card);
  }
  if (state.weaponOffer) {
    log.push(`${state.time.toFixed(0).padStart(4)}s arme trouvée : ${state.weaponOffer} (prise)`);
    resolveWeaponOffer(state, true);
  }
  step(state, bot(state), DT);
  for (const ev of state.events) {
    counts[ev.type] = (counts[ev.type] ?? 0) + 1;
    const time = state.time.toFixed(0).padStart(4);
    if (ev.type === 'built') log.push(`${time}s construit ${JSON.stringify(ev.action)}`);
    if (ev.type === 'happening') counts[`happening:${ev.kind}`] = (counts[`happening:${ev.kind}`] ?? 0) + 1;
    if (ev.type === 'equipGained' || ev.type === 'worldAdvance') log.push(`${state.time.toFixed(0).padStart(4)}s ${JSON.stringify(ev)}`);
    if (ev.type === 'bossSpawn' || ev.type === 'bossKilled' || ev.type === 'nightStart' || ev.type === 'dayStart' || ev.type === 'heroDied' || ev.type === 'gameOver' || ev.type === 'structureDestroyed') {
      const house = state.structures.find((s) => s.kind === 'house');
      log.push(`${time}s ${ev.type} ${JSON.stringify(ev)} baraque=${house?.hp.toFixed(0)}/${house?.maxHp} bois=${state.inventory.wood}`);
    }
  }
  state.events.length = 0;
}
console.log(log.join('\n'));
console.log('\nÉvénements :', counts);
console.log('Atouts :', JSON.stringify(state.perks), '| arme', JSON.stringify(state.hero.weapon), '| unités', state.units.length, '| bois récolté', state.stats.woodGathered);
console.log('Fin :', state.status, '| monde', state.world, '| équipement', JSON.stringify(state.equipment), '| niveau', state.hero.level, '| boss', state.bossesKilled, '| temps', state.time.toFixed(0), 's | nuits', state.cycle.night, '| zombies tués', state.stats.zombiesKilled, '| bâtiments', state.structures.length);
