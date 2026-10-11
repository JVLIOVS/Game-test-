import type { PlayerInput } from '../game/types';

// Joystick "flottant" : il apparaît là où le pouce se pose.

export interface JoystickState {
  active: boolean;
  originX: number;
  originY: number;
  knobX: number;
  knobY: number;
  radius: number;
}

const DEAD_ZONE = 0.12;

export function createJoystick(): JoystickState {
  return { active: false, originX: 0, originY: 0, knobX: 0, knobY: 0, radius: 60 };
}

export function joystickStart(j: JoystickState, x: number, y: number) {
  j.active = true;
  j.originX = x;
  j.originY = y;
  j.knobX = 0;
  j.knobY = 0;
}

export function joystickMove(j: JoystickState, x: number, y: number) {
  if (!j.active) return;
  let dx = x - j.originX;
  let dy = y - j.originY;
  const d = Math.hypot(dx, dy);
  if (d > j.radius) {
    // Le socle suit le pouce s'il va trop loin : plus confortable.
    const excess = d - j.radius;
    j.originX += (dx / d) * excess;
    j.originY += (dy / d) * excess;
    dx = (dx / d) * j.radius;
    dy = (dy / d) * j.radius;
  }
  j.knobX = dx;
  j.knobY = dy;
}

export function joystickEnd(j: JoystickState) {
  j.active = false;
  j.knobX = 0;
  j.knobY = 0;
}

export function readInput(j: JoystickState, keys: Set<string>): PlayerInput {
  // Clavier (test sur ordinateur / navigateur)
  let kx = 0;
  let ky = 0;
  if (keys.has('ArrowLeft') || keys.has('a') || keys.has('q')) kx -= 1;
  if (keys.has('ArrowRight') || keys.has('d')) kx += 1;
  if (keys.has('ArrowUp') || keys.has('w') || keys.has('z')) ky -= 1;
  if (keys.has('ArrowDown') || keys.has('s')) ky += 1;
  if (kx || ky) {
    const l = Math.hypot(kx, ky);
    return { moveX: kx / l, moveY: ky / l };
  }
  if (!j.active) return { moveX: 0, moveY: 0 };
  const mx = j.knobX / j.radius;
  const my = j.knobY / j.radius;
  const m = Math.hypot(mx, my);
  if (m < DEAD_ZONE) return { moveX: 0, moveY: 0 };
  // Rampe douce après la zone morte.
  const k = Math.min(1, (m - DEAD_ZONE) / (1 - DEAD_ZONE)) / m;
  return { moveX: mx * k, moveY: my * k };
}
