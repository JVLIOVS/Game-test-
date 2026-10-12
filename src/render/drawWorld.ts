import { ClipOp, PaintStyle, Skia, TileMode, type SkCanvas, type SkFont, type SkPaint } from '@shopify/react-native-skia';
import { PAD_RADIUS } from '../game/constants';
import { PERK_VALUES, perkPhase } from '../game/data/perks';
import { towerRange } from '../game/systems/towers';
import { CHARGE_LENGTH, WINDUP, slamRadius } from '../game/systems/zombies';
import { orbitPositions } from '../game/systems/weapons';
import { soldierHelmet } from '../game/systems/units';
import type { GameState, Pad, Slash } from '../game/types';
import { t } from '../i18n';
import type { JoystickState } from '../input/joystick';
import { worldDef } from '../game/data/worlds';
import { drawFloatingTexts, drawOutlinedText, drawParticles, drawProjectile } from './fx';
import { PALETTE as C, THEME, fill, setTheme, stroke } from './palette';
import {
  drawAnimal,
  drawLodge,
  drawMeatIcon,
  drawTrap,
  drawCatapult,
  drawTurret,
  drawWolf,
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
const CAMP_RADIUS = 465;

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

function padLabel(pad: Pad): string {
  const a = pad.action;
  if (a.type === 'upgradeHouse') return t('pad.house', { level: a.level });
  if (a.type === 'forge') return t('pad.forge', { level: a.level });
  if (a.type === 'upgradeWalls') return t('pad.walls', { level: a.level });
  if (a.type === 'upgradeStructure') {
    const key = a.slot.startsWith('tower') ? 'pad.towerUp' : a.slot === 'barracks' ? 'pad.barracksUp' : a.slot === 'lodge' ? 'pad.lodgeUp' : 'pad.lumberUp';
    return t(key, { level: a.level });
  }
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
  } else if (a.type === 'upgradeWalls') {
    canvas.scale(0.6, 0.6);
    drawStakes(canvas, 1, 0, 0, a.level);
  } else if (a.type === 'upgradeStructure' || a.kind === 'barracks' || a.kind === 'lumber' || a.kind === 'lodge') {
    const slot = a.type === 'upgradeStructure' ? a.slot : a.kind;
    const level = a.type === 'upgradeStructure' ? a.level : 1;
    if (slot.startsWith('tower')) {
      canvas.scale(0.3, 0.3);
      drawTower(canvas, 0, 0, level, time);
    } else {
      canvas.scale(0.45, 0.45);
      if (slot === 'barracks') drawBarracks(canvas, level, 0, time);
      else if (slot === 'lodge') drawLodge(canvas, level, 0);
      else drawLumberCamp(canvas, level, 0);
    }
  } else if (a.kind === 'trap') {
    canvas.translate(0, -16);
    canvas.scale(0.6, 0.6);
    drawTrap(canvas, time);
  } else if (a.kind === 'catapult') {
    canvas.scale(0.55, 0.55);
    drawCatapult(canvas, 0, 0);
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

/** Nom et prix restant (bois, et nourriture si besoin) : dessinés après les personnages pour rester lisibles. */
function drawPadLabels(canvas: SkCanvas, pad: Pad, font: SkFont) {
  const r = PAD_RADIUS;
  drawOutlinedText(canvas, padLabel(pad), pad.x, pad.y - r - 10, font, C.white);
  const wood = pad.cost - pad.paid;
  const food = pad.foodCost - pad.foodPaid;
  const parts: { text: string; food: boolean }[] = [];
  if (wood > 0) parts.push({ text: `${wood}`, food: false });
  if (food > 0) parts.push({ text: `${food}`, food: true });
  const widths = parts.map((p) => font.getTextWidth(p.text) + 26);
  let x = pad.x - widths.reduce((a, b) => a + b, 0) / 2;
  parts.forEach((p, i) => {
    const w = font.getTextWidth(p.text);
    drawOutlinedText(canvas, p.text, x + w / 2, pad.y + r + 22, font, p.food ? '#FF8A7A' : C.hpBuilding);
    if (p.food) drawMeatIcon(canvas, x + w + 12, pad.y + r + 16, 0.6);
    else drawLogIcon(canvas, x + w + 12, pad.y + r + 16, 0.8);
    x += widths[i];
  });
}

/** Les améliorations de tour n'apparaissent que quand le héros est à côté (sinon trop d'emplacements). */
const padShown = (pad: Pad, state: GameState) =>
  !(pad.action.type === 'upgradeStructure' && pad.action.slot.startsWith('tower')) ||
  Math.hypot(state.hero.x - pad.x, state.hero.y - pad.y) < 240;

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
  // Zones au sol : flammes et nuages toxiques
  for (const h of state.hazards) {
    if (!visible(h.x, h.y)) continue;
    const a = Math.min(1, h.life / 0.6);
    if (h.kind === 'fire') {
      const p1 = fill('rgba(255,120,30,0.28)');
      p1.setAlphaf(0.28 * a);
      canvas.drawOval(Skia.XYWHRect(h.x - h.radius, h.y - h.radius * 0.55, h.radius * 2, h.radius * 1.1), p1);
      p1.setAlphaf(1);
      for (let i = 0; i < 5; i++) {
        const fx = h.x + Math.cos(i * 1.3 + h.x) * h.radius * 0.6;
        const fy = h.y + Math.sin(i * 1.7 + h.y) * h.radius * 0.3;
        const fh = 10 + Math.sin(state.time * 12 + i) * 4;
        canvas.drawOval(Skia.XYWHRect(fx - 5, fy - fh, 10, fh), fill(i % 2 ? '#FFB020' : '#FF6B2B'));
      }
    } else {
      const p1 = fill('rgba(140,220,90,0.32)');
      p1.setAlphaf(0.32 * a);
      for (let i = 0; i < 4; i++) {
        const r = h.radius * (0.55 + 0.15 * Math.sin(state.time * 2 + i));
        canvas.drawCircle(h.x + Math.cos(i * 1.6) * h.radius * 0.35, h.y - 10 + Math.sin(i * 1.6) * h.radius * 0.2, r, p1);
      }
      p1.setAlphaf(1);
    }
  }

  // Aura de givre autour du héros
  const frost = perkPhase(state.perks.frost);
  if (frost > 0 && !hero.dead) {
    const r = PERK_VALUES.frost.radius[frost];
    canvas.drawOval(Skia.XYWHRect(hero.x - r, hero.y - r * 0.6, r * 2, r * 1.2), fill('rgba(150,210,255,0.16)'));
    canvas.drawOval(Skia.XYWHRect(hero.x - r, hero.y - r * 0.6, r * 2, r * 1.2), stroke('rgba(200,235,255,0.55)', 2));
    for (let i = 0; i < 4 + frost * 2; i++) {
      const a = state.time * 0.8 + (i / (4 + frost * 2)) * Math.PI * 2;
      canvas.drawCircle(hero.x + Math.cos(a) * r * 0.85, hero.y + Math.sin(a) * r * 0.5 - 6, 2.5 + frost * 0.5, fill(C.white));
    }
  }

  for (const pad of state.pads) {
    if (!visible(pad.x, pad.y) || !padShown(pad, state)) continue;
    const heroOn = !hero.dead && Math.hypot(hero.x - pad.x, hero.y - pad.y) < PAD_RADIUS + 4;
    drawPadGround(canvas, pad, heroOn, paints.dash, state);
  }

  // Attaques de boss annoncées au sol : la zone rouge se remplit, puis ça frappe.
  for (const z of state.zombies) {
    const a = z.ability;
    if (!a || a.state !== 'windup' || !visible(z.x, z.y)) continue;
    const k = 1 - a.timer / WINDUP[a.kind];
    const edge = stroke('rgba(255,60,60,0.9)', 3);
    const area = fill('rgba(255,60,60,0.18)');
    const core = fill('rgba(255,60,60,0.35)');
    if (a.kind === 'charge') {
      const w = z.radius * 2.6;
      canvas.save();
      canvas.translate(z.x, z.y);
      canvas.rotate((a.angle * 180) / Math.PI, 0, 0);
      canvas.drawRect(Skia.XYWHRect(0, -w / 2, CHARGE_LENGTH, w), area);
      canvas.drawRect(Skia.XYWHRect(0, -w / 2, CHARGE_LENGTH * k, w), core);
      canvas.drawRect(Skia.XYWHRect(0, -w / 2, CHARGE_LENGTH, w), edge);
      canvas.restore();
    } else if (a.kind === 'slam') {
      const r = slamRadius(z);
      canvas.drawOval(Skia.XYWHRect(z.x - r, z.y - r * 0.6, r * 2, r * 1.2), area);
      canvas.drawOval(Skia.XYWHRect(z.x - r * k, z.y - r * 0.6 * k, r * 2 * k, r * 1.2 * k), core);
      canvas.drawOval(Skia.XYWHRect(z.x - r, z.y - r * 0.6, r * 2, r * 1.2), edge);
    } else if (a.kind === 'spit') {
      for (let i = -1; i <= 1; i++) {
        const ang = a.angle + i * 0.22;
        canvas.drawLine(z.x, z.y, z.x + Math.cos(ang) * 320, z.y + Math.sin(ang) * 320, stroke('rgba(140,220,90,0.6)', 6));
      }
    } else {
      canvas.drawCircle(z.x, z.y, 60 + k * 40, stroke('rgba(199,125,255,0.8)', 4));
    }
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
    drawables.push({ y: s.y, draw: () => drawStructure(canvas, s, base.x, base.y, state.time, Math.min(3, state.perks.engineer), state.wallLevel) });
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
  for (const a of state.animals) {
    if (!visible(a.x, a.y)) continue;
    drawShadow(canvas, a.x, a.y, a.kind === 'rabbit' ? 9 : 16, 4);
    drawables.push({ y: a.y, draw: () => drawAnimal(canvas, a) });
  }
  for (const w of state.pets) {
    if (!visible(w.x, w.y)) continue;
    drawShadow(canvas, w.x, w.y, w.alpha ? 22 : 14, 5);
    drawables.push({ y: w.y, draw: () => drawWolf(canvas, w, state.time) });
  }
  for (const tu of state.turrets) {
    if (!visible(tu.x, tu.y)) continue;
    drawShadow(canvas, tu.x, tu.y, 14, 4);
    drawables.push({ y: tu.y, draw: () => drawTurret(canvas, tu) });
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

  // Haches tournoyantes : flammes en phase 2, tornade de lames d'or en phase 3
  const orbit = perkPhase(state.perks.orbit);
  if (!hero.dead && orbit > 0) {
    if (orbit >= 3) {
      const r = PERK_VALUES.orbit.radius[3];
      for (let i = 0; i < 3; i++) {
        const rr = r * (0.75 + i * 0.15);
        canvas.drawArc(Skia.XYWHRect(hero.x - rr, hero.y - 20 - rr * 0.75, rr * 2, rr * 1.5), ((state.time * 300 + i * 120) % 360), 140, false, stroke('rgba(255,255,255,0.35)', 4));
      }
    }
    for (const o of orbitPositions(state)) {
      if (orbit === 2) {
        canvas.drawCircle(o.x, o.y, 22, fill('rgba(255,120,30,0.35)'));
        canvas.drawCircle(o.x, o.y, 12, fill('rgba(255,210,90,0.45)'));
      }
      drawSpinningAxe(canvas, o.x, o.y, o.angle, orbit);
    }
  }

  // Nuage d'orage au-dessus du héros (Éclair phase 3)
  if (!hero.dead && perkPhase(state.perks.lightning) >= 3) {
    const cx = hero.x;
    const cy = hero.y - 150 + Math.sin(state.time * 1.5) * 6;
    const flash = state.bolts.length > 0;
    for (const [ox, oy, r] of [[-30, 6, 24], [0, -6, 32], [32, 4, 24], [12, 12, 22], [-14, 12, 20]] as const) {
      canvas.drawCircle(cx + ox, cy + oy, r + 3, fill(C.outline));
    }
    for (const [ox, oy, r] of [[-30, 6, 24], [0, -6, 32], [32, 4, 24], [12, 12, 22], [-14, 12, 20]] as const) {
      canvas.drawCircle(cx + ox, cy + oy, r, fill(flash ? '#D8D2FF' : '#5E5A78'));
    }
  }

  // Pluie de flèches et météores
  for (const d of state.skyDrops) {
    if (d.t < 0) continue;
    if (d.kind === 'arrow') {
      const y = d.y - (1 - d.t) * 260;
      canvas.drawLine(d.x - 4, y - 22, d.x, y, stroke(C.outline, 5));
      canvas.drawLine(d.x - 4, y - 22, d.x, y, stroke('#5BE0FF', 2.5));
    } else {
      const k = d.t;
      canvas.drawOval(Skia.XYWHRect(d.x - d.radius * k * 0.6, d.y - d.radius * k * 0.3, d.radius * k * 1.2, d.radius * k * 0.6), fill('rgba(43,34,56,0.3)'));
      const mx = d.x - (1 - k) * 260;
      const my = d.y - (1 - k) * 520;
      canvas.drawLine(mx - 60, my - 120, mx, my, stroke('rgba(255,140,40,0.5)', 22));
      canvas.drawCircle(mx, my, 26, fill(C.outline));
      canvas.drawCircle(mx, my, 23, fill('#C2352B'));
      canvas.drawCircle(mx - 6, my - 6, 9, fill('#FFB020'));
    }
  }

  // Ondes : gel, hurlement, impact de météore
  for (const n of state.novas) {
    const k = 1 - n.life / n.maxLife;
    const r = n.radius * (0.3 + 0.7 * k);
    const color =
      n.kind === 'frost'
        ? 'rgba(170,225,255,0.8)'
        : n.kind === 'howl'
          ? 'rgba(255,255,255,0.7)'
          : n.kind === 'slam'
            ? 'rgba(255,60,60,0.85)'
            : n.kind === 'summon'
              ? 'rgba(199,125,255,0.85)'
              : 'rgba(255,150,40,0.8)';
    const paint = stroke(color, 8 * (1 - k) + 2);
    canvas.drawOval(Skia.XYWHRect(n.x - r, n.y - r * 0.6, r * 2, r * 1.2), paint);
    if (n.kind === 'frost') canvas.drawOval(Skia.XYWHRect(n.x - r, n.y - r * 0.6, r * 2, r * 1.2), fill('rgba(170,225,255,0.15)'));
  }

  // Bombes en vol (ombre au sol + bombe en cloche)
  for (const b of state.bombs) {
    const x = b.fromX + (b.toX - b.fromX) * b.t;
    const y = b.fromY + (b.toY - b.fromY) * b.t;
    drawShadow(canvas, x, y + 30 * (1 - b.t), 8, 3);
    const by = y - Math.sin(Math.PI * b.t) * (b.boulder ? 160 : b.cluster < 0 ? 50 : 110);
    if (b.boulder) {
      canvas.drawCircle(x, by, 12, fill(C.outline));
      canvas.drawCircle(x, by, 10, fill(C.stoneDark));
      canvas.drawCircle(x - 3, by - 3, 3, fill(C.stone));
    } else {
      drawBomb(canvas, x, by, state.time, b.phase);
    }
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
    // Éclair en chaîne : arcs entre les zombies touchés
    let cx = bolt.x;
    let cy = bolt.y - 20;
    for (const pnt of bolt.chain) {
      const mx = (cx + pnt.x) / 2 + Math.sin(bolt.seed + pnt.x) * 14;
      const my = (cy + pnt.y - 20) / 2 + Math.cos(bolt.seed + pnt.y) * 14;
      canvas.drawLine(cx, cy, mx, my, glow);
      canvas.drawLine(mx, my, pnt.x, pnt.y - 20, glow);
      canvas.drawLine(cx, cy, mx, my, core);
      canvas.drawLine(mx, my, pnt.x, pnt.y - 20, core);
      cx = pnt.x;
      cy = pnt.y - 20;
    }
    glow.setAlphaf(1);
    core.setAlphaf(1);
  }

  // Crachats ennemis
  for (const s of state.enemyShots) {
    const r = s.big ? 11 : 7;
    canvas.drawCircle(s.x, s.y, r + 3, fill(C.outline));
    canvas.drawCircle(s.x, s.y, r, fill('#8FD14F'));
    canvas.drawCircle(s.x - r * 0.3, s.y - r * 0.3, r * 0.35, fill('rgba(255,255,255,0.6)'));
  }

  // Flèches et boulets (l'apparence suit la phase de l'atout)
  for (const p of state.projectiles) drawProjectile(canvas, p);

  // Particules
  drawParticles(canvas, state.particles, visible);

  // Bûches qui volent vers un emplacement
  for (const l of state.flyingLogs) {
    const x = l.fromX + (l.toX - l.fromX) * l.t;
    const y = l.fromY + (l.toY - l.fromY) * l.t - Math.sin(Math.PI * l.t) * 50;
    drawLogIcon(canvas, x, y, 1.1);
  }

  if (fonts.small) {
    for (const pad of state.pads) if (visible(pad.x, pad.y) && padShown(pad, state)) drawPadLabels(canvas, pad, fonts.small);
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
      if (s.kind === 'tower' && visible(s.x, s.y)) canvas.drawCircle(s.x, s.y, towerRange(s.level), stroke('rgba(255,255,255,0.12)', 2));
    }
  }

  // Chiffres qui sautent
  if (fonts.big) drawFloatingTexts(canvas, state.texts, fonts.big);
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
