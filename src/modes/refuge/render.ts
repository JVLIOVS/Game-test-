import { ClipOp, PaintStyle, Skia, StrokeCap, StrokeJoin, type SkCanvas, type SkFont, type SkPaint, type SkPath } from '@shopify/react-native-skia';
import type { JoystickState } from '../../input/joystick';
import { drawFloatingTexts, drawOutlinedText, drawParticles, drawProjectile } from '../../render/fx';
import { PALETTE as C, fill, layerAlpha, stroke } from '../../render/palette';
import { drawHpBar, drawShadow, drawZombie } from '../../render/sprites';
import { drawSprite, poseOf } from '../../render/spriteCache';
import { ARENA_H, ARENA_W, ARRIVAL_TIME, CELL, DEMON_RADIUS, PAD_RADIUS, TURRET, WALL } from './balance';
import { CENTER, cellTaken, doorOutside, doorRect } from './layout';
import { ALLIES, ROAR } from './data';
import { DEVOUR_TIME, padOffer, playerSurvivor, turretOffer } from './sim';
import type { Ally, Demon, PlacedArtifact, RefugePad, RefugeState, RefugeTurret, Room, Survivor } from './types';

// Rendu du mode Refuges : arène sombre, refuges éclairés de l'intérieur, portes qui
// changent d'aspect à chaque niveau, tourelles qui se transforment, Démon menaçant.

const COLORS = {
  void: '#16131F',
  floor: '#2E2A40',
  floorLine: 'rgba(255,255,255,0.04)',
  plank: '#8A5A3A',
  plankLine: '#74482C',
  wall: '#5E5A78',
  wallTop: '#7A76A0',
  altar: '#5A1E2E',
  altarRune: '#C2352B',
  coin: '#FFD25A',
};

/** Porte : bois → fer → acier → blindée → titane. */
const DOOR_COLORS = ['#000', '#A86D38', '#8E979E', '#6E86A8', '#4A4F5E', '#5BE0FF'];

// Chemins créés une seule fois (sur le web, chaque objet Skia doit être libéré à la main).
const paths = new Map<string, SkPath>();
function cached(key: string, build: (b: ReturnType<typeof Skia.PathBuilder.Make>) => void): SkPath {
  let p = paths.get(key);
  if (!p) {
    const b = Skia.PathBuilder.Make();
    build(b);
    p = b.build();
    paths.set(key, p);
  }
  return p;
}

const scaleFor = (width: number) => Math.min(1.3, Math.max(0.8, width / 480));

function drawRoomFloor(canvas: SkCanvas, room: Room, mine: boolean) {
  const r = room.inner;
  canvas.drawRect(Skia.XYWHRect(r.x, r.y, r.w, r.h), fill(COLORS.plank));
  for (let y = r.y + 20; y < r.y + r.h; y += 20) canvas.drawRect(Skia.XYWHRect(r.x, y, r.w, 2), fill(COLORS.plankLine));
  // Lueur chaude autour du trône, seulement dans ta chambre (les grands halos coûtent cher à l'écran).
  if (mine) canvas.drawCircle(room.gen.x, room.gen.y, 110 + room.gen.level * 8, fill('rgba(255,170,60,0.12)'));
  if (mine) canvas.drawRect(Skia.XYWHRect(r.x, r.y, r.w, r.h), stroke('rgba(255,210,90,0.5)', 4));
}

function drawWalls(canvas: SkCanvas, room: Room) {
  for (const w of room.walls) {
    canvas.drawRect(Skia.XYWHRect(w.x - 2, w.y - 2, w.w + 4, w.h + 4), fill(C.outline));
    canvas.drawRect(Skia.XYWHRect(w.x, w.y, w.w, w.h), fill(COLORS.wall));
    canvas.drawRect(Skia.XYWHRect(w.x, w.y, w.w, 4), fill(COLORS.wallTop));
  }
}

function drawDoor(canvas: SkCanvas, room: Room) {
  const d = doorRect(room);
  if (room.door.broken) {
    for (let i = 0; i < 4; i++) canvas.drawRect(Skia.XYWHRect(d.x + 6 + i * 17, d.y + (i % 2) * 6, 12, 5), fill(DOOR_COLORS[1]));
    return;
  }
  const lv = room.door.level;
  const flash = room.door.hitFlash > 0.5;
  const color = flash ? C.white : DOOR_COLORS[lv];
  canvas.drawRect(Skia.XYWHRect(d.x - 3, d.y - 3, d.w + 6, d.h + 6), fill(C.outline));
  canvas.drawRect(Skia.XYWHRect(d.x, d.y, d.w, d.h), fill(color));
  if (lv === 1) {
    for (let x = d.x + 12; x < d.x + d.w; x += 13) canvas.drawRect(Skia.XYWHRect(x, d.y, 2, d.h), fill(C.plankDark));
  } else {
    // Rivets, de plus en plus nombreux
    for (let i = 0; i < lv + 2; i++) canvas.drawCircle(d.x + 8 + (i * (d.w - 16)) / (lv + 1), d.y + d.h / 2, 2.5, fill(C.outline));
    if (lv === 5) canvas.drawRect(Skia.XYWHRect(d.x, d.y + d.h / 2 - 2, d.w, 4), fill('rgba(255,255,255,0.7)'));
  }
}

/** Le trône : s'y asseoir rapporte l'or. Il s'embellit à chaque niveau (bois, pierre, bronze, or, or et pierres). */
const THRONE = [
  { wood: '#8A5A3A', trim: '#6A4A2A', cushion: '#B0452A' },
  { wood: '#8A5A3A', trim: '#6A4A2A', cushion: '#B0452A' },
  { wood: '#8E929E', trim: '#6E7280', cushion: '#4E7BD6' },
  { wood: '#B87A3A', trim: '#8A5A2A', cushion: '#7E3AA3' },
  { wood: '#E8B830', trim: '#B88A1E', cushion: '#C2352B' },
  { wood: '#F4CC40', trim: '#C8962A', cushion: '#7E1830' },
  { wood: '#FFE070', trim: '#D8A030', cushion: '#5A2A86' },
];

/**
 * Trône, en deux morceaux pour qu'on voie le personnage assis dedans :
 * le dossier (dessiné derrière lui) et le siège avec ses accoudoirs (dessinés devant ses jambes).
 */
function drawThroneBack(canvas: SkCanvas, room: Room) {
  const g = room.gen;
  const lv = Math.min(THRONE.length - 1, g.level);
  drawSprite(canvas, `throneBack|${lv}`, g.x, g.y, [-44, -112, 88, 116], (c) => {
    const th = THRONE[lv];
    // Halo royal à partir de l'or
    if (lv >= 4) c.drawCircle(0, -56, 42, fill('rgba(255,210,90,0.22)'));
    // Grand dossier arrondi, surmonté de pointes comme une couronne
    c.drawRRect(Skia.RRectXY(Skia.XYWHRect(-31, -94, 62, 84), 14, 14), fill(C.outline));
    c.drawRRect(Skia.RRectXY(Skia.XYWHRect(-27, -90, 54, 78), 11, 11), fill(th.wood));
    for (const px of [-18, 0, 18]) {
      c.drawPath(cached(`thronePeakO${px}`, (b) => b.moveTo(px - 9, -88).lineTo(px, px === 0 ? -110 : -104).lineTo(px + 9, -88).close()), fill(C.outline));
      c.drawPath(cached(`thronePeakI${px}`, (b) => b.moveTo(px - 6, -89).lineTo(px, px === 0 ? -105 : -99).lineTo(px + 6, -89).close()), fill(th.trim));
    }
    if (lv >= 5) for (const px of [-18, 0, 18]) c.drawCircle(px, -96, 3.5, fill(px === 0 ? '#5BE0FF' : '#E0533D'));
    // Coussin du dossier, avec un liseré doré
    c.drawRRect(Skia.RRectXY(Skia.XYWHRect(-19, -80, 38, 60), 9, 9), fill(th.cushion));
    c.drawRRect(Skia.RRectXY(Skia.XYWHRect(-19, -80, 38, 60), 9, 9), stroke(th.trim, 2.5));
    // Pieds du trône (on les voit dépasser derrière le siège)
    c.drawRect(Skia.XYWHRect(-30, -14, 8, 16), fill(th.trim));
    c.drawRect(Skia.XYWHRect(22, -14, 8, 16), fill(th.trim));
  });
}

function drawThroneFront(canvas: SkCanvas, room: Room) {
  const g = room.gen;
  const lv = Math.min(THRONE.length - 1, g.level);
  drawSprite(canvas, `throneFront|${lv}`, g.x, g.y, [-42, -46, 84, 62], (c) => {
    const th = THRONE[lv];
    // Bord avant du siège : il cache les hanches du personnage assis
    c.drawRRect(Skia.RRectXY(Skia.XYWHRect(-30, -22, 60, 26), 8, 8), fill(C.outline));
    c.drawRRect(Skia.RRectXY(Skia.XYWHRect(-27, -19, 54, 20), 6, 6), fill(th.wood));
    c.drawRect(Skia.XYWHRect(-27, -19, 54, 5), fill(th.cushion));
    // Accoudoirs de chaque côté, avec une boule dorée au bout
    for (const ax of [-38, 26]) {
      c.drawRRect(Skia.RRectXY(Skia.XYWHRect(ax, -40, 12, 42), 5, 5), fill(C.outline));
      c.drawRRect(Skia.RRectXY(Skia.XYWHRect(ax + 2.5, -37.5, 7, 37), 3.5, 3.5), fill(th.trim));
      c.drawCircle(ax + 6, -40, 6, fill(C.outline));
      c.drawCircle(ax + 6, -40, 4, fill('#FFD25A'));
    }
    // Petites pièces : le niveau du trône
    for (let i = 0; i < g.level; i++) c.drawCircle(-15 + i * 6, 10, 2.4, fill('#FFD25A'));
  });
}

