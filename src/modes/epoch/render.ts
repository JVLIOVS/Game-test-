import { PaintStyle, Skia, StrokeCap, type SkCanvas, type SkFont, type SkPaint, type SkPath } from '@shopify/react-native-skia';
import { drawOutlinedText } from '../../render/fx';
import { PALETTE as C, fill, stroke } from '../../render/palette';
import { AGE_THEMES, LANE, LANE_HALF } from './data';
import type { Base, Bolt, Corpse, Crate, EpochState, Shot, Side, TurretSlot, Unit } from './types';

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
    canvas.drawLine(a.x + wa, a.y, b.x + wb, b.y, line(mix(th.lane, '#000000', 0.3), Math.max(1, 4 * a.s)));    // Cailloux sur le chemin, touffes d'herbe sur les côtés (toujours aux mêmes endroits)
    const seed = Math.abs(Math.round(z / step)) * 9301 + 49297;
    for (let k = 0; k < 4; k++) {
      const r1 = ((seed * (k + 3)) % 233280) / 233280;
      const r2 = ((seed * (k + 7) * 17) % 233280) / 233280;
      const pz = z + r1 * step;
      const pebble = proj.at(pz, (r2 - 0.5) * (LANE_HALF + 30) * 1.8);
      if (pebble && pebble.y > hor) canvas.drawOval(Skia.XYWHRect(pebble.x - 5 * pebble.s, pebble.y - 2 * pebble.s, 10 * pebble.s, 4 * pebble.s), fill(mix(th.lane, '#000000', 0.22)));
      const tuftX = (r2 < 0.5 ? -1 : 1) * (LANE_HALF + 60 + r1 * 200);
      const tuft = proj.at(pz, tuftX);
      if (tuft && tuft.y > hor) {
        const g = mix(th.side, '#FFFFFF', 0.18);
        for (const dx of [-5, 0, 5]) canvas.drawLine(tuft.x + dx * tuft.s, tuft.y, tuft.x + dx * 1.6 * tuft.s, tuft.y - 12 * tuft.s, line(g, Math.max(1, 2.5 * tuft.s)));
      }
    }
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
  // Tourelles sur les 4 emplacements (mêmes positions que dans la simulation)
  b.turrets.forEach((t, i) => {
    if (!t.type) return;
    canvas.save();
    canvas.translate(TURRET_SPOT[i], i < 2 ? (b.age === 4 ? -175 : -158) : -118);
    drawTurret(canvas, t, b.age, team, side, time);
    canvas.restore();
  });
  // Tourbillon du temps pendant l'évolution
  if (b.evolving > 0) {
    const k = b.evolving / 1.6;
    for (let r = 0; r < 4; r++) {
      const rad = 60 + r * 50 + (1 - k) * 120;
      canvas.drawOval(Skia.XYWHRect(-rad, -80 - rad * 0.45, rad * 2, rad * 0.9), stroke(rgba(r % 2 ? '142,197,255' : '230,200,255', k), 6));
    }
  }
}

/** Position x des 4 emplacements de tourelle sur la base. */
const TURRET_SPOT = [-70, 70, -120, 120];
const TURRET_STONE = ['#8A6A4A', '#8E979E', '#7A4A2A', '#5E6670', '#C8D0E8'];

/** Une tourelle : socle selon l'époque, tête selon le type, un étage de plus par niveau. */
function drawTurret(canvas: SkCanvas, t: TurretSlot, age: number, team: (typeof TEAM)[number], side: Side, time: number) {
  const tall = 10 + t.level * 9;
  canvas.drawRRect(rr(-20, -tall, 40, tall + 8, 6), ol());
  canvas.drawRRect(rr(-17, -tall + 3, 34, tall + 2, 4), fill(TURRET_STONE[age]));
  for (let l = 1; l < t.level; l++) canvas.drawRect(Skia.XYWHRect(-17, -tall + 3 + l * 9, 34, 3), fill(team.dark));
  // Étoiles de niveau
  for (let l = 0; l < t.level; l++) canvas.drawCircle(-10 + l * 10, 2, 3, fill('#FFD25A'));
  canvas.translate(0, -tall);
  const kick = t.fire * 6;
  const aim = side === 0 ? -1 : 1;
  if (t.type === 'arrow') {
    // Baliste : arc large et carreau
    canvas.drawRRect(rr(-6, -14, 12, 16, 3), fill(team.main));
    canvas.drawPath(cached('ballista', (p) => p.moveTo(-26, -4).quadTo(0, -26, 26, -4)), line(C.outline, 6));
    canvas.drawPath(cached('ballista', (p) => p.moveTo(-26, -4).quadTo(0, -26, 26, -4)), line('#A8703A', 3.5));
    canvas.drawLine(0, -10 + kick, 0, -10 + kick + aim * 22, line('#E8ECF4', 2.5));
  } else if (t.type === 'cannon') {
    // Gros canon qui recule à chaque tir
    canvas.drawCircle(0, -10, 14, ol());
    canvas.drawCircle(0, -10, 11, fill('#3A3F4C'));
    canvas.drawRRect(rr(-7, aim < 0 ? -40 + kick : -10 - kick, 14, 30, 5), ol());
    canvas.drawRRect(rr(-5, aim < 0 ? -38 + kick : -8 - kick, 10, 26, 4), fill('#4A4F5E'));
    if (t.fire > 0.6) canvas.drawCircle(0, aim < 0 ? -44 : 24, 10 * t.fire, fill('#FFB84D'));
  } else if (t.type === 'frost') {
    // Cristal de glace qui flotte
    const bob = Math.sin(time * 3) * 3;
    canvas.drawCircle(0, -18 + bob, 18 + t.fire * 8, fill(rgba('160,230,255', 0.3)));
    canvas.drawPath(cached('crystal', (p) => p.moveTo(0, -42).lineTo(11, -18).lineTo(0, 0).lineTo(-11, -18).close()), ol());
    canvas.save();
    canvas.translate(0, bob);
    canvas.scale(0.8, 0.85);
    canvas.drawPath(cached('crystal', (p) => p.moveTo(0, -42).lineTo(11, -18).lineTo(0, 0).lineTo(-11, -18).close()), fill('#BFF0FF'));
    canvas.restore();
  } else {
    // Bobine électrique et sa boule
    for (let k = 0; k < 3; k++) canvas.drawOval(Skia.XYWHRect(-12 + k * 2, -8 - k * 9, 24 - k * 4, 8), fill(k % 2 ? '#C8962A' : '#E8B84A'));
    canvas.drawRect(Skia.XYWHRect(-2, -36, 4, 12), fill('#5A626E'));
    canvas.drawCircle(0, -40, 9, ol());
    canvas.drawCircle(0, -40, 7, fill(t.fire > 0.3 ? '#FFFFFF' : '#B8E8FF'));
    const flick = Math.sin(time * 40);
    if (flick > 0.3 || t.fire > 0) canvas.drawLine(-4, -46, -12 + flick * 3, -56, line('#E0FAFF', 2));
  }
}

