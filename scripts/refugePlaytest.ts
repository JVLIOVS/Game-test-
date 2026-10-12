// Fait jouer une partie du mode Refuges entre robots (le joueur est aussi un robot).
// Lancer : npx tsx scripts/refugePlaytest.ts
import { botThink } from '../src/modes/refuge/ai';
import { createRefuge, stepRefuge } from '../src/modes/refuge/sim';

const DT = 1 / 60;
const runs = Number(process.argv[2] ?? 5);
for (let r = 0; r < runs; r++) {
  const state = createRefuge();
  const player = state.survivors[0];
  const log: string[] = [];
  let t0 = performance.now();
  let steps = 0;
  while (state.phase !== 'over' && state.time < 600) {
    // Le joueur suit la même logique que les robots.
    botThink(state, player, DT);
    const g = player.goal;
    const d = g ? Math.hypot(g.x - player.x, g.y - player.y) : 0;
    const input = g && d > 6 ? { moveX: (g.x - player.x) / d, moveY: (g.y - player.y) / d } : { moveX: 0, moveY: 0 };
    stepRefuge(state, input, DT);
    steps++;
    for (const ev of state.events) {
      const time = `${state.time.toFixed(0).padStart(4)}s`;
      if (ev.type === 'eliminated') log.push(`${time} éliminé : ${ev.name} (démon niv. ${state.demon.level})`);
      if (ev.type === 'demonKilled') log.push(`${time} DÉMON TUÉ`);
      if (ev.type === 'wave' && ev.boss) log.push(`${time} vague ${ev.wave} avec mini-boss`);
    }
    state.events.length = 0;
  }
  const ms = (performance.now() - t0) / steps;
  t0 = 0;
  console.log(`--- Partie ${r + 1} : ${state.result?.won ? 'victoire' : 'défaite'} | rang ${state.result?.rank} | ${state.result?.survivedSeconds}s | vague ${state.wave} | démon niv. ${state.demon.level} | zombies tués ${state.zombiesKilled} | ${ms.toFixed(2)} ms/image`);
  console.log(log.join('\n'));
  console.log('Refuges :', state.rooms.filter((rm) => rm.owner !== null).map((rm) => `${state.survivors[rm.owner!].name}: porte ${rm.door.level} gén ${rm.gen.level} tourelles ${rm.turrets.map((t) => t.level).join('')}`).join(' | '));
}
