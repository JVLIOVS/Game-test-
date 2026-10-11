import { ClipOp, PaintStyle, Skia, TileMode, type SkCanvas, type SkFont, type SkPaint } from '@shopify/react-native-skia';
import { PAD_RADIUS, TOWER_RANGE } from '../game/constants';
import type { GameState, Pad } from '../game/types';
import { t } from '../i18n';
import type { JoystickState } from '../input/joystick';
import { PALETTE as C, fill, stroke } from './palette';
import {
  drawAxeIcon,
  drawChest,
  drawHero,
  drawHouse,
  drawHpBar,
  drawLogIcon,
  drawShadow,
  drawStakes,
  drawStructure,
  drawTower,
  drawTree,
  drawWorkshop,
  drawZombie,
} from './sprites';

export interface Viewport {
  width: number;
  height: number;
}

export interface Fonts {
  big: SkFont | null;
  small: SkFont | null;
}

const VIEW_MARGIN = 160;
const BORDER_SPACING = 56;
const CAMP_RADIUS = 250;

/** Zoom adapté à l'écran : plus de carte visible sur iPad. */
function cameraScale(width: number) {
  return Math.min(1.5, Math.max(0.85, width / 430));
}

function clampAxis(target: number, half: number, size: number, margin: number) {
  if (size + margin * 2 <= half * 2) return size / 2;
  return Math.min(size - half + margin, Math.max(half - margin, target));
}

// Objets Skia créés une seule fois (sur le web, chaque objet doit être libéré à la main).
let dashPaint: SkPaint | null = null;
let nightPaint: SkPaint | null = null;
let glowPaint: SkPaint | null = null;
function sharedPaints() {
  if (!dashPaint) {
    dashPaint = Skia.Paint();
    dashPaint.setAntiAlias(true);
    dashPaint.setStyle(PaintStyle.Stroke);
    dashPaint.setStrokeWidth(3);
    dashPaint.setColor(Skia.Color(C.padStroke));
    dashPaint.setPathEffect(Skia.PathEffect.MakeDash([10, 7], 0));

    nightPaint = Skia.Paint();
    nightPaint.setShader(
      Skia.Shader.MakeRadialGradient({ x: 0, y: 0 }, 1, [Skia.Color(C.nightClear), Skia.Color(C.nightClear), Skia.Color(C.night)], [0, 0.35, 1], TileMode.Clamp),
    );
    glowPaint = Skia.Paint();
    glowPaint.setShader(
      Skia.Shader.MakeRadialGradient({ x: 0, y: 0 }, 1, [Skia.Color(C.glow), Skia.Color(C.glowClear)], [0, 1], TileMode.Clamp),
    );
  }
  return { dash: dashPaint!, night: nightPaint!, glow: glowPaint! };
}

function drawOutlinedText(canvas: SkCanvas, text: string, x: number, y: number, font: SkFont, color: string, alpha = 1) {
  const w = font.getTextWidth(text);
  const outline = stroke(C.outline, 5);
  const body = fill(color);
  outline.setAlphaf(alpha);
  body.setAlphaf(alpha);
  canvas.drawText(text, x - w / 2, y, outline, font);
  canvas.drawText(text, x - w / 2, y, body, font);
  outline.setAlphaf(1);
  body.setAlphaf(1);
  return w;
}

function padLabel(pad: Pad): string {
  const a = pad.action;
  if (a.type === 'upgradeHouse') return t('pad.house', { level: a.level });
  if (a.type === 'upgradeAxe') return t('pad.axe', { level: a.level });
  return t(`pad.${a.kind}`);
}