// ---------- Troupes ----------

const SKIN = '#F2C39A';
const SKIN_DARK = '#D9A27A';

/** Arme selon l'époque et le type de troupe, tenue dans la main avant. */
function drawWeapon(canvas: SkCanvas, u: Unit, swing: number) {
  canvas.save();
  canvas.translate(13, -30);
  canvas.rotate(-35 + swing * 120, 0, 0);
  const a = u.age;
  if (u.kind === 'inf') {
    if (a === 0) {
      // Gros gourdin noueux
      canvas.drawRRect(rr(-3.5, -30, 7, 32, 3.5), ol());
      canvas.drawRRect(rr(-2, -29, 4, 30, 2), fill('#8A5A3A'));
      canvas.drawOval(Skia.XYWHRect(-8, -42, 16, 18), ol());
      canvas.drawOval(Skia.XYWHRect(-6.5, -40.5, 13, 15), fill('#A8704A'));
      canvas.drawCircle(-2, -36, 2, fill('#6A4A2A'));
    } else if (a === 1) {
      // Épée et garde dorée
      canvas.drawRRect(rr(-3, -40, 6, 36, 2), ol());
      canvas.drawRRect(rr(-1.8, -39, 3.6, 34, 1.5), fill('#E8ECF4'));
      canvas.drawRRect(rr(-8, -6, 16, 5, 2), fill('#C8962A'));
      canvas.drawRect(Skia.XYWHRect(-1.5, -1, 3, 8), fill('#6A4A2A'));
    } else if (a === 2) {
      // Hallebarde
      canvas.drawRect(Skia.XYWHRect(-1.8, -58, 3.6, 62), fill('#7A5A3A'));
      canvas.drawPath(cached('halb', (b) => b.moveTo(-2, -60).lineTo(0, -72).lineTo(2, -60).lineTo(10, -54).lineTo(2, -48).close()), fill('#D6DCE6'));
    } else if (a === 3) {
      // Fusil à baïonnette
      canvas.drawRRect(rr(-3, -30, 6, 32, 2), fill('#3A3F4C'));
      canvas.drawRect(Skia.XYWHRect(-1, -42, 2, 12), fill('#E8ECF4'));
      canvas.drawRect(Skia.XYWHRect(-3, -2, 6, 8), fill('#6A4A2A'));
    } else {
      // Sabre laser qui vibre
      canvas.drawRRect(rr(-3, -6, 6, 10, 2), fill('#3A3F4C'));
      canvas.drawRRect(rr(-4.5, -46, 9, 42, 4.5), fill('rgba(91,224,255,0.4)'));
      canvas.drawRRect(rr(-2, -44, 4, 38, 2), fill('#E0FAFF'));
    }
  } else if (a === 0) {
    // Fronde qui tourne
    canvas.drawLine(0, 0, 0, -18, line('#8A5A3A', 2.5));
    canvas.drawCircle(Math.cos(swing * 9) * 6, -20 + Math.sin(swing * 9) * 4, 4.5, fill('#9A9A9A'));
  } else if (a === 1) {
    // Arc tendu
    canvas.drawPath(cached('bow2', (b) => b.moveTo(-2, -32).quadTo(14, -15, -2, 2)), line(C.outline, 5));
    canvas.drawPath(cached('bow2', (b) => b.moveTo(-2, -32).quadTo(14, -15, -2, 2)), line('#A8703A', 3));
    canvas.drawLine(-2, -32, -2 - swing * 6, 2, line('#F1E3C6', 1.2));
  } else {
    const col = a === 4 ? '#E8ECF8' : a === 3 ? '#3A3F4C' : '#6A4A2A';
    canvas.drawRRect(rr(-4, -38, 8, 40, 3), ol());
    canvas.drawRRect(rr(-2.5, -36.5, 5, 37, 2), fill(col));
    if (a === 2) canvas.drawRect(Skia.XYWHRect(-2.5, -36, 5, 6), fill('#C8962A'));
    if (a === 4) canvas.drawCircle(0, -38, 4.5, fill(rgba('91,224,255', 0.6 + swing * 0.4)));
  }
  canvas.restore();
}

