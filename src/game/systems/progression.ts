import { GEM_PICKUP_RADIUS, GEM_PULL_SPEED, HERO_MAX_HP, xpToNext } from '../constants';
import { PERK_VALUES, drawCards } from '../data/perks';
import { FX_COLORS } from '../fxColors';
import type { CardId, GameState } from '../types';
import { dist, gain, nextId } from './common';
import { spawnBurst, spawnText } from './effects';

export function dropGems(state: GameState, x: number, y: number, count: number, value: number) {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const r = count > 1 ? 14 + Math.random() * 30 : 0;
    state.gems.push({ id: nextId(state), x: x + Math.cos(a) * r, y: y + Math.sin(a) * r * 0.7, value, pulled: false, age: 0 });
  }
}

function addXp(state: GameState, amount: number) {
  const hero = state.hero;
  hero.xp += amount;
  while (hero.xp >= xpToNext(hero.level)) {
    hero.xp -= xpToNext(hero.level);
    hero.level++;
    state.pendingLevelUps++;
    state.events.push({ type: 'levelUp', level: hero.level });
    spawnBurst(state, hero.x, hero.y, 30, 18, 'confetti', FX_COLORS.confetti, 1.2);
  }
}

export function updateGems(state: GameState, dt: number) {
  const hero = state.hero;
  const magnet = PERK_VALUES.magnet.radius[state.perks.magnet];
  for (let i = state.gems.length - 1; i >= 0; i--) {
    const g = state.gems[i];
    g.age += dt;
    if (hero.dead) continue;
    const d = dist(g.x, g.y, hero.x, hero.y - 20);
    if (!g.pulled && d < magnet) g.pulled = true;
    if (g.pulled) {
      const speed = GEM_PULL_SPEED * Math.min(1, 0.4 + g.age);
      g.x += ((hero.x - g.x) / (d || 1)) * speed * dt;
      g.y += ((hero.y - 20 - g.y) / (d || 1)) * speed * dt;
    }
    if (d < GEM_PICKUP_RADIUS) {
      state.gems.splice(i, 1);
      state.events.push({ type: 'gemPicked' });
      addXp(state, g.value);
    }
  }
  // Ouvre le choix de cartes dès qu'un niveau est en attente.
  if (!state.choice && state.pendingLevelUps > 0 && !hero.dead) {
    state.choice = drawCards(state);
  }
}

export function chooseCard(state: GameState, card: CardId) {
  if (!state.choice || !state.choice.includes(card)) return;
  const hero = state.hero;
  if (card === 'heal') {
    hero.hp = hero.maxHp;
    spawnText(state, hero.x, hero.y - 60, '+♥', FX_COLORS.textHeal);
  } else if (card === 'woodBag') {
    gain(state, 'wood', 25, hero.x, hero.y - 60);
  } else {
    state.perks[card]++;
    if (card === 'vigor') {
      const before = hero.maxHp;
      hero.maxHp = HERO_MAX_HP + PERK_VALUES.vigor.hpBonus[state.perks.vigor];
      hero.hp += hero.maxHp - before;
    }
    if (card === 'architect') {
      for (const s of state.structures) {
        const ratio = s.hp / s.maxHp;
        s.maxHp = Math.round(s.maxHp * ((1 + PERK_VALUES.architect.hpBonus[state.perks.architect]) / (1 + PERK_VALUES.architect.hpBonus[state.perks.architect - 1])));
        s.hp = Math.round(s.maxHp * ratio);
      }
    }
  }
  spawnBurst(state, hero.x, hero.y, 30, 14, 'confetti', FX_COLORS.confetti, 1);
  state.pendingLevelUps--;
  state.choice = null;
}
