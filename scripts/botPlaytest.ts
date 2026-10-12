// Fait jouer un robot simple pour vérifier les règles et l'équilibrage.
// Lancer : npx tsx scripts/botPlaytest.ts
import { createGame, step } from '../src/game/simulation';
import { META_UPGRADES, emptyMeta, runBonuses, soulsEarned } from '../src/meta/upgrades';
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
  const affordable = state.pads.filter(
    (p) => state.inventory.wood >= p.cost - p.paid && state.inventory.food >= p.foodCost - p.foodPaid,
  );
  const pad = affordable.sort((a, b) => a.cost - a.paid - (b.cost - b.paid))[0];
  if (pad) return moveTo(state, pad.x, pad.y);
  const tree = state.trees
    .filter((t) => t.state === 'standing')
    .sort((a, b) => Math.hypot(a.x - hero.x, a.y - hero.y) - Math.hypot(b.x - hero.x, b.y - hero.y))[0];
  return tree ? moveTo(state, tree.x, tree.y) : { moveX: 0, moveY: 0 };
}

// META=max : toutes les améliorations permanentes achetées.
const meta = emptyMeta();
if (process.env.META === 'max') {
  for (const u of META_UPGRADES) meta.upgrades[u.id] = u.maxLevel;
  meta.weapons = ['sword', 'spear', 'hammer', 'daggers'];
  meta.perks = ['bow', 'orbit', 'bomb', 'lightning', 'engineer', 'frost', 'poison', 'wolf'];
}
const state = createGame(runBonuses(meta));
let maxZombies = 0;
let simMs = 0;
let steps = 0;
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
  const t0 = performance.now();
  step(state, bot(state), DT);
  simMs += performance.now() - t0;
  steps++;
  maxZombies = Math.max(maxZombies, state.zombies.length);
  if (process.env.DUMP && state.cycle.phase === 'night' && state.cycle.timer > 150) {
    console.log('BLOQUÉ', JSON.stringify(state.zombies.map((z) => ({ dx: Math.round(z.x - state.base.x), dy: Math.round(z.y - state.base.y), kind: z.kind, golden: z.golden, hunter: z.hunter, boss: z.boss, size: z.bossSize, hp: z.hp, speed: z.speed, vx: Math.round(z.vx), vy: Math.round(z.vy), slow: z.slow }))));
    console.log('héros', Math.round(state.hero.x - state.base.x), Math.round(state.hero.y - state.base.y), 'structures proches', JSON.stringify(state.structures.filter((st) => state.zombies.some((z) => Math.hypot(z.x - st.x, z.y - st.y) < 80)).map((st) => ({ kind: st.kind, slot: st.slot, hp: st.hp }))));
    break;
  }
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
console.log('Perf : zombies max', maxZombies, '| simulation', (simMs / steps).toFixed(2), 'ms par image | missions', state.questsDone, '| nourriture', state.inventory.food, '| murs niv.', state.wallLevel, '| tours', state.structures.filter((s) => s.kind === 'tower').map((s) => s.level).join(','));
console.log('Âmes gagnées :', soulsEarned({ kills: state.stats.zombiesKilled, bosses: state.bossesKilled, nights: state.cycle.night, world: state.world, quests: state.questsDone }));
console.log('Atouts :', JSON.stringify(state.perks), '| arme', JSON.stringify(state.hero.weapon), '| unités', state.units.length, '| bois récolté', state.stats.woodGathered);
console.log('Fin :', state.status, '| monde', state.world, '| équipement', JSON.stringify(state.equipment), '| niveau', state.hero.level, '| boss', state.bossesKilled, '| temps', state.time.toFixed(0), 's | nuits', state.cycle.night, '| zombies tués', state.stats.zombiesKilled, '| bâtiments', state.structures.length);

if (process.env.DUMP) {
  console.log('night', state.cycle.night, 'world', state.world, 'spawnTimer', state.cycle.spawnTimer, 'angles', JSON.stringify(state.cycle.hordeAngles), 'phase', state.cycle.phase, 'toSpawn', state.cycle.toSpawn, 'boss', state.cycle.bossSpawned, 'zombies', state.zombies.length);
  console.log(state.zombies.slice(0, 6).map((z) => ({ dx: Math.round(z.x - state.base.x), dy: Math.round(z.y - state.base.y), kind: z.kind, hunter: z.hunter, boss: z.boss, hp: z.hp, vx: Math.round(z.vx), vy: Math.round(z.vy) })));
  console.log('héros', Math.round(state.hero.x - state.base.x), Math.round(state.hero.y - state.base.y), 'mort', state.hero.dead);
}