/** Coiffe selon l'époque. */
function drawHeadgear(canvas: SkCanvas, age: number, team: (typeof TEAM)[number], front: boolean) {
  if (age === 0) {
    // Crinière ébouriffée et os
    canvas.drawOval(Skia.XYWHRect(-15, -70, 30, 18), fill('#6A3A1A'));
    if (front) canvas.drawRRect(rr(-10, -70, 20, 4, 2), fill('#F1E3C6'));
  } else if (age === 1) {
    // Casque à nasal
    canvas.drawOval(Skia.XYWHRect(-15, -72, 30, 24), ol());
    canvas.drawOval(Skia.XYWHRect(-13.5, -70.5, 27, 21), fill('#B8C0CC'));
    canvas.drawOval(Skia.XYWHRect(-8, -69, 9, 6), fill('rgba(255,255,255,0.5)'));
    if (front) canvas.drawRect(Skia.XYWHRect(-1.8, -56, 3.6, 12), fill('#8A929E'));
    canvas.drawOval(Skia.XYWHRect(-3, -80, 6, 12), fill(team.main));
  } else if (age === 2) {
    // Tricorne à cocarde
    canvas.drawPath(cached('tricorn2', (b) => b.moveTo(-20, -58).quadTo(0, -80, 20, -58).quadTo(0, -64, -20, -58).close()), fill('#2B2238'));
    canvas.drawCircle(front ? 0 : 0, -64, 3.5, fill(team.main));
    canvas.drawPath(cached('tricornEdge', (b) => b.moveTo(-20, -58).quadTo(0, -64, 20, -58)), line('#C8962A', 2));
  } else if (age === 3) {
    // Casque de soldat
    canvas.drawOval(Skia.XYWHRect(-16, -72, 32, 22), ol());
    canvas.drawOval(Skia.XYWHRect(-14.5, -70.5, 29, 19), fill('#5E6E4A'));
    canvas.drawRRect(rr(-17, -56, 34, 5, 2.5), fill('#4A5A3A'));
    canvas.drawRect(Skia.XYWHRect(-8, -66, 16, 3), fill(team.main));
  } else {
    // Casque spatial, visière lumineuse
    canvas.drawOval(Skia.XYWHRect(-16, -74, 32, 30), ol());
    canvas.drawOval(Skia.XYWHRect(-14.5, -72.5, 29, 27), fill('#F0F2FA'));
    if (front) canvas.drawRRect(rr(-11, -63, 22, 10, 5), fill('#5BE0FF'));
    canvas.drawRect(Skia.XYWHRect(-14, -58, 28, 3), fill(team.main));
  }
}

