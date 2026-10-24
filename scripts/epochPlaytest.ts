// Mode Époques : un « joueur » simulé (le cerveau de l'ordi en Moyen, sans bonus d'or)
// affronte l'ordinateur au niveau choisi.
// Lancer : DIFF=hardcore npx tsx scripts/epochPlaytest.ts 5   (PLAYER=hard pour un joueur plus fort)
import { aiThink } from '../src/modes/epoch/ai';
import { createEpoch, stepEpoch } from '../src/modes/epoch/sim';
import type { Difficulty } from '../src/modes/epoch/types';

const DT = 1 / 60;
const runs = Number(process.argv[2] ?? 5);
const difficulty = (process.env.DIFF ?? 'normal') as Difficulty;
const player = (process.env.PLAYER ?? 'normal') as Difficulty;
let wins = 0;
let total = 0;
for (let r = 0; r < runs; r++) {
  const s = createEpoch({ difficulty, aiSides: [1] });
  const log: string[] = [];
  while (!s.result && s.time < 1200) {
    s.difficulty = player;
    aiThink(s, 0, DT);
    s.difficulty = difficulty;
    stepEpoch(s, DT);
    for (const ev of s.events) if (ev.type === 'evolve') log.push(`${s.time.toFixed(0)}s ${ev.side ? 'ordi' : 'joueur'} → ${ev.age + 1}`);
    s.events.length = 0;
  }
  if (s.result?.won) wins++;
  total += s.time;
  console.log(`--- ${r + 1} : ${s.result ? (s.result.won ? 'joueur gagne' : 'ordi gagne') : 'pas de fin'} en ${s.time.toFixed(0)}s | tués ${s.kills.join('/')} | boost ${s.aiBoost.toFixed(2)} | tourelles ordi ${s.bases[1].turrets.map((t) => (t.type ? t.type[0] + t.level : '-')).join(' ')}`);
  if (process.env.LOG) console.log('  ' + log.join(' | '));
}
console.log(`${difficulty} : joueur ${wins}/${runs}, durée moyenne ${(total / runs).toFixed(0)}s`);