/** Alpha arrondi : évite de créer un pinceau par valeur. */
const rgba = (rgb: string, a: number) => `rgba(${rgb},${Math.round(Math.max(0, Math.min(1, a)) * 20) / 20})`;

const rounds = new Map<string, SkPaint>();
/** Trait à bouts arrondis (bras, queue). */
function roundStroke(color: string, width: number): SkPaint {
  const key = `${color}|${width}`;
  let p = rounds.get(key);
  if (!p) {
    p = Skia.Paint();
    p.setAntiAlias(true);
    p.setStyle(PaintStyle.Stroke);
    p.setStrokeWidth(width);
    p.setStrokeCap(StrokeCap.Round);
    p.setStrokeJoin(StrokeJoin.Round);
    p.setColor(Skia.Color(color));
    rounds.set(key, p);
  }
  return p;
}

/** Forme pleine cernée de noir, dans le style cartoon du jeu. */
function outlined(canvas: SkCanvas, path: SkPath, color: string, width = 5) {
  canvas.drawPath(path, roundStroke(C.outline, width));
  canvas.drawPath(path, fill(color));
}

const TURRET_BASE = ['', '#9A6A42', '#7E8794', '#4A4F5E', '#E8ECF8'];

/** Tourelle : arbalète en bois → baliste double → canon → laser de cristal. */
/** Tourelle depuis le cache d'images : 32 orientations, 3 positions de recul. */
function drawTurret(canvas: SkCanvas, t: RefugeTurret, time: number) {
  if (t.level === 0) return;
  const def = TURRET[t.level]!;
  const recoil = Math.round(Math.max(0, 1 - (def.interval - t.cooldown) / 0.15) * 2) / 2;
  const dirs = 32;
  const a = poseOf(t.angle + Math.PI / dirs, dirs);
  const glow = t.level >= 4 ? poseOf(time * 18, 4) : 0;
  drawSprite(canvas, `t|${t.level}|${a}|${recoil}|${glow}`, t.x, t.y, [-44, -48, 88, 92], (c) =>
    drawTurretShape(c, t.level, (a / dirs) * Math.PI * 2, recoil * (t.level === 3 ? 7 : 4), ((glow + 0.5) / 4) * ((Math.PI * 2) / 18)),
  );
}

function drawTurretShape(canvas: SkCanvas, level: number, angle: number, recoil: number, time: number) {
  const t = { level, angle };
  canvas.save();
  // Socle carré, propre à chaque niveau
  canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(-21, -17, 42, 38), 9, 9), fill(C.shadow));
  canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(-20, -20, 40, 38), 9, 9), fill(C.outline));
  canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(-17, -17, 34, 32), 7, 7), fill(TURRET_BASE[t.level]));
  if (t.level === 1) {
    for (const y of [-7, 3]) canvas.drawRect(Skia.XYWHRect(-17, y, 34, 2), fill(C.plankDark));
  } else if (t.level === 2) {
    for (const [x, y] of [[-12, -12], [12, -12], [-12, 10], [12, 10]]) canvas.drawCircle(x, y, 2.4, fill(C.outline));
  } else if (t.level === 3) {
    for (let i = 0; i < 4; i++) canvas.drawRect(Skia.XYWHRect(-15 + i * 9, 11, 5, 4), fill('#FFB020'));
  } else {
    canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(-17, -17, 34, 32), 7, 7), stroke(rgba('91,224,255', 0.6 + Math.sin(time * 4) * 0.3), 3));
  }
  // Tête orientable
  canvas.translate(0, -4);
  canvas.rotate((t.angle * 180) / Math.PI, 0, 0);
  canvas.translate(-recoil, 0);
  switch (t.level) {
    case 1: {
      canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(-10, -4, 32, 8), 4, 4), fill(C.outline));
      canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(-8, -2.5, 28, 5), 2.5, 2.5), fill('#C08A52'));
      canvas.drawPath(cached('bow1', (b) => b.moveTo(14, -15).quadTo(26, 0, 14, 15)), roundStroke(C.outline, 6));
      canvas.drawPath(cached('bow1', (b) => b.moveTo(14, -15).quadTo(26, 0, 14, 15)), roundStroke('#8A5A3A', 3));
      canvas.drawLine(14, -15, 6, 0, stroke('#F1E3C6', 1.5));
      canvas.drawLine(14, 15, 6, 0, stroke('#F1E3C6', 1.5));
      canvas.drawPath(cached('tip1', (b) => b.moveTo(22, -4).lineTo(29, 0).lineTo(22, 4).close()), fill('#D9DEE6'));
      break;
    }
    case 2: {
      for (const oy of [-7, 7]) {
        canvas.save();
        canvas.translate(0, oy);
        canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(-8, -3.5, 30, 7), 3.5, 3.5), fill(C.outline));
        canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(-6, -2, 26, 4), 2, 2), fill('#B0B8C4'));
        canvas.drawPath(cached('tip2', (b) => b.moveTo(22, -3.5).lineTo(28, 0).lineTo(22, 3.5).close()), fill('#FFD25A'));
        canvas.restore();
      }
      canvas.drawPath(cached('bow2', (b) => b.moveTo(10, -19).quadTo(24, 0, 10, 19)), roundStroke(C.outline, 7));
      canvas.drawPath(cached('bow2', (b) => b.moveTo(10, -19).quadTo(24, 0, 10, 19)), roundStroke('#6E7A86', 4));
      canvas.drawCircle(-4, 0, 7, fill(C.outline));
      canvas.drawCircle(-4, 0, 4.5, fill('#FFB020'));
      break;
    }
    case 3: {
      canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(-4, -9, 34, 18), 8, 8), fill(C.outline));
      canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(-2, -6.5, 30, 13), 6, 6), fill('#3A3F4C'));
      canvas.drawRect(Skia.XYWHRect(19, -9, 5, 18), fill('#FFB020'));
      canvas.drawCircle(30, 0, 6, fill(C.outline));
      canvas.drawCircle(30, 0, 3.5, fill('#1A1A22'));
      canvas.drawCircle(-3, 0, 13, fill(C.outline));
      canvas.drawCircle(-3, 0, 10, fill('#5E6670'));
      canvas.drawCircle(-6, -3, 3.5, fill('rgba(255,255,255,0.35)'));
      break;
    }
    default: {
      const glow = 0.5 + Math.sin(time * 18) * 0.25;
      canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(-2, -5, 32, 10), 5, 5), fill(C.outline));
      canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(0, -3, 28, 6), 3, 3), fill('#D6DCF0'));
      for (const x of [10, 20]) canvas.drawRect(Skia.XYWHRect(x, -5, 3, 10), fill('#5BE0FF'));
      canvas.drawCircle(31, 0, 9, fill(rgba('91,224,255', glow * 0.6)));
      canvas.drawCircle(31, 0, 4, fill('#E0FAFF'));
      canvas.drawCircle(-3, 0, 12, fill(C.outline));
      canvas.drawCircle(-3, 0, 9, fill('#F4F6FF'));
      canvas.drawPath(cached('crystal', (b) => b.moveTo(-3, -8).lineTo(3, 0).lineTo(-3, 8).lineTo(-9, 0).close()), fill('#5BE0FF'));
    }
  }
  canvas.restore();
}

/** Autel : scellé au départ, il se fissure pendant l'arrivée du Démon, puis devient son repaire. */
function drawAltar(canvas: SkCanvas, state: RefugeState) {
  const { x, y } = CENTER;
  const awake = state.phase !== 'intro' && state.phase !== 'choose';
  const arriving = state.phase === 'arrival';
  const t = state.time;
  canvas.drawCircle(x, y, 74, fill(C.outline));
  canvas.drawCircle(x, y, 70, fill(awake ? COLORS.altar : '#3A3248'));
  canvas.drawCircle(x, y, 52, stroke(awake ? COLORS.altarRune : '#5A4E6E', 3));
  // Étoile de runes
  canvas.drawPath(
    cached('altarStar', (b) => {
      for (let i = 0; i <= 5; i++) {
        const a = -Math.PI / 2 + ((i * 2) % 5) * ((Math.PI * 2) / 5);
        const px = x + Math.cos(a) * 50;
        const py = y + Math.sin(a) * 50;
        if (i === 0) b.moveTo(px, py);
        else b.lineTo(px, py);
      }
    }),
    stroke(awake ? COLORS.altarRune : rgba('194,53,43', 0.25 + Math.sin(t * 2) * 0.15), 3),
  );
  for (let i = 0; i < 8; i++) {
    const a = (awake ? t * 0.5 : t * 0.15) + (i / 8) * Math.PI * 2;
    canvas.drawCircle(x + Math.cos(a) * 62, y + Math.sin(a) * 62, 3.5, fill(awake ? '#FF7A3D' : '#6E2A3A'));
  }
  if (arriving) {
    // Fissures incandescentes et colonne de lumière
    const p = 1 - state.phaseTimer / ARRIVAL_TIME;
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.3;
      const len = Math.min(1, p * 2) * (60 + (i % 3) * 25);
      canvas.drawLine(x, y, x + Math.cos(a) * len, y + Math.sin(a) * len * 0.8, roundStroke('#FF7A3D', 5));
      canvas.drawLine(x, y, x + Math.cos(a) * len, y + Math.sin(a) * len * 0.8, roundStroke('#FFE14D', 2));
    }
    canvas.drawCircle(x, y, 30 + p * 40, fill(rgba('255,90,40', 0.35 + Math.sin(t * 20) * 0.1)));
    const beam = Math.min(1, p * 1.6) * (1 - Math.max(0, (p - 0.8) / 0.2));
    canvas.drawRect(Skia.XYWHRect(x - 46, y - 900, 92, 900), fill(rgba('255,80,50', beam * 0.25)));
    canvas.drawRect(Skia.XYWHRect(x - 20, y - 900, 40, 900), fill(rgba('255,200,120', beam * 0.3)));
  }
}

