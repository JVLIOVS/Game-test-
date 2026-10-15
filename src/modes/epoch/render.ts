import { PaintStyle, Skia, StrokeCap, type SkCanvas, type SkFont, type SkPaint, type SkPath } from '@shopify/react-native-skia';
import { drawOutlinedText } from '../../render/fx';
import { PALETTE as C, fill, stroke } from '../../render/palette';
import { AGE_THEMES, LANE, LANE_HALF } from './data';
import type { Base, Crate, EpochState, Side, Unit } from './types';

// Mode Époques, dessiné en perspective : le chemin file vers l'horizon, ta base au premier plan,
// celle de l'adversaire au loin. Chaque moitié du chemin prend les couleurs de l'époque de son camp.

const TEAM = [
  { main: '#4E8BF0', dark: '#2E5AAE', light: '#9EC8FF' },
  { main: '#E85A4A', dark: '#A8342A', light: '#FFB0A0' },
];

// ---------- Perspective ----------

/** Distance entre la caméra et le point regardé. */
const D0 = 520;
/** Le point regardé est dessiné à cette hauteur de l'écran. */
const FOCUS_Y = 0.6;
const HORIZON = 0.2;
/** Échelle de ta propre base, au premier plan. */
const BASE_NEAR = 0.42;

export interface EpochView {
  width: number;
  height: number;
  /** Position de la caméra le long du chemin (point regardé). */
  camZ: number;
  /** Mode visée du pouvoir spécial. */
  aiming: boolean;
}

export interface Projection {
  /** Point du monde → écran ; null s'il est derrière la caméra. */
  at: (z: number, x: number, h?: number) => { x: number; y: number; s: number } | null;
  /** Hauteur d'écran → position sur le chemin (pour viser ou toucher). */
  zAt: (y: number) => number;
  /** Premier et dernier z visibles. */
  nearZ: number;
}

export function makeProjection(view: EpochView): Projection {
  const { width: W, height: H, camZ } = view;
  const hor = H * HORIZON;
  const span = H * FOCUS_Y - hor;
  const unit = W / 330;
  const nearDz = (D0 * span) / (H + 40 - hor);
  return {
    at(z, x, h = 0) {
      const dz = z - camZ + D0;
      if (dz < nearDz * 0.7) return null;
      const k = D0 / dz;
      const s = unit * k;
      return { x: W / 2 + x * s, y: hor + span * k - h * s, s };
    },
    zAt(y) {
      const k = Math.max(0.05, (y - hor) / span);
      return camZ + D0 / k - D0;
    },
    nearZ: camZ - D0 + nearDz * 0.7,
  };
}

// ---------- Outils de dessin ----------

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

const rounds = new Map<string, SkPaint>();
function line(color: string, width: number): SkPaint {
  const key = `${color}|${width}`;
  let p = rounds.get(key);
  if (!p) {
    p = Skia.Paint();
    p.setAntiAlias(true);
    p.setStyle(PaintStyle.Stroke);
    p.setStrokeWidth(width);
    p.setStrokeCap(StrokeCap.Round);
    p.setColor(Skia.Color(color));
    rounds.set(key, p);
  }
  return p;
}

const rgba = (rgb: string, a: number) => `rgba(${rgb},${Math.round(Math.max(0, Math.min(1, a)) * 20) / 20})`;
const rr = (x: number, y: number, w: number, h: number, r: number) => Skia.RRectXY(Skia.XYWHRect(x, y, w, h), r, r);
const ol = () => fill(C.outline);

function mix(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const q = Math.round(Math.max(0, Math.min(1, t)) * 8) / 8;
  const ch = (sh: number) => Math.round(((pa >> sh) & 255) * (1 - q) + ((pb >> sh) & 255) * q);
  return `#${((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)}`;
}

/** Époque du décor à un endroit du chemin : ta moitié, puis celle de l'adversaire. */
const ageAt = (state: EpochState, z: number) => (z < LANE / 2 ? state.bases[0].age : state.bases[1].age);

// ---------- Décor ----------

