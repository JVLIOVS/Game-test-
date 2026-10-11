import { Skia, type SkCanvas, type SkPath } from '@shopify/react-native-skia';
import { SWING_DURATION, TREE_FALL_TIME, TREE_GROW_TIME, bossStats } from '../game/constants';
import { EQUIP_TIER_COLORS } from '../game/data/equipment';
import type { Chest, EquipSlot, Hero, Structure, Tree, Unit, WeaponType, Zombie } from '../game/types';
import { PALETTE as C, THEME, fill, layerAlpha, stroke } from './palette';

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

/** Choisit la couleur, ou du blanc pendant un flash de dégâts. */
type Tint = (color: string) => string;
const normal: Tint = (c) => c;
const flashWhite: Tint = () => C.white;
const tintFor = (flash: number): Tint => (flash > 0.5 ? flashWhite : normal);

function box(canvas: SkCanvas, x: number, y: number, w: number, h: number, r: number, color: string) {
  canvas.drawRRect(rrect(x - OUTLINE, y - OUTLINE, w + OUTLINE * 2, h + OUTLINE * 2, r + 2), fill(C.outline));
  canvas.drawRRect(rrect(x, y, w, h, r), fill(color));
}

function outlinedCircle(canvas: SkCanvas, x: number, y: number, r: number, color: string) {
  canvas.drawCircle(x, y, r + OUTLINE, fill(C.outline));
  canvas.drawCircle(x, y, r, fill(color));
}

const pathCache = new Map<string, SkPath>();
function cachedPath(key: string, build: (b: ReturnType<typeof Skia.PathBuilder.Make>) => void): SkPath {
  let p = pathCache.get(key);
  if (!p) {
    const b = Skia.PathBuilder.Make();
    build(b);
    p = b.build();
    pathCache.set(key, p);
  }
  return p;
}

function outlinedPath(canvas: SkCanvas, path: SkPath, color: string) {
  canvas.drawPath(path, stroke(C.outline, OUTLINE * 2));
  canvas.drawPath(path, fill(color));
}

export function drawShadow(canvas: SkCanvas, x: number, y: number, rx: number, ry: number) {
  canvas.drawOval(rect(x - rx, y - ry, rx * 2, ry * 2), fill(C.shadow));
}

export function drawHpBar(canvas: SkCanvas, x: number, y: number, w: number, ratio: number, color: string) {
  const r = Math.max(0, Math.min(1, ratio));
  canvas.drawRRect(rrect(x - w / 2 - 2, y - 2, w + 4, 9, 4), fill(C.hpBack));
  if (r > 0) canvas.drawRRect(rrect(x - w / 2, y, w * r, 5, 2.5), fill(color));
}

// ---------- Arbres ----------

function drawStump(canvas: SkCanvas, tree: Tree) {
  const s = tree.size;
  box(canvas, -11 * s, -12 * s, 22 * s, 14 * s, 5, C.trunk);
  canvas.drawOval(rect(-11 * s, -16 * s, 22 * s, 9 * s), fill(C.stumpTop));
  canvas.drawOval(rect(-5 * s, -13.5 * s, 10 * s, 4 * s), stroke(C.trunkLight, 1.5));
}

const GOLDEN_CANOPY = ['#E0A81E', '#FFD25A', '#FFF0A0'] as const;

function drawCanopy(canvas: SkCanvas, variant: number, golden = false) {
  const canopies = THEME().canopy;
  const pal = golden ? GOLDEN_CANOPY : canopies[variant % canopies.length];
  if (variant === 1) {
    const path = cachedPath('pine', (p) => {
      for (const t of [
        { y: -28, w: 40, h: 34 },
        { y: -50, w: 32, h: 30 },
        { y: -70, w: 22, h: 26 },
      ]) {
        p.moveTo(-t.w, t.y);
        p.lineTo(0, t.y - t.h - 10);
        p.lineTo(t.w, t.y);
        p.close();
      }
    });
    outlinedPath(canvas, path, pal[0]);
    canvas.save();
    canvas.translate(-5, -4);
    canvas.scale(0.55, 0.9);
    canvas.drawPath(path, fill(pal[1]));
    canvas.restore();
    return;
  }
  canvas.drawCircle(0, -62, 34 + OUTLINE, fill(C.outline));
  canvas.drawCircle(-22, -46, 24 + OUTLINE, fill(C.outline));
  canvas.drawCircle(22, -46, 24 + OUTLINE, fill(C.outline));
  canvas.drawCircle(0, -62, 34, fill(pal[0]));
  canvas.drawCircle(-22, -46, 24, fill(pal[0]));
  canvas.drawCircle(22, -46, 24, fill(pal[0]));
  canvas.drawCircle(-6, -68, 22, fill(pal[1]));
  canvas.drawCircle(-14, -76, 9, fill(pal[2]));
  if (variant === 2) {
    for (const [bx, by] of [
      [14, -60],
      [-18, -44],
      [6, -40],
    ]) {
      canvas.drawCircle(bx, by, 5, fill(C.outline));
      canvas.drawCircle(bx, by, 3.6, fill('#FF4D5E'));
    }
  }
}

