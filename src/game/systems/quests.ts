import { FX_COLORS } from '../fxColors';
import type { GameState, Quest, QuestKind } from '../types';
import { gain } from './common';
import { spawnBurst } from './effects';
import { dropGems } from './progression';

// Missions de la partie : toujours 3 objectifs en cours, renouvelés dès qu'un est réussi.
// Elles donnent une direction (« chasse 3 animaux », « construis 2 bâtiments »...)
// et récompensent en bois, nourriture et gemmes d'XP.

export const QUEST_SLOTS = 3;

const KINDS: QuestKind[] = ['zombies', 'trees', 'animals', 'build', 'gems', 'boss'];

function targetFor(state: GameState, kind: QuestKind) {
  const k = 1 + state.world * 0.6 + state.cycle.night * 0.15;
  switch (kind) {
    case 'zombies':
      return Math.round(30 * k);
    case 'trees':
      return Math.round(6 * k);
    case 'animals':
      return Math.max(2, Math.round(3 * k));
    case 'build':
      return 2;
    case 'gems':
      return Math.round(25 * k);
    case 'boss':
      return 1;
  }
}

function newQuest(state: GameState): Quest {
  const taken = state.quests.map((q) => q.kind);
  const pool = KINDS.filter((k) => !taken.includes(k) && (k !== 'boss' || state.cycle.night >= 1));
  const kind = pool[Math.floor(Math.random() * pool.length)] ?? 'zombies';
  const target = targetFor(state, kind);
  const scale = 1 + state.world * 0.5;
  return {
    id: state.nextId++,
    kind,
    target,
    progress: 0,
    rewardWood: Math.round((kind === 'animals' ? 15 : 25) * scale),
    rewardFood: Math.round((kind === 'animals' || kind === 'boss' ? 15 : 6) * scale),
    rewardGems: kind === 'boss' ? 8 : 4,
  };
}

export function updateQuests(state: GameState) {
  while (state.quests.length < QUEST_SLOTS) state.quests.push(newQuest(state));
  for (const ev of state.events) {
    const kind: QuestKind | null =
      ev.type === 'zombieKilled'
        ? 'zombies'
        : ev.type === 'treeFelled'
          ? 'trees'
          : ev.type === 'animalKilled'
            ? 'animals'
            : ev.type === 'built'
              ? 'build'
              : ev.type === 'gemPicked'
                ? 'gems'
                : ev.type === 'bossKilled'
                  ? 'boss'
                  : null;
    if (!kind) continue;
    for (const q of state.quests) if (q.kind === kind) q.progress++;
  }
  const hero = state.hero;
  for (let i = state.quests.length - 1; i >= 0; i--) {
    const q = state.quests[i];
    if (q.progress < q.target) continue;
    state.quests.splice(i, 1);
    if (q.rewardWood) gain(state, 'wood', q.rewardWood, hero.x - 20, hero.y - 70);
    if (q.rewardFood) gain(state, 'food', q.rewardFood, hero.x + 20, hero.y - 90);
    dropGems(state, hero.x, hero.y, q.rewardGems, 2);
    spawnBurst(state, hero.x, hero.y, 40, 20, 'confetti', FX_COLORS.confetti, 1.3);
    state.events.push({ type: 'questDone', kind: q.kind });
    state.questsDone++;
  }
}