/** Le Démon : colosse cornu aux ailes de chauve-souris, queue fourchue, yeux de braise. */
/** Couleurs du Démon, et de ses doubles (violets). */
const DEMON_SKIN = { skin: '#B8263A', dark: '#7E1830', chest: '#E0533D', wing: '#4A1F3D' };
const CLONE_SKIN = { skin: '#8E4BC4', dark: '#5A2A86', chest: '#C49AF0', wing: '#2E1A4A' };

/**
 * Démon depuis le cache d'images : 12 poses de marche ou 8 de repos, dans les deux sens.
 * Il était dessiné avec des dizaines de contours courbes à chaque image : c'était la cause du ralentissement.
 * La transparence (sortie de terre, clones) passe par l'image au lieu d'un calque, bien plus léger.
 */
function drawDemon(canvas: SkCanvas, d: Demon, time: number) {
  const rise = d.rise < 1 ? 1 - Math.pow(1 - d.rise, 3) : 1;
  const alpha = d.rise < 1 ? 0.3 + 0.7 * rise : d.cloneTime > 0 ? (d.cloneTime < 3 ? 0.4 + 0.3 * Math.abs(Math.sin(time * 12)) : 0.8) : 1;
  const walking = d.walkTime > 0;
  const poses = walking ? 12 : 8;
  const speed = walking ? 7 : 2.5;
  const pose = poseOf((walking ? d.walkTime : time) * speed, poses);
  // Toutes les petites animations (ailes, queue, flammes, yeux) suivent la même pose.
  const clock = ((pose + 0.5) / poses) * ((Math.PI * 2) / speed);
  const level = Math.min(10, d.level);
  const lunge = Math.round(d.lunge * 2);
  const flash = d.hitFlash > 0.6 ? 1 : 0;
  const dir = d.dirX < 0 ? -1 : 1;
  const hunt = d.state === 'hunt' ? 1 : 0;
  const s = 0.82 + Math.min(0.45, level * 0.045);
  canvas.save();
  canvas.translate(d.x, d.y + (1 - rise) * 40);
  if (d.state === 'heal') canvas.drawCircle(0, -50, 78, fill('rgba(140,255,140,0.16)'));
  if (rise < 1) canvas.scale(0.4 + 0.6 * rise, 0.4 + 0.6 * rise);
  const key = `d|${d.cloneTime > 0 ? 1 : 0}|${level}|${dir}|${walking ? 1 : 0}|${pose}|${lunge}|${flash}|${hunt}`;
  drawSprite(
    canvas,
    key,
    0,
    0,
    [-84 * s, -142 * s, 168 * s, 178 * s],
    (c) =>
      drawDemonShape(
        c,
        { ...d, x: 0, y: 0, rise: 1, level, dirX: dir, lunge: lunge / 2, hitFlash: flash, walkTime: walking ? clock : 0, state: hunt ? 'hunt' : 'attack' },
        clock,
      ),
    { res: 1.5, alpha },
  );
  canvas.restore();
}

function drawDemonShape(canvas: SkCanvas, d: Demon, time: number) {
  const flash = d.hitFlash > 0.6;
  const pal = d.cloneTime > 0 ? CLONE_SKIN : DEMON_SKIN;
  const skin = flash ? C.white : pal.skin;
  const dark = flash ? C.white : pal.dark;
  const chest = flash ? C.white : pal.chest;
  const wing = flash ? C.white : pal.wing;
  const horn = flash ? C.white : '#F1E3C6';
  const s = 0.82 + Math.min(0.45, d.level * 0.045);
  const walking = d.walkTime > 0;
  const step = Math.sin(d.walkTime * 7);
  const bob = walking ? Math.abs(step) * 3 : Math.sin(time * 2.5) * 1.5;
  canvas.save();
  // Aura de flammes au sol, plus haute à chaque niveau
  const fire = 10 + Math.min(14, d.level * 2);
  for (let i = 0; i < 5; i++) {
    const h = fire + Math.sin(time * 11 + i * 1.7) * 5;
    const fx = -28 + i * 14;
    canvas.save();
    canvas.translate(fx, 4);
    canvas.scale(1, h / 20);
    canvas.drawPath(cached('flame', (b) => b.moveTo(0, -20).quadTo(9, -6, 7, 0).quadTo(0, 6, -7, 0).quadTo(-9, -6, 0, -20).close()), fill('#FF7A3D'));
    canvas.scale(0.55, 0.6);
    canvas.drawPath(cached('flame', (b) => b), fill('#FFD25A'));
    canvas.restore();
  }
  canvas.scale(d.dirX * s, s);
  canvas.translate(d.lunge * 10, -bob);

  // Queue fourchue qui fouette l'air
  canvas.save();
  canvas.translate(-16, -26);
  canvas.rotate(Math.sin(time * 3) * 14, 0, 0);
  const tail = cached('tail', (b) => b.moveTo(0, 0).quadTo(-34, 10, -40, -18).quadTo(-44, -36, -30, -46));
  canvas.drawPath(tail, roundStroke(C.outline, 11));
  canvas.drawPath(tail, roundStroke(dark, 6));
  outlined(canvas, cached('tailTip', (b) => b.moveTo(-36, -40).lineTo(-30, -60).lineTo(-20, -42).close()), dark, 4);
  canvas.restore();

  // Ailes (celle du fond plus sombre), qui battent doucement
  const flap = Math.sin(time * (d.state === 'hunt' ? 9 : 4)) * 10;
  const wingPath = cached('wing', (b) =>
    b.moveTo(0, 0).lineTo(-18, -36).lineTo(-52, -40).quadTo(-44, -26, -50, -12).quadTo(-36, -16, -32, -2).quadTo(-20, -10, -8, 10).close(),
  );
  for (const [ox, rot, col] of [[6, -18, '#2E1228'], [-6, 0, wing]] as const) {
    canvas.save();
    canvas.translate(ox, -64);
    canvas.rotate(rot - flap, 0, 0);
    outlined(canvas, wingPath, flash ? C.white : col, 4);
    canvas.drawLine(0, 0, -50, -12, stroke(C.outline, 2));
    canvas.drawLine(0, 0, -32, -2, stroke(C.outline, 2));
    canvas.restore();
  }

  // Jambes trapues et sabots
  for (const [lx, ph] of [[-20, step], [6, -step]] as const) {
    canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(lx - 2, -26 + ph * 3, 18, 26), 8, 8), fill(C.outline));
    canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(lx, -24 + ph * 3, 14, 20), 6, 6), fill(dark));
    canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(lx - 1, -6 + ph * 3, 16, 7), 3, 3), fill('#2B2238'));
  }

  // Bras arrière
  canvas.drawLine(-14, -62, -26, -38, roundStroke(C.outline, 16));
  canvas.drawLine(-14, -62, -26, -38, roundStroke(dark, 10));

  // Torse massif aux épaules larges
  outlined(canvas, cached('torso', (b) => b.moveTo(-20, -20).quadTo(-34, -46, -32, -66).quadTo(-28, -84, -4, -84).lineTo(16, -84).quadTo(38, -82, 36, -62).quadTo(32, -40, 18, -20).close()), skin, 6);
  canvas.drawOval(Skia.XYWHRect(-14, -70, 30, 40), fill(chest));
  canvas.drawLine(-6, -48, 10, -48, roundStroke(dark, 2.5));
  canvas.drawLine(-4, -38, 8, -38, roundStroke(dark, 2.5));
  // Pointes dorsales : une de plus par niveau
  for (let i = 0; i < Math.min(5, d.level); i++) {
    canvas.save();
    canvas.translate(-28 + i * 3, -70 + i * 11);
    outlined(canvas, cached('spike', (b) => b.moveTo(0, -5).lineTo(-12, -2).lineTo(0, 5).close()), horn, 3);
    canvas.restore();
  }

  // Tête enfoncée dans les épaules
  canvas.save();
  canvas.translate(12, -88);
  // Cornes recourbées
  outlined(canvas, cached('hornBack', (b) => b.moveTo(-10, -8).quadTo(-28, -18, -22, -44).quadTo(-14, -26, 0, -16).close()), horn, 5);
  outlined(canvas, cached('hornFront', (b) => b.moveTo(6, -14).quadTo(14, -36, 34, -40).quadTo(22, -26, 18, -8).close()), horn, 5);
  canvas.drawLine(-20, -30, -13, -27, stroke(rgba('43,34,56', 0.5), 2));
  canvas.drawLine(14, -28, 20, -22, stroke(rgba('43,34,56', 0.5), 2));
  canvas.drawCircle(0, 0, 19, fill(C.outline));
  canvas.drawCircle(0, 0, 16, fill(skin));
  // Sourcils froncés et yeux de braise
  const glow = 0.55 + Math.sin(time * 6) * 0.25;
  canvas.drawCircle(4, -3, 10, fill(rgba('255,180,40', glow * 0.45)));
  canvas.drawCircle(15, -3, 8, fill(rgba('255,180,40', glow * 0.45)));
  canvas.drawPath(cached('eyes', (b) => b.moveTo(-2, -5).lineTo(9, -1).lineTo(-1, 0).close().moveTo(11, -1).lineTo(19, -6).lineTo(18, 0).close()), fill('#FFE14D'));
  canvas.drawLine(-4, -10, 9, -5, roundStroke(C.outline, 4));
  canvas.drawLine(12, -5, 20, -10, roundStroke(C.outline, 4));
  // Gueule pleine de crocs, grande ouverte quand il frappe
  const jaw = 5 + d.lunge * 6;
  canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(-2, 4, 22, jaw), 3, 3), fill('#2B0E18'));
  for (let i = 0; i < 4; i++) {
    const fx = 1 + i * 5;
    canvas.drawPath(cached(`fang${i}`, (b) => b.moveTo(fx, 4).lineTo(fx + 2, 9).lineTo(fx + 4, 4).close()), fill(C.white));
  }
  canvas.restore();

  // Bras avant et griffes, projetés vers la porte quand il frappe
  const reach = d.lunge * 14;
  canvas.drawLine(26, -64, 40 + reach, -42, roundStroke(C.outline, 18));
  canvas.drawLine(26, -64, 40 + reach, -42, roundStroke(skin, 12));
  canvas.save();
  canvas.translate(42 + reach, -42);
  canvas.drawCircle(0, 0, 10, fill(C.outline));
  canvas.drawCircle(0, 0, 7, fill(skin));
  outlined(canvas, cached('claws', (b) => b.moveTo(6, -8).lineTo(18, -10).lineTo(8, -3).close().moveTo(8, -2).lineTo(20, 0).lineTo(8, 3).close().moveTo(6, 5).lineTo(17, 10).lineTo(5, 9).close()), horn, 3);
  canvas.restore();
  canvas.restore();
}