/** Le feuillage devient transparent quand le héros passe derrière. */
export function drawTree(canvas: SkCanvas, tree: Tree, time: number, heroBehind = false) {
  if (heroBehind && tree.state === 'standing') {
    canvas.saveLayer(layerAlpha(0.45));
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
  box(canvas, -9, -42, 18, 44, 5, C.trunk);
  canvas.drawRRect(rrect(-6, -38, 5, 36, 3), fill(C.trunkLight));
  drawCanopy(canvas, tree.variant, tree.golden);
  if (tree.golden) {
    for (let i = 0; i < 3; i++) {
      const a = time * 2 + i * 2.1;
      canvas.drawCircle(Math.cos(a) * 30, -60 + Math.sin(a * 1.3) * 25, 3 + Math.sin(time * 8 + i) * 1.5, fill(C.white));
    }
  }
  canvas.restore();
}

// ---------- Personnages ----------

function drawAxe(canvas: SkCanvas, level: number, t: Tint) {
  canvas.drawRRect(rrect(-4.5, -34, 9, 38, 4), fill(C.outline));
  canvas.drawRRect(rrect(-2.5, -32, 5, 34, 2.5), fill(t(C.axeHandle)));
  const w = 13 + level * 2;
  box(canvas, -1, -36, w, 12, 3, t(C.axeHeads[level] ?? C.axeHeads[1]));
  canvas.drawRRect(rrect(w - 5, -36, 4, 12, 2), fill(C.white));
}


/** Lueur de forge : blanche, puis orange, puis bleue quand l'arme est très améliorée. */
function forgeGlow(forge: number) {
  if (forge >= 10) return 'rgba(91,224,255,0.35)';
  if (forge >= 6) return 'rgba(255,140,40,0.35)';
  if (forge >= 3) return 'rgba(255,255,255,0.3)';
  return null;
}

/** Arme principale, dessinée verticalement dans la main (poignée en 0,0). */
export function drawMainWeapon(canvas: SkCanvas, type: WeaponType, tier: number, forge: number, t: Tint = normal) {
  const metal = tier >= 2 ? EQUIP_TIER_COLORS[tier] : '#D7DEE6';
  const glow = forgeGlow(forge);
  const grow = 1 + Math.min(0.4, forge * 0.03);
  canvas.save();
  canvas.scale(grow, grow);
  switch (type) {
    case 'sword':
      if (glow) canvas.drawCircle(0, -30, 14, fill(glow));
      box(canvas, -3, -46, 6, 38, 2, t(metal));
      canvas.drawRect(rect(-1, -44, 2, 32), fill(C.white));
      box(canvas, -9, -10, 18, 5, 2, t(tier === 1 ? C.trunk : metal));
      box(canvas, -2.5, -6, 5, 10, 2, t(C.axeHandle));
      break;
    case 'spear':
      if (glow) canvas.drawCircle(0, -62, 12, fill(glow));
      box(canvas, -2, -56, 4, 64, 2, t(C.axeHandle));
      outlinedPath(
        canvas,
        cachedPath('spearTip', (p) => {
          p.moveTo(-6, -54);
          p.lineTo(0, -74);
          p.lineTo(6, -54);
          p.close();
        }),
        t(metal),
      );
      canvas.drawRect(rect(-5, -56, 10, 3), fill(C.flag));
      break;
    case 'hammer':
      if (glow) canvas.drawCircle(0, -44, 18, fill(glow));
      box(canvas, -2.5, -38, 5, 44, 2, t(C.axeHandle));
      box(canvas, -15, -54, 30, 18, 5, t(metal));
      canvas.drawRRect(rrect(-11, -51, 6, 12, 3), fill(C.white));
      break;
    case 'daggers':
      if (glow) canvas.drawCircle(0, -18, 10, fill(glow));
      outlinedPath(
        canvas,
        cachedPath('dagger', (p) => {
          p.moveTo(-3, -6);
          p.lineTo(0, -28);
          p.lineTo(3, -6);
          p.close();
        }),
        t(metal),
      );
      box(canvas, -6, -7, 12, 4, 2, t(C.outline));
      box(canvas, -2, -4, 4, 8, 1, t(C.axeHandle));
      break;
  }
  canvas.restore();
}

export function drawHero(canvas: SkCanvas, hero: Hero, time: number, gear: Record<EquipSlot, number>) {
  const t = tintFor(hero.hurtFlash);
  const walking = hero.walkTime > 0;
  const phase = Math.sin(hero.walkTime * 16);
  const bob = walking ? Math.abs(phase) * 4 : Math.sin(time * 3) * 1;

  canvas.save();
  canvas.translate(hero.x, hero.y);
  canvas.scale(hero.dirX, 1);

  const lf = walking ? phase * 4 : 0;
  outlinedCircle(canvas, -6, -3 + lf, 5, t(C.pants));
  outlinedCircle(canvas, 6, -3 - lf, 5, t(C.pants));
  canvas.translate(0, -bob);
  outlinedCircle(canvas, -13, -18, 4.5, t(C.skin));

  // Armure : le torse prend la couleur du palier.
  const armor = gear.armor ? EQUIP_TIER_COLORS[gear.armor] : null;
  box(canvas, -13, -32, 26, 26, 10, t(armor ?? C.shirt));
  canvas.drawRRect(rrect(-13, -14, 26, 8, 4), fill(t(armor ? C.outline : C.shirtDark)));
  if (armor) canvas.drawRRect(rrect(-6, -29, 12, 10, 4), fill(t('rgba(255,255,255,0.35)')));

  outlinedCircle(canvas, 0, -44, 15, t(C.skin));
  if (armor) {
    // Casque assorti à l'armure
    canvas.drawRRect(rrect(-17, -63, 32, 16, 8), fill(C.outline));
    canvas.drawRRect(rrect(-15, -61, 28, 13, 6), fill(t(armor)));
    canvas.drawRect(rect(-15, -52, 9, 8), fill(t(armor)));
  } else {
    canvas.drawOval(rect(-15, -61, 28, 16), fill(t(C.hair)));
    canvas.drawOval(rect(-15, -52, 9, 12), fill(t(C.hair)));
  }
  canvas.drawCircle(4, -41, 4.6, fill(C.white));
  canvas.drawCircle(12, -41, 4.6, fill(C.white));
  canvas.drawCircle(5.6, -40.5, 2.4, fill(C.outline));
  canvas.drawCircle(13.6, -40.5, 2.4, fill(C.outline));
  canvas.drawCircle(1, -35, 3, fill('rgba(255,110,110,0.45)'));

  // La hache sert aux arbres, l'arme principale au combat. Chaque arme a son mouvement.
  const chopping = hero.target?.kind === 'tree';
  const type = hero.weapon.type;
  const p = hero.swingTime > 0 ? Math.min(1, hero.swingTime / SWING_DURATION) : -1;
  let angle = -25 + Math.sin(time * 3) * 3;
  let thrust = 0;
  if (p >= 0) {
    if (chopping || type === 'sword' || type === 'hammer') {
      const wind = !chopping && type === 'hammer' ? -150 : -125;
      if (p < 0.4) angle = lerp(-25, wind, p / 0.4);
      else if (p < 0.6) angle = lerp(wind, 80, (p - 0.4) / 0.2);
      else angle = lerp(80, -25, (p - 0.6) / 0.4);
    } else if (type === 'spear') {
      angle = 80;
      thrust = Math.sin(Math.PI * p) * 18;
    } else {
      angle = p < 0.5 ? lerp(-40, 70, p / 0.5) : lerp(70, -40, (p - 0.5) / 0.5);
    }
  } else if (!chopping && type === 'spear') {
    angle = 15;
  }
  canvas.save();
  canvas.translate(10 + thrust, -20);
  canvas.rotate(angle, 0, 0);
  if (chopping) drawAxe(canvas, hero.axeLevel, t);
  else drawMainWeapon(canvas, type, gear.sword, hero.weapon.forge, t);
  outlinedCircle(canvas, 0, 0, 4.5, t(C.skin));
  canvas.restore();
  if (type === 'daggers' && !chopping) {
    // Deuxième dague dans l'autre main
    canvas.save();
    canvas.translate(-12, -18);
    canvas.rotate(p >= 0 ? lerp(60, -50, p) : -30, 0, 0);
    drawMainWeapon(canvas, 'daggers', gear.sword, hero.weapon.forge, t);
    canvas.restore();
  }

  // Bouclier sur le bras arrière
  if (gear.shield) {
    const col = EQUIP_TIER_COLORS[gear.shield];
    outlinedCircle(canvas, -16, -20, 10, t(col));
    canvas.drawCircle(-16, -20, 5, fill(t(gear.shield >= 3 ? C.white : C.outline)));
    canvas.drawCircle(-16, -20, 3, fill(t(col)));
  }

  canvas.restore();
}

export function drawZombie(canvas: SkCanvas, z: Zombie) {
  const t = tintFor(z.hitFlash);
  const skin = z.golden ? '#FFD25A' : z.boss ? C.bossSkin : C.zombieSkin[z.variant % 3];
  const shirt = z.golden ? '#B8860B' : z.boss ? C.bossShirt : C.zombieShirt[z.variant % 3];
  const phase = Math.sin(z.walkTime * (z.boss ? 5 : 9));
  const dir = z.vx >= 0 ? 1 : -1;

  canvas.save();
  canvas.translate(z.x, z.y);
  if (z.boss) {
    const s = bossStats(1, z.bossSize === 'big' ? 'big' : 'mini').scale;
    canvas.scale(s, s);
  }
  canvas.scale(dir, 1);
  outlinedCircle(canvas, -6, -3 + phase * 3, 5, t(C.zombiePants));
  outlinedCircle(canvas, 6, -3 - phase * 3, 5, t(C.zombiePants));
  canvas.translate(z.lunge * 7, -Math.abs(phase) * 2);
  canvas.rotate(phase * 4 + z.lunge * 10, 0, -20);

  box(canvas, -12, -31, 24, 25, 9, t(shirt));
  canvas.drawRect(rect(-12, -12, 7, 6), fill(t(skin)));
  canvas.drawRect(rect(3, -10, 6, 4), fill(t(skin)));

  outlinedCircle(canvas, 1, -43, 14, t(skin));
  canvas.drawCircle(-4, -50, 4, fill(t('rgba(60,90,40,0.35)')));
  canvas.drawCircle(6, -44, 4.4, fill(C.white));
  canvas.drawCircle(13, -43, 3.6, fill(C.white));
  canvas.drawCircle(7, -43.5, 2.2, fill(C.hpEnemy));
  canvas.drawCircle(13.5, -42.5, 1.8, fill(C.hpEnemy));
  canvas.drawRRect(rrect(3, -36, 10, 3, 1.5), fill(C.outline));
  drawZombieGear(canvas, t);

  // Bras tendus vers l'avant
  const reach = 6 + z.lunge * 8;
  canvas.drawRRect(rrect(4, -26, 10 + reach, 7, 3.5), fill(C.outline));
  canvas.drawRRect(rrect(5, -25, 8 + reach, 5, 2.5), fill(t(skin)));
  canvas.drawRRect(rrect(2, -19, 12 + reach, 7, 3.5), fill(C.outline));
  canvas.drawRRect(rrect(3, -18, 10 + reach, 5, 2.5), fill(t(skin)));
  if (z.bossSize === 'mini') {
    // Bandeau rouge du mini-boss
    canvas.drawRRect(rrect(-13, -53, 28, 6, 3), fill(C.outline));
    canvas.drawRRect(rrect(-12, -52, 26, 4, 2), fill(t(C.hpEnemy)));
  }
  if (z.bossSize === 'big') {
    const crown = cachedPath('crown', (p) => {
      p.moveTo(-10, -55);
      p.lineTo(-10, -66);
      p.lineTo(-4, -60);
      p.lineTo(1, -69);
      p.lineTo(6, -60);
      p.lineTo(12, -66);
      p.lineTo(12, -55);
      p.close();
    });
    outlinedPath(canvas, crown, t(C.chestBand));
  }
  canvas.restore();
}

function drawZombieGear(canvas: SkCanvas, t: Tint) {
  const gear = THEME().zombieGear;
  if (gear === 'helmet') {
    canvas.drawRRect(rrect(-14, -60, 30, 14, 7), fill(C.outline));
    canvas.drawRRect(rrect(-12, -58, 26, 11, 5), fill(t(C.stone)));
    canvas.drawRect(rect(-1, -58, 4, 11), fill(t(C.stoneDark)));
  } else if (gear === 'goggles') {
    canvas.drawRect(rect(-13, -47, 28, 4), fill(t(C.door)));
    outlinedCircle(canvas, 7, -45, 4.5, t('#FFB020'));
    outlinedCircle(canvas, 14, -44, 3.5, t('#FFB020'));
  } else if (gear === 'visor') {
    canvas.drawRRect(rrect(0, -49, 18, 8, 4), fill(C.outline));
    canvas.drawRRect(rrect(1, -48, 16, 6, 3), fill(t('#5BE0FF')));
  }
}

export function drawGem(canvas: SkCanvas, x: number, y: number, value: number, time: number) {
  const s = value > 1 ? 1.35 : 1;
  const bob = Math.sin(time * 5 + x) * 2;
  const gem = cachedPath('gem', (p) => {
    p.moveTo(0, -8);
    p.lineTo(6, 0);
    p.lineTo(0, 8);
    p.lineTo(-6, 0);
    p.close();
  });
  canvas.save();
  canvas.translate(x, y - 8 + bob);
  canvas.scale(s, s);
  outlinedPath(canvas, gem, value > 1 ? C.gemBig : C.gem);
  canvas.drawCircle(-1.5, -3, 1.6, fill(C.white));
  canvas.restore();
}

/** Hache qui tourne autour du héros. */
export function drawSpinningAxe(canvas: SkCanvas, x: number, y: number, angle: number, phase: number) {
  canvas.save();
  canvas.translate(x, y);
  const s = phase === 3 ? 1.5 : phase === 2 ? 1.25 : 1;
  if (phase >= 2) canvas.drawCircle(0, 0, 22 * s, fill(phase === 3 ? 'rgba(255,210,90,0.35)' : 'rgba(255,255,255,0.25)'));
  canvas.scale(s, s);
  canvas.rotate(((angle * 180) / Math.PI) * 3, 0, 0);
  canvas.translate(0, 14);
  drawAxe(canvas, phase === 3 ? 3 : 2, normal);
  canvas.restore();
}

export function drawBomb(canvas: SkCanvas, x: number, y: number, time: number, phase: number) {
  canvas.save();
  canvas.translate(x, y);
  const s = phase === 2 ? 1.3 : 1;
  canvas.scale(s, s);
  outlinedCircle(canvas, 0, 0, 9, phase === 3 ? '#7A3FC2' : phase === 2 ? '#C2352B' : C.outline);
  canvas.drawCircle(-3, -3, 2.5, fill('rgba(255,255,255,0.5)'));
  canvas.drawRect(rect(-2, -14, 4, 5), fill(C.outline));
  canvas.drawCircle(0, -16, 3 + Math.sin(time * 30) * 1, fill('#FFB020'));
  canvas.restore();
}

export function drawChest(canvas: SkCanvas, chest: Chest, time: number) {
  const bob = chest.fall > 0 ? 0 : Math.sin(time * 4) * 2;
  canvas.save();
  canvas.translate(chest.x, chest.y - bob - chest.fall);
  if (chest.kind === 'crate') {
    if (chest.fall > 0) {
      // Parachute
      canvas.drawLine(-14, -24, -26, -70, stroke(C.outline, 1.5));
      canvas.drawLine(14, -24, 26, -70, stroke(C.outline, 1.5));
      canvas.drawArc(rect(-34, -96, 68, 52), 180, 180, true, fill(C.outline));
      canvas.drawArc(rect(-31, -93, 62, 46), 180, 180, true, fill(C.white));
      canvas.drawArc(rect(-31, -93, 62, 46), 225, 45, true, fill(C.flag));
      canvas.drawArc(rect(-31, -93, 62, 46), 315, 45, true, fill(C.flag));
    }
    box(canvas, -16, -28, 32, 28, 3, C.plank);
    canvas.drawLine(-14, -26, 14, -2, stroke(C.plankDark, 4));
    canvas.drawLine(14, -26, -14, -2, stroke(C.plankDark, 4));
    canvas.restore();
    return;
  }
  const weapon = chest.kind === 'weapon';
  if (weapon) canvas.drawCircle(0, -16, 26 + Math.sin(time * 5) * 3, fill('rgba(199,125,255,0.3)'));
  box(canvas, -15, -22, 30, 22, 4, weapon ? '#7A3FC2' : C.chest);
  box(canvas, -16, -28, 32, 10, 5, weapon ? '#9A5BE0' : C.plank);
  canvas.drawRect(rect(-3, -28, 6, 28), fill(C.chestBand));
  canvas.drawCircle(0, -16, 3, fill(C.outline));
  // Petite étincelle pour attirer l'œil
  const s = 3 + Math.sin(time * 6) * 1.5;
  canvas.drawCircle(12, -34, s, fill(C.chestBand));
  canvas.restore();
}

// ---------- Bâtiments ----------

const HOUSE_STYLE = [
  null,
  { walls: C.plank, wallsDark: C.plankDark, roof: C.straw, roofDark: C.strawDark, stone: false, chimney: false, flag: false, scale: 0.9 },
  { walls: C.plank, wallsDark: C.plankDark, roof: C.roofRed, roofDark: C.roofRedDark, stone: false, chimney: true, flag: false, scale: 1 },
  { walls: C.plank, wallsDark: C.plankDark, roof: C.roofRed, roofDark: C.roofRedDark, stone: true, chimney: true, flag: false, scale: 1.08 },
  { walls: C.stone, wallsDark: C.stoneDark, roof: C.roofBlue, roofDark: C.roofBlueDark, stone: true, chimney: true, flag: true, scale: 1.16 },
] as const;

export function drawHouse(canvas: SkCanvas, level: number, flash: number, time: number) {
  const t = tintFor(flash);
  const th = THEME();
  const base = HOUSE_STYLE[Math.max(1, Math.min(4, level))]!;
  // Les murs et le toit prennent les couleurs du monde.
  const st = { ...base, walls: th.walls[0], wallsDark: th.walls[1], roof: th.roof[0], roofDark: th.roof[1] };
  canvas.save();
  canvas.scale(st.scale, st.scale);

  if (st.chimney) {
    box(canvas, 14, -86, 12, 26, 2, t(C.stoneDark));
  }
  if (st.flag) {
    canvas.drawRect(rect(-2, -128, 4, 40), fill(C.outline));
    const flag = cachedPath('flag', (p) => {
      p.moveTo(2, -126);
      p.lineTo(28, -118);
      p.lineTo(2, -108);
      p.close();
    });
    canvas.save();
    canvas.translate(2, -117);
    canvas.scale(1, 1 + Math.sin(time * 5) * 0.15);
    canvas.translate(-2, 117);
    outlinedPath(canvas, flag, t(C.flag));
    canvas.restore();
  }

  box(canvas, -36, -42, 72, 62, 6, t(st.walls));
  if (st.stone) {
    canvas.drawRect(rect(-36, 4, 72, 16), fill(t(C.stone)));
    for (let i = -30; i < 36; i += 16) canvas.drawRRect(rrect(i, 7, 12, 9, 3), fill(t(C.stoneDark)));
  } else {
    for (let y = -30; y < 18; y += 12) canvas.drawRect(rect(-36, y, 72, 2), fill(t(st.wallsDark)));
  }

  const roof = cachedPath('roof', (p) => {
    p.moveTo(-48, -36);
    p.lineTo(0, -92);
    p.lineTo(48, -36);
    p.close();
  });
  if (th.id === 'future') {
    // Dôme
    canvas.drawCircle(0, -40, 44 + OUTLINE, fill(C.outline));
    canvas.drawCircle(0, -40, 44, fill(t(st.roof)));
    canvas.drawCircle(-14, -58, 10, fill(t('rgba(255,255,255,0.5)')));
    canvas.drawRect(rect(-48, -40, 96, 6), fill(C.outline));
  } else {
  outlinedPath(canvas, roof, t(st.roof));
  if (th.id === 'kingdom') {
    for (const cx of [-36, -12, 12, 36]) box(canvas, cx - 6, -50, 12, 12, 2, t(st.walls));
  }
  const roofShade = cachedPath('roofShade', (p) => {
    p.moveTo(0, -92);
    p.lineTo(48, -36);
    p.lineTo(18, -36);
    p.close();
  });
  canvas.drawPath(roofShade, fill(t(st.roofDark)));
  }

  box(canvas, -10, -6, 20, 26, 8, t(C.door));
  canvas.drawCircle(5, 8, 2, fill(C.chestBand));
  if (level >= 2) {
    box(canvas, -28, -28, 14, 14, 3, t(C.window));
    box(canvas, 14, -28, 14, 14, 3, t(C.window));
  }
  canvas.restore();
}

export function drawStakes(canvas: SkCanvas, tx: number, ty: number, flash: number) {
  const t = tintFor(flash);
  const offsets = [-22, 0, 22];
  // Pieux du fond d'abord pour que l'ordre de profondeur reste juste.
  offsets.sort((a, b) => a * ty - b * ty);
  const stake = cachedPath('stake', (p) => {
    p.moveTo(-7, 0);
    p.lineTo(-7, -38);
    p.lineTo(0, -50);
    p.lineTo(7, -38);
    p.lineTo(7, 0);
    p.close();
  });
  for (const o of offsets) {
    canvas.save();
    canvas.translate(tx * o, ty * o);
    const [stakeColor, stakeLight] = THEME().stake;
    outlinedPath(canvas, stake, t(stakeColor));
    canvas.drawRect(rect(-5, -36, 3, 34), fill(t(stakeLight)));
    canvas.restore();
  }
}

export function drawWall(canvas: SkCanvas, s: Structure, baseX: number, baseY: number) {
  const a = Math.atan2(s.y - baseY, s.x - baseX) + Math.PI / 2;
  canvas.save();
  canvas.translate(s.x, s.y);
  drawStakes(canvas, Math.cos(a), Math.sin(a), s.hitFlash);
  canvas.restore();
}

export function drawTower(canvas: SkCanvas, flash: number, phase = 0) {
  const t = tintFor(flash);
  const [wall, wallDark] = THEME().walls;
  box(canvas, -18, -50, 6, 50, 2, t(wallDark));
  box(canvas, 12, -50, 6, 50, 2, t(wallDark));
  canvas.drawRect(rect(-14, -36, 28, 4), fill(t(wall)));
  canvas.drawRect(rect(-14, -20, 28, 4), fill(t(wall)));
  box(canvas, -24, -62, 48, 14, 3, t(wall));
  if (phase >= 3) {
    // Canon
    box(canvas, -6, -78, 26, 12, 6, t(C.outline));
    canvas.drawCircle(18, -72, 4, fill(C.hpEnemy));
  } else {
    // Archer(s)
    outlinedCircle(canvas, phase >= 2 ? -8 : 0, -70, 8, t(C.skin));
    canvas.drawCircle(phase >= 2 ? -5 : 3, -71, 2, fill(C.outline));
    if (phase >= 2) {
      outlinedCircle(canvas, 9, -70, 8, t(C.skin));
      canvas.drawCircle(12, -71, 2, fill(C.outline));
    }
  }
  const roof = cachedPath('towerRoof', (p) => {
    p.moveTo(-28, -80);
    p.lineTo(0, -104);
    p.lineTo(28, -80);
    p.close();
  });
  outlinedPath(canvas, roof, t(C.roofRed));
}

export function drawWorkshop(canvas: SkCanvas, flash: number, time = 0) {
  const t = tintFor(flash);
  // Cheminée de la forge, avec ses braises
  box(canvas, 12, -70, 12, 22, 2, t(C.stoneDark));
  canvas.drawCircle(18, -74 - (time * 20) % 10, 4, fill('rgba(255,140,40,0.6)'));
  box(canvas, -28, -34, 56, 40, 5, t(C.plank));
  const roof = cachedPath('shopRoof', (p) => {
    p.moveTo(-36, -30);
    p.lineTo(-24, -58);
    p.lineTo(24, -58);
    p.lineTo(36, -30);
    p.close();
  });
  outlinedPath(canvas, roof, t(C.roofBlue));
  box(canvas, -20, -22, 18, 28, 4, t(C.door));
  // Enclume
  box(canvas, 4, -10, 22, 8, 2, t(C.stoneDark));
  box(canvas, 10, -2, 10, 8, 1, t(C.stoneDark));
}

export function drawStructure(canvas: SkCanvas, s: Structure, baseX: number, baseY: number, time: number, towerPhase = 0) {
  if (s.kind === 'wall') {
    if (s.pop < 1) {
      canvas.save();
      canvas.translate(s.x, s.y);
      const k = easeOutBack(s.pop);
      canvas.scale(1, k);
      canvas.translate(-s.x, -s.y);
      drawWall(canvas, s, baseX, baseY);
      canvas.restore();
    } else drawWall(canvas, s, baseX, baseY);
    return;
  }
  canvas.save();
  canvas.translate(s.x, s.y);
  const k = s.pop < 1 ? Math.max(0.01, easeOutBack(s.pop)) : 1;
  canvas.scale(k, k);
  if (s.kind === 'house') drawHouse(canvas, s.level, s.hitFlash, time);
  else if (s.kind === 'tower') drawTower(canvas, s.hitFlash, towerPhase);
  else if (s.kind === 'barracks') drawBarracks(canvas, s.level, s.hitFlash, time);
  else if (s.kind === 'lumber') drawLumberCamp(canvas, s.level, s.hitFlash);
  else drawWorkshop(canvas, s.hitFlash, time);
  if (s.kind === 'barracks' || s.kind === 'lumber') drawLevelPips(canvas, s.level);
  canvas.restore();
}

function drawLevelPips(canvas: SkCanvas, level: number) {
  for (let i = 0; i < level; i++) {
    const x = (i - (level - 1) / 2) * 12;
    outlinedCircle(canvas, x, 14, 4, C.chestBand);
  }
}

export function drawBarracks(canvas: SkCanvas, level: number, flash: number, time: number) {
  const t = tintFor(flash);
  const [wall, wallDark] = THEME().walls;
  box(canvas, -32, -36, 64, 42, 5, t(wall));
  for (let y = -26; y < 6; y += 10) canvas.drawRect(rect(-32, y, 64, 2), fill(t(wallDark)));
  outlinedPath(
    canvas,
    cachedPath('barracksRoof', (p) => {
      p.moveTo(-40, -32);
      p.lineTo(0, -64);
      p.lineTo(40, -32);
      p.close();
    }),
    t(C.roofRed),
  );
  box(canvas, -10, -18, 20, 24, 8, t(C.door));
  // Épées croisées
  canvas.drawLine(-22, -26, -8, -8, stroke(C.outline, 5));
  canvas.drawLine(-8, -26, -22, -8, stroke(C.outline, 5));
  canvas.drawLine(-22, -26, -8, -8, stroke(C.axeHeads[1], 2.5));
  canvas.drawLine(-8, -26, -22, -8, stroke(C.axeHeads[1], 2.5));
  // Drapeau
  canvas.drawRect(rect(26, -86, 3, 52), fill(C.outline));
  canvas.save();
  canvas.translate(29, -84);
  canvas.scale(1, 1 + Math.sin(time * 5) * 0.12);
  canvas.drawRect(rect(0, 0, 18, 12), fill(t(level >= 3 ? C.chestBand : C.flag)));
  canvas.restore();
}

export function drawLumberCamp(canvas: SkCanvas, level: number, flash: number) {
  const t = tintFor(flash);
  box(canvas, -30, -34, 46, 40, 5, t(C.plank));
  for (let y = -26; y < 6; y += 9) canvas.drawRect(rect(-30, y, 46, 2), fill(t(C.plankDark)));
  outlinedPath(
    canvas,
    cachedPath('lumberRoof', (p) => {
      p.moveTo(-38, -30);
      p.lineTo(-7, -60);
      p.lineTo(24, -30);
      p.close();
    }),
    t(C.straw),
  );
  box(canvas, -14, -18, 14, 24, 6, t(C.door));
  // Tas de bûches, plus gros à chaque niveau
  for (let i = 0; i < 2 + level; i++) {
    const x = 26 + (i % 2) * 8;
    const y = 2 - Math.floor(i / 2) * 9;
    canvas.drawRRect(rrect(x - 9, y - 5, 18, 10, 5), fill(C.outline));
    canvas.drawRRect(rrect(x - 8, y - 4, 16, 8, 4), fill(t(C.trunk)));
    canvas.drawCircle(x + 6, y, 3, fill(t(C.stumpTop)));
  }
}

// ---------- Habitants du camp ----------

export function drawUnit(canvas: SkCanvas, u: Unit, helmet: string) {
  const t = tintFor(u.hitFlash);
  const walking = u.walkTime > 0;
  const phase = Math.sin(u.walkTime * 16);
  canvas.save();
  canvas.translate(u.x, u.y);
  canvas.scale(u.dirX * 0.78, 0.78);
  const lf = walking ? phase * 4 : 0;
  outlinedCircle(canvas, -5, -3 + lf, 4, t(C.zombiePants));
  outlinedCircle(canvas, 5, -3 - lf, 4, t(C.zombiePants));
  canvas.translate(0, walking ? -Math.abs(phase) * 3 : 0);
  const worker = u.kind === 'worker';
  box(canvas, -11, -28, 22, 22, 8, t(worker ? '#5FA35A' : '#4A5BD6'));
  outlinedCircle(canvas, 0, -38, 12, t(C.skin));
  canvas.drawCircle(5, -37, 2.2, fill(C.outline));
  if (worker) {
    // Chapeau de paille
    canvas.drawOval(rect(-17, -50, 34, 8), fill(C.outline));
    canvas.drawOval(rect(-16, -49, 32, 6), fill(t(C.straw)));
    canvas.drawRRect(rrect(-9, -58, 18, 10, 4), fill(t(C.straw)));
    // Hache, qui s'abat pendant la coupe
    canvas.save();
    canvas.translate(9, -16);
    canvas.rotate(u.state === 'chop' ? lerp(-110, 60, (u.timer / 1.1) ** 3) : -30, 0, 0);
    canvas.scale(0.7, 0.7);
    drawAxe(canvas, 1, t);
    canvas.restore();
    if (u.carry > 0) {
      // Bûches sur le dos
      for (let i = 0; i < Math.min(3, u.carry); i++) {
        canvas.drawRRect(rrect(-22, -30 - i * 7, 18, 8, 4), fill(C.outline));
        canvas.drawRRect(rrect(-21, -29 - i * 7, 16, 6, 3), fill(C.trunk));
      }
    }
  } else {
    // Casque et lance
    canvas.drawRRect(rrect(-13, -52, 26, 13, 6), fill(C.outline));
    canvas.drawRRect(rrect(-11, -50, 22, 10, 5), fill(t(helmet)));
    canvas.save();
    canvas.translate(10, -16);
    canvas.rotate(u.state === 'fight' ? 70 + Math.sin(u.timer * 12) * 15 : 10, 0, 0);
    canvas.scale(0.75, 0.75);
    drawMainWeapon(canvas, 'spear', 1, 0, t);
    canvas.restore();
    outlinedCircle(canvas, -12, -18, 7, t(helmet));
  }
  canvas.restore();
}

export function drawAxeIcon(canvas: SkCanvas, level: number) {
  canvas.save();
  canvas.rotate(30, 0, 0);
  canvas.translate(0, 14);
  drawAxe(canvas, level, normal);
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
