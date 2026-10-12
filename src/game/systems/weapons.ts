import { ARROW_SPEED } from '../constants';
import { damageMult } from '../data/equipment';
import { PERK_VALUES, perkPhase, starDamage, starRate } from '../data/perks';
import { FX_COLORS } from '../fxColors';
import type { GameState, Zombie } from '../types';
import { damageZombie } from './combat';
import { dist, nextId } from './common';
import { addTrauma, spawnBurst } from './effects';

// Atouts du héros. Chaque phase transforme l'atout, pas seulement ses chiffres :
// - Arc : flèches → flèches de feu (flammes au sol) → + pluie de flèches
// - Haches : 1 hache → 2 haches enflammées → tornade de 4 lames d'or
// - Bombes : bombe → bombe incendiaire → fragmentation + météore
// - Éclair : étincelle → éclair en chaîne → nuage d'orage
// - Ingénieur : tours renforcées → tourelle portable → canons explosifs
// - Givre : aura qui ralentit → aura plus large → blizzard avec onde de gel
// - Poison : fiole → 2 fioles → peste (les zombies empoisonnés explosent en nuage)
// - Loups : 1 loup → 2 loups → meute avec un loup alpha géant

const BOW_RANGE = 290;
const BOMB_RANGE = 300;
const LIGHTNING_RANGE = 340;
const CHAIN_RANGE = 130;
const ORBIT_HIT_COOLDOWN = 0.45;
const ORBIT_SPIN = 3.6;
const MAX_HAZARDS = 28;
const PET_SPEED = 240;
const PET_REACH = 22;
const PET_RANGE = 280;
const TURRET_LIFE = 12;
const TURRET_RANGE = 230;

function nearestZombies(state: GameState, x: number, y: number, range: number, count: number): Zombie[] {
  return state.zombies
    .map((z) => ({ z, d: dist(x, y, z.x, z.y) }))
    .filter((e) => e.d < range)
    .sort((a, b) => a.d - b.d)
    .slice(0, count)
    .map((e) => e.z);
}

/** Le point où les zombies sont les plus nombreux autour du héros (pour la pluie de flèches et le météore). */
function densestPoint(state: GameState, range: number) {
  const hero = state.hero;
  let best: Zombie | null = null;
  let bestCount = 0;
  const near = state.zombies.filter((z) => dist(z.x, z.y, hero.x, hero.y) < range);
  for (const z of near) {
    let c = 0;
    for (const o of near) if (dist(z.x, z.y, o.x, o.y) < 90) c++;
    if (c > bestCount) {
      bestCount = c;
      best = z;
    }
  }
  return best;
}

/** Positions des haches tournoyantes autour du héros. */
export function orbitPositions(state: GameState) {
  const phase = perkPhase(state.perks.orbit);
  const n = PERK_VALUES.orbit.count[phase];
  const r = PERK_VALUES.orbit.radius[phase];
  const out: { x: number; y: number; angle: number }[] = [];
  const hero = state.hero;
  for (let i = 0; i < n; i++) {
    const a = state.weaponTimers.orbitAngle + (i / n) * Math.PI * 2;
    out.push({ x: hero.x + Math.cos(a) * r, y: hero.y - 20 + Math.sin(a) * r * 0.75, angle: a });
  }
  return out;
}

export function addHazard(state: GameState, x: number, y: number, radius: number, kind: 'fire' | 'toxic', dps: number, life: number) {
  if (state.hazards.length >= MAX_HAZARDS) state.hazards.shift();
  state.hazards.push({ x, y, radius, kind, dps, life, maxLife: life });
}

export function explode(state: GameState, x: number, y: number, radius: number, damage: number, big = true) {
  for (const z of [...state.zombies]) {
    if (dist(x, y, z.x, z.y) < radius + z.radius) damageZombie(state, z, damage, x, y);
  }
  spawnBurst(state, x, y, 10, big ? 22 : 10, 'goo', FX_COLORS.fire, big ? 1.5 : 1);
  spawnBurst(state, x, y, 0, big ? 10 : 5, 'dust', FX_COLORS.dust, big ? 1.6 : 1);
  addTrauma(state, big ? 0.3 : 0.12);
}