// ---------- Artefacts et effets des refuges ----------

/** Grille de construction de ton refuge, et la case où tu te tiens. */
function drawGrid(canvas: SkCanvas, room: Room, buildCell: number | null, time: number) {
  room.cells.forEach((c, i) => {
    const taken = cellTaken(room, i);
    if (taken) return;
    const here = i === buildCell;
    canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(c.x - CELL / 2 + 4, c.y - CELL / 2 + 4, CELL - 8, CELL - 8), 8, 8), fill(here ? 'rgba(255,210,90,0.3)' : 'rgba(30,24,52,0.16)'));
    canvas.drawRRect(
      Skia.RRectXY(Skia.XYWHRect(c.x - CELL / 2 + 4, c.y - CELL / 2 + 4, CELL - 8, CELL - 8), 8, 8),
      stroke(here ? rgba('255,210,90', 0.7 + Math.sin(time * 8) * 0.3) : 'rgba(255,240,220,0.18)', here ? 3 : 1.5),
    );
  });
}

function drawArtifact(canvas: SkCanvas, room: Room, art: PlacedArtifact, time: number) {
  const kind = art.kind;
  const { x, y } = room.cells[art.cell];
  const facing = room.doorSide === 'bottom' ? 1 : -1;
  canvas.save();
  canvas.translate(x, y);
  canvas.drawOval(Skia.XYWHRect(-26, -8, 52, 16), fill(C.shadow));
  if (kind === 'mega') {
    // Méga-tourelle : socle doré et double canon
    canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(-27, -26, 54, 32), 10, 10), fill(C.outline));
    canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(-24, -23, 48, 26), 8, 8), fill('#5E6670'));
    canvas.drawRect(Skia.XYWHRect(-24, -6, 48, 5), fill('#FFD25A'));
    canvas.drawCircle(0, -26, 17, fill(C.outline));
    canvas.drawCircle(0, -26, 14, fill('#C2352B'));
    // Deux canons tournés vers la porte
    const by = facing > 0 ? -26 : -56;
    for (const ox of [-7, 7]) {
      canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(ox - 6, by, 12, 30), 5, 5), fill(C.outline));
      canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(ox - 4, by + 2, 8, 26), 3, 3), fill('#3A3F4C'));
      canvas.drawRect(Skia.XYWHRect(ox - 6, facing > 0 ? by + 22 : by + 2, 12, 4), fill('#FFD25A'));
    }
    canvas.drawCircle(0, -26, 6, fill('#FFD25A'));
    canvas.drawCircle(-4, -30, 3, fill('rgba(255,255,255,0.5)'));
  } else if (kind === 'tesla') {
    // Bobine Tesla : colonne de cuivre et sphère qui crépite
    canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(-16, -8, 32, 12), 5, 5), fill(C.outline));
    canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(-7, -40, 14, 36), 5, 5), fill(C.outline));
    canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(-5, -38, 10, 32), 4, 4), fill('#C8783A'));
    for (let k = 0; k < 4; k++) canvas.drawRect(Skia.XYWHRect(-9, -34 + k * 7, 18, 3), fill('#8A4E24'));
    canvas.drawCircle(0, -46, 11, fill(C.outline));
    canvas.drawCircle(0, -46, 8.5, fill('#9EC8FF'));
    canvas.drawCircle(-3, -49, 3, fill(C.white));
    const a = time * 9;
    canvas.drawLine(0, -46, Math.cos(a) * 18, -46 + Math.sin(a) * 14, stroke('#E0FAFF', 2));
    canvas.drawLine(0, -46, Math.cos(a + 2.5) * 16, -46 + Math.sin(a + 2.5) * 12, stroke('#5BE0FF', 2));
  } else if (kind === 'frost') {
    // Totem de givre : cristal bleu flottant, aura de neige
    canvas.drawCircle(0, 0, 30 + Math.sin(time * 2) * 3, fill('rgba(150,210,255,0.18)'));
    canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(-12, -10, 24, 14), 5, 5), fill(C.outline));
    canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(-10, -8, 20, 10), 4, 4), fill('#DDEBFA'));
    canvas.translate(0, -34 + Math.sin(time * 3) * 3);
    outlined(canvas, cached('crystalBig', (b) => b.moveTo(0, -18).lineTo(11, 0).lineTo(0, 18).lineTo(-11, 0).close()), '#6FB7F0', 4);
    canvas.drawPath(cached('crystalShine', (b) => b.moveTo(0, -14).lineTo(5, 0).lineTo(0, 4).close()), fill('#E0FAFF'));
  } else if (kind === 'heal') {
    // Totem de soin : croix verte qui pulse
    const pulse = 1 + Math.sin(time * 4) * 0.08;
    canvas.drawCircle(0, -24, 26 * pulse, fill('rgba(123,211,90,0.2)'));
    canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(-14, -10, 28, 14), 5, 5), fill(C.outline));
    canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(-12, -8, 24, 10), 4, 4), fill('#F1E3C6'));
    canvas.scale(pulse, pulse);
    canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(-8, -44, 16, 36), 4, 4), fill(C.outline));
    canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(-18, -34, 36, 16), 4, 4), fill(C.outline));
    canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(-5, -41, 10, 30), 3, 3), fill('#7BD35A'));
    canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(-15, -31, 30, 10), 3, 3), fill('#7BD35A'));
  }
  canvas.restore();
}

/** Bouclier, poison, orage, assourdissement : ce qui se passe à la porte. */
function drawDoorEffects(canvas: SkCanvas, room: Room, time: number) {
  const { x, y } = room.door;
  const out = room.doorSide === 'bottom' ? 1 : -1;
  if (room.shield > 0 && !room.door.broken) {
    const a = 0.25 + (room.shield / Math.max(1, room.shieldMax)) * 0.35 + Math.sin(time * 5) * 0.05;
    canvas.drawOval(Skia.XYWHRect(x - 62, y - 26, 124, 52), fill(rgba('111,183,240', a)));
    canvas.drawOval(Skia.XYWHRect(x - 62, y - 26, 124, 52), stroke('#E0FAFF', 2.5));
  }
  if (room.poison.time > 0) {
    for (let i = 0; i < 4; i++) {
      const bx = x - 24 + i * 16;
      const by = y - ((time * 30 + i * 9) % 28);
      canvas.drawCircle(bx, by, 4, fill('rgba(155,225,93,0.8)'));
    }
  }
  if (room.boosts.storm > 0) {
    // Nuage d'orage au-dessus de l'entrée
    const cy = y + out * 90 - 120;
    for (const [ox, r] of [[-30, 22], [0, 28], [30, 22], [-14, 20], [16, 20]] as const) canvas.drawCircle(x + ox, cy + (r === 20 ? -14 : 0), r, fill('#4A4F5E'));
    canvas.drawCircle(x - 8, cy - 18, 12, fill('#6E7486'));
  }
  if (room.stun > 0) {
    for (const t of room.turrets) {
      if (t.level === 0) continue;
      const a = time * 6;
      for (let k = 0; k < 3; k++) canvas.drawCircle(t.x + Math.cos(a + k * 2.1) * 14, t.y - 34 + Math.sin(a + k * 2.1) * 5, 3, fill('#C49AF0'));
    }
  }
}

function drawPad(canvas: SkCanvas, room: Room, pad: RefugePad, gold: number, font: SkFont | null, time: number) {
  const offer = padOffer(room, pad);
  const can = offer !== null && gold >= offer.cost;
  const pulse = can ? 1 + Math.sin(time * 5) * 0.06 : 1;
  canvas.save();
  canvas.translate(pad.x, pad.y);
  canvas.scale(pulse, pulse);
  canvas.drawCircle(0, 0, PAD_RADIUS, fill(can ? 'rgba(255,210,90,0.28)' : 'rgba(255,255,255,0.12)'));
  canvas.drawCircle(0, 0, PAD_RADIUS, stroke(can ? '#FFD25A' : 'rgba(255,255,255,0.4)', 3));
  if (pad.hold > 0) canvas.drawArc(Skia.XYWHRect(-PAD_RADIUS, -PAD_RADIUS, PAD_RADIUS * 2, PAD_RADIUS * 2), -90, Math.min(1, pad.hold / 0.35) * 360, false, stroke('#FFFFFF', 5));
  // Icône
  const ic = fill(C.white);
  if (pad.kind === 'door') {
    canvas.drawRect(Skia.XYWHRect(-8, -12, 16, 22), ic);
    canvas.drawCircle(4, 0, 2, fill(C.outline));
  } else if (pad.kind === 'gen') {
    // Couronne : améliorer le trône
    canvas.drawPath(cached('crownIcon', (b) => b.moveTo(-11, 7).lineTo(-12, -7).lineTo(-5, -1).lineTo(0, -10).lineTo(5, -1).lineTo(12, -7).lineTo(11, 7).close()), fill('#FFD25A'));
  } else if (pad.kind === 'weapon') {
    // Arc : améliorer ton arme
    canvas.drawPath(cached('bowIcon', (b) => b.moveTo(-4, -12).quadTo(10, 0, -4, 12)), stroke('#FFFFFF', 3));
    canvas.drawLine(-4, -12, -4, 12, stroke('#FFFFFF', 1.5));
    canvas.drawLine(-8, 0, 10, 0, stroke('#FFD25A', 2.5));
  } else if (pad.kind === 'repair') {
    canvas.drawRect(Skia.XYWHRect(-3, -11, 6, 22), fill('#7BD35A'));
    canvas.drawRect(Skia.XYWHRect(-11, -3, 22, 6), fill('#7BD35A'));
  }
  canvas.restore();
  if (font) {
    const label = offer === null ? (pad.kind === 'repair' ? '…' : 'MAX') : `${offer.cost}`;
    drawOutlinedText(canvas, label, pad.x, pad.y + PAD_RADIUS + 17, font, offer === null ? C.white : can ? COLORS.coin : '#C9C2D8');
  }
}