function drawSky(canvas: SkCanvas, state: EpochState, W: number, H: number) {
  const th = AGE_THEMES[state.bases[0].age];
  const hor = H * HORIZON;
  const bands = 10;
  for (let i = 0; i < bands; i++) canvas.drawRect(Skia.XYWHRect(0, (hor * i) / bands, W, hor / bands + 1), fill(mix(th.sky[0], th.sky[1], i / (bands - 1))));
  const age = state.bases[0].age;
  const t = state.time;
  if (age === 0) {
    // Volcans qui fument
    for (const [cx, w, hgt] of [[W * 0.2, 150, 70], [W * 0.75, 190, 95]] as const) {
      canvas.drawPath(cached(`volc${cx}`, (b) => b.moveTo(cx - w / 2, hor).lineTo(cx - 18, hor - hgt).lineTo(cx + 18, hor - hgt).lineTo(cx + w / 2, hor).close()), fill('#6A3A2A'));
      canvas.drawRect(Skia.XYWHRect(cx - 16, hor - hgt, 32, 6), fill('#FF6B2B'));
      for (let k = 0; k < 3; k++) {
        const p = (t * 0.3 + k / 3) % 1;
        canvas.drawCircle(cx + Math.sin(p * 6 + k) * 10, hor - hgt - p * 60, 8 + p * 14, fill(rgba('90,80,80', 0.5 * (1 - p))));
      }
    }
  } else if (age === 1) {
    // Collines et château lointain
    canvas.drawOval(Skia.XYWHRect(-W * 0.2, hor - 40, W * 0.8, 90), fill('#7FA86A'));
    canvas.drawOval(Skia.XYWHRect(W * 0.4, hor - 55, W * 0.9, 110), fill('#6E9A5A'));
    const cx = W * 0.72;
    canvas.drawRect(Skia.XYWHRect(cx - 30, hor - 80, 60, 40), fill('#8A8EA0'));
    for (const ox of [-36, 24]) canvas.drawRect(Skia.XYWHRect(cx + ox, hor - 100, 14, 60), fill('#7A7E90'));
    canvas.drawPath(cached('flagC', (b) => b.moveTo(cx, hor - 110).lineTo(cx + 16, hor - 104).lineTo(cx, hor - 98).close()), fill('#E85A4A'));
  } else if (age === 2) {
    // Moulins et fumée de canons
    for (const cx of [W * 0.25, W * 0.8]) {
      canvas.drawRect(Skia.XYWHRect(cx - 8, hor - 60, 16, 60), fill('#5A4A3A'));
      canvas.save();
      canvas.translate(cx, hor - 60);
      canvas.rotate(t * 40 + cx, 0, 0);
      for (let k = 0; k < 4; k++) {
        canvas.rotate(90, 0, 0);
        canvas.drawRect(Skia.XYWHRect(-3, 0, 6, 34), fill('#C8B89A'));
      }
      canvas.restore();
    }
  } else if (age === 3) {
    // Ville et cheminées d'usines
    for (let i = 0; i < 9; i++) {
      const w = 30 + ((i * 37) % 30);
      const hgt = 30 + ((i * 53) % 60);
      const x = (i / 9) * W;
      canvas.drawRect(Skia.XYWHRect(x, hor - hgt, w, hgt), fill(i % 2 ? '#4A566A' : '#55627A'));
      for (let k = 0; k < 3; k++) canvas.drawRect(Skia.XYWHRect(x + 6 + k * 8, hor - hgt + 8, 4, 5), fill('#FFE38A'));
    }
  } else {
    // Espace : étoiles, planètes, comète
    for (let i = 0; i < 40; i++) {
      const x = (i * 97) % W;
      const y = (i * 53) % hor;
      canvas.drawCircle(x, y, 1 + (i % 3) * 0.5, fill(rgba('255,255,255', 0.4 + 0.4 * Math.sin(t * 2 + i))));
    }
    canvas.drawCircle(W * 0.78, hor * 0.45, 34, fill('#C49AF0'));
    canvas.drawOval(Skia.XYWHRect(W * 0.78 - 54, hor * 0.45 - 8, 108, 16), stroke('#E6C8FF', 3));
    canvas.drawCircle(W * 0.18, hor * 0.6, 16, fill('#5BE0FF'));
    const cx = ((t * 40) % (W + 200)) - 100;
    canvas.drawLine(cx, hor * 0.2, cx - 60, hor * 0.2 - 20, line('rgba(255,255,255,0.5)', 3));
  }
}

function drawGround(canvas: SkCanvas, state: EpochState, proj: Projection, W: number, H: number) {
  const hor = H * HORIZON;
  // Sol de chaque moitié
  const mid = proj.at(LANE / 2, 0);
  const near = AGE_THEMES[state.bases[0].age];
  const far = AGE_THEMES[state.bases[1].age];
  const midY = mid ? Math.max(hor, mid.y) : H;
  canvas.drawRect(Skia.XYWHRect(0, hor, W, midY - hor), fill(far.side));
  canvas.drawRect(Skia.XYWHRect(0, midY, W, H - midY), fill(near.side));
  // Le chemin, tuile par tuile, pour bien sentir la profondeur
  const step = 100;
  const start = Math.max(-200, Math.floor(proj.nearZ / step) * step);
  for (let z = start; z < LANE + 300; z += step) {
    const a = proj.at(z, 0);
    const b = proj.at(z + step, 0);
    if (!a || !b) continue;
    const th = z + step / 2 < LANE / 2 ? near : far;
    const wa = (LANE_HALF + 40) * a.s;
    const wb = (LANE_HALF + 40) * b.s;
    const path = Skia.Path.Make();
    path.moveTo(a.x - wa, a.y);
    path.lineTo(a.x + wa, a.y);
    path.lineTo(b.x + wb, b.y);
    path.lineTo(b.x - wb, b.y);
    path.close();
    canvas.drawPath(path, fill((z / step) % 2 === 0 ? th.lane : mix(th.lane, '#000000', 0.08)));
    path.dispose?.();
    // Bords du chemin
    canvas.drawLine(a.x - wa, a.y, b.x - wb, b.y, line(mix(th.lane, '#000000', 0.3), Math.max(1, 4 * a.s)));
    canvas.drawLine(a.x + wa, a.y, b.x + wb, b.y, line(mix(th.lane, '#000000', 0.3), Math.max(1, 4 * a.s)));
  }
  // Frontière du temps, au milieu du chemin
  if (mid && mid.y > hor) {
    const w = (LANE_HALF + 60) * mid.s;
    canvas.drawLine(mid.x - w, mid.y, mid.x + w, mid.y, line(rgba('255,255,255', 0.35 + Math.sin(state.time * 3) * 0.2), Math.max(2, 5 * mid.s)));
  }
}