function drawPadIcon(canvas: SkCanvas, pad: Pad, time: number) {
  const a = pad.action;
  canvas.save();
  canvas.translate(0, 18);
  if (a.type === 'upgradeHouse') {
    canvas.scale(0.36, 0.36);
    drawHouse(canvas, a.level, 0, time);
  } else if (a.type === 'upgradeAxe') {
    canvas.translate(0, -16);
    drawAxeIcon(canvas, a.level);
  } else if (a.kind === 'wall') {
    canvas.scale(0.6, 0.6);
    drawStakes(canvas, 1, 0, 0);
  } else if (a.kind === 'tower') {
    canvas.scale(0.4, 0.4);
    drawTower(canvas, 0);
  } else {
    canvas.scale(0.55, 0.55);
    drawWorkshop(canvas, 0);
  }
  canvas.restore();
}

function drawPadGround(canvas: SkCanvas, pad: Pad, heroOn: boolean, dash: SkPaint, time: number) {
  const s = 1 + pad.pulse * 0.1 + (heroOn ? 0.05 : 0);
  canvas.save();
  canvas.translate(pad.x, pad.y);
  canvas.scale(s, s);
  const r = PAD_RADIUS;
  const box = Skia.RRectXY(Skia.XYWHRect(-r, -r, r * 2, r * 2), 16, 16);
  canvas.drawRRect(box, fill(heroOn ? C.padFillActive : C.padFill));
  if (pad.paid > 0) {
    const h = (r * 2 * pad.paid) / pad.cost;
    canvas.save();
    canvas.clipRRect(box, ClipOp.Intersect, true);
    canvas.drawRect(Skia.XYWHRect(-r, r - h, r * 2, h), fill(C.padProgress));
    canvas.restore();
  }
  canvas.drawRRect(box, dash);
  drawPadIcon(canvas, pad, time);
  canvas.restore();
}

/** Nom et prix restant : dessinés après les personnages pour rester lisibles. */
function drawPadLabels(canvas: SkCanvas, pad: Pad, font: SkFont) {
  const r = PAD_RADIUS;
  drawOutlinedText(canvas, padLabel(pad), pad.x, pad.y - r - 10, font, C.white);
  const remaining = `${pad.cost - pad.paid}`;
  const w = font.getTextWidth(remaining);
  drawOutlinedText(canvas, remaining, pad.x - 9, pad.y + r + 22, font, C.hpBuilding);
  drawLogIcon(canvas, pad.x + w / 2 + 5, pad.y + r + 16, 0.8);
}

type Drawable = { y: number; draw: () => void };

