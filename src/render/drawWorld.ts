import { Skia, type SkCanvas, type SkFont } from '@shopify/react-native-skia';
import type { GameState, Tree } from '../game/types';
import type { JoystickState } from '../input/joystick';
import { PALETTE as C, fill, stroke } from './palette';
import { drawHero, drawLogIcon, drawShadow, drawTree } from './sprites';

export interface Viewport {
  width: number;
  height: number;
}

const VIEW_MARGIN = 140;
const BORDER_SPACING = 56;

/** Zoom adapté à l'écran : plus de carte visible sur iPad. */
function cameraScale(width: number) {
  return Math.min(1.6, Math.max(0.9, width / 400));
}

function clampAxis(target: number, half: number, size: number, margin: number) {
  if (size + margin * 2 <= half * 2) return size / 2;
  return Math.min(size - half + margin, Math.max(half - margin, target));
}

export function drawWorld(
  canvas: SkCanvas,
  state: GameState,
  view: Viewport,
  font: SkFont | null,
  joystick: JoystickState,
) {
  const { hero, zone } = state;
  const { width: zw, height: zh } = zone.def;
  const scale = cameraScale(view.width);
  const halfW = view.width / scale / 2;
  const halfH = view.height / scale / 2;

  const shake = state.trauma * state.trauma * 12;
  const camX = clampAxis(hero.x, halfW, zw, 70) + (Math.random() * 2 - 1) * shake;
  const camY = clampAxis(hero.y - 20, halfH, zh, 70) + (Math.random() * 2 - 1) * shake;

  const left = camX - halfW - VIEW_MARGIN;
  const right = camX + halfW + VIEW_MARGIN;
  const top = camY - halfH - VIEW_MARGIN;
  const bottom = camY + halfH + VIEW_MARGIN;
  const visible = (x: number, y: number) => x > left && x < right && y > top && y < bottom;

  canvas.drawColor(Skia.Color(C.void));
  canvas.save();
  canvas.translate(view.width / 2, view.height / 2);
  canvas.scale(scale, scale);
  canvas.translate(-camX, -camY);

  // Sol du micro-monde
  canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(-12, -12, zw + 24, zh + 24), 40, 40), fill(C.grassDark));
  canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(0, 0, zw, zh), 34, 34), fill(C.grass));

  for (const d of zone.decor) {
    if (!visible(d.x, d.y)) continue;
    const s = d.size;
    switch (d.kind) {
      case 'patch':
        canvas.drawOval(Skia.XYWHRect(d.x - 60 * s, d.y - 30 * s, 120 * s, 60 * s), fill(d.variant % 2 ? C.grassLight : C.grassDark));
        break;
      case 'tuft':
        canvas.drawOval(Skia.XYWHRect(d.x - 6 * s, d.y - 9 * s, 4 * s, 10 * s), fill(C.tuft));
        canvas.drawOval(Skia.XYWHRect(d.x - 2 * s, d.y - 12 * s, 4 * s, 13 * s), fill(C.tuft));
        canvas.drawOval(Skia.XYWHRect(d.x + 2 * s, d.y - 9 * s, 4 * s, 10 * s), fill(C.tuft));
        break;
      case 'flower':
        canvas.drawCircle(d.x, d.y, 4.5 * s, fill(C.flowers[d.variant % C.flowers.length]));
        canvas.drawCircle(d.x, d.y, 1.8 * s, fill('#FFB627'));
        break;
      case 'pebble':
        canvas.drawOval(Skia.XYWHRect(d.x - 6 * s, d.y - 4 * s, 12 * s, 8 * s), fill(C.pebble));
        break;
    }
  }

  // Bordure de buissons sombres autour du micro-monde
  for (let x = 0; x <= zw; x += BORDER_SPACING) {
    if (x > left && x < right) {
      if (top < 0) canvas.drawCircle(x, -18 + ((x / BORDER_SPACING) % 2) * 8, 38, fill(C.void));
      if (bottom > zh) canvas.drawCircle(x, zh + 18 - ((x / BORDER_SPACING) % 2) * 8, 38, fill(C.void));
    }
  }
  for (let y = 0; y <= zh; y += BORDER_SPACING) {
    if (y > top && y < bottom) {
      if (left < 0) canvas.drawCircle(-18 + ((y / BORDER_SPACING) % 2) * 8, y, 38, fill(C.void));
      if (right > zw) canvas.drawCircle(zw + 18 - ((y / BORDER_SPACING) % 2) * 8, y, 38, fill(C.void));
    }
  }

  // Ombres
  const visibleTrees: Tree[] = [];
  for (const t of zone.trees) {
    if (!visible(t.x, t.y)) continue;
    visibleTrees.push(t);
    if (t.state === 'standing' || t.state === 'growing') drawShadow(canvas, t.x + 6, t.y, 34 * t.size, 12 * t.size);
  }
  drawShadow(canvas, hero.x, hero.y, 16, 6);

  // Tri en profondeur : ce qui est plus bas à l'écran passe devant.
  let heroDrawn = false;
  visibleTrees.sort((a, b) => a.y - b.y);
  for (const t of visibleTrees) {
    if (!heroDrawn && hero.y < t.y) {
      drawHero(canvas, hero, state.time);
      heroDrawn = true;
    }
    const behind =
      heroDrawn && hero.y < t.y - 10 && hero.y > t.y - 110 * t.size && Math.abs(hero.x - t.x) < 50 * t.size;
    drawTree(canvas, t, state.time, behind);
  }
  if (!heroDrawn) drawHero(canvas, hero, state.time);

  // Particules
  for (const p of state.particles) {
    const alpha = Math.min(1, p.life / (p.maxLife * 0.4));
    const paint = fill(p.color);
    paint.setAlphaf(p.kind === 'dust' ? alpha * 0.8 : alpha);
    if (p.kind === 'dust') {
      const grow = 1 + (1 - p.life / p.maxLife) * 1.5;
      canvas.drawCircle(p.x, p.y - p.z, p.size * grow, paint);
    } else {
      canvas.save();
      canvas.translate(p.x, p.y - p.z);
      canvas.rotate((p.rot * 180) / Math.PI, 0, 0);
      if (p.kind === 'leaf') canvas.drawOval(Skia.XYWHRect(-p.size, -p.size * 0.5, p.size * 2, p.size), paint);
      else canvas.drawRect(Skia.XYWHRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.7), paint);
      canvas.restore();
    }
    paint.setAlphaf(1);
  }

  // Chiffres qui sautent
  if (font) {
    for (const t of state.texts) {
      const k = 1 - t.life / t.maxLife;
      const pop = k < 0.15 ? 0.5 + (k / 0.15) * 0.8 : 1.3 - Math.min(0.3, (k - 0.15) * 1.5);
      const alpha = Math.min(1, t.life / (t.maxLife * 0.35));
      const w = font.getTextWidth(t.text);
      canvas.save();
      canvas.translate(t.x, t.y - t.z);
      canvas.scale(pop, pop);
      const outline = stroke(C.outline, 6);
      const body = fill(t.color);
      outline.setAlphaf(alpha);
      body.setAlphaf(alpha);
      canvas.drawText(t.text, -w / 2 - 8, 8, outline, font);
      canvas.drawText(t.text, -w / 2 - 8, 8, body, font);
      outline.setAlphaf(1);
      body.setAlphaf(1);
      drawLogIcon(canvas, w / 2 + 6, 0, 0.9);
      canvas.restore();
    }
  }

  canvas.restore();

  // Joystick (coordonnées écran)
  if (joystick.active) {
    canvas.drawCircle(joystick.originX, joystick.originY, joystick.radius, fill(C.joystickBase));
    canvas.drawCircle(joystick.originX, joystick.originY, joystick.radius, stroke(C.joystickRing, 3));
    canvas.drawCircle(joystick.originX + joystick.knobX, joystick.originY + joystick.knobY, 26, fill(C.joystickKnob));
  }
}