/** Accessoires sur les côtés du chemin, selon l'époque de chaque moitié. */
function drawProp(canvas: SkCanvas, age: number, s: number, seed: number, time: number) {
  canvas.save();
  canvas.scale(s, s);
  const th = AGE_THEMES[age];
  if (age === 0) {
    if (seed % 2) {
      // Palmier préhistorique
      canvas.drawRect(Skia.XYWHRect(-4, -70, 8, 70), fill('#7A5A3A'));
      for (let k = 0; k < 5; k++) {
        canvas.save();
        canvas.translate(0, -70);
        canvas.rotate(-80 + k * 40 + Math.sin(time + seed) * 4, 0, 0);
        canvas.drawOval(Skia.XYWHRect(0, -6, 44, 12), fill(th.prop));
        canvas.restore();
      }
    } else {
      canvas.drawOval(Skia.XYWHRect(-26, -30, 52, 34), fill('#8A7A6A'));
      canvas.drawOval(Skia.XYWHRect(-18, -26, 20, 10), fill('#A89A8A'));
    }
  } else if (age === 1) {
    // Sapin
    canvas.drawRect(Skia.XYWHRect(-4, -14, 8, 14), fill('#6A4A2A'));
    for (let k = 0; k < 3; k++) canvas.drawPath(cached(`pine${k}`, (b) => b.moveTo(-26 + k * 5, -10 - k * 20).lineTo(0, -44 - k * 20).lineTo(26 - k * 5, -10 - k * 20).close()), fill(th.prop));
  } else if (age === 2) {
    // Tonneaux et palissade
    canvas.drawRRect(rr(-14, -30, 28, 30, 6), fill('#8A5A3A'));
    canvas.drawRect(Skia.XYWHRect(-14, -22, 28, 3), fill('#4A3A2A'));
    canvas.drawRect(Skia.XYWHRect(-14, -10, 28, 3), fill('#4A3A2A'));
  } else if (age === 3) {
    // Sacs de sable et lampadaire
    if (seed % 2) {
      canvas.drawRect(Skia.XYWHRect(-2, -80, 4, 80), fill('#3A3F4C'));
      canvas.drawCircle(0, -82, 7, fill('#FFE38A'));
      canvas.drawCircle(0, -82, 16, fill('rgba(255,227,138,0.25)'));
    } else {
      for (let k = 0; k < 3; k++) canvas.drawOval(Skia.XYWHRect(-30 + k * 20, -14, 22, 14), fill('#A89A70'));
      canvas.drawOval(Skia.XYWHRect(-20, -26, 22, 14), fill('#B8AA80'));
    }
  } else {
    // Cristaux lumineux
    const glow = 0.6 + Math.sin(time * 2 + seed) * 0.3;
    canvas.drawCircle(0, -24, 26, fill(rgba('196,154,240', glow * 0.25)));
    canvas.drawPath(cached('crys', (b) => b.moveTo(-10, 0).lineTo(-4, -50).lineTo(4, -42).lineTo(10, 0).close()), fill('#7E5AD6'));
    canvas.drawPath(cached('crys2', (b) => b.moveTo(4, 0).lineTo(16, -30).lineTo(20, 0).close()), fill('#5BE0FF'));
  }
  canvas.restore();
}

// ---------- Bases ----------

