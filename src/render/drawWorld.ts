import { ClipOp, PaintStyle, Skia, TileMode, type SkCanvas, type SkFont, type SkPaint } from '@shopify/react-native-skia';
import { PAD_RADIUS, TOWER_RANGE } from '../game/constants';
import { orbitPositions } from '../game/systems/weapons';
import { soldierHelmet } from '../game/systems/units';
import type { GameState, Pad, Slash } from '../game/types';
import { t } from '../i18n';
import type { JoystickState } from '../input/joystick';
import { worldDef } from '../game/data/worlds';
import { PALETTE as C, THEME, fill, setTheme, stroke } from './palette';
import {
  drawBarracks,
  drawBomb,
  drawLumberCamp,
  drawMainWeapon,
  drawUnit,
  drawChest,
  drawGem,
  drawSpinningAxe,
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
const CAMP_RADIUS = 390;

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
  if (a.type === 'forge') return t('pad.forge', { level: a.level });
  if (a.type === 'upgradeStructure') return t(a.slot === 'barracks' ? 'pad.barracksUp' : 'pad.lumberUp', { level: a.level });
  return t(`pad.${a.kind}`);
}

function drawPadIcon(canvas: SkCanvas, pad: Pad, state: GameState) {
  const a = pad.action;
  const time = state.time;
  canvas.save();
  canvas.translate(0, 18);
  if (a.type === 'upgradeHouse') {
    canvas.scale(0.36, 0.36);
    drawHouse(canvas, a.level, 0, time);
  } else if (a.type === 'forge') {
    canvas.translate(0, -2);
    canvas.rotate(25, 0, 0);
    canvas.scale(0.7, 0.7);
    drawMainWeapon(canvas, state.hero.weapon.type, Math.max(1, state.equipment.sword), a.level);
  } else if (a.type === 'upgradeStructure' || a.kind === 'barracks' || a.kind === 'lumber') {
    const slot = a.type === 'upgradeStructure' ? a.slot : a.kind;
    const level = a.type === 'upgradeStructure' ? a.level : 1;
    canvas.scale(0.45, 0.45);
    if (slot === 'barracks') drawBarracks(canvas, level, 0, time);
    else drawLumberCamp(canvas, level, 0);
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

function drawPadGround(canvas: SkCanvas, pad: Pad, heroOn: boolean, dash: SkPaint, state: GameState) {
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
  drawPadIcon(canvas, pad, state);
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

function drawSlash(canvas: SkCanvas, sl: Slash) {
  const k = sl.life / sl.maxLife;
  const deg = (sl.angle * 180) / Math.PI;
  const paint = stroke(C.white, sl.kind === 'hammer' ? 6 : 7);
  paint.setAlphaf(Math.min(1, k * 1.6));
  switch (sl.kind) {
    case 'sword': {
      const r = sl.size * (0.75 + (1 - k) * 0.25);
      canvas.drawArc(Skia.XYWHRect(sl.x - r, sl.y - r * 0.8, r * 2, r * 1.6), deg - 75, 150, false, paint);
      break;
    }
    case 'spear': {
      const len = sl.size * (0.6 + (1 - k) * 0.4);
      canvas.drawLine(sl.x, sl.y, sl.x + Math.cos(sl.angle) * len, sl.y + Math.sin(sl.angle) * len * 0.8, paint);
      break;
    }
    case 'hammer': {
      const r = sl.size * (1 - k * 0.8);
      canvas.drawOval(Skia.XYWHRect(sl.x - r, sl.y - r * 0.55, r * 2, r * 1.1), paint);
      break;
    }
    case 'daggers': {
      const s = sl.size;
      canvas.drawLine(sl.x - s, sl.y - s, sl.x + s, sl.y + s, paint);
      canvas.drawLine(sl.x + s, sl.y - s, sl.x - s, sl.y + s, paint);
      break;
    }
  }
  paint.setAlphaf(1);
}

function drawOffscreenArrow(canvas: SkCanvas, sx: number, sy: number, view: Viewport, color: string, time: number) {
  const margin = 34;
  if (sx > margin && sx < view.width - margin && sy > margin + 120 && sy < view.height - margin) return;
  const cx = view.width / 2;
  const cy = view.height / 2;
  const a = Math.atan2(sy - cy, sx - cx);
  // Position sur le bord de l'écran
  const hw = cx - margin;
  const hh = cy - margin - 60;
  const k = Math.min(Math.abs(hw / Math.cos(a)), Math.abs(hh / Math.sin(a)));
  const x = cx + Math.cos(a) * k;
  const y = cy + 30 + Math.sin(a) * k;
  const pulse = 1 + Math.sin(time * 6) * 0.12;
  canvas.save();
  canvas.translate(x, y);
  canvas.rotate((a * 180) / Math.PI, 0, 0);
  canvas.scale(pulse, pulse);
  canvas.drawCircle(0, 0, 15, fill(C.outline));
  canvas.drawCircle(0, 0, 12, fill(color));
  canvas.drawLine(-4, -6, 5, 0, stroke(C.outline, 4));
  canvas.drawLine(-4, 6, 5, 0, stroke(C.outline, 4));
  canvas.restore();
}

export function drawWorld(
  canvas: SkCanvas,
  state: GameState,
  view: Viewport,
  fonts: Fonts,
  joystick: JoystickState,
) {
  const { hero, map, base, cycle } = state;
  setTheme(worldDef(state.world));
  const G = THEME().ground;
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

  canvas.drawColor(Skia.Color(G.void));
  canvas.save();
  canvas.translate(view.width / 2, view.height / 2);
  canvas.scale(scale, scale);
  canvas.translate(-camX, -camY);

  // Sol
  canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(-12, -12, map.width + 24, map.height + 24), 40, 40), fill(G.grassDark));
  canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(0, 0, map.width, map.height), 34, 34), fill(G.grass));
  for (const d of state.decor) {
    if (!visible(d.x, d.y)) continue;
    const s = d.size;
    switch (d.kind) {
      case 'patch':
        canvas.drawOval(Skia.XYWHRect(d.x - 60 * s, d.y - 30 * s, 120 * s, 60 * s), fill(d.variant % 2 ? G.grassLight : G.grassDark));
        break;
      case 'tuft':
        canvas.drawOval(Skia.XYWHRect(d.x - 6 * s, d.y - 9 * s, 4 * s, 10 * s), fill(G.tuft));
        canvas.drawOval(Skia.XYWHRect(d.x - 2 * s, d.y - 12 * s, 4 * s, 13 * s), fill(G.tuft));
        canvas.drawOval(Skia.XYWHRect(d.x + 2 * s, d.y - 9 * s, 4 * s, 10 * s), fill(G.tuft));
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
    canvas.drawCircle(base.x, base.y, CAMP_RADIUS + 8, fill(G.dirtDark));
    canvas.drawCircle(base.x, base.y, CAMP_RADIUS, fill(G.dirt));
  }

  // Bordure de buissons sombres autour de la carte
  for (let x = 0; x <= map.width; x += BORDER_SPACING) {
    if (x > left && x < right) {
      if (top < 0) canvas.drawCircle(x, -18 + ((x / BORDER_SPACING) % 2) * 8, 38, fill(G.void));
      if (bottom > map.height) canvas.drawCircle(x, map.height + 18 - ((x / BORDER_SPACING) % 2) * 8, 38, fill(G.void));
    }
  }
  for (let y = 0; y <= map.height; y += BORDER_SPACING) {
    if (y > top && y < bottom) {
      if (left < 0) canvas.drawCircle(-18 + ((y / BORDER_SPACING) % 2) * 8, y, 38, fill(G.void));
      if (right > map.width) canvas.drawCircle(map.width + 18 - ((y / BORDER_SPACING) % 2) * 8, y, 38, fill(G.void));
    }
  }

  // Emplacements de construction (au sol)
  for (const pad of state.pads) {
    if (!visible(pad.x, pad.y)) continue;
    const heroOn = !hero.dead && Math.hypot(hero.x - pad.x, hero.y - pad.y) < PAD_RADIUS + 4;
    drawPadGround(canvas, pad, heroOn, paints.dash, state);
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
    drawables.push({ y: s.y, draw: () => drawStructure(canvas, s, base.x, base.y, state.time, Math.min(3, state.perks.engineer)) });
  }
  for (const c of state.chests) {
    if (!visible(c.x, c.y)) continue;
    drawShadow(canvas, c.x, c.y, 16, 5);
    drawables.push({ y: c.y, draw: () => drawChest(canvas, c, state.time) });
  }
  for (const g of state.gems) {
    if (visible(g.x, g.y)) drawGem(canvas, g.x, g.y, g.value, state.time);
  }
  for (const z of state.zombies) {
    if (!visible(z.x, z.y)) continue;
    drawShadow(canvas, z.x, z.y, z.boss ? 34 : 15, z.boss ? 11 : 5);
    drawables.push({ y: z.y, draw: () => drawZombie(canvas, z) });
  }
  const helmet = soldierHelmet(state);
  for (const u of state.units) {
    if (!visible(u.x, u.y)) continue;
    drawShadow(canvas, u.x, u.y, 11, 4);
    drawables.push({ y: u.y, draw: () => drawUnit(canvas, u, helmet) });
  }
  if (!hero.dead) {
    drawShadow(canvas, hero.x, hero.y, 16, 6);
    drawables.push({ y: hero.y, draw: () => drawHero(canvas, hero, state.time, state.equipment) });
  }
  drawables.sort((a, b) => a.y - b.y);
  for (const d of drawables) d.draw();

  // Traces des coups d'arme
  for (const sl of state.slashes) drawSlash(canvas, sl);

  // Haches tournoyantes
  if (!hero.dead) for (const o of orbitPositions(state)) drawSpinningAxe(canvas, o.x, o.y, o.angle, Math.min(3, state.perks.orbit));

  // Bombes en vol (ombre au sol + bombe en cloche)
  for (const b of state.bombs) {
    const x = b.fromX + (b.toX - b.fromX) * b.t;
    const y = b.fromY + (b.toY - b.fromY) * b.t;
    drawShadow(canvas, x, y + 30 * (1 - b.t), 8, 3);
    drawBomb(canvas, x, y - Math.sin(Math.PI * b.t) * (b.cluster < 0 ? 50 : 110), state.time, b.phase);
  }

  // Éclairs
  for (const bolt of state.bolts) {
    const a = bolt.life / 0.25;
    let px = bolt.x;
    let py = bolt.y - 320;
    const glow = stroke(bolt.phase >= 3 ? C.boltGlowStorm : C.boltGlow, 8 + bolt.phase * 4);
    const core = stroke(bolt.phase >= 3 ? C.boltStorm : C.bolt, 2 + bolt.phase * 1.5);
    glow.setAlphaf(a);
    core.setAlphaf(a);
    for (let k = 1; k <= 6; k++) {
      const nx = bolt.x + (k < 6 ? Math.sin(bolt.seed + k * 2.1) * 22 : 0);
      const ny = bolt.y - 320 + (320 * k) / 6 - 20;
      canvas.drawLine(px, py, nx, ny, glow);
      canvas.drawLine(px, py, nx, ny, core);
      px = nx;
      py = ny;
    }
    glow.setAlphaf(1);
    core.setAlphaf(1);
  }

  // Flèches et boulets (l'apparence suit la phase de l'atout)
  for (const p of state.projectiles) {
    if (p.style === 'cannon') {
      canvas.drawCircle(p.x, p.y, 7, fill(C.outline));
      canvas.drawCircle(p.x - 2, p.y - 2, 2, fill(C.white));
      continue;
    }
    const len = Math.hypot(p.vx, p.vy) || 1;
    const dx = (p.vx / len) * 16;
    const dy = (p.vy / len) * 16;
    if (p.style === 'bow2' || p.style === 'bow3') {
      const glowColor = p.style === 'bow2' ? C.fireGlow : C.iceGlow;
      canvas.drawLine(p.x - dx * 2, p.y - dy * 2, p.x, p.y, stroke(glowColor, 10));
    }
    const shaft = p.style === 'bow2' ? '#FF6B2B' : p.style === 'bow3' ? '#5BE0FF' : C.arrow;
    canvas.drawLine(p.x - dx, p.y - dy, p.x, p.y, stroke(C.outline, 5));
    canvas.drawLine(p.x - dx, p.y - dy, p.x, p.y, stroke(shaft, 2.5));
    canvas.drawCircle(p.x, p.y, p.style === 'bow3' ? 4.5 : 3, fill(p.style === 'bow2' ? '#FFE14D' : C.white));
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
    if (z.boss) continue;
    if (z.hp < z.maxHp && visible(z.x, z.y)) drawHpBar(canvas, z.x, z.y - 66, 30, z.hp / z.maxHp, C.hpEnemy);
  }
  for (const s of state.structures) {
    if (s.hp < s.maxHp && visible(s.x, s.y)) {
      const y = s.kind === 'house' ? s.y - 120 : s.kind === 'tower' ? s.y - 112 : s.y - 62;
      drawHpBar(canvas, s.x, y, s.kind === 'house' ? 70 : 34, s.hp / s.maxHp, C.hpBuilding);
    }
  }
  for (const u of state.units) {
    if (u.hp < u.maxHp && visible(u.x, u.y)) drawHpBar(canvas, u.x, u.y - 50, 22, u.hp / u.maxHp, C.hpHero);
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

  // Flèches au bord de l'écran vers les choses intéressantes hors champ
  const markers: { x: number; y: number; color: string }[] = [];
  for (const c of state.chests) markers.push({ x: c.x, y: c.y, color: c.kind === 'weapon' ? '#C77DFF' : c.kind === 'crate' ? C.white : C.chestBand });
  for (const z of state.zombies) if (z.golden || z.boss) markers.push({ x: z.x, y: z.y, color: z.golden ? C.chestBand : C.hpEnemy });
  for (const tr of state.trees) if (tr.golden && tr.state === 'standing') markers.push({ x: tr.x, y: tr.y, color: C.chestBand });
  for (const m of markers) drawOffscreenArrow(canvas, toScreenX(m.x), toScreenY(m.y - 30), view, m.color, state.time);

  // Joystick (coordonnées écran)
  if (joystick.active) {
    canvas.drawCircle(joystick.originX, joystick.originY, joystick.radius, fill(C.joystickBase));
    canvas.drawCircle(joystick.originX, joystick.originY, joystick.radius, stroke(C.joystickRing, 3));
    canvas.drawCircle(joystick.originX + joystick.knobX, joystick.originY + joystick.knobY, 26, fill(C.joystickKnob));
  }
}