/** Petite flèche verte qui saute : « touche-moi, tu peux m'améliorer ». */
function drawUpBadge(canvas: SkCanvas, x: number, y: number, time: number) {
  const hop = Math.abs(Math.sin(time * 5)) * 5;
  drawSprite(canvas, 'upBadge', x, y - hop, [-14, -14, 28, 28], (c) => {
    c.drawCircle(0, 0, 13, fill(C.outline));
    c.drawCircle(0, 0, 10.5, fill('#7BD35A'));
    c.drawPath(cached('upArrow', (b) => b.moveTo(0, -7).lineTo(7, 1).lineTo(2.5, 1).lineTo(2.5, 7).lineTo(-2.5, 7).lineTo(-2.5, 1).lineTo(-7, 1).close()), fill(C.white));
  });
}

/** Sous chacune de tes tourelles : le prix de l'amélioration (la toucher pour l'acheter). */
function drawTurretUpgrade(canvas: SkCanvas, room: Room, t: RefugeTurret, gold: number, font: SkFont | null) {
  const offer = turretOffer(room, t);
  const can = offer !== null && gold >= offer.cost;
  if (can) canvas.drawCircle(t.x, t.y, PAD_RADIUS + 2, stroke('#FFD25A', 3));
  if (font) drawOutlinedText(canvas, offer ? `${offer.cost}` : 'MAX', t.x, t.y + 34, font, offer === null ? C.white : can ? COLORS.coin : '#C9C2D8');
}

// ---------- Survivants : chaque personnage a son allure ----------

const HAIRS = ['#5A3A22', '#2B2238', '#C8783A', '#E8C468', '#7A4A2A', '#B0452A'];

/** Compagnon : garde (casque, lance, bouclier), archère (capuche, arc), banquier (haut-de-forme, sac d'or). */
/** Compagnon depuis le cache d'images. */
function drawAlly(canvas: SkCanvas, a: Ally, time: number) {
  const pose = poseOf(time * 3 + a.cell);
  const anim = Math.round(a.anim * 2);
  const dir = a.aimX < 0 ? -1 : 1;
  drawSprite(canvas, `a|${a.kind}|${dir}|${anim}|${pose}`, a.x, a.y, [-30, -90, 60, 100], (c) =>
    drawAllyShape(c, { ...a, x: 0, y: 0, cell: 0, aimX: dir, anim: anim / 2 }, ((pose + 0.5) / 8) * ((Math.PI * 2) / 3)),
  );
}

function drawAllyShape(canvas: SkCanvas, a: Ally, time: number) {
  const ol = fill(C.outline);
  const bob = Math.sin(time * 3 + a.cell) * 1.2;
  canvas.save();
  canvas.translate(a.x, a.y);
  canvas.scale(0.82 * a.aimX, 0.82);
  canvas.drawOval(Skia.XYWHRect(-14, -5, 28, 10), fill(C.shadow));
  canvas.translate(0, bob);
  for (const lx of [-6, 6]) {
    canvas.drawCircle(lx, -3, 6, ol);
    canvas.drawCircle(lx, -3, 4.5, fill('#3A3F4C'));
  }
  canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(-14, -34, 28, 30), 10, 10), ol);
  canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(-12.5, -32.5, 25, 27), 9, 9), fill(ALLIES[a.kind].shirt));
  canvas.drawCircle(0, -46, 14, ol);
  canvas.drawCircle(0, -46, 12, fill(C.skin));
  canvas.drawCircle(4, -45, 3.6, fill(C.white));
  canvas.drawCircle(10, -45, 3.6, fill(C.white));
  canvas.drawCircle(5, -44.6, 1.8, ol);
  canvas.drawCircle(11, -44.6, 1.8, ol);
  if (a.kind === 'guard') {
    canvas.drawOval(Skia.XYWHRect(-14, -64, 28, 20), ol);
    canvas.drawOval(Skia.XYWHRect(-12.5, -62.5, 25, 17), fill('#AEB6C2'));
    canvas.drawRect(Skia.XYWHRect(14, -70, 3, 66), fill('#8A5A3A'));
    canvas.drawPath(cached('spear', (b) => b.moveTo(11, -70).lineTo(15.5, -82).lineTo(20, -70).close()), fill('#D6DCE6'));
    canvas.drawCircle(-14, -22, 10, ol);
    canvas.drawCircle(-14, -22, 8, fill('#4E7BD6'));
  } else if (a.kind === 'archer') {
    canvas.drawPath(cached('hood', (b) => b.moveTo(-15, -44).quadTo(0, -72, 15, -44).lineTo(10, -50).quadTo(0, -60, -10, -50).close()), fill('#2E8A3A'));
    canvas.save();
    canvas.translate(14, -28);
    canvas.drawPath(cached('allyBow', (b) => b.moveTo(-2, -16).quadTo(12, 0, -2, 16)), stroke(C.outline, 4));
    canvas.drawPath(cached('allyBow', (b) => b.moveTo(-2, -16).quadTo(12, 0, -2, 16)), stroke('#A8703A', 2.5));
    canvas.drawLine(-2 - a.anim * 5, -16, -2 - a.anim * 5, 16, stroke('#F1E3C6', 1));
    canvas.restore();
  } else {
    canvas.drawRect(Skia.XYWHRect(-11, -76, 22, 18), ol);
    canvas.drawRect(Skia.XYWHRect(-9.5, -74.5, 19, 15), fill('#2B2238'));
    canvas.drawRect(Skia.XYWHRect(-15, -60, 30, 4), ol);
    canvas.drawRect(Skia.XYWHRect(-9.5, -64, 19, 3), fill('#C2352B'));
    canvas.drawCircle(14, -16, 9, ol);
    canvas.drawCircle(14, -16, 7.5, fill('#C8A060'));
    canvas.drawCircle(14, -16, 3, fill('#FFD25A'));
  }
  canvas.restore();
}

/** Survivant depuis le cache d'images : 8 poses de marche ou de repos, dans les deux sens. */
function drawSurvivor(canvas: SkCanvas, s: Survivor, time: number) {
  const walking = s.walkTime > 0 && s.seat === 0;
  const pose = walking ? poseOf(s.walkTime * 16) : poseOf(time * 3);
  // Sur le trône : un petit saut, puis il est assis (plus haut, jambes repliées, face à nous).
  const seated = s.seat >= 0.55;
  const hop = s.seat > 0 && s.seat < 1 ? Math.sin(s.seat * Math.PI) * 26 : 0;
  const lift = s.seat > 0 ? Math.min(1, s.seat / 0.55) * SEAT_LIFT : 0;
  const dir = seated ? 1 : s.dirX > 0 ? 1 : -1;
  const key = `s|${s.id % HAIRS.length}|${s.character}|${s.shirt}|${dir}|${walking ? 1 : 0}|${seated ? 1 : 0}|${pose}`;
  drawSprite(canvas, key, s.x, s.y - lift - hop, [-40, -86, 80, 128], (c) =>
    drawSurvivorShape(
      c,
      { ...s, x: 0, y: 0, dirX: dir, walkTime: walking ? ((pose + 0.5) / 8) * ((Math.PI * 2) / 16) : 0 },
      walking ? 0 : ((pose + 0.5) / 8) * ((Math.PI * 2) / 3),
      seated,
    ),
  );
}

/** Hauteur du siège du trône : le personnage assis est dessiné plus haut, sur le coussin. */
const SEAT_LIFT = 16;