function drawBase(canvas: SkCanvas, b: Base, side: Side, time: number) {
  const team = TEAM[side];
  const flash = b.flash > 0.5;
  const wall = flash ? '#FFFFFF' : ['#7A6A5A', '#9A9EAE', '#A86A4A', '#7E8794', '#D6DCF0'][b.age];
  const roof = flash ? '#FFFFFF' : ['#5A4A3A', '#6E7286', '#7A4A2A', '#5A626E', '#7E5AD6'][b.age];
  if (b.age === 0) {
    // Caverne : gros rocher, entrée sombre, os et feu
    canvas.drawOval(Skia.XYWHRect(-150, -140, 300, 170), ol());
    canvas.drawOval(Skia.XYWHRect(-144, -134, 288, 158), fill(wall));
    canvas.drawOval(Skia.XYWHRect(-48, -86, 96, 100), fill('#2B2238'));
    canvas.drawOval(Skia.XYWHRect(-100, -120, 60, 30), fill(rgba('255,255,255', 0.15)));
    canvas.drawCircle(70, -10, 12 + Math.sin(time * 12) * 3, fill('#FF6B2B'));
    canvas.drawCircle(70, -14, 7, fill('#FFE14D'));
  } else if (b.age === 1) {
    // Château : donjon et créneaux
    canvas.drawRRect(rr(-130, -150, 260, 160, 10), ol());
    canvas.drawRect(Skia.XYWHRect(-124, -144, 248, 150), fill(wall));
    for (let k = 0; k < 7; k++) canvas.drawRect(Skia.XYWHRect(-124 + k * 38, -164, 22, 22), fill(wall));
    canvas.drawRRect(rr(-34, -80, 68, 86, 30), fill('#4A3A2A'));
    for (const ox of [-90, 64]) canvas.drawRect(Skia.XYWHRect(ox, -116, 20, 26), fill('#2B2238'));
  } else if (b.age === 2) {
    // Fort en briques avec canon
    canvas.drawRRect(rr(-140, -130, 280, 140, 8), ol());
    canvas.drawRect(Skia.XYWHRect(-134, -124, 268, 130), fill(wall));
    for (let r = 0; r < 5; r++) for (let k = 0; k < 7; k++) canvas.drawRect(Skia.XYWHRect(-130 + k * 38 + (r % 2) * 19, -118 + r * 24, 30, 3), fill(roof));
    canvas.drawRRect(rr(-30, -70, 60, 76, 6), fill('#3A2A1A'));
  } else if (b.age === 3) {
    // Bunker en béton, radar
    canvas.drawRRect(rr(-150, -110, 300, 120, 30), ol());
    canvas.drawRRect(rr(-144, -104, 288, 108, 26), fill(wall));
    canvas.drawRect(Skia.XYWHRect(-110, -60, 220, 14), fill('#2B2238'));
    canvas.save();
    canvas.translate(90, -130);
    canvas.rotate(Math.sin(time) * 30, 0, 20);
    canvas.drawOval(Skia.XYWHRect(-26, -12, 52, 22), fill(roof));
    canvas.restore();
    canvas.drawRect(Skia.XYWHRect(88, -120, 4, 20), fill(roof));
  } else {
    // Station spatiale : dôme lumineux et antenne
    const glow = 0.5 + Math.sin(time * 3) * 0.2;
    canvas.drawOval(Skia.XYWHRect(-170, -190, 340, 260), fill(rgba('91,224,255', glow * 0.25)));
    canvas.drawOval(Skia.XYWHRect(-150, -170, 300, 200), ol());
    canvas.drawOval(Skia.XYWHRect(-144, -164, 288, 188), fill(wall));
    canvas.drawOval(Skia.XYWHRect(-110, -140, 220, 120), fill(rgba('91,224,255', 0.45)));
    canvas.drawRect(Skia.XYWHRect(-3, -230, 6, 70), fill(roof));
    canvas.drawCircle(0, -232, 9, fill(flash ? '#FFFFFF' : '#5BE0FF'));
  }
  // Drapeau du camp
  canvas.drawRect(Skia.XYWHRect(-118, -230, 6, 110), fill(C.outline));
  canvas.drawPath(cached('flag', (bb) => bb.moveTo(-112, -230).lineTo(-60, -218).lineTo(-112, -204).close()), fill(team.main));
  // Tourelle
  if (b.turret >= 0) {
    canvas.save();
    canvas.translate(40, b.age === 4 ? -170 : -150);
    canvas.drawRRect(rr(-22, -10, 44, 22, 6), ol());
    canvas.drawRRect(rr(-19, -7, 38, 16, 5), fill(team.dark));
    canvas.drawCircle(0, -10, 14, ol());
    canvas.drawCircle(0, -10, 11, fill(['#8A6A4A', '#8E979E', '#4A4F5E', '#5E6670', '#E8ECF8'][b.turret]));
    canvas.drawRRect(rr(-4, side === 0 ? -40 : -10, 8, 30, 3), ol());
    canvas.restore();
  }
  // Tourbillon du temps pendant l'évolution
  if (b.evolving > 0) {
    const k = b.evolving / 1.6;
    for (let r = 0; r < 4; r++) {
      const rad = 60 + r * 50 + (1 - k) * 120;
      canvas.drawOval(Skia.XYWHRect(-rad, -80 - rad * 0.45, rad * 2, rad * 0.9), stroke(rgba(r % 2 ? '142,197,255' : '230,200,255', k), 6));
    }
  }
}

// ---------- Troupes ----------

const SKIN = '#F2C39A';

/** Arme selon l'époque et le type de troupe. */
function drawWeapon(canvas: SkCanvas, u: Unit, swing: number) {
  canvas.save();
  canvas.translate(12, -26);
  canvas.rotate(-30 + swing * 110, 0, 0);
  const a = u.age;
  if (u.kind === 'inf') {
    if (a === 0) {
      canvas.drawRRect(rr(-3, -30, 6, 30, 3), ol());
      canvas.drawOval(Skia.XYWHRect(-7, -38, 14, 16), fill('#8A5A3A'));
    } else if (a === 1) {
      canvas.drawRect(Skia.XYWHRect(-2, -34, 4, 30), fill('#D6DCE6'));
      canvas.drawRect(Skia.XYWHRect(-7, -6, 14, 4), fill('#8A6A2A'));
    } else if (a === 2) {
      canvas.drawRect(Skia.XYWHRect(-1.5, -46, 3, 46), fill('#8A5A3A'));
      canvas.drawPath(cached('pike', (b) => b.moveTo(-5, -44).lineTo(0, -56).lineTo(5, -44).close()), fill('#D6DCE6'));
    } else if (a === 3) {
      canvas.drawRect(Skia.XYWHRect(-2, -18, 4, 18), fill('#3A3F4C'));
      canvas.drawRect(Skia.XYWHRect(-1.5, -28, 3, 10), fill('#D6DCE6'));
    } else {
      canvas.drawRect(Skia.XYWHRect(-2, -6, 4, 8), fill('#3A3F4C'));
      canvas.drawRRect(rr(-3, -42, 6, 36, 3), fill('rgba(91,224,255,0.45)'));
      canvas.drawRRect(rr(-1.5, -40, 3, 34, 1.5), fill('#E0FAFF'));
    }
  } else {
    // Archer : fronde, arc, mousquet, fusil, pistolet laser
    if (a === 0) {
      canvas.drawLine(0, 0, 0, -20, line('#8A5A3A', 2));
      canvas.drawCircle(0, -22, 4, fill('#8A8A8A'));
    } else if (a === 1) {
      canvas.drawPath(cached('bow', (b) => b.moveTo(-2, -30).quadTo(12, -14, -2, 2)), line('#8A5A3A', 3));
      canvas.drawLine(-2, -30, -2, 2, line('#F1E3C6', 1));
    } else {
      const col = a === 4 ? '#E8ECF8' : a === 3 ? '#3A3F4C' : '#6A4A2A';
      canvas.drawRRect(rr(-3, -36, 6, 36, 2), fill(col));
      if (a === 4) canvas.drawCircle(0, -36, 4, fill('#5BE0FF'));
    }
  }
  canvas.restore();
}

