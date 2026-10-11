import { GRAVITY, MAX_PARTICLES } from '../constants';
import { fxRandom } from '../rng';
import type { GameState, ParticleKind } from '../types';

export function spawnBurst(
  state: GameState,
  x: number,
  y: number,
  z: number,
  count: number,
  kind: ParticleKind,
  colors: readonly string[],
  power = 1,
) {
  for (let i = 0; i < count; i++) {
    if (state.particles.length >= MAX_PARTICLES) state.particles.shift();
    const angle = fxRandom(0, Math.PI * 2);
    const speed = fxRandom(40, 150) * power;
    const life = kind === 'leaf' || kind === 'confetti' ? fxRandom(0.9, 1.6) : fxRandom(0.5, 0.9);
    state.particles.push({
      x,
      y,
      z,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed * 0.6,
      vz: kind === 'dust' ? fxRandom(10, 40) : fxRandom(150, 320) * power,
      rot: fxRandom(0, Math.PI * 2),
      vrot: fxRandom(-12, 12),
      life,
      maxLife: life,
      size: kind === 'dust' ? fxRandom(6, 12) : fxRandom(3, 6),
      color: colors[Math.floor(Math.random() * colors.length)],
      kind,
    });
  }
}

export function spawnText(
  state: GameState,
  x: number,
  y: number,
  text: string,
  color: string,
  options: { log?: boolean; size?: number } = {},
) {
  state.texts.push({
    x: x + fxRandom(-8, 8),
    y,
    z: 40,
    vz: 160,
    life: 0.9,
    maxLife: 0.9,
    text,
    color,
    log: options.log ?? false,
    size: options.size ?? 1,
  });
}

export function addTrauma(state: GameState, amount: number) {
  state.trauma = Math.min(1, state.trauma + amount);
}

export function updateEffects(state: GameState, dt: number) {
  const ps = state.particles;
  for (let i = ps.length - 1; i >= 0; i--) {
    const p = ps[i];
    p.life -= dt;
    if (p.life <= 0) {
      ps.splice(i, 1);
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.kind === 'dust') {
      p.z += p.vz * dt;
      p.vx *= 1 - 3 * dt;
      p.vy *= 1 - 3 * dt;
      continue;
    }
    // Les feuilles et confettis planent, les copeaux tombent vite.
    const floaty = p.kind === 'leaf' || p.kind === 'confetti';
    p.vz -= (floaty ? GRAVITY * 0.35 : GRAVITY) * dt;
    if (floaty) p.vx += Math.sin(state.time * 6 + p.rot) * 60 * dt;
    p.z += p.vz * dt;
    p.rot += p.vrot * dt;
    if (p.z < 0) {
      p.z = 0;
      p.vz = -p.vz * 0.35;
      p.vx *= 0.5;
      p.vy *= 0.5;
      p.vrot *= 0.5;
    }
  }

  const ts = state.texts;
  for (let i = ts.length - 1; i >= 0; i--) {
    const t = ts[i];
    t.life -= dt;
    if (t.life <= 0) {
      ts.splice(i, 1);
      continue;
    }
    t.vz -= 380 * dt;
    t.z = Math.max(t.z + t.vz * dt, 30);
  }

  const logs = state.flyingLogs;
  for (let i = logs.length - 1; i >= 0; i--) {
    logs[i].t += dt / 0.28;
    if (logs[i].t >= 1) logs.splice(i, 1);
  }

  state.trauma = Math.max(0, state.trauma - dt * 1.6);
}