/** Fantassin ou archer : petit soldat cartoon, de face (ennemi) ou de dos (toi). */
function drawSoldier(canvas: SkCanvas, u: Unit, time: number) {
  const team = TEAM[u.side];
  const flash = u.flash > 0.5;
  const front = u.side === 1;
  const step = Math.sin(u.walk * 10);
  const bob = Math.abs(step) * 3;
  const c = (col: string) => (flash ? '#FFFFFF' : col);
  // Jambes et bottes
  for (const [lx, o] of [[-6, step], [6, -step]] as const) {
    canvas.drawRRect(rr(lx - 5, -18 + o * 3, 10, 18, 4), ol());
    canvas.drawRRect(rr(lx - 3.5, -17 + o * 3, 7, 12, 3), fill(c(u.age === 0 ? '#8A5A3A' : u.age === 4 ? '#C8CEE0' : '#3A3F4C')));
    canvas.drawRRect(rr(lx - 4, -6 + o * 3, 8, 5, 2), fill(c(u.age === 0 ? SKIN_DARK : '#2B2238')));
  }
  canvas.translate(0, -bob);
  // Bras arrière
  canvas.drawCircle(-14, -28, 5.5, ol());
  canvas.drawCircle(-14, -28, 4, fill(c(SKIN_DARK)));
  // Écharpe aux couleurs du camp, qui flotte derrière
  if (!front) {
    const flap = Math.sin(time * 8 + u.id) * 4;
    canvas.drawPath(cached('scarf', (b) => b.moveTo(-6, -42).quadTo(-14, -26, -10, -12).lineTo(-2, -16).quadTo(-4, -28, 2, -40).close()), fill(team.dark));
    canvas.drawCircle(-10 + flap * 0.3, -12, 3, fill(team.main));
  }
  // Corps
  const body = u.age === 0 ? '#A8784A' : u.age === 1 ? '#9AA2AE' : u.age === 3 ? '#6E7A4E' : u.age === 4 ? '#F0F2FA' : team.main;
  canvas.drawRRect(rr(-14, -44, 28, 30, 11), ol());
  canvas.drawRRect(rr(-12.5, -42.5, 25, 27, 9.5), fill(c(body)));
  // Ombre douce sur un côté
  canvas.drawRRect(rr(3, -41, 8, 24, 6), fill('rgba(0,0,0,0.12)'));
  if (u.age === 0) {
    // Peau de bête tachetée, ceinture du camp
    for (const [sx, sy] of [[-6, -36], [4, -30], [-3, -24]] as const) canvas.drawCircle(sx, sy, 2.5, fill('#7A4A2A'));
    canvas.drawRect(Skia.XYWHRect(-12.5, -22, 25, 4), fill(team.main));
  } else if (u.age === 1) {
    // Tabard aux couleurs du camp sur la cotte de mailles
    canvas.drawRRect(rr(-7, -42, 14, 26, 3), fill(c(team.main)));
    canvas.drawCircle(0, -32, 3.5, fill('#FFD25A'));
  } else if (u.age === 2) {
    // Baudriers croisés et boutons dorés
    canvas.drawLine(-10, -40, 10, -20, line('#F4EEE0', 3));
    canvas.drawLine(10, -40, -10, -20, line('#F4EEE0', 3));
    canvas.drawCircle(0, -30, 2, fill('#FFD25A'));
  } else if (u.age === 3) {
    // Gilet à poches, brassard du camp
    canvas.drawRect(Skia.XYWHRect(-9, -30, 7, 6), fill('#5A6A3E'));
    canvas.drawRect(Skia.XYWHRect(2, -30, 7, 6), fill('#5A6A3E'));
    canvas.drawRect(Skia.XYWHRect(-12.5, -40, 25, 4), fill(team.main));
  } else {
    // Armure blanche, bandes lumineuses
    canvas.drawRect(Skia.XYWHRect(-12.5, -34, 25, 3), fill(team.main));
    canvas.drawCircle(0, -26, 3.5, fill(rgba('91,224,255', 0.6 + Math.sin(time * 6) * 0.3)));
  }
  // Tête
  canvas.drawCircle(0, -56, 13.5, ol());
  canvas.drawCircle(0, -56, 12, fill(c(SKIN)));
  if (front) {
    canvas.drawCircle(-4.5, -55, 3, fill('#FFFFFF'));
    canvas.drawCircle(4.5, -55, 3, fill('#FFFFFF'));
    canvas.drawCircle(-4.5, -54.2, 1.8, ol());
    canvas.drawCircle(4.5, -54.2, 1.8, ol());
    // Sourcils froncés : ils viennent pour se battre
    canvas.drawLine(-8, -60, -2, -58, line(C.outline, 2));
    canvas.drawLine(8, -60, 2, -58, line(C.outline, 2));
    canvas.drawRRect(rr(-3, -49, 6, 2.5, 1.2), ol());
  } else {
    canvas.drawOval(Skia.XYWHRect(-12, -66, 24, 18), fill(u.age === 0 ? '#6A3A1A' : '#5A3A22'));
  }
  drawHeadgear(canvas, u.age, team, front);
  // Bras avant et arme
  drawWeapon(canvas, u, u.attack);
  canvas.drawCircle(13, -30, 5.5, ol());
  canvas.drawCircle(13, -30, 4, fill(c(SKIN)));
}