/** Coiffe selon l'époque (vue de face pour l'adversaire, de dos pour toi). */
function drawHeadgear(canvas: SkCanvas, age: number, team: (typeof TEAM)[number]) {
  if (age === 0) {
    canvas.drawOval(Skia.XYWHRect(-13, -64, 26, 14), fill('#7A4A2A'));
  } else if (age === 1) {
    canvas.drawOval(Skia.XYWHRect(-14, -66, 28, 20), fill('#B0B8C4'));
    canvas.drawRect(Skia.XYWHRect(-2, -56, 4, 12), fill('#8A929E'));
  } else if (age === 2) {
    canvas.drawPath(cached('tricorn', (b) => b.moveTo(-18, -54).lineTo(0, -68).lineTo(18, -54).close()), fill('#2B2238'));
    canvas.drawCircle(0, -60, 3, fill(team.main));
  } else if (age === 3) {
    canvas.drawOval(Skia.XYWHRect(-15, -66, 30, 18), fill('#5A6A4A'));
    canvas.drawRect(Skia.XYWHRect(-16, -54, 32, 4), fill('#4A5A3A'));
  } else {
    canvas.drawOval(Skia.XYWHRect(-15, -68, 30, 26), fill('#E8ECF8'));
    canvas.drawRRect(rr(-11, -58, 22, 9, 4), fill('#5BE0FF'));
  }
}

function drawSoldier(canvas: SkCanvas, u: Unit, time: number) {
  const team = TEAM[u.side];
  const flash = u.flash > 0.5;
  const step = Math.sin(u.walk * 10);
  const bob = Math.abs(step) * 3;
  const facing = u.side === 1; // l'adversaire vient vers toi : on voit son visage
  canvas.drawCircle(-6, -4 + step * 3, 5, ol());
  canvas.drawCircle(6, -4 - step * 3, 5, ol());
  canvas.translate(0, -bob);
  // Corps : peau de bête à la préhistoire, uniforme ensuite
  const body = flash ? '#FFFFFF' : u.age === 0 ? '#A8784A' : team.main;
  canvas.drawRRect(rr(-13, -36, 26, 30, 10), ol());
  canvas.drawRRect(rr(-11, -34, 22, 26, 8), fill(body));
  if (u.age === 0) canvas.drawRect(Skia.XYWHRect(-11, -24, 22, 5), fill(team.main));
  else canvas.drawRect(Skia.XYWHRect(-11, -16, 22, 4), fill(team.dark));
  // Tête
  canvas.drawCircle(0, -48, 13, ol());
  canvas.drawCircle(0, -48, 11, fill(flash ? '#FFFFFF' : SKIN));
  if (facing) {
    canvas.drawCircle(-4, -48, 2.5, ol());
    canvas.drawCircle(4, -48, 2.5, ol());
    canvas.drawRect(Skia.XYWHRect(-4, -42, 8, 2), ol());
  } else {
    canvas.drawOval(Skia.XYWHRect(-11, -58, 22, 16), fill('#5A3A22'));
  }
  drawHeadgear(canvas, u.age, team);
  drawWeapon(canvas, u, u.attack);
  void time;
}