function drawSurvivorShape(canvas: SkCanvas, s: Survivor, time: number, seated = false) {
  const walking = s.walkTime > 0;
  const phase = Math.sin(s.walkTime * 16);
  const bob = walking ? Math.abs(phase) * 4 : Math.sin(time * 3) * 1;
  const hair = HAIRS[s.id % HAIRS.length];
  const ch = s.character;
  const ol = fill(C.outline);
  canvas.save();
  canvas.translate(s.x, s.y);
  canvas.scale(s.dirX, 1);
  // Jambes
  const lf = walking ? phase * 4 : 0;
  const pants = ch === 'mecano' ? '#2E5E9A' : ch === 'gardien' ? '#3A3F4C' : '#6E4A8A';
  if (seated) {
    // Assis : les jambes pendent devant le siège, les chaussures dépassent dessous.
    for (const lx of [-7, 7]) {
      canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(lx - 5.5, -6, 11, 28), 5, 5), ol);
      canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(lx - 3.5, -4, 7, 22), 3.5, 3.5), fill(pants));
      canvas.drawOval(Skia.XYWHRect(lx - 6, 17, 12, 8), fill('#2B2238'));
    }
  } else {
    for (const [lx, o] of [[-6, lf], [6, -lf]] as const) {
      canvas.drawCircle(lx, -3 + o, 6.5, ol);
      canvas.drawCircle(lx, -3 + o, 4.5, fill(pants));
    }
  }
  canvas.translate(0, -bob);
  // Corps
  canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(-15, -34, 30, 30), 11, 11), ol);
  canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(-13, -32, 26, 26), 9, 9), fill(s.shirt));
  if (ch === 'mecano') {
    // Salopette et bretelles
    canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(-9, -24, 18, 18), 4, 4), fill('#2E5E9A'));
    canvas.drawRect(Skia.XYWHRect(-9, -32, 4, 10), fill('#2E5E9A'));
    canvas.drawRect(Skia.XYWHRect(5, -32, 4, 10), fill('#2E5E9A'));
    canvas.drawCircle(0, -16, 2.2, fill('#FFD25A'));
  } else if (ch === 'gardien') {
    // Plastron d'acier
    canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(-11, -30, 22, 18), 6, 6), fill('#AEB6C2'));
    canvas.drawRect(Skia.XYWHRect(-1, -30, 2, 18), fill('#7E8794'));
  } else {
    // Trèfle porte-bonheur sur le cœur
    for (const [cx, cy] of [[-3, -22], [3, -22], [0, -25], [0, -19]] as const) canvas.drawCircle(cx, cy, 3, fill('#2E8A3A'));
  }
  // Tête
  canvas.drawCircle(0, -46, 16.5, ol);
  canvas.drawCircle(0, -46, 14.5, fill(C.skin));
  if (ch === 'mecano') {
    // Casque de chantier jaune
    canvas.drawOval(Skia.XYWHRect(-17, -67, 34, 22), ol);
    canvas.drawOval(Skia.XYWHRect(-15, -65, 30, 18), fill('#FFC300'));
    canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(-20, -55, 40, 7), 3, 3), ol);
    canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(-18, -54, 36, 4), 2, 2), fill('#FFC300'));
    canvas.drawRect(Skia.XYWHRect(-2, -66, 4, 11), fill('#E0A800'));
  } else if (ch === 'gardien') {
    // Heaume avec un plumet rouge
    canvas.drawOval(Skia.XYWHRect(-10, -78, 14, 20), ol);
    canvas.drawOval(Skia.XYWHRect(-8, -76, 10, 16), fill('#E0533D'));
    canvas.drawOval(Skia.XYWHRect(-17, -66, 34, 24), ol);
    canvas.drawOval(Skia.XYWHRect(-15, -64, 30, 20), fill('#AEB6C2'));
    canvas.drawRect(Skia.XYWHRect(-15, -52, 30, 4), fill('#7E8794'));
  } else {
    // Cheveux, queue de cheval et pince trèfle
    canvas.drawOval(Skia.XYWHRect(-16, -64, 30, 17), fill(hair));
    canvas.drawOval(Skia.XYWHRect(-16, -54, 9, 13), fill(hair));
    canvas.drawCircle(-19, -48, 7.5, ol);
    canvas.drawCircle(-19, -48, 6, fill(hair));
    for (const [cx, cy] of [[7, -62], [12, -62], [9.5, -66], [9.5, -58]] as const) canvas.drawCircle(cx, cy, 2.8, fill('#4FB86A'));
  }
  // Yeux
  canvas.drawCircle(4, -43, 4.6, fill(C.white));
  canvas.drawCircle(12, -43, 4.6, fill(C.white));
  canvas.drawCircle(5.6, -42.5, 2.4, ol);
  canvas.drawCircle(13.6, -42.5, 2.4, ol);
  canvas.drawCircle(1, -37, 3, fill('rgba(255,110,110,0.45)'));
  // Objet en main : clé à molette, bouclier, ou lanterne
  const swing = walking ? phase * 10 : Math.sin(time * 2) * 4;
  canvas.save();
  canvas.translate(13, -21);
  canvas.rotate(swing, 0, 0);
  if (ch === 'mecano') {
    canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(-3, -2, 6, 22), 3, 3), ol);
    canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(-1.5, -1, 3, 20), 1.5, 1.5), fill('#AEB6C2'));
    canvas.drawCircle(0, 22, 7, ol);
    canvas.drawCircle(0, 22, 5, fill('#AEB6C2'));
    canvas.drawRect(Skia.XYWHRect(-2, 21, 4, 8), fill(s.shirt));
  } else if (ch === 'gardien') {
    canvas.drawCircle(2, 8, 12, ol);
    canvas.drawCircle(2, 8, 10, fill('#4E7BD6'));
    canvas.drawCircle(2, 8, 5, fill('#AEB6C2'));
  } else {
    canvas.drawCircle(0, 16, 15, fill('rgba(255,190,80,0.22)'));
    canvas.drawRect(Skia.XYWHRect(-1, 0, 2, 7), ol);
    canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(-6.5, 6, 13, 15), 4, 4), ol);
    canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(-4.5, 8, 9, 11), 3, 3), fill('#FFD25A'));
    canvas.drawCircle(0, 13.5, 2.6, fill('#FFF4C2'));
  }
  canvas.drawCircle(0, 0, 5.5, ol);
  canvas.drawCircle(0, 0, 4, fill(C.skin));
  canvas.restore();
  canvas.restore();
}

/** La couronne descend du ciel et se pose sur la tête du vainqueur, dans une pluie d'étincelles. */
function drawCrown(canvas: SkCanvas, state: RefugeState) {
  const f = state.finale!;
  const w = f.winner >= 0 ? state.survivors[f.winner] : state.demon;
  const headY = w.y - (f.winner >= 0 ? 72 + (state.survivors[f.winner].seat > 0 ? SEAT_LIFT : 0) : 150);
  const land = Math.min(1, f.t / 1.1);
  const ease = 1 - Math.pow(1 - land, 3);
  const y = headY - (1 - ease) * 260;
  const bounce = land >= 1 ? Math.sin(Math.min(1, (f.t - 1.1) / 0.4) * Math.PI) * 6 : 0;
  // Rayons de lumière derrière
  if (land >= 1) {
    canvas.save();
    canvas.translate(w.x, headY);
    canvas.rotate(f.t * 30, 0, 0);
    for (let i = 0; i < 10; i++) {
      canvas.rotate(36, 0, 0);
      canvas.drawPath(cached('ray', (b) => b.moveTo(-8, 0).lineTo(0, -120).lineTo(8, 0).close()), fill('rgba(255,225,120,0.28)'));
    }
    canvas.restore();
  }
  canvas.save();
  canvas.translate(w.x, y - bounce);
  const sc = f.winner >= 0 ? 1 : 1.6;
  canvas.scale(sc, sc);
  canvas.drawPath(cached('crownBig', (b) => b.moveTo(-20, 8).lineTo(-23, -14).lineTo(-11, -4).lineTo(0, -20).lineTo(11, -4).lineTo(23, -14).lineTo(20, 8).close()), stroke(C.outline, 5));
  canvas.drawPath(cached('crownBig', (b) => b), fill('#FFD25A'));
  canvas.drawRect(Skia.XYWHRect(-20, 2, 40, 6), fill('#E8B830'));
  canvas.drawCircle(0, -4, 4, fill('#E0533D'));
  canvas.drawCircle(-12, 0, 3, fill('#5BE0FF'));
  canvas.drawCircle(12, 0, 3, fill('#7BD35A'));
  canvas.restore();
  // Étincelles quand elle se pose
  if (land >= 1 && f.t < 2.6) {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + f.t;
      const r = 30 + (f.t - 1.1) * 80;
      canvas.drawCircle(w.x + Math.cos(a) * r, headY + Math.sin(a) * r * 0.6, 3.5, fill(i % 2 ? '#FFFFFF' : '#FFD25A'));
    }
  }
}

/** Petit cadre en bas de l'écran : le Démon surgit et dévore le survivant trouvé (2 à 3 secondes). */
function drawDevour(canvas: SkCanvas, state: RefugeState, survivorId: number, t: number, view: RefugeView, font: SkFont | null) {
  const s = state.survivors[survivorId];
  const size = Math.min(150, view.width * 0.36);
  const x = 12;
  const y = view.height - size - 250;
  const appear = Math.max(0, Math.min(1, t / 0.2, (DEVOUR_TIME - t) / 0.3));
  if (appear <= 0) return;
  canvas.save();
  canvas.translate(x + size / 2, y + size / 2);
  canvas.scale(appear, appear);
  canvas.translate(-size / 2, -size / 2);
  canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(-4, -4, size + 8, size + 8), 16, 16), fill(C.outline));
  canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(0, 0, size, size), 13, 13), fill('#3A1420'));
  canvas.save();
  canvas.clipRRect(Skia.RRectXY(Skia.XYWHRect(0, 0, size, size), 13, 13), ClipOp.Intersect, true);
  canvas.drawRect(Skia.XYWHRect(0, size * 0.72, size, size * 0.28), fill('#5A2A30'));
  const k = size / 150;
  const eaten = t > 1.55;
  // Le survivant tremble de peur
  if (!eaten) {
    canvas.save();
    canvas.translate(size * 0.3 + Math.sin(t * 60) * 2 * k, size * 0.86);
    canvas.scale(k * 1.15, k * 1.15);
    drawSurvivor(canvas, { ...s, x: 0, y: 0, alive: true, walkTime: 0, shootAnim: 0, dirX: 1, seat: 0 }, state.time);
    canvas.restore();
    if (t < 1) drawBang(canvas, size * 0.3, size * 0.2, k);
  }
  // Le Démon arrive par la droite, gueule ouverte, puis croque
  const enter = Math.min(1, Math.max(0, (t - 0.4) / 0.6));
  const lunge = t > 1.2 && t < 1.7 ? Math.sin(((t - 1.2) / 0.5) * Math.PI) : 0;
  const dx = size * (1.35 - 0.55 * enter) - lunge * size * 0.18;
  const fake: Demon = { ...state.demon, x: 0, y: 0, dirX: -1, lunge, walkTime: enter < 1 ? t * 2 : 0, rise: 1, cloneTime: 0, hitFlash: 0, state: 'attack' };
  canvas.save();
  canvas.translate(dx, size * 0.92);
  canvas.scale(k * 0.9, k * 0.9);
  drawDemon(canvas, fake, state.time);
  canvas.restore();
  // Croc ! éclair blanc et gouttes
  if (t > 1.45 && t < 1.75) canvas.drawRect(Skia.XYWHRect(0, 0, size, size), fill(rgba('255,255,255', 1 - (t - 1.45) / 0.3)));
  if (eaten) {
    for (let i = 0; i < 6; i++) {
      const a = i * 1.1 + 0.4;
      canvas.drawCircle(size * 0.32 + Math.cos(a) * (t - 1.55) * 60 * k, size * 0.7 + Math.sin(a) * (t - 1.55) * 40 * k, 4 * k, fill('#C2352B'));
    }
  }
  canvas.restore();
  if (font) drawOutlinedText(canvas, s.isPlayer ? `× ${s.name}` : `× ${s.name}`, size / 2, size + 22, font, '#FF8A7A');
  canvas.restore();
}