/** Troupe lourde : tricératops, chevalier, canon, char, méca. */
function drawHeavy(canvas: SkCanvas, u: Unit, time: number) {
  const team = TEAM[u.side];
  const flash = u.flash > 0.5;
  const step = Math.sin(u.walk * 6);
  const front = u.side === 1;
  const c = (col: string) => (flash ? '#FFFFFF' : col);
  const shade = fill('rgba(0,0,0,0.13)');
  canvas.translate(0, -Math.abs(step) * 2);
  if (u.age === 0) {
    // Tricératops harnaché aux couleurs du camp
    for (const lx of [-24, -9, 9, 24]) {
      canvas.drawRRect(rr(lx - 6, -22 + (lx > 0 ? step : -step) * 3, 12, 22, 5), ol());
      canvas.drawRRect(rr(lx - 4.5, -21 + (lx > 0 ? step : -step) * 3, 9, 19, 4), fill(c('#5E7E3A')));
    }
    canvas.drawOval(Skia.XYWHRect(-36, -64, 72, 50), ol());
    canvas.drawOval(Skia.XYWHRect(-33, -61, 66, 44), fill(c('#7A9E4A')));
    canvas.drawOval(Skia.XYWHRect(4, -58, 26, 36), shade);
    for (let k = 0; k < 4; k++) canvas.drawCircle(-18 + k * 12, -52, 3, fill(c('#5E7E3A')));
    canvas.drawRRect(rr(-20, -50, 40, 12, 4), fill(team.main));
    if (front) {
      canvas.drawOval(Skia.XYWHRect(-30, -96, 60, 40), ol());
      canvas.drawOval(Skia.XYWHRect(-27, -93, 54, 34), fill(c('#A8C470')));
      for (let k = 0; k < 6; k++) canvas.drawCircle(-24 + k * 9.6, -92, 3, fill(c('#D06A3A')));
      canvas.drawOval(Skia.XYWHRect(-16, -66, 32, 30), ol());
      canvas.drawOval(Skia.XYWHRect(-14, -64, 28, 26), fill(c('#7A9E4A')));
      for (const hx of [-11, 11]) {
        canvas.drawPath(cached(`horn2${hx}`, (b) => b.moveTo(hx - 4, -70).lineTo(hx * 1.2, -98).lineTo(hx + 4, -70).close()), ol());
        canvas.drawPath(cached(`horn3${hx}`, (b) => b.moveTo(hx - 2.5, -71).lineTo(hx * 1.2, -95).lineTo(hx + 2.5, -71).close()), fill('#F4EEE0'));
      }
      canvas.drawCircle(-6, -56, 3, fill('#FFFFFF'));
      canvas.drawCircle(6, -56, 3, fill('#FFFFFF'));
      canvas.drawCircle(-6, -55.5, 1.8, ol());
      canvas.drawCircle(6, -55.5, 1.8, ol());
    } else {
      canvas.drawPath(cached('tail2', (b) => b.moveTo(-8, -32).quadTo(0, -2, 8, -32).close()), fill(c('#6A8E3A')));
    }
  } else if (u.age === 1) {
    // Chevalier sur son destrier caparaçonné
    for (const lx of [-13, -5, 5, 13]) canvas.drawRRect(rr(lx - 3, -24 + (lx > 0 ? step : -step) * 4, 6, 24, 2), ol());
    canvas.drawOval(Skia.XYWHRect(-24, -54, 48, 34), ol());
    canvas.drawOval(Skia.XYWHRect(-22, -52, 44, 30), fill(c('#7A4A2A')));
    canvas.drawRRect(rr(-24, -44, 48, 22, 6), fill(c(team.main)));
    for (let k = 0; k < 4; k++) canvas.drawPath(cached(`cap${k}`, (b) => b.moveTo(-24 + k * 12, -22).lineTo(-18 + k * 12, -16).lineTo(-12 + k * 12, -22).close()), fill(c(team.dark)));
    if (front) {
      canvas.drawOval(Skia.XYWHRect(-9, -70, 18, 30), ol());
      canvas.drawOval(Skia.XYWHRect(-7.5, -68.5, 15, 27), fill(c('#8A5A3A')));
      canvas.drawRect(Skia.XYWHRect(-7.5, -66, 15, 8), fill(c('#B8C0CC')));
    }
    canvas.drawRRect(rr(-12, -88, 24, 34, 9), ol());
    canvas.drawRRect(rr(-10.5, -86.5, 21, 31, 8), fill(c('#B8C0CC')));
    canvas.drawRect(Skia.XYWHRect(-10.5, -76, 21, 6), fill(team.main));
    canvas.drawOval(Skia.XYWHRect(-11, -108, 22, 24), ol());
    canvas.drawOval(Skia.XYWHRect(-9.5, -106.5, 19, 21), fill(c('#C8D0DC')));
    if (front) canvas.drawRect(Skia.XYWHRect(-7, -98, 14, 3), ol());
    canvas.drawOval(Skia.XYWHRect(-4, -122, 8, 16), fill(team.main));
    canvas.save();
    canvas.translate(14, -76);
    canvas.rotate(-55 + u.attack * 75, 0, 0);
    canvas.drawRRect(rr(-3, -64, 6, 64, 3), ol());
    canvas.drawRRect(rr(-1.8, -62, 3.6, 60, 1.8), fill('#C8A060'));
    canvas.drawPath(cached('lance', (b) => b.moveTo(-4, -62).lineTo(0, -76).lineTo(4, -62).close()), fill('#E8ECF4'));
    canvas.restore();
  } else if (u.age === 2) {
    // Canon sur affût, mèche fumante
    for (const wx of [-24, 24]) {
      canvas.drawCircle(wx, -18, 18, ol());
      canvas.drawCircle(wx, -18, 14.5, fill(c('#8A5A3A')));
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI + u.walk * 3;
        canvas.drawLine(wx - Math.cos(a) * 12, -18 - Math.sin(a) * 12, wx + Math.cos(a) * 12, -18 + Math.sin(a) * 12, line('#5A3A22', 2.5));
      }
      canvas.drawCircle(wx, -18, 4, fill('#C8962A'));
    }
    canvas.drawRRect(rr(-28, -44, 56, 22, 6), ol());
    canvas.drawRRect(rr(-26, -42, 52, 18, 5), fill(c(team.dark)));
    const recoil = u.attack * 6;
    canvas.drawCircle(0, -48 - recoil, 19, ol());
    canvas.drawCircle(0, -48 - recoil, 16, fill(c('#3A3F4C')));
    canvas.drawCircle(-5, -54 - recoil, 5, fill('rgba(255,255,255,0.25)'));
    canvas.drawRRect(rr(-18, -50 - recoil, 36, 5, 2), fill('#C8962A'));
    if (front) {
      canvas.drawCircle(0, -48 - recoil, 9, fill('#15111F'));
      if (u.attack > 0.6) canvas.drawCircle(0, -48, 20, fill(rgba('255,180,60', u.attack)));
    }
  } else if (u.age === 3) {
    // Char d'assaut à chenilles
    canvas.drawRRect(rr(-42, -26, 84, 26, 11), ol());
    canvas.drawRRect(rr(-39, -24, 78, 22, 9), fill('#2E3340'));
    for (let k = 0; k < 6; k++) canvas.drawCircle(-32 + k * 12.8, -13, 5, fill('#5E6670'));
    canvas.drawRect(Skia.XYWHRect(-39, -25 + ((u.walk * 20) % 4), 78, 2), fill('#4A4F5E'));
    canvas.drawRRect(rr(-35, -50, 70, 28, 9), ol());
    canvas.drawRRect(rr(-33, -48, 66, 24, 7), fill(c('#5E7048')));
    canvas.drawRRect(rr(10, -46, 20, 20, 5), shade);
    canvas.drawRect(Skia.XYWHRect(-33, -38, 66, 5), fill(team.main));
    canvas.drawRRect(rr(-18, -70, 36, 24, 9), ol());
    canvas.drawRRect(rr(-16, -68, 32, 20, 7), fill(c('#6E8256')));
    if (front) {
      canvas.drawCircle(0, -58, 8, ol());
      canvas.drawCircle(0, -58, 5, fill('#15111F'));
      if (u.attack > 0.6) canvas.drawCircle(0, -58, 18, fill(rgba('255,200,80', u.attack)));
    } else {
      canvas.drawRRect(rr(-4, -98, 8, 32, 3), ol());
      canvas.drawRRect(rr(-2.5, -96, 5, 28, 2), fill(c('#4E6038')));
    }
  } else {
    // Méca géant au cœur lumineux
    const glow = 0.6 + Math.sin(time * 6) * 0.3;
    for (const [lx, o] of [[-18, step], [18, -step]] as const) {
      canvas.drawRRect(rr(lx - 8, -34 + o * 4, 16, 34, 5), ol());
      canvas.drawRRect(rr(lx - 6, -32 + o * 4, 12, 30, 4), fill(c('#C8CEE0')));
      canvas.drawRRect(rr(lx - 9, -6 + o * 4, 18, 6, 3), fill('#3A3F4C'));
    }
    canvas.drawRRect(rr(-32, -84, 64, 54, 14), ol());
    canvas.drawRRect(rr(-29.5, -81.5, 59, 49, 12), fill(c('#F0F2FA')));
    canvas.drawRRect(rr(8, -78, 18, 42, 8), shade);
    canvas.drawRect(Skia.XYWHRect(-29.5, -62, 59, 6), fill(team.main));
    canvas.drawCircle(0, -50, 10, fill(rgba('91,224,255', glow)));
    canvas.drawCircle(0, -50, 5, fill('#E0FAFF'));
    canvas.drawRRect(rr(-17, -108, 34, 26, 10), ol());
    canvas.drawRRect(rr(-15, -106, 30, 22, 8), fill(c('#DDE2F0')));
    if (front) canvas.drawRRect(rr(-11, -99, 22, 8, 4), fill('#5BE0FF'));
    for (const ax of [-42, 32]) {
      canvas.drawRRect(rr(ax, -80 + (ax > 0 ? u.attack * 10 : 0), 12, 40, 5), ol());
      canvas.drawRRect(rr(ax + 2, -78 + (ax > 0 ? u.attack * 10 : 0), 8, 36, 4), fill(c('#C8CEE0')));
    }
  }
}