/** Troupe lourde : dinosaure, chevalier, canon, char, robot géant. */
function drawHeavy(canvas: SkCanvas, u: Unit, time: number) {
  const team = TEAM[u.side];
  const flash = u.flash > 0.5;
  const step = Math.sin(u.walk * 6);
  const facing = u.side === 1;
  const c = (col: string) => (flash ? '#FFFFFF' : col);
  canvas.translate(0, -Math.abs(step) * 2);
  if (u.age === 0) {
    // Tricératops
    for (const lx of [-22, -8, 8, 22]) canvas.drawRRect(rr(lx - 5, -20 + (lx > 0 ? step : -step) * 3, 10, 20, 4), ol());
    canvas.drawOval(Skia.XYWHRect(-34, -58, 68, 46), ol());
    canvas.drawOval(Skia.XYWHRect(-31, -55, 62, 40), fill(c('#7A9A4A')));
    canvas.drawOval(Skia.XYWHRect(-18, -50, 36, 12), fill(team.main));
    if (facing) {
      canvas.drawOval(Skia.XYWHRect(-26, -82, 52, 34), fill(c('#9AB86A')));
      canvas.drawCircle(0, -50, 14, fill(c('#7A9A4A')));
      for (const hx of [-12, 12]) canvas.drawPath(cached(`horn${hx}`, (b) => b.moveTo(hx - 4, -58).lineTo(hx, -84).lineTo(hx + 4, -58).close()), fill('#F1E3C6'));
      canvas.drawCircle(-6, -52, 2.5, ol());
      canvas.drawCircle(6, -52, 2.5, ol());
    } else {
      canvas.drawPath(cached('tail', (b) => b.moveTo(-6, -30).lineTo(0, -6).lineTo(6, -30).close()), fill(c('#6A8A3A')));
    }
  } else if (u.age === 1) {
    // Chevalier à cheval
    for (const lx of [-12, -4, 4, 12]) canvas.drawRect(Skia.XYWHRect(lx - 2.5, -22 + (lx > 0 ? step : -step) * 3, 5, 22), fill(C.outline));
    canvas.drawOval(Skia.XYWHRect(-22, -48, 44, 30), ol());
    canvas.drawOval(Skia.XYWHRect(-20, -46, 40, 26), fill(c('#8A5A3A')));
    canvas.drawRect(Skia.XYWHRect(-20, -38, 40, 8), fill(team.main));
    if (facing) canvas.drawOval(Skia.XYWHRect(-8, -60, 16, 26), fill(c('#7A4A2A')));
    canvas.drawRRect(rr(-11, -78, 22, 30, 8), ol());
    canvas.drawRRect(rr(-9, -76, 18, 26, 6), fill(c('#B0B8C4')));
    canvas.drawOval(Skia.XYWHRect(-10, -94, 20, 22), fill(c('#B0B8C4')));
    canvas.drawRect(Skia.XYWHRect(-7, -86, 14, 3), ol());
    canvas.drawOval(Skia.XYWHRect(-4, -104, 8, 12), fill(team.main));
    canvas.save();
    canvas.translate(12, -66);
    canvas.rotate(-60 + u.attack * 70, 0, 0);
    canvas.drawRect(Skia.XYWHRect(-2, -50, 4, 50), fill('#D6DCE6'));
    canvas.restore();
  } else if (u.age === 2) {
    // Canon sur roues, et son artilleur
    canvas.drawCircle(-22, -16, 16, ol());
    canvas.drawCircle(22, -16, 16, ol());
    canvas.drawCircle(-22, -16, 12, fill(c('#8A5A3A')));
    canvas.drawCircle(22, -16, 12, fill(c('#8A5A3A')));
    canvas.drawRRect(rr(-26, -40, 52, 20, 6), fill(team.dark));
    canvas.drawCircle(0, -40 - u.attack * 4, 16, ol());
    canvas.drawCircle(0, -40 - u.attack * 4, 12, fill(c('#3A3F4C')));
    if (facing) canvas.drawCircle(0, -40, 7, fill('#1A1A22'));
    if (u.attack > 0.7) canvas.drawCircle(0, facing ? -40 : -60, 14, fill(rgba('255,180,60', 0.7)));
  } else if (u.age === 3) {
    // Char d'assaut
    canvas.drawRRect(rr(-38, -24, 76, 24, 10), ol());
    canvas.drawRRect(rr(-35, -22, 70, 20, 8), fill('#3A3F4C'));
    for (let k = 0; k < 5; k++) canvas.drawCircle(-28 + k * 14, -12, 4, fill('#5E6670'));
    canvas.drawRRect(rr(-32, -46, 64, 26, 8), ol());
    canvas.drawRRect(rr(-30, -44, 60, 22, 6), fill(c('#5A6A4A')));
    canvas.drawRect(Skia.XYWHRect(-30, -36, 60, 4), fill(team.main));
    canvas.drawRRect(rr(-16, -64, 32, 22, 8), fill(c('#4A5A3A')));
    if (facing) canvas.drawCircle(0, -52, 7, fill('#1A1A22'));
    else canvas.drawRect(Skia.XYWHRect(-3, -84, 6, 26), fill(c('#3A4A2A')));
  } else {
    // Robot géant
    const glow = 0.6 + Math.sin(time * 6) * 0.3;
    canvas.drawRRect(rr(-24, -30 + step * 3, 12, 30, 4), ol());
    canvas.drawRRect(rr(12, -30 - step * 3, 12, 30, 4), ol());
    canvas.drawRRect(rr(-30, -76, 60, 50, 12), ol());
    canvas.drawRRect(rr(-27, -73, 54, 44, 10), fill(c('#E8ECF8')));
    canvas.drawRect(Skia.XYWHRect(-27, -56, 54, 6), fill(team.main));
    canvas.drawCircle(0, -48, 8, fill(rgba('91,224,255', glow)));
    canvas.drawRRect(rr(-16, -98, 32, 24, 8), fill(c('#C8CEE0')));
    if (facing) canvas.drawRRect(rr(-11, -90, 22, 7, 3), fill('#5BE0FF'));
    for (const ax of [-40, 30]) canvas.drawRRect(rr(ax, -72 + (ax > 0 ? u.attack * 8 : 0), 10, 34, 4), fill(c('#C8CEE0')));
  }
}

function drawUnit(canvas: SkCanvas, u: Unit, rage: boolean, time: number) {
  if (rage) canvas.drawOval(Skia.XYWHRect(-26, -8, 52, 16), fill(rgba('255,90,60', 0.4 + Math.sin(time * 10) * 0.2)));
  canvas.drawOval(Skia.XYWHRect(-20, -6, 40, 12), fill('rgba(0,0,0,0.25)'));
  if (u.kind === 'heavy') drawHeavy(canvas, u, time);
  else drawSoldier(canvas, u, time);
}

// ---------- Projectiles, frappes, caisses ----------

function drawShotLook(canvas: SkCanvas, age: number, big: boolean, s: number) {
  const r = (big ? 7 : 4) * s;
  if (age === 0) canvas.drawCircle(0, 0, r, fill('#8A8A8A'));
  else if (age === 1) canvas.drawLine(0, -r * 2, 0, r * 2, line('#5A3A22', Math.max(1.5, 2 * s)));
  else if (age === 2) canvas.drawCircle(0, 0, r, fill('#2B2238'));
  else if (age === 3) canvas.drawCircle(0, 0, r * 0.8, fill('#FFE14D'));
  else {
    canvas.drawLine(0, -r * 3, 0, r * 3, line('rgba(91,224,255,0.6)', r * 1.6));
    canvas.drawLine(0, -r * 3, 0, r * 3, line('#E0FAFF', Math.max(1, r * 0.6)));
  }
}

