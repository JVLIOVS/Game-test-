import { DAY_LENGTH, NIGHT_SPAWN_SPREAD, zombieWave } from '../constants';
import type { GameState } from '../types';
import { repairAll } from './build';
import { spawnZombie } from './zombies';

export function updateCycle(state: GameState, dt: number) {
  const c = state.cycle;
  const targetDark = c.phase === 'night' ? 1 : 0;
  c.darkness += (targetDark - c.darkness) * (1 - Math.exp(-1.5 * dt));

  if (c.phase === 'day') {
    c.timer -= dt;
    if (c.timer > 0) return;
    c.phase = 'night';
    c.night++;
    c.timer = 0;
    c.toSpawn = zombieWave(c.night).count;
    c.spawnTimer = 1.5;
    state.events.push({ type: 'nightStart', night: c.night });
    return;
  }

  c.timer += dt;
  if (c.toSpawn > 0) {
    c.spawnTimer -= dt;
    if (c.spawnTimer <= 0) {
      spawnZombie(state, c.night);
      c.toSpawn--;
      c.spawnTimer = NIGHT_SPAWN_SPREAD / zombieWave(c.night).count;
    }
  } else if (state.zombies.length === 0) {
    // Vague repoussée : le jour se lève et la base est réparée.
    c.phase = 'day';
    c.timer = DAY_LENGTH;
    repairAll(state);
    state.events.push({ type: 'dayStart', day: c.night + 1 });
  }
}