function drawUnit(canvas: SkCanvas, u: Unit, rage: boolean, healing: boolean, time: number) {
  const big = u.kind === 'heavy';
  canvas.drawOval(Skia.XYWHRect(big ? -40 : -18, -7, big ? 80 : 36, 14), fill('rgba(0,0,0,0.28)'));
  if (rage) canvas.drawOval(Skia.XYWHRect(big ? -46 : -24, -10, big ? 92 : 48, 20), stroke(rgba('255,90,60', 0.6 + Math.sin(time * 12) * 0.3), 3));
  if (healing) canvas.drawOval(Skia.XYWHRect(big ? -46 : -24, -10, big ? 92 : 48, 20), stroke('#7BD35A', 3));
  // Il se retourne vers sa cible quand elle est sur le côté.
  if (u.aimX < -0.35) canvas.scale(-1, 1);
  // Élan vers la cible au moment du coup
  canvas.translate(Math.abs(u.aimX) * u.attack * 8, 0);
  if (big) drawHeavy(canvas, u, time);
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

function drawTurretShot(canvas: SkCanvas, s: Shot, k: number, time: number) {
  if (s.kind === 'arrow') {
    // Carreau de baliste avec traînée
    canvas.drawLine(0, -18 * k, 0, 10 * k, line(rgba('255,255,255', 0.4), 5 * k));
    canvas.drawLine(0, -14 * k, 0, 8 * k, line('#5A3A22', Math.max(1.5, 2.5 * k)));
    canvas.drawCircle(0, 9 * k, 2.5 * k, fill('#E8ECF4'));
  } else if (s.kind === 'cannon') {
    canvas.drawCircle(0, 0, 12 * k, fill(rgba('255,180,80', 0.35)));
    canvas.drawCircle(0, 0, 8 * k, ol());
    canvas.drawCircle(0, 0, 6.5 * k, fill('#2B2238'));
    canvas.drawCircle(-2 * k, -2 * k, 2 * k, fill('rgba(255,255,255,0.5)'));
  } else {
    // Éclat de givre qui tourne
    canvas.save();
    canvas.rotate(time * 600, 0, 0);
    canvas.drawCircle(0, 0, 12 * k, fill(rgba('160,230,255', 0.4)));
    for (let a = 0; a < 3; a++) {
      canvas.rotate(60, 0, 0);
      canvas.drawLine(0, -9 * k, 0, 9 * k, line('#E8FAFF', Math.max(1.5, 3 * k)));
    }
    canvas.restore();
  }
}

/** Éclair brisé entre deux points. */
function drawBolt(canvas: SkCanvas, proj: Projection, bo: Bolt) {
  const a = proj.at(bo.z1, bo.x1, bo.h1);
  const b = proj.at(bo.z2, bo.x2, bo.h2);
  if (!a || !b) return;
  const alpha = Math.min(1, bo.life / 0.15);
  const pb = Skia.PathBuilder.Make();
  pb.moveTo(a.x, a.y);
  const n = 6;
  for (let i = 1; i < n; i++) {
    const t = i / n;
    pb.lineTo(a.x + (b.x - a.x) * t + (Math.random() - 0.5) * 22, a.y + (b.y - a.y) * t + (Math.random() - 0.5) * 22);
  }
  pb.lineTo(b.x, b.y);
  const path = pb.build();
  canvas.drawPath(path, line(rgba('120,200,255', alpha * 0.5), 9));
  canvas.drawPath(path, line(rgba('255,255,255', alpha), 3));
  canvas.drawCircle(b.x, b.y, 14 * alpha, fill(rgba('200,240,255', alpha * 0.6)));
}

/**
 * Élimination stylisée selon l'époque de l'arme :
 * 0 assommé (il tourne sur lui-même avec des étoiles), 1 tranché (une croix blanche, puis il tombe),
 * 2 enfumé (nuage de poudre), 3 soufflé (projeté en l'air dans une explosion), 4 désintégré (en pixels).
 */
function drawCorpse(canvas: SkCanvas, cp: Corpse, time: number) {
  const t = cp.t;
  const u = { ...cp.unit, attack: 0 };
  const dir = cp.unit.side === 0 ? -1 : 1;
  const alpha = t < 0.8 ? 1 : Math.max(0, 1 - (t - 0.8) / 0.6);
  const team = TEAM[cp.unit.side];
  const style = cp.style;
  if (style === 3) {
    // Explosion : boule de feu, il s'envole en tournoyant
    const up = Math.sin(Math.min(1, t / 0.9) * Math.PI) * 90;
    if (t < 0.5) {
      const r = 20 + t * 140;
      canvas.drawCircle(0, -30, r, fill(rgba('255,140,40', 0.7 - t)));
      canvas.drawCircle(0, -30, r * 0.6, fill(rgba('255,230,120', 0.9 - t * 1.6)));
    }
    canvas.saveLayer(layerAlphaPaint(alpha));
    canvas.translate(dir * t * 60, -up);
    canvas.rotate(dir * t * 540, 0, -40);
    drawUnit(canvas, { ...u, flash: Math.max(0, 1 - t * 3) }, false, false, time);
    canvas.restore();
    return;
  }
  if (style === 4) {
    // Désintégration : il se dissout en carrés lumineux qui montent
    const k = Math.min(1, t / 0.5);
    if (k < 1) {
      canvas.saveLayer(layerAlphaPaint(1 - k));
      drawUnit(canvas, { ...u, flash: 1 }, false, false, time);
      canvas.restore();
    }
    for (let i = 0; i < 14; i++) {
      const sx = ((i * 37) % 30) - 15;
      const sy = -((i * 53) % 70) - 5;
      const rise = t * (40 + (i % 5) * 18);
      const sz = 6 * (1 - Math.min(1, t / 1.3));
      if (sz <= 0) continue;
      canvas.drawRect(Skia.XYWHRect(sx + Math.sin(t * 6 + i) * 6, sy - rise, sz, sz), fill(i % 3 ? team.light : '#E0FAFF'));
    }
    return;
  }
  const fall = Math.min(1, t / 0.35);
  canvas.saveLayer(layerAlphaPaint(alpha));
  if (style === 0) {
    // Assommé : il tourne, puis tombe
    const spin = Math.min(1, t / 0.5);
    canvas.rotate(dir * (spin * 360 * 0.5 + Math.min(1, Math.max(0, t - 0.4) / 0.3) * 80), 0, -20);
  } else {
    canvas.rotate(dir * fall * 85, 0, 0);
  }
  drawUnit(canvas, { ...u, flash: 1 - fall }, false, false, time);
  canvas.restore();
  if (style === 0) {
    // Étoiles qui tournent au-dessus de la tête
    for (let i = 0; i < 3; i++) {
      const a = time * 6 + (i * Math.PI * 2) / 3;
      const x = Math.cos(a) * 18;
      const y = -78 + Math.sin(a) * 6;
      const r = 5 * alpha;
      canvas.save();
      canvas.translate(x, y);
      canvas.scale(r / 5, r / 5);
      canvas.drawPath(starPath(), fill('#FFE14D'));
      canvas.restore();
    }
  } else if (style === 1 && t < 0.4) {
    // Croix de coups d'épée
    const k = 1 - t / 0.4;
    const w = 36;
    canvas.drawLine(-w / 2, -60, w / 2, -10, line(rgba('255,255,255', k), 6));
    canvas.drawLine(w / 2, -60, -w / 2, -10, line(rgba('255,255,255', k), 6));
    canvas.drawLine(-w / 2, -60, w / 2, -10, line(rgba('255,90,90', k), 2));
  } else if (style === 2) {
    // Nuage de poudre
    for (let i = 0; i < 5; i++) {
      const r = (10 + i * 4) * (0.5 + t);
      canvas.drawCircle(((i * 23) % 40) - 20, -40 - t * 30 - i * 6, r, fill(rgba('210,210,215', Math.max(0, 0.6 - t * 0.45))));
    }
  }
}

let star: SkPath | null = null;
function starPath() {
  if (!star) {
    const b = Skia.PathBuilder.Make();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 2.2 : 5;
      const a = (i * Math.PI) / 5 - Math.PI / 2;
      if (i === 0) b.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else b.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    b.close();
    star = b.build();
  }
  return star;
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

/** Brume au loin : les choses lointaines se fondent dans la couleur du ciel. */
function drawHaze(canvas: SkCanvas, state: EpochState, W: number, H: number) {
  const sky = AGE_THEMES[state.bases[0].age].sky[1];
  const hor = H * HORIZON;
  const depth = H * 0.16;
  const bands = 8;
  for (let i = 0; i < bands; i++) {
    const a = 0.42 * (1 - i / bands);
    const paint = fill(sky);
    paint.setAlphaf(a);
    canvas.drawRect(Skia.XYWHRect(0, hor + (depth * i) / bands, W, depth / bands + 1), paint);
    paint.setAlphaf(1);
  }
}

const alphaPaints = new Map<number, SkPaint>();
function layerAlphaPaint(a: number): SkPaint {
  const key = Math.round(a * 20);
  let p = alphaPaints.get(key);
  if (!p) {
    p = Skia.Paint();
    p.setAlphaf(key / 20);
    alphaPaints.set(key, p);
  }
  return p;
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
        const us = p.s * (u.kind === 'heavy' ? 1.15 : 1) * (1 + u.age * 0.06);
        canvas.scale(us, us);
        // Élan vers l'avant ou l'arrière, selon où est la cible
        canvas.translate(0, -u.aimZ * u.attack * 5 * p.s);
        drawUnit(canvas, u, state.bases[u.side].rage > 0, state.bases[u.side].healing > 0, state.time);
        canvas.restore();
        if (u.hp < u.maxHp) {
          const w = 30 * p.s;
          const y = p.y - (u.kind === 'heavy' ? 140 : 90) * p.s;
          canvas.drawRect(Skia.XYWHRect(p.x - w / 2 - 1, y - 1, w + 2, 6), fill('#2B2238'));
          canvas.drawRect(Skia.XYWHRect(p.x - w / 2, y, w * Math.max(0, u.hp / u.maxHp), 4), fill(TEAM[u.side].light));
        }
      },
    });
  }
  // Troupes éliminées : chaque époque d'arme a sa façon de mettre K.O.
  for (const cp of state.corpses) {
    items.push({
      z: cp.unit.z,
      draw: () => {
        const p = proj.at(cp.unit.z, cp.unit.x);
        if (!p) return;
        canvas.save();
        canvas.translate(p.x, p.y);
        const k = p.s * (cp.unit.kind === 'heavy' ? 1.15 : 1) * (1 + cp.unit.age * 0.06);
        canvas.scale(k, k);
        drawCorpse(canvas, cp, state.time);
        canvas.restore();
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
  drawHaze(canvas, state, W, H);

  // Projectiles
  for (const s of state.shots) {
    const p = proj.at(s.z, s.x, s.h);
    if (!p) continue;
    canvas.save();
    canvas.translate(p.x, p.y);
    if (s.kind) drawTurretShot(canvas, s, p.s, state.time);
    else drawShotLook(canvas, s.age, s.big, p.s);
    canvas.restore();
  }
  // Éclairs des tourelles de foudre
  for (const bo of state.bolts) drawBolt(canvas, proj, bo);
  // Traces des coups au corps à corps
  for (const sl of state.slashes) {
    const p = proj.at(sl.z, sl.x, 34);
    if (!p) continue;
    const k = sl.life / 0.25;
    const r = (14 + (1 - k) * 16) * p.s;
    canvas.drawArc(Skia.XYWHRect(p.x - r, p.y - r, r * 2, r * 2), sl.side === 0 ? 200 : 20, 140, false, line(rgba('255,255,255', k), Math.max(1.5, 4 * p.s)));
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