function drawCrate(canvas: SkCanvas, c: Crate, s: number, time: number) {
  const icon = { gold: '#FFD25A', xp: '#8EC5FF', rage: '#FF5A5A', heal: '#7BD35A' }[c.bonus];
  canvas.save();
  canvas.scale(s, s);
  // Halo qui attire l'œil : il faut toucher la caisse
  canvas.drawCircle(0, -20, 40 + Math.sin(time * 6) * 6, fill(rgba('255,255,255', 0.18)));
  if (c.h > 0) {
    canvas.drawLine(-18, -40, 0, -100, line('#FFFFFF', 2));
    canvas.drawLine(18, -40, 0, -100, line('#FFFFFF', 2));
    canvas.drawArc(Skia.XYWHRect(-40, -140, 80, 70), 180, 180, true, fill(icon));
  }
  canvas.drawRRect(rr(-20, -40, 40, 36, 6), ol());
  canvas.drawRRect(rr(-17, -37, 34, 30, 4), fill('#C8874A'));
  canvas.drawRect(Skia.XYWHRect(-17, -24, 34, 4), fill('#8A5A2A'));
  canvas.drawCircle(0, -22, 8, fill(icon));
  canvas.restore();
}

/** Ce qui tombe du ciel pendant une frappe : météores, flèches, boulets, bombes, laser orbital. */
function drawDrop(canvas: SkCanvas, age: number, x: number, y: number, s: number, height: number) {
  const top = y - height * s;
  if (age === 4) {
    canvas.drawLine(x, 0, x, y, line('rgba(91,224,255,0.4)', 22 * s));
    canvas.drawLine(x, 0, x, y, line('#E0FAFF', 6 * s));
    return;
  }
  if (age === 0) {
    canvas.drawLine(x + 40 * s, top - 60 * s, x, top, line('rgba(255,120,40,0.5)', 14 * s));
    canvas.drawCircle(x, top, 12 * s, fill('#6A3A2A'));
    canvas.drawCircle(x, top, 7 * s, fill('#FF6B2B'));
  } else if (age === 1) {
    for (let k = -1; k <= 1; k++) canvas.drawLine(x + k * 14 * s, top - 30 * s, x + k * 14 * s, top, line('#5A3A22', 3 * s));
  } else if (age === 2) {
    canvas.drawCircle(x, top, 9 * s, fill('#2B2238'));
  } else {
    canvas.drawRRect(rr(x - 6 * s, top - 18 * s, 12 * s, 24 * s, 5 * s), fill('#3A3F4C'));
  }
}

// ---------- Image complète ----------

