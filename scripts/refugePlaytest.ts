// Fait jouer des parties du mode Refuges entre robots (le joueur est aussi un robot).
// Lancer : npx tsx scripts/refugePlaytest.ts 5        (rôle survivant)
//          ROLE=demon npx tsx scripts/refugePlaytest.ts 5   (rôle Démon, piloté par l'ordinateur)
import { botThink } from '../src/modes/refuge/ai';
import { CHARACTER_IDS } from '../src/modes/refuge/data';
import { createRefuge, stepRefuge } from '../src/modes/refuge/sim';
import type { CharacterId } from '../src/modes/refuge/types';

const DT = 1 / 60;
const runs = Number(process.argv[2] ?? 5);
const role = process.env.ROLE === 'demon' ? 'demon' : 'survivor';
const stats = { won: 0, rankSum: 0, found: 0, demonKilled: 0, prizes: {} as Record<string, number>, byChar: {} as Record<string, number[]> };
for (let r = 0; r < runs; r++) {
  const character = (process.env.CHAR as CharacterId) ?? CHARACTER_IDS[r % CHARACTER_IDS.length];
  const state = createRefuge({ role, character, demonAI: true });
  const player = state.survivors[0];
  const log: string[] = [];
  const t0 = performance.now();
  let steps = 0;
  while (state.phase !== 'over' && state.time < 700) {
    // Le joueur suit la même logique que les robots.
    if (state.role === 'survivor') botThink(state, player, DT);
    const g = player.goal;
    const d = g ? Math.hypot(g.x - player.x, g.y - player.y) : 0;
    const input = state.role === 'survivor' && g && d > 6 ? { moveX: (g.x - player.x) / d, moveY: (g.y - player.y) / d } : { moveX: 0, moveY: 0 };
    stepRefuge(state, input, DT);
    // La roue du joueur s'affiche en vrai ; ici on la referme tout de suite.
    if (state.wheel) {
      stats.prizes[state.wheel.prize] = (stats.prizes[state.wheel.prize] ?? 0) + 1;
      log.push(`${state.time.toFixed(0).padStart(4)}s roue manche ${state.wheel.round} : ${state.wheel.prize}${state.wheel.artifact ? ` (${state.wheel.artifact})` : ''} chance ${(state.wheel.luck * 100).toFixed(0)} %`);
      state.wheel = null;
    }
    steps++;
    for (const ev of state.events) {
      const time = `${state.time.toFixed(0).padStart(4)}s`;
      if (ev.type === 'eliminated') log.push(`${time} éliminé : ${ev.name} (démon niv. ${state.demon.level})`);
      if (ev.type === 'demonKilled') log.push(`${time} DÉMON TUÉ`);
      if (ev.type === 'demonPower') log.push(`${time} pouvoir ${ev.power} niv. ${ev.level}`);
      if (ev.type === 'demonActive') log.push(`${time} utilise ${ev.power}`);
    }
    state.events.length = 0;
  }
  const ms = (performance.now() - t0) / steps;
  const res = state.result!;
  if (res.won) stats.won++;
  stats.rankSum += res.rank;
  stats.found += res.found;
  if (state.demon.hp <= 0) stats.demonKilled++;
  (stats.byChar[character] ??= []).push(res.rank);
  console.log(`--- Partie ${r + 1} (${role}, ${character}) : ${res.won ? 'victoire' : 'défaite'} | rang ${res.rank} | trouvés ${res.found}/6 | ${res.survivedSeconds}s | vague ${state.wave} | démon niv. ${state.demon.level} | ${ms.toFixed(2)} ms/image`);
  if (process.env.LOG) console.log(log.join('\n'));
  console.log(
    'Refuges :',
    state.rooms
      .filter((rm) => rm.owner !== null)
      .map((rm) => `${state.survivors[rm.owner!].name}(${state.survivors[rm.owner!].character}): porte ${rm.door.level} gén ${rm.gen.level} tour. ${rm.turrets.map((t) => t.level).join('')} art. ${rm.artifacts.map((a) => a ?? '-').join(',')}`)
      .join(' | '),
  );
}
console.log(`\nBilan ${runs} parties : victoires ${stats.won}, rang moyen ${(stats.rankSum / runs).toFixed(1)}, trouvés moyen ${(stats.found / runs).toFixed(1)}, Démon tué ${stats.demonKilled}`);
console.log('Rangs par personnage :', JSON.stringify(stats.byChar), '| gains du joueur :', JSON.stringify(stats.prizes));