function shootArrow(state: GameState, fromX: number, fromY: number, z: Zombie, damage: number, style: 'bow1' | 'bow2' | 'bow3' | 'tower') {
  const d = dist(fromX, fromY, z.x, z.y - 20) || 1;
  state.projectiles.push({
    x: fromX,
    y: fromY,
    vx: ((z.x - fromX) / d) * ARROW_SPEED,
    vy: ((z.y - 20 - fromY) / d) * ARROW_SPEED,
    life: 1.2,
    damage,
    targetId: z.id,
    style,
    splash: style === 'bow3' ? 40 : 0,
  });
}

/** Mort d'un zombie empoisonné avec la Peste : il éclate en nuage toxique. */
export function onZombieDeath(state: GameState, z: Zombie) {
  if (z.poisonTime > 0 && perkPhase(state.perks.poison) >= 3) {
    addHazard(state, z.x, z.y, 50, 'toxic', PERK_VALUES.poison.dps[3] * damageMult(state), 2.5);
  }
}

export function updateWeapons(state: GameState, dt: number) {
  const hero = state.hero;
  const p = state.perks;
  const timers = state.weaponTimers;
  const mult = damageMult(state);
  const armed = !hero.dead;
  const ph = {
    bow: perkPhase(p.bow),
    orbit: perkPhase(p.orbit),
    bomb: perkPhase(p.bomb),
    lightning: perkPhase(p.lightning),
    engineer: perkPhase(p.engineer),
    frost: perkPhase(p.frost),
    poison: perkPhase(p.poison),
    wolf: perkPhase(p.wolf),
  };
  timers.orbitAngle += dt * ORBIT_SPIN * (ph.orbit >= 3 ? 1.4 : 1);
  for (const z of state.zombies) {
    z.orbitCooldown = Math.max(0, z.orbitCooldown - dt);
  }

  // ---------- Arc ----------
  if (armed && ph.bow > 0) {
    timers.bow -= dt;
    if (timers.bow <= 0) {
      const targets = nearestZombies(state, hero.x, hero.y, BOW_RANGE, PERK_VALUES.bow.arrows[ph.bow]);
      if (targets.length) {
        timers.bow = PERK_VALUES.bow.interval[ph.bow] / starRate(p.bow);
        const style = ph.bow === 1 ? 'bow1' : ph.bow === 2 ? 'bow2' : 'bow3';
        for (const z of targets) shootArrow(state, hero.x, hero.y - 30, z, Math.round(PERK_VALUES.bow.damage[ph.bow] * mult * starDamage(p.bow)), style);
      }
    }
    if (ph.bow >= 3) {
      timers.volley -= dt;
      const center = timers.volley <= 0 ? densestPoint(state, BOW_RANGE + 60) : null;
      if (center) {
        timers.volley = PERK_VALUES.bow.volleyInterval / starRate(p.bow);
        for (let i = 0; i < PERK_VALUES.bow.volley[3]; i++) {
          state.skyDrops.push({
            x: center.x + (Math.random() - 0.5) * 150,
            y: center.y + (Math.random() - 0.5) * 110,
            t: -i * 0.05,
            duration: 0.45,
            radius: 26,
            damage: Math.round(18 * mult * starDamage(p.bow)),
            kind: 'arrow',
          });
        }
      }
    }
  }

  // ---------- Haches tournoyantes ----------
  if (armed && ph.orbit > 0) {
    const damage = Math.round(PERK_VALUES.orbit.damage[ph.orbit] * mult * starDamage(p.orbit));
    const reach = 16 * PERK_VALUES.orbit.size[ph.orbit];
    for (const o of orbitPositions(state)) {
      for (const z of [...state.zombies]) {
        if (z.orbitCooldown > 0) continue;
        if (dist(o.x, o.y, z.x, z.y - 20) < z.radius + reach) {
          z.orbitCooldown = ORBIT_HIT_COOLDOWN;
          damageZombie(state, z, damage, hero.x, hero.y);
          if (ph.orbit === 2 && Math.random() < 0.25) addHazard(state, z.x, z.y, 28, 'fire', 8 * mult, 1.5);
        }
      }
    }
  }

  // ---------- Bombes ----------
  if (armed && ph.bomb > 0) {
    timers.bomb -= dt;
    if (timers.bomb <= 0) {
      const [z] = nearestZombies(state, hero.x, hero.y, BOMB_RANGE, 1);
      if (z) {
        timers.bomb = PERK_VALUES.bomb.interval[ph.bomb] / starRate(p.bomb);
        state.bombs.push({
          fromX: hero.x,
          fromY: hero.y - 30,
          toX: z.x + z.vx * 0.5,
          toY: z.y + z.vy * 0.5,
          t: 0,
          duration: 0.55,
          radius: PERK_VALUES.bomb.radius[ph.bomb],
          damage: Math.round(PERK_VALUES.bomb.damage[ph.bomb] * mult * starDamage(p.bomb)),
          phase: ph.bomb,
          cluster: PERK_VALUES.bomb.cluster[ph.bomb],
        });
      }
    }
    if (ph.bomb >= 3) {
      timers.meteor -= dt;
      const center = timers.meteor <= 0 ? densestPoint(state, 420) : null;
      if (center) {
        timers.meteor = PERK_VALUES.bomb.meteorInterval / starRate(p.bomb);
        state.skyDrops.push({ x: center.x, y: center.y, t: 0, duration: 1.1, radius: 150, damage: Math.round(110 * mult * starDamage(p.bomb)), kind: 'meteor' });
      }
    }
  }
  for (let i = state.bombs.length - 1; i >= 0; i--) {
    const b = state.bombs[i];
    b.t += dt / b.duration;
    if (b.t < 1) continue;
    state.bombs.splice(i, 1);
    explode(state, b.toX, b.toY, b.radius, b.damage, b.cluster >= 0);
    if (b.phase >= 2 && b.cluster >= 0) addHazard(state, b.toX, b.toY, b.radius * 0.7, 'fire', 10 * mult, 2.5);
    state.events.push({ type: 'bombExploded' });
    for (let k = 0; k < b.cluster; k++) {
      const a = (k / b.cluster) * Math.PI * 2 + Math.random();
      state.bombs.push({
        fromX: b.toX,
        fromY: b.toY,
        toX: b.toX + Math.cos(a) * 85,
        toY: b.toY + Math.sin(a) * 65,
        t: 0,
        duration: 0.4,
        radius: b.radius * 0.6,
        damage: Math.round(b.damage * 0.6),
        phase: b.phase,
        cluster: -1,
      });
    }
  }

  // ---------- Pluie de flèches et météores ----------
  for (let i = state.skyDrops.length - 1; i >= 0; i--) {
    const d = state.skyDrops[i];
    d.t += dt / d.duration;
    if (d.t < 1) continue;
    state.skyDrops.splice(i, 1);
    if (d.kind === 'meteor') {
      explode(state, d.x, d.y, d.radius, d.damage, true);
      addHazard(state, d.x, d.y, d.radius * 0.6, 'fire', 18 * mult, 3);
      state.novas.push({ x: d.x, y: d.y, radius: d.radius * 1.3, life: 0.5, maxLife: 0.5, kind: 'meteor' });
      addTrauma(state, 0.7);
      state.events.push({ type: 'bombExploded' });
    } else {
      for (const z of [...state.zombies]) if (dist(d.x, d.y, z.x, z.y) < d.radius + z.radius) damageZombie(state, z, d.damage, d.x, d.y - 10, 120);
      spawnBurst(state, d.x, d.y, 0, 2, 'dust', FX_COLORS.dust, 0.6);
    }
  }

  // ---------- Éclair ----------
  if (armed && ph.lightning > 0) {
    timers.lightning -= dt;
    if (timers.lightning <= 0) {
      const inRange = state.zombies.filter((z) => dist(hero.x, hero.y, z.x, z.y) < LIGHTNING_RANGE);
      if (inRange.length) {
        timers.lightning = PERK_VALUES.lightning.interval[ph.lightning] / starRate(p.lightning);
        const strikes = Math.min(inRange.length, PERK_VALUES.lightning.strikes[ph.lightning]);
        const damage = Math.round(PERK_VALUES.lightning.damage[ph.lightning] * mult * starDamage(p.lightning));
        for (let k = 0; k < strikes; k++) {
          const first = inRange.splice(Math.floor(Math.random() * inRange.length), 1)[0];
          // Éclair en chaîne : saute de zombie en zombie.
          const hit = new Set<Zombie>([first]);
          const chain: { x: number; y: number }[] = [];
          let cur = first;
          for (let j = 0; j < PERK_VALUES.lightning.chain[ph.lightning]; j++) {
            let next: Zombie | null = null;
            let nd = CHAIN_RANGE;
            for (const z of state.zombies) {
              if (hit.has(z)) continue;
              const d = dist(cur.x, cur.y, z.x, z.y);
              if (d < nd) {
                nd = d;
                next = z;
              }
            }
            if (!next) break;
            hit.add(next);
            chain.push({ x: next.x, y: next.y });
            cur = next;
          }
          state.bolts.push({ x: first.x, y: first.y, life: 0.28, seed: Math.random() * 1000, phase: ph.lightning, chain });
          let dmg = damage;
          for (const z of hit) {
            spawnBurst(state, z.x, z.y, 5, 4, 'goo', ['#FFFFFF', '#BFE9FF', '#FFE14D'], 1);
            damageZombie(state, z, Math.round(dmg), z.x, z.y - 1, 60);
            dmg *= 0.85;
          }
        }
        addTrauma(state, 0.12);
        state.events.push({ type: 'lightning' });
      }
    }
  }
  for (let i = state.bolts.length - 1; i >= 0; i--) {
    state.bolts[i].life -= dt;
    if (state.bolts[i].life <= 0) state.bolts.splice(i, 1);
  }

  // ---------- Ingénieur : tourelles portables ----------
  if (armed && ph.engineer >= 2) {
    timers.deploy -= dt;
    if (timers.deploy <= 0 && state.zombies.length > 0) {
      timers.deploy = PERK_VALUES.engineer.deployInterval[ph.engineer];
      state.turrets.push({ x: hero.x + hero.dirX * 34, y: hero.y + 10, life: TURRET_LIFE, cooldown: 0.3, pop: 0 });
      spawnBurst(state, hero.x + hero.dirX * 34, hero.y + 10, 0, 6, 'dust', FX_COLORS.dust, 0.8);
    }
  }
  for (let i = state.turrets.length - 1; i >= 0; i--) {
    const t = state.turrets[i];
    t.life -= dt;
    t.pop = Math.min(1, t.pop + dt / 0.35);
    if (t.life <= 0) {
      spawnBurst(state, t.x, t.y, 10, 6, 'dust', FX_COLORS.dust, 0.8);
      state.turrets.splice(i, 1);
      continue;
    }
    t.cooldown -= dt;
    if (t.cooldown > 0) continue;
    const [z] = nearestZombies(state, t.x, t.y, TURRET_RANGE, 1);
    if (!z) continue;
    t.cooldown = 0.55;
    shootArrow(state, t.x, t.y - 30, z, Math.round(14 * mult * starDamage(p.engineer)), ph.engineer >= 3 ? 'bow2' : 'tower');
  }

  // ---------- Givre : aura qui ralentit et blesse ----------
  const dot = (timers.tick += dt) >= 0.25;
  if (dot) timers.tick = 0;
  if (armed && ph.frost > 0) {
    const r = PERK_VALUES.frost.radius[ph.frost];
    const slow = PERK_VALUES.frost.slow[ph.frost];
    const dps = PERK_VALUES.frost.dps[ph.frost] * mult * starDamage(p.frost);
    for (const z of [...state.zombies]) {
      if (dist(z.x, z.y, hero.x, hero.y) > r + z.radius) continue;
      z.slow = Math.max(z.slow, z.boss ? slow * 0.5 : slow);
      if (dot) damageZombie(state, z, Math.max(1, Math.round(dps * 0.25)), hero.x, hero.y, 0);
    }
    if (ph.frost >= 3) {
      timers.nova -= dt;
      if (timers.nova <= 0) {
        timers.nova = PERK_VALUES.frost.novaInterval / starRate(p.frost);
        const novaR = r * 1.4;
        for (const z of [...state.zombies]) {
          if (dist(z.x, z.y, hero.x, hero.y) < novaR) damageZombie(state, z, Math.round(PERK_VALUES.frost.novaDamage * mult * starDamage(p.frost)), hero.x, hero.y, 200);
        }
        state.novas.push({ x: hero.x, y: hero.y, radius: novaR, life: 0.5, maxLife: 0.5, kind: 'frost' });
        spawnBurst(state, hero.x, hero.y, 20, 20, 'confetti', ['#FFFFFF', '#BFE9FF', '#8EC5FF'], 1.4);
        addTrauma(state, 0.2);
      }
    }
  }

  // ---------- Poison : fioles qui laissent des nuages toxiques ----------
  if (armed && ph.poison > 0) {
    timers.poison -= dt;
    if (timers.poison <= 0) {
      const targets = nearestZombies(state, hero.x, hero.y, 280, PERK_VALUES.poison.flasks[ph.poison]);
      if (targets.length) {
        timers.poison = PERK_VALUES.poison.interval[ph.poison] / starRate(p.poison);
        for (const z of targets) {
          addHazard(state, z.x, z.y, PERK_VALUES.poison.radius[ph.poison], 'toxic', PERK_VALUES.poison.dps[ph.poison] * mult * starDamage(p.poison), 4);
          spawnBurst(state, z.x, z.y, 10, 8, 'goo', ['#9BE15D', '#6BC24C', '#C77DFF'], 0.8);
        }
      }
    }
  }

  // ---------- Zones au sol (flammes, poison) ----------
  for (let i = state.hazards.length - 1; i >= 0; i--) {
    const h = state.hazards[i];
    h.life -= dt;
    if (h.life <= 0) {
      state.hazards.splice(i, 1);
      continue;
    }
    if (!dot) continue;
    for (const z of [...state.zombies]) {
      if (dist(h.x, h.y, z.x, z.y) > h.radius + z.radius) continue;
      if (h.kind === 'toxic') z.poisonTime = 1.5;
      damageZombie(state, z, Math.max(1, Math.round(h.dps * 0.25)), h.x, h.y, 0);
    }
  }

  // ---------- Loups compagnons ----------
  const wolves = armed ? PERK_VALUES.wolf.count[ph.wolf] : 0;
  while (state.pets.length < wolves) {
    const alpha = ph.wolf >= 3 && !state.pets.some((w) => w.alpha);
    state.pets.push({ id: nextId(state), x: hero.x - 30, y: hero.y + 10, vx: 0, vy: 0, targetId: null, cooldown: 0, alpha, walkTime: 0, dirX: 1, bite: 0 });
    spawnBurst(state, hero.x - 30, hero.y + 10, 0, 8, 'dust', FX_COLORS.dust, 0.8);
  }
  if (ph.wolf >= 3 && state.pets.length && !state.pets.some((w) => w.alpha)) state.pets[0].alpha = true;
  state.pets.forEach((w, i) => {
    w.cooldown = Math.max(0, w.cooldown - dt);
    w.bite = Math.max(0, w.bite - dt * 4);
    let target = w.targetId !== null ? state.zombies.find((z) => z.id === w.targetId) : undefined;
    if (!target || dist(target.x, target.y, hero.x, hero.y) > PET_RANGE + 80) {
      target = nearestZombies(state, w.x, w.y, PET_RANGE, 1)[0];
      w.targetId = target?.id ?? null;
    }
    // Sans cible, le loup suit le héros.
    const a = (i / Math.max(1, state.pets.length)) * Math.PI * 2 + state.time * 0.5;
    const tx = target ? target.x : hero.x + Math.cos(a) * 50;
    const ty = target ? target.y : hero.y + Math.sin(a) * 30 + 10;
    const d = dist(w.x, w.y, tx, ty);
    const speed = PET_SPEED * (w.alpha ? 1.1 : 1);
    const k = 1 - Math.exp(-8 * dt);
    const reach = target ? target.radius + PET_REACH * (w.alpha ? 1.4 : 1) : 12;
    const vx = d > reach ? ((tx - w.x) / d) * speed : 0;
    const vy = d > reach ? ((ty - w.y) / d) * speed : 0;
    w.vx += (vx - w.vx) * k;
    w.vy += (vy - w.vy) * k;
    w.x += w.vx * dt;
    w.y += w.vy * dt;
    if (Math.abs(w.vx) > 10) w.dirX = w.vx > 0 ? 1 : -1;
    w.walkTime = Math.hypot(w.vx, w.vy) > 20 ? w.walkTime + dt : 0;
    if (target && d <= reach + 4 && w.cooldown <= 0) {
      w.cooldown = w.alpha ? 0.5 : 0.65;
      w.bite = 1;
      const dmg = PERK_VALUES.wolf.damage[ph.wolf] * (w.alpha ? 2.2 : 1) * mult * starDamage(p.wolf);
      damageZombie(state, target, Math.round(dmg), w.x, w.y, w.alpha ? 300 : 150);
      // Le hurlement de l'alpha repousse tout autour de temps en temps.
      if (w.alpha && Math.random() < 0.15) {
        for (const z of [...state.zombies]) if (dist(z.x, z.y, w.x, w.y) < 110) damageZombie(state, z, Math.round(dmg * 0.5), w.x, w.y, 380);
        state.novas.push({ x: w.x, y: w.y, radius: 110, life: 0.4, maxLife: 0.4, kind: 'howl' });
      }
    }
  });
  if (state.pets.length > wolves) state.pets.length = wolves;

  for (let i = state.novas.length - 1; i >= 0; i--) {
    state.novas[i].life -= dt;
    if (state.novas[i].life <= 0) state.novas.splice(i, 1);
  }
}