export function drawEpoch(canvas: SkCanvas, state: EpochState, view: EpochView, fonts: { big: SkFont | null; small: SkFont | null }) {
  const { width: W, height: H } = view;
  const proj = makeProjection(view);
  const shake = state.trauma * state.trauma * 12;
  canvas.save();
  canvas.translate((Math.random() * 2 - 1) * shake, (Math.random() * 2 - 1) * shake);
  drawSky(canvas, state, W, H);
  drawGround(canvas, state, proj, W, H);

  // Tout ce qui est posé sur le chemin, du plus loin au plus proche
  const items: { z: number; draw: () => void }[] = [];
  for (let z = Math.floor(proj.nearZ / 130) * 130; z < LANE + 260; z += 130) {
    for (const side of [-1, 1]) {
      const seed = Math.abs(Math.round(z / 130) * 7 + side * 3);
      const x = side * (LANE_HALF + 120 + (seed % 5) * 22);
      items.push({
        z,
        draw: () => {
          const p = proj.at(z, x);
          if (!p || p.y < H * HORIZON) return;
          canvas.save();
          canvas.translate(p.x, p.y);
          drawProp(canvas, ageAt(state, z), p.s, seed, state.time);
          canvas.restore();
        },
      });
    }
  }
  state.bases.forEach((b, i) => {
    const z = i === 0 ? -30 : LANE + 40;
    items.push({
      z,
      draw: () => {
        const p = proj.at(z, 0);
        if (!p) return;
        canvas.save();
        canvas.translate(p.x, p.y);
        // Ta base, tout près de la caméra, est réduite pour ne pas cacher le chemin.
        const k = p.s * (i === 0 ? BASE_NEAR : 1);
        canvas.scale(k, k);
        drawBase(canvas, b, i as Side, state.time);
        canvas.restore();
      },
    });
  });
  for (const u of state.units) {
    items.push({
      z: u.z,
      draw: () => {
        const p = proj.at(u.z, u.x);
        if (!p) return;
        canvas.save();
        canvas.translate(p.x, p.y);
        canvas.scale(p.s * (u.kind === 'heavy' ? 1.15 : 1), p.s * (u.kind === 'heavy' ? 1.15 : 1));
        drawUnit(canvas, u, state.bases[u.side].rage > 0, state.time);
        canvas.restore();
        if (u.hp < u.maxHp) {
          const w = 30 * p.s;
          const y = p.y - (u.kind === 'heavy' ? 120 : 76) * p.s;
          canvas.drawRect(Skia.XYWHRect(p.x - w / 2 - 1, y - 1, w + 2, 6), fill('#2B2238'));
          canvas.drawRect(Skia.XYWHRect(p.x - w / 2, y, w * Math.max(0, u.hp / u.maxHp), 4), fill(TEAM[u.side].light));
        }
      },
    });
  }
  for (const c of state.crates) {
    items.push({
      z: c.z,
      draw: () => {
        const p = proj.at(c.z, c.x, c.h);
        if (!p) return;
        canvas.save();
        canvas.translate(p.x, p.y);
        drawCrate(canvas, c, p.s, state.time);
        canvas.restore();
      },
    });
  }
  items.sort((a, b) => b.z - a.z);
  for (const it of items) it.draw();

  // Projectiles
  for (const s of state.shots) {
    const p = proj.at(s.z, s.x, s.h);
    if (!p) continue;
    canvas.save();
    canvas.translate(p.x, p.y);
    drawShotLook(canvas, s.age, s.big, p.s);
    canvas.restore();
  }
  // Frappes spéciales : ce qui tombe, et une zone rouge au sol pour prévenir
  for (const st of state.strikes) {
    const zone = proj.at(st.z, 0);
    if (zone) canvas.drawOval(Skia.XYWHRect(zone.x - 180 * zone.s, zone.y - 40 * zone.s, 360 * zone.s, 80 * zone.s), fill(rgba('255,60,40', 0.18 + Math.sin(state.time * 12) * 0.08)));
    for (const d of st.drops) {
      if (d.done || st.time < d.t - 0.6) continue;
      const p = proj.at(d.z, d.x);
      if (!p) continue;
      drawDrop(canvas, st.age, p.x, p.y, p.s, (d.t - st.time) * 900);
    }
  }
  // Étincelles
  for (const sp of state.sparks) {
    const p = proj.at(sp.z, sp.x, sp.h);
    if (!p) continue;
    const paint = fill(sp.color);
    paint.setAlphaf(Math.min(1, sp.life / (sp.maxLife * 0.4)));
    canvas.drawCircle(p.x, p.y, Math.max(1.2, sp.size * p.s), paint);
    paint.setAlphaf(1);
  }
  // Barre de vie de la base adverse (la tienne est en haut de l'écran)
  state.bases.forEach((b, i) => {
    if (i === 0) return;
    const p = proj.at(LANE + 40, 0, 270);
    if (!p || p.y < 0 || p.y > H) return;
    const w = Math.max(60, 180 * p.s);
    canvas.drawRRect(rr(p.x - w / 2 - 2, p.y - 2, w + 4, 12, 5), fill('#2B2238'));
    canvas.drawRRect(rr(p.x - w / 2, p.y, w * Math.max(0, b.hp / b.maxHp), 8, 4), fill(TEAM[i].main));
  });
  if (fonts.big) {
    for (const tx of state.texts) {
      const p = proj.at(tx.z, tx.x, tx.h);
      if (p) drawOutlinedText(canvas, tx.text, p.x, p.y, fonts.big, tx.color, Math.min(1, tx.life / 0.4));
    }
  }
  canvas.restore();

  // Mode visée : on voit où le pouvoir peut tomber
  if (view.aiming) {
    canvas.drawRect(Skia.XYWHRect(0, H * HORIZON, W, H * (1 - HORIZON)), fill(rgba('255,60,40', 0.08 + Math.sin(state.time * 6) * 0.04)));
  }
  // Tourbillon du temps : quand tu évolues, tout l'écran s'illumine
  const evo = state.bases[0].evolving;
  if (evo > 0) {
    const k = evo / 1.6;
    canvas.drawRect(Skia.XYWHRect(0, 0, W, H), fill(rgba('255,255,255', Math.max(0, k - 0.6) * 2)));
    for (let r = 0; r < 6; r++) {
      const rad = (1 - k) * W * 1.4 + r * 40;
      canvas.drawCircle(W / 2, H * 0.75, rad, stroke(rgba(r % 2 ? '142,197,255' : '230,200,255', k * 0.8), 10));
    }
  }
  drawMinimap(canvas, state, view);
}

/** Petite carte du chemin entier sur le côté droit (touche-la pour déplacer la caméra). */
export const MINIMAP = { width: 14, top: 0.28, bottom: 0.72, margin: 10 };

function drawMinimap(canvas: SkCanvas, state: EpochState, view: EpochView) {
  const { width: W, height: H } = view;
  const x = W - MINIMAP.margin - MINIMAP.width;
  const y0 = H * MINIMAP.top;
  const y1 = H * MINIMAP.bottom;
  const zy = (z: number) => y1 - (z / LANE) * (y1 - y0);
  canvas.drawRRect(rr(x - 3, y0 - 8, MINIMAP.width + 6, y1 - y0 + 16, 8), fill('rgba(30,24,52,0.7)'));
  canvas.drawRect(Skia.XYWHRect(x, (y0 + y1) / 2 - 1, MINIMAP.width, 2), fill('rgba(255,255,255,0.4)'));
  // Fenêtre de la caméra
  const proj = makeProjection(view);
  const camTop = zy(Math.min(LANE, proj.zAt(H * 0.3)));
  const camBottom = zy(Math.max(0, proj.nearZ));
  canvas.drawRRect(rr(x - 2, camTop, MINIMAP.width + 4, Math.max(6, camBottom - camTop), 4), stroke('rgba(255,255,255,0.8)', 2));
  for (const u of state.units) canvas.drawCircle(x + MINIMAP.width / 2 + (u.x / LANE_HALF) * 4, zy(u.z), u.kind === 'heavy' ? 3 : 2, fill(TEAM[u.side].main));
  for (const c of state.crates) canvas.drawCircle(x + MINIMAP.width / 2, zy(c.z), 3.5, fill('#FFD25A'));
  canvas.drawRect(Skia.XYWHRect(x - 2, y1 + 2, MINIMAP.width + 4, 5), fill(TEAM[0].main));
  canvas.drawRect(Skia.XYWHRect(x - 2, y0 - 7, MINIMAP.width + 4, 5), fill(TEAM[1].main));
}