/** Point d'exclamation de peur. */
function drawBang(canvas: SkCanvas, x: number, y: number, k: number) {
  canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(x - 4 * k, y - 16 * k, 8 * k, 20 * k), 4 * k, 4 * k), fill('#FFD25A'));
  canvas.drawCircle(x, y + 10 * k, 4 * k, fill('#FFD25A'));
}

/** Point de l'arène sous le doigt, d'après la dernière image dessinée. */
export function screenToArena(view: Pick<RefugeView, 'width' | 'height' | 'cam'>, sx: number, sy: number) {
  const { cam } = view;
  const scale = cam.scale ?? cam.zoom;
  return { x: (cam.screenX ?? cam.x) + (sx - view.width / 2) / scale, y: (cam.screenY ?? cam.y) + (sy - view.height / 2) / scale };
}

export interface RefugeView {
  width: number;
  height: number;
  /** Hauteur occupée par l'interface en haut : la caméra centre le jeu en dessous. */
  top: number;
  /** Caméra lissée (position et zoom), conservée d'une image à l'autre. */
  cam: { x: number; y: number; zoom: number; ready: boolean; screenX?: number; screenY?: number; scale?: number };
  /** Vue d'ensemble (bouton œil) : toute l'arène d'un coup d'œil. */
  overview: boolean;
}

/** Ce que la caméra regarde : toi, puis l'autel pendant l'arrivée, puis ton refuge en entier. */
function cameraFocus(state: RefugeState) {
  if (state.finale) {
    // Fin : la caméra va sur le vainqueur pour la couronne.
    const w = state.finale.winner >= 0 ? state.survivors[state.finale.winner] : state.demon;
    return { x: w.x, y: w.y - 40 };
  }
  if (state.phase === 'arrival') return { x: CENTER.x, y: CENTER.y - 40 };
  if (state.role === 'demon') {
    // Rôle Démon : on regarde les survivants courir depuis l'autel, puis on suit le Démon.
    if (state.phase === 'intro' || state.phase === 'choose' || state.demon.hp <= 0) return { x: CENTER.x, y: CENTER.y };
    return { x: state.demon.x, y: state.demon.y - 30 };
  }
  const player = state.survivors[0];
  if (!player.alive) return { x: state.demon.x, y: state.demon.y - 30 };
  if (state.phase === 'siege' && player.roomId !== null) {
    const r = state.rooms[player.roomId].inner;
    // Le refuge, plus un peu de place devant la porte pour voir arriver les ennemis.
    const front = state.rooms[player.roomId].doorSide === 'bottom' ? 50 : -50;
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 + front };
  }
  return { x: player.x, y: player.y - 20 };
}

