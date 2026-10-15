// Fait s'affronter deux ordinateurs en mode Époques.
// Lancer : npx tsx scripts/epochPlaytest.ts 5
import { createEpoch, stepEpoch } from '../src/modes/epoch/sim';

const DT = 1 / 60;
const runs = Number(process.argv[2] ?? 5);
let wins = 0;
for (let r = 0; r < runs; r++) {
  const s = createEpoch();
  if (process.env.WEAK) s.bases[0].gold = 0;
  const log: string[] = [];
  const t0 = performance.now();
  let steps = 0;
  while (!s.result && s.time < 1200) {
    stepEpoch(s, DT, [0, 1]);
    steps++;
    for (const ev of s.events) if (ev.type === 'evolve') log.push(`${s.time.toFixed(0)}s camp ${ev.side} → époque ${ev.age + 1}`);
    s.events.length = 0;
  }
  if (s.result?.won) wins++;
  console.log(`--- Partie ${r + 1} : ${s.result ? (s.result.won ? 'camp 0 gagne' : 'camp 1 gagne') : 'pas de fin'} en ${s.time.toFixed(0)}s | troupes ${s.units.length} | tués ${s.kills.join('/')} | ${((performance.now() - t0) / steps).toFixed(3)} ms/image`);
  console.log('  ' + log.join(' | '));
}
console.log(`camp 0 : ${wins}/${runs}`);