export function drawWorld(
  canvas: SkCanvas,
  state: GameState,
  view: Viewport,
  fonts: Fonts,
  joystick: JoystickState,
) {
  const { hero, map, base, cycle } = state;
  const paints = sharedPaints();
  const scale = cameraScale(view.width);
  const halfW = view.width / scale / 2;
  const halfH = view.height / scale / 2;

  const shake = state.trauma * state.trauma * 12;
  const camX = clampAxis(hero.x, halfW, map.width, 70) + (Math.random() * 2 - 1) * shake;
  const camY = clampAxis(hero.y - 20, halfH, map.height, 70) + (Math.random() * 2 - 1) * shake;
  const toScreenX = (x: number) => view.width / 2 + (x - camX) * scale;
  const toScreenY = (y: number) => view.height / 2 + (y - camY) * scale;

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

  // Sol
  canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(-12, -12, map.width + 24, map.height + 24), 40, 40), fill(C.grassDark));
  canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(0, 0, map.width, map.height), 34, 34), fill(C.grass));
  for (const d of state.decor) {
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
  // Terre battue du camp
  if (visible(base.x, base.y) || Math.abs(base.x - camX) < halfW + CAMP_RADIUS) {
    canvas.drawCircle(base.x, base.y, CAMP_RADIUS + 8, fill(C.dirtDark));
    canvas.drawCircle(base.x, base.y, CAMP_RADIUS, fill(C.dirt));
  }

  // Bordure de buissons sombres autour de la carte
  for (let x = 0; x <= map.width; x += BORDER_SPACING) {
    if (x > left && x < right) {
      if (top < 0) canvas.drawCircle(x, -18 + ((x / BORDER_SPACING) % 2) * 8, 38, fill(C.void));
      if (bottom > map.height) canvas.drawCircle(x, map.height + 18 - ((x / BORDER_SPACING) % 2) * 8, 38, fill(C.void));
    }
  }
  for (let y = 0; y <= map.height; y += BORDER_SPACING) {
    if (y > top && y < bottom) {
      if (left < 0) canvas.drawCircle(-18 + ((y / BORDER_SPACING) % 2) * 8, y, 38, fill(C.void));
      if (right > map.width) canvas.drawCircle(map.width + 18 - ((y / BORDER_SPACING) % 2) * 8, y, 38, fill(C.void));
    }
  }

  // Emplacements de construction (au sol)
  for (const pad of state.pads) {
    if (!visible(pad.x, pad.y)) continue;
    const heroOn = !hero.dead && Math.hypot(hero.x - pad.x, hero.y - pad.y) < PAD_RADIUS + 4;
    drawPadGround(canvas, pad, heroOn, paints.dash, state.time);
  }

  // Ombres + liste triée en profondeur
  const drawables: Drawable[] = [];
  for (const tr of state.trees) {
    if (!visible(tr.x, tr.y)) continue;
    if (tr.state === 'standing' || tr.state === 'growing') drawShadow(canvas, tr.x + 6, tr.y, 34 * tr.size, 12 * tr.size);
    const behind = !hero.dead && hero.y < tr.y - 10 && hero.y > tr.y - 110 * tr.size && Math.abs(hero.x - tr.x) < 50 * tr.size;
    drawables.push({ y: tr.y, draw: () => drawTree(canvas, tr, state.time, behind) });
  }
  for (const s of state.structures) {
    if (!visible(s.x, s.y)) continue;
    if (s.kind !== 'wall') drawShadow(canvas, s.x + 6, s.y + 4, s.radius * 1.1, s.radius * 0.4);
    drawables.push({ y: s.y, draw: () => drawStructure(canvas, s, base.x, base.y, state.time) });
  }
  for (const c of state.chests) {
    if (!visible(c.x, c.y)) continue;
    drawShadow(canvas, c.x, c.y, 16, 5);
    drawables.push({ y: c.y, draw: () => drawChest(canvas, c, state.time) });
  }
  for (const z of state.zombies) {
    if (!visible(z.x, z.y)) continue;
    drawShadow(canvas, z.x, z.y, 15, 5);
    drawables.push({ y: z.y, draw: () => drawZombie(canvas, z) });
  }
  if (!hero.dead) {
    drawShadow(canvas, hero.x, hero.y, 16, 6);
    drawables.push({ y: hero.y, draw: () => drawHero(canvas, hero, state.time) });
  }
  drawables.sort((a, b) => a.y - b.y);
  for (const d of drawables) d.draw();

  // Flèches
  for (const p of state.projectiles) {
    const len = Math.hypot(p.vx, p.vy) || 1;
    const dx = (p.vx / len) * 16;
    const dy = (p.vy / len) * 16;
    canvas.drawLine(p.x - dx, p.y - dy, p.x, p.y, stroke(C.outline, 5));
    canvas.drawLine(p.x - dx, p.y - dy, p.x, p.y, stroke(C.arrow, 2.5));
    canvas.drawCircle(p.x, p.y, 3, fill(C.white));
  }

  // Particules
  for (const p of state.particles) {
    if (!visible(p.x, p.y)) continue;
    const alpha = Math.min(1, p.life / (p.maxLife * 0.4));
    const paint = fill(p.color);
    paint.setAlphaf(p.kind === 'dust' ? alpha * 0.8 : alpha);
    if (p.kind === 'dust') {
      const grow = 1 + (1 - p.life / p.maxLife) * 1.5;
      canvas.drawCircle(p.x, p.y - p.z, p.size * grow, paint);
    } else if (p.kind === 'goo') {
      canvas.drawCircle(p.x, p.y - p.z, p.size, paint);
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

  // Bûches qui volent vers un emplacement
  for (const l of state.flyingLogs) {
    const x = l.fromX + (l.toX - l.fromX) * l.t;
    const y = l.fromY + (l.toY - l.fromY) * l.t - Math.sin(Math.PI * l.t) * 50;
    drawLogIcon(canvas, x, y, 1.1);
  }

  if (fonts.small) {
    for (const pad of state.pads) if (visible(pad.x, pad.y)) drawPadLabels(canvas, pad, fonts.small);
  }

  // Barres de vie
  for (const z of state.zombies) {
    if (z.hp < z.maxHp && visible(z.x, z.y)) drawHpBar(canvas, z.x, z.y - 66, 30, z.hp / z.maxHp, C.hpEnemy);
  }
  for (const s of state.structures) {
    if (s.hp < s.maxHp && visible(s.x, s.y)) {
      const y = s.kind === 'house' ? s.y - 120 : s.kind === 'tower' ? s.y - 112 : s.y - 62;
      drawHpBar(canvas, s.x, y, s.kind === 'house' ? 70 : 34, s.hp / s.maxHp, C.hpBuilding);
    }
  }
  if (!hero.dead && hero.hp < hero.maxHp) drawHpBar(canvas, hero.x, hero.y - 74, 34, hero.hp / hero.maxHp, C.hpHero);

  // Portée des tours, discrète, la nuit
  if (cycle.darkness > 0.2) {
    for (const s of state.structures) {
      if (s.kind === 'tower' && visible(s.x, s.y)) canvas.drawCircle(s.x, s.y, TOWER_RANGE, stroke('rgba(255,255,255,0.12)', 2));
    }
  }

  // Chiffres qui sautent
  if (fonts.big) {
    for (const tx of state.texts) {
      const k = 1 - tx.life / tx.maxLife;
      const pop = (k < 0.15 ? 0.5 + (k / 0.15) * 0.8 : 1.3 - Math.min(0.3, (k - 0.15) * 1.5)) * tx.size;
      const alpha = Math.min(1, tx.life / (tx.maxLife * 0.35));
      canvas.save();
      canvas.translate(tx.x, tx.y - tx.z);
      canvas.scale(pop, pop);
      if (tx.log) {
        const w = drawOutlinedText(canvas, tx.text, -8, 8, fonts.big, tx.color, alpha);
        drawLogIcon(canvas, w / 2 + 6, 0, 0.9);
      } else {
        drawOutlinedText(canvas, tx.text, 0, 8, fonts.big, tx.color, alpha);
      }
      canvas.restore();
    }
  }
  canvas.restore();

  // Nuit : obscurité autour du héros, lueur chaude autour de la baraque
  if (cycle.darkness > 0.01) {
    const lightX = hero.dead ? toScreenX(base.x) : toScreenX(hero.x);
    const lightY = hero.dead ? toScreenY(base.y) : toScreenY(hero.y - 30);
    const R = 360 * scale;
    paints.night.setAlphaf(Math.min(1, cycle.darkness));
    canvas.save();
    canvas.translate(lightX, lightY);
    canvas.scale(R, R);
    canvas.drawRect(Skia.XYWHRect(-lightX / R, -lightY / R, view.width / R, view.height / R), paints.night);
    canvas.restore();

    const gR = 200 * scale;
    paints.glow.setAlphaf(Math.min(1, cycle.darkness));
    canvas.save();
    canvas.translate(toScreenX(base.x), toScreenY(base.y - 30));
    canvas.scale(gR, gR);
    canvas.drawCircle(0, 0, 1, paints.glow);
    canvas.restore();
  }

  // Joystick (coordonnées écran)
  if (joystick.active) {
    canvas.drawCircle(joystick.originX, joystick.originY, joystick.radius, fill(C.joystickBase));
    canvas.drawCircle(joystick.originX, joystick.originY, joystick.radius, stroke(C.joystickRing, 3));
    canvas.drawCircle(joystick.originX + joystick.knobX, joystick.originY + joystick.knobY, 26, fill(C.joystickKnob));
  }
}
