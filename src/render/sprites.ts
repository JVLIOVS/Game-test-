import { Skia, type SkCanvas, type SkPaint, type SkPath } from '@shopify/react-native-skia';
import { SWING_DURATION, TREE_FALL_TIME, TREE_GROW_TIME } from '../game/constants';
import type { Hero, Tree } from '../game/types';
import { PALETTE as C, fill, stroke } from './palette';

// Sprites dessinés par code. Chaque fonction dessine à l'origine (pieds/base en 0,0),
// ce qui permettra plus tard de les remplacer par de vraies images.

const OUTLINE = 3;
const rect = (x: number, y: number, w: number, h: number) => Skia.XYWHRect(x, y, w, h);
const rrect = (x: number, y: number, w: number, h: number, r: number) =>
  Skia.RRectXY(Skia.XYWHRect(x, y, w, h), r, r);

const easeOutBack = (t: number) => {
  const c = 1.9;
  const u = t - 1;
  return 1 + (c + 1) * u * u * u + c * u * u;
};
const easeInQuad = (t: number) => t * t;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

let pinePath: SkPath | null = null;
function getPinePath(): SkPath {
  if (pinePath) return pinePath;
  const p = Skia.PathBuilder.Make();
  const tiers = [
    { y: -28, w: 40, h: 34 },
    { y: -50, w: 32, h: 30 },
    { y: -70, w: 22, h: 26 },
  ];
  for (const t of tiers) {
    p.moveTo(-t.w, t.y);
    p.lineTo(0, t.y - t.h - 10);
    p.lineTo(t.w, t.y);
    p.close();
  }
  pinePath = p.build();
  return pinePath;
}

export function drawShadow(canvas: SkCanvas, x: number, y: number, rx: number, ry: number) {
  canvas.drawOval(rect(x - rx, y - ry, rx * 2, ry * 2), fill(C.shadow));
}

function outlinedCircle(canvas: SkCanvas, x: number, y: number, r: number, color: string) {
  canvas.drawCircle(x, y, r + OUTLINE, fill(C.outline));
  canvas.drawCircle(x, y, r, fill(color));
}

function drawStump(canvas: SkCanvas, tree: Tree) {
  const s = tree.size;
  canvas.drawRRect(rrect(-11 * s - OUTLINE, -12 * s - OUTLINE, 22 * s + OUTLINE * 2, 14 * s + OUTLINE * 2, 6), fill(C.outline));
  canvas.drawRRect(rrect(-11 * s, -12 * s, 22 * s, 14 * s, 5), fill(C.trunk));
  canvas.drawOval(rect(-11 * s, -16 * s, 22 * s, 9 * s), fill(C.stumpTop));
  canvas.drawOval(rect(-5 * s, -13.5 * s, 10 * s, 4 * s), stroke(C.trunkLight, 1.5));
}

function drawCanopy(canvas: SkCanvas, variant: number) {
  const pal = C.canopies[variant % C.canopies.length];
  if (variant === 1) {
    const path = getPinePath();
    canvas.drawPath(path, stroke(C.outline, OUTLINE * 2));
    canvas.drawPath(path, fill(pal[0]));
    canvas.save();
    canvas.translate(-5, -4);
    canvas.scale(0.55, 0.9);
    canvas.drawPath(path, fill(pal[1]));
    canvas.restore();
    return;
  }
  // Silhouette contour, puis remplissage, puis reflets.
  canvas.drawCircle(0, -62, 34 + OUTLINE, fill(C.outline));
  canvas.drawCircle(-22, -46, 24 + OUTLINE, fill(C.outline));
  canvas.drawCircle(22, -46, 24 + OUTLINE, fill(C.outline));
  canvas.drawCircle(0, -62, 34, fill(pal[0]));
  canvas.drawCircle(-22, -46, 24, fill(pal[0]));
  canvas.drawCircle(22, -46, 24, fill(pal[0]));
  canvas.drawCircle(-6, -68, 22, fill(pal[1]));
  canvas.drawCircle(-14, -76, 9, fill(pal[2]));
  if (variant === 2) {
    for (const [bx, by] of [[14, -60], [-18, -44], [6, -40]]) {
      canvas.drawCircle(bx, by, 5, fill(C.outline));
      canvas.drawCircle(bx, by, 3.6, fill('#FF4D5E'));
    }
  }
}

let fadePaint: SkPaint | null = null;