export function drawRefuge(canvas: SkCanvas, state: RefugeState, view: RefugeView, fonts: { big: SkFont | null; small: SkFont | null }, joystick: JoystickState, dt: number) {
  const player = playerSurvivor(state);
  const mine = (room: Room) => player !== null && room.owner === player.id;
  const overview = view.overview && state.phase !== 'arrival';
  // Vue d'ensemble : toute l'arène tient dans l'espace sous l'interface.
  const overviewScale = Math.min(view.width / (ARENA_W + 60), (view.height - view.top - 40) / (ARENA_H + 60));
  const focus = overview ? { x: ARENA_W / 2, y: ARENA_H / 2 } : cameraFocus(state);
  const cam = view.cam;
  const targetZoom = overview ? overviewScale : scaleFor(view.width);
  if (!cam.ready) {
    cam.x = focus.x;
    cam.y = focus.y;
    cam.zoom = targetZoom;
    cam.ready = true;
  }
  const k = 1 - Math.exp(-(state.phase === 'arrival' ? 3 : 7) * dt);
  cam.x += (focus.x - cam.x) * k;
  cam.y += (focus.y - cam.y) * k;
  cam.zoom += (targetZoom - cam.zoom) * (1 - Math.exp(-8 * dt));
  const scale = cam.zoom;
  const halfW = view.width / scale / 2;
  const halfH = view.height / scale / 2;
  const shake = overview ? 0 : state.trauma * state.trauma * 10;
  // Le centre de l'écran utile est sous l'interface du haut.
  const offsetY = view.top / scale / 2;
  const zoomedOut = scale < scaleFor(view.width) * 0.8;
  const camX = (zoomedOut ? cam.x : Math.min(state.width - halfW + 60, Math.max(halfW - 60, cam.x))) + (Math.random() * 2 - 1) * shake;
  const camY = (zoomedOut ? cam.y - offsetY : Math.min(state.height - halfH + 60 + offsetY, Math.max(halfH - 60 - offsetY, cam.y - offsetY))) + (Math.random() * 2 - 1) * shake;
  // Dernière transformation, pour savoir ce que le joueur touche (voir screenToArena).
  cam.screenX = camX;
  cam.screenY = camY;
  cam.scale = scale;
  /** Position à l'écran d'un point de l'arène. */
  const toScreen = (x: number, y: number) => ({ x: view.width / 2 + (x - camX) * scale, y: view.height / 2 + (y - camY) * scale });
  const margin = 160;
  const visible = (x: number, y: number) => Math.abs(x - camX) < halfW + margin && Math.abs(y - camY) < halfH + margin;

  canvas.drawColor(Skia.Color(COLORS.void));
  canvas.save();
  canvas.translate(view.width / 2, view.height / 2);
  canvas.scale(scale, scale);
  canvas.translate(-camX, -camY);

  // Sol de l'arène, dalles discrètes
  canvas.drawRect(Skia.XYWHRect(0, 0, state.width, state.height), fill(COLORS.floor));
  const x0 = Math.max(0, Math.floor((camX - halfW) / 80) * 80);
  const y0 = Math.max(0, Math.floor((camY - halfH) / 80) * 80);
  for (let x = x0; x < Math.min(state.width, camX + halfW); x += 80) canvas.drawRect(Skia.XYWHRect(x, y0, 2, halfH * 2 + 160), fill(COLORS.floorLine));
  for (let y = y0; y < Math.min(state.height, camY + halfH); y += 80) canvas.drawRect(Skia.XYWHRect(x0, y, halfW * 2 + 160, 2), fill(COLORS.floorLine));
  drawAltar(canvas, state);

  for (const room of state.rooms) {
    const c = { x: room.inner.x + room.inner.w / 2, y: room.inner.y + room.inner.h / 2 };
    if (!visible(c.x, c.y)) continue;
    drawRoomFloor(canvas, room, mine(room));
    if (room.boosts.turbo > 0) canvas.drawCircle(room.gen.x, room.gen.y - 14, 40 + Math.sin(state.time * 10) * 4, fill('rgba(255,210,90,0.3)'));
    if (room.boosts.power > 0) for (const t of room.turrets) if (t.level > 0) canvas.drawCircle(t.x, t.y, 30, fill(rgba('255,90,60', 0.25 + Math.sin(state.time * 8) * 0.1)));
    if (mine(room) && player && player.alive && state.phase === 'siege') drawGrid(canvas, room, player.buildCell, state.time);
    drawWalls(canvas, room);
    drawDoor(canvas, room);
    drawThroneBack(canvas, room);
  }

  // Emplacements d'achat : seulement dans ton refuge (pour rester lisible)
  const myRoom = player && player.roomId !== null ? state.rooms[player.roomId] : null;
  if (player && myRoom && player.alive && (state.phase === 'siege' || state.phase === 'arrival')) {
    for (const pad of myRoom.pads) drawPad(canvas, myRoom, pad, player.gold, fonts.small, state.time);
    for (const t of myRoom.turrets) drawTurretUpgrade(canvas, myRoom, t, player.gold, fonts.small);
  }

  // Personnages et tourelles, triés en profondeur
  const drawables: { y: number; draw: () => void }[] = [];
  for (const room of state.rooms) {
    // L'avant du trône passe devant celui qui est assis (juste après lui dans l'ordre de dessin).
    if (visible(room.gen.x, room.gen.y)) drawables.push({ y: room.gen.y + 0.5, draw: () => drawThroneFront(canvas, room) });
    for (const t of room.turrets) if (t.level > 0 && visible(t.x, t.y)) drawables.push({ y: t.y, draw: () => drawTurret(canvas, t, state.time) });
    for (const a of room.allies) if (visible(a.x, a.y)) drawables.push({ y: a.y, draw: () => drawAlly(canvas, a, state.time) });
    for (const art of room.artifacts) {
      const spot = room.cells[art.cell];
      if (visible(spot.x, spot.y)) drawables.push({ y: spot.y, draw: () => drawArtifact(canvas, room, art, state.time) });
    }
  }
  for (const s of state.survivors) {
    if (!s.alive || !visible(s.x, s.y)) continue;
    drawShadow(canvas, s.x, s.y, 16, 6);
    drawables.push({
      y: s.y,
      draw: () => {
        drawSurvivor(canvas, s, state.time);
        // Éclair du tir quand il tire lui-même sur les ennemis
        if (s.shootAnim > 0.5) canvas.drawCircle(s.x + (s.seat > 0 ? 22 : s.dirX * 22), s.y - 34 - (s.seat > 0 ? SEAT_LIFT : 0), 8 * s.shootAnim, fill('rgba(255,230,140,0.8)'));
      },
    });
  }
  for (const z of state.zombies) {
    if (!visible(z.x, z.y)) continue;
    drawShadow(canvas, z.x, z.y, z.boss ? 30 : 14, 5);
    drawables.push({ y: z.y, draw: () => drawZombie(canvas, z) });
  }
  const d = state.demon;
  if (d.hp > 0 && d.rise > 0 && visible(d.x, d.y)) {
    drawShadow(canvas, d.x, d.y, DEMON_RADIUS * 1.4, 10);
    // En rôle Démon, un anneau doré marque ton personnage.
    if (state.role === 'demon') canvas.drawOval(Skia.XYWHRect(d.x - 46, d.y - 16, 92, 32), stroke('#FFD25A', 3));
    drawables.push({ y: d.y, draw: () => drawDemon(canvas, d, state.time) });
  }
  for (const c of state.clones) {
    if (!visible(c.x, c.y)) continue;
    drawShadow(canvas, c.x, c.y, DEMON_RADIUS * 1.2, 8);
    drawables.push({ y: c.y, draw: () => drawDemon(canvas, c, state.time) });
  }
  drawables.sort((a, b) => a.y - b.y);
  for (const dr of drawables) dr.draw();
  // Ce que tu peux améliorer tout de suite : une flèche verte dessus (il suffit de toucher).
  if (player && myRoom && player.alive && state.phase === 'siege') {
    for (const pad of myRoom.pads) {
      const offer = padOffer(myRoom, pad);
      if (offer && player.gold >= offer.cost) drawUpBadge(canvas, pad.x + PAD_RADIUS * 0.75, pad.y - PAD_RADIUS * 0.85, state.time);
    }
    for (const t of myRoom.turrets) {
      const offer = turretOffer(myRoom, t);
      if (t.level > 0 && offer && player.gold >= offer.cost) drawUpBadge(canvas, t.x + 18, t.y - 40, state.time);
    }
  }
  if (state.finale) drawCrown(canvas, state);

  // Lasers
  for (const room of state.rooms) {
    for (const t of room.turrets) {
      if (!t.beamTo) continue;
      canvas.drawLine(t.x, t.y - 4, t.beamTo.x, t.beamTo.y, stroke('rgba(91,224,255,0.35)', 10));
      canvas.drawLine(t.x, t.y - 4, t.beamTo.x, t.beamTo.y, stroke('#E0FAFF', 3));
    }
  }
  for (const p of state.projectiles) drawProjectile(canvas, p);
  for (const room of state.rooms) if (visible(room.door.x, room.door.y)) drawDoorEffects(canvas, room, state.time);
  // Pouvoirs des survivants : glace devant la porte (Gel), anneau qui s'élargit (Onde de choc)
  for (const room of state.rooms) {
    if (room.freeze <= 0 || !visible(room.door.x, room.door.y)) continue;
    const g = doorOutside(room, 70);
    const k = Math.min(1, room.freeze / 0.5);
    canvas.drawOval(Skia.XYWHRect(g.x - 150, g.y - 70, 300, 140), fill(rgba('160,225,255', 0.28 * k)));
    canvas.drawOval(Skia.XYWHRect(g.x - 150, g.y - 70, 300, 140), stroke(rgba('230,250,255', 0.8 * k), 4));
  }
  for (const b of state.blasts) {
    const k = b.t / 0.6;
    const r = 40 + k * 260;
    canvas.drawCircle(b.x, b.y, r, stroke(rgba('255,200,90', 1 - k), 14 * (1 - k) + 2));
    canvas.drawCircle(b.x, b.y, r * 0.7, fill(rgba('255,160,60', 0.25 * (1 - k))));
  }
  // Éclairs (orage, bobine Tesla)
  for (const z of state.zaps) {
    const path = Skia.Path.Make();
    z.points.forEach((pt, i) => (i === 0 ? path.moveTo(pt.x, pt.y) : path.lineTo(pt.x, pt.y)));
    canvas.drawPath(path, roundStroke('rgba(91,224,255,0.45)', 9));
    canvas.drawPath(path, roundStroke('#FFFFFF', 3));
    path.dispose?.();
  }
  // Onde du rugissement
  if (state.roarTime > 0 && d.hp > 0) {
    const r = ROAR.radius * (1 - state.roarTime);
    canvas.drawCircle(d.x, d.y - 30, r, stroke(rgba('196,154,240', state.roarTime), 8));
  }
  drawParticles(canvas, state.particles, visible);

  // Barres de vie : portes, zombies, Démon ; prénoms au-dessus des refuges
  for (const room of state.rooms) {
    if (room.owner === null) continue;
    const owner = state.survivors[room.owner];
    // Barre dessinée côté intérieur, pour ne pas être cachée par les assaillants ; la tienne est en haut de l'écran.
    const by = room.doorSide === 'bottom' ? room.door.y - WALL - 12 : room.door.y + WALL + 4;
    if (!room.door.broken && owner.alive && !mine(room)) drawHpBar(canvas, room.door.x, by, 64, room.door.hp / room.door.maxHp, C.hpBuilding);
    if (fonts.small) {
      // Le prénom passe au-dessus du grand dossier du trône quand il est contre ce mur.
      const ny = room.doorSide === 'bottom' ? Math.min(room.inner.y - WALL - 8, room.gen.y - 116) : room.inner.y + room.inner.h + WALL + 22;
      drawOutlinedText(canvas, owner.alive ? owner.name : `× ${owner.name}`, room.door.x, ny, fonts.small, owner.alive ? C.white : '#8E8A9E');
    }
  }
  for (const c of state.clones) if (visible(c.x, c.y)) drawHpBar(canvas, c.x, c.y - 140, 50, c.hp / c.maxHp, '#C49AF0');
  for (const z of state.zombies) if (z.hp < z.maxHp && visible(z.x, z.y)) drawHpBar(canvas, z.x, z.y - (z.boss ? 90 : 64), z.boss ? 60 : 28, z.hp / z.maxHp, C.hpEnemy);
  if (fonts.big) drawFloatingTexts(canvas, state.texts, fonts.big);
  canvas.restore();

  if (zoomedOut && fonts.small) {
    // Vue d'ensemble : prénoms et portes lisibles, Démon entouré.
    for (const room of state.rooms) {
      if (room.owner === null) continue;
      const owner = state.survivors[room.owner];
      const c = toScreen(room.inner.x + room.inner.w / 2, room.inner.y + room.inner.h / 2);
      drawOutlinedText(canvas, owner.alive ? owner.name : `× ${owner.name}`, c.x, c.y + 6, fonts.small, mine(room) ? '#FFD25A' : owner.alive ? C.white : '#8E8A9E');
      if (owner.alive && !room.door.broken) drawHpBar(canvas, c.x, c.y + 14, 50, room.door.hp / room.door.maxHp, room.shield > 0 ? '#9EDBFF' : '#7BD35A');
    }
    for (const dm of [state.demon, ...state.clones]) {
      if (dm.hp <= 0 || dm.rise <= 0) continue;
      const p = toScreen(dm.x, dm.y - 30);
      canvas.drawCircle(p.x, p.y, 16 + Math.sin(state.time * 8) * 3, stroke(dm.cloneTime > 0 ? '#C49AF0' : '#FF5A5A', 4));
    }
  } else if (state.phase === 'siege' && state.role === 'survivor' && state.demon.hp > 0) {
    // Flèche au bord de l'écran vers le Démon quand il est hors de vue.
    const p = toScreen(state.demon.x, state.demon.y - 40);
    const top = view.top + 20;
    const inside = p.x > 0 && p.x < view.width && p.y > top && p.y < view.height;
    if (!inside) {
      const cx = view.width / 2;
      const cy = (top + view.height) / 2;
      const a = Math.atan2(p.y - cy, p.x - cx);
      const ex = Math.max(28, Math.min(view.width - 28, cx + Math.cos(a) * view.width));
      const ey = Math.max(top + 10, Math.min(view.height - 120, cy + Math.sin(a) * view.height));
      canvas.save();
      canvas.translate(ex, ey);
      canvas.drawCircle(0, 0, 20, fill('rgba(126,24,48,0.9)'));
      canvas.drawCircle(0, 0, 20, stroke('#FF5A5A', 3));
      canvas.drawCircle(-5, -2, 3, fill('#FFE14D'));
      canvas.drawCircle(5, -2, 3, fill('#FFE14D'));
      canvas.rotate((a * 180) / Math.PI, 0, 0);
      canvas.drawPath(cached('demonArrow', (b) => b.moveTo(22, -8).lineTo(34, 0).lineTo(22, 8).close()), fill('#FF5A5A'));
      canvas.restore();
    }
  }

  const dv = state.devours[0];
  if (dv) drawDevour(canvas, state, dv.survivorId, dv.t, view, fonts.small);
  if (state.finale) {
    // Voile doré pendant le couronnement
    const k = Math.min(1, state.finale.t / 0.6);
    canvas.drawRect(Skia.XYWHRect(0, 0, view.width, view.height), fill(rgba('255,210,90', 0.12 * k)));
  }

  // Bandes noires de cinéma pendant l'arrivée du Démon
  if (state.phase === 'arrival') {
    const p = 1 - state.phaseTimer / ARRIVAL_TIME;
    const band = Math.min(1, p * 4, (1 - p) * 6) * view.height * 0.11;
    canvas.drawRect(Skia.XYWHRect(0, 0, view.width, band), fill('#000000'));
    canvas.drawRect(Skia.XYWHRect(0, view.height - band, view.width, band), fill('#000000'));
  }

  if (joystick.active) {
    canvas.drawCircle(joystick.originX, joystick.originY, joystick.radius, fill(C.joystickBase));
    canvas.drawCircle(joystick.originX, joystick.originY, joystick.radius, stroke(C.joystickRing, 3));
    canvas.drawCircle(joystick.originX + joystick.knobX, joystick.originY + joystick.knobY, 26, fill(C.joystickKnob));
  }
}
