import { DAY_LENGTH, MAX_ZOMBIES, NIGHT_SPAWN_SPREAD, zombieWave } from '../constants';
import { EQUIP_ORDER, EQUIP_TIER_COLORS, equipStats } from '../data/equipment';
import { ROUNDS_PER_WORLD } from '../data/worlds';
import { FX_COLORS } from '../fxColors';
import type { GameState } from '../types';
import { repairAll } from './build';
import { spawnBurst } from './effects';
import { spawnBoss, spawnPoint, spawnZombie } from './zombies';

const HORDE_INTERVAL = 0.9;
import { HERO_MAX_HP } from '../constants';

/** Récompense de manche : l'épée, le bouclier puis l'armure du palier du monde. */
function grantEquipment(state: GameState) {
  const slot = EQUIP_ORDER[state.roundInWorld - 1];
  const tier = Math.min(state.world + 1, EQUIP_TIER_COLORS.length - 1);
  if (!slot || state.equipment[slot] >= tier) return;
  state.equipment[slot] = tier;
  const hero = state.hero;
  const maxHp = HERO_MAX_HP + equipStats(state).hpBonus;
  hero.hp += maxHp - hero.maxHp;
  hero.maxHp = maxHp;
  spawnBurst(state, hero.x, hero.y, 30, 20, 'confetti', FX_COLORS.confetti, 1.3);
  state.events.push({ type: 'equipGained', slot, tier });
}

export function updateCycle(state: GameState, dt: number) {
  const c = state.cycle;
  const targetDark = c.phase === 'night' ? 1 : 0;
  c.darkness += (targetDark - c.darkness) * (1 - Math.exp(-1.5 * dt));

  if (c.phase === 'day') {
    c.timer -= dt;
    if (c.timer > 0) return;
    c.phase = 'night';
    c.night++;
    state.roundInWorld++;
    c.timer = 0;
    c.toSpawn = zombieWave(c.night, state.world).count;
    c.spawnTimer = 1.5;
    c.bossSpawned = false;
    // 2 à 4 directions d'invasion, de plus en plus avec les nuits.
    const dirs = Math.min(4, 2 + Math.floor(c.night / 3));
    const start = Math.random() * Math.PI * 2;
    c.hordeAngles = Array.from({ length: dirs }, (_, i) => start + (i / dirs) * Math.PI * 2 + (Math.random() - 0.5) * 0.6);
    state.events.push({ type: 'nightStart', night: c.night });
    return;
  }

  c.timer += dt;
  if (c.toSpawn > 0) {
    c.spawnTimer -= dt;
    if (c.spawnTimer <= 0 && state.zombies.length < MAX_ZOMBIES) {
      // Une horde sort d'une des directions d'invasion.
      const total = zombieWave(c.night, state.world).count;
      const groups = Math.max(1, Math.round(NIGHT_SPAWN_SPREAD / HORDE_INTERVAL));
      const size = Math.min(c.toSpawn, Math.max(2, Math.ceil(total / groups)));
      const angle = c.hordeAngles[Math.floor(Math.random() * c.hordeAngles.length)] ?? Math.random() * Math.PI * 2;
      const center = spawnPoint(state, angle + (Math.random() - 0.5) * 0.25);
      for (let i = 0; i < size; i++) {
        spawnZombie(state, c.night, { x: center.x + (Math.random() - 0.5) * 120, y: center.y + (Math.random() - 0.5) * 120 });
      }
      c.toSpawn -= size;
      c.spawnTimer = HORDE_INTERVAL;
    }
  } else if (!c.bossSpawned) {
    // Fin de vague : mini-boss aux manches 1 et 2, gros boss à la manche 3.
    c.bossSpawned = true;
    const size = state.roundInWorld >= ROUNDS_PER_WORLD ? 'big' : 'mini';
    spawnBoss(state, c.night, size);
    state.events.push({ type: 'bossSpawn', round: state.roundInWorld });
  } else if (state.zombies.every((z) => z.golden)) {
    // Boss battu et vague repoussée : manche validée, le jour se lève.
    c.phase = 'day';
    c.timer = DAY_LENGTH;
    repairAll(state);
    for (const g of state.gems) g.pulled = true;
    state.events.push({ type: 'roundCleared', round: state.roundInWorld });
    grantEquipment(state);
    if (state.roundInWorld >= ROUNDS_PER_WORLD) {
      // Gros boss battu : on passe au monde suivant.
      state.world++;
      state.roundInWorld = 0;
      state.padsDirty = true;
      state.events.push({ type: 'worldAdvance', world: state.world });
    }
    state.events.push({ type: 'dayStart', day: c.night + 1 });
  }
}