/** Le feuillage devient transparent quand le héros passe derrière. */
export function drawTree(canvas: SkCanvas, tree: Tree, time: number, heroBehind = false) {
  if (heroBehind && tree.state === 'standing') {
    if (!fadePaint) {
      fadePaint = Skia.Paint();
      fadePaint.setAlphaf(0.45);
    }
    canvas.saveLayer(fadePaint);
    drawTree(canvas, tree, time, false);
    canvas.restore();
    return;
  }
  canvas.save();
  canvas.translate(tree.x, tree.y);

  if (tree.state === 'stump' || tree.state === 'falling') drawStump(canvas, tree);
  if (tree.state === 'stump') {
    canvas.restore();
    return;
  }

  let scale = tree.size;
  let angle = Math.sin(time * 48) * tree.shake * 5;
  if (tree.state === 'growing') {
    scale *= Math.max(0, easeOutBack(Math.min(1, tree.timer / TREE_GROW_TIME)));
  } else if (tree.state === 'falling') {
    const t = Math.min(1, tree.timer / TREE_FALL_TIME);
    angle = tree.fallDir * 88 * easeInQuad(t);
    if (t > 0.75) scale *= 1 - (t - 0.75) / 0.25;
    canvas.translate(0, -10 * tree.size);
  }

  canvas.rotate(angle, 0, 0);
  canvas.scale(scale, scale);
  canvas.drawRRect(rrect(-9 - OUTLINE, -42 - OUTLINE, 18 + OUTLINE * 2, 44 + OUTLINE * 2, 6), fill(C.outline));
  canvas.drawRRect(rrect(-9, -42, 18, 44, 5), fill(C.trunk));
  canvas.drawRRect(rrect(-6, -38, 5, 36, 3), fill(C.trunkLight));
  drawCanopy(canvas, tree.variant);
  canvas.restore();
}

export function drawHero(canvas: SkCanvas, hero: Hero, time: number) {
  const walking = hero.walkTime > 0;
  const phase = Math.sin(hero.walkTime * 16);
  const bob = walking ? Math.abs(phase) * 4 : Math.sin(time * 3) * 1;

  canvas.save();
  canvas.translate(hero.x, hero.y);
  canvas.scale(hero.dirX, 1);

  // Pieds
  const lf = walking ? phase * 4 : 0;
  outlinedCircle(canvas, -6, -3 + lf, 5, C.pants);
  outlinedCircle(canvas, 6, -3 - lf, 5, C.pants);

  canvas.translate(0, -bob);

  // Bras arrière
  outlinedCircle(canvas, -13, -18, 4.5, C.skin);

  // Corps
  canvas.drawRRect(rrect(-13 - OUTLINE, -32 - OUTLINE, 26 + OUTLINE * 2, 26 + OUTLINE * 2, 12), fill(C.outline));
  canvas.drawRRect(rrect(-13, -32, 26, 26, 10), fill(C.shirt));
  canvas.drawRRect(rrect(-13, -14, 26, 8, 4), fill(C.shirtDark));

  // Tête
  outlinedCircle(canvas, 0, -44, 15, C.skin);
  canvas.drawOval(rect(-15, -61, 28, 16), fill(C.hair));
  canvas.drawOval(rect(-15, -52, 9, 12), fill(C.hair));
  canvas.drawCircle(4, -41, 4.6, fill(C.white));
  canvas.drawCircle(12, -41, 4.6, fill(C.white));
  canvas.drawCircle(5.6, -40.5, 2.4, fill(C.outline));
  canvas.drawCircle(13.6, -40.5, 2.4, fill(C.outline));
  canvas.drawCircle(1, -35, 3, fill('rgba(255,110,110,0.45)'));

  // Hache
  let angle = -25 + Math.sin(time * 3) * 3;
  if (hero.swingTime > 0) {
    const p = Math.min(1, hero.swingTime / SWING_DURATION);
    if (p < 0.4) angle = lerp(-25, -125, p / 0.4);
    else if (p < 0.6) angle = lerp(-125, 75, (p - 0.4) / 0.2);
    else angle = lerp(75, -25, (p - 0.6) / 0.4);
  }
  canvas.save();
  canvas.translate(10, -20);
  canvas.rotate(angle, 0, 0);
  canvas.drawRRect(rrect(-2.5 - 2, -32 - 2, 5 + 4, 34 + 4, 3), fill(C.outline));
  canvas.drawRRect(rrect(-2.5, -32, 5, 34, 2.5), fill(C.axeHandle));
  canvas.drawRRect(rrect(-1 - OUTLINE, -36 - OUTLINE, 15 + OUTLINE * 2, 12 + OUTLINE * 2, 4), fill(C.outline));
  canvas.drawRRect(rrect(-1, -36, 15, 12, 3), fill(C.axeHead));
  canvas.drawRRect(rrect(10, -36, 4, 12, 2), fill(C.white));
  outlinedCircle(canvas, 0, 0, 4.5, C.skin);
  canvas.restore();

  canvas.restore();
}

export function drawLogIcon(canvas: SkCanvas, x: number, y: number, s: number) {
  canvas.save();
  canvas.translate(x, y);
  canvas.scale(s, s);
  canvas.drawRRect(rrect(-10, -5, 20, 10, 5), fill(C.outline));
  canvas.drawRRect(rrect(-9, -4, 18, 8, 4), fill(C.trunk));
  canvas.drawCircle(8, 0, 4, fill(C.outline));
  canvas.drawCircle(8, 0, 3, fill(C.stumpTop));
  canvas.restore();
}
