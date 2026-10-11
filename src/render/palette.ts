import { PaintStyle, Skia, type SkPaint } from '@shopify/react-native-skia';
import { WORLDS, type WorldDef } from '../game/data/worlds';

// Palette cartoon : couleurs saturées, contours sombres.
export const PALETTE = {
  void: '#1E5B3A',
  grass: '#7BD35A',
  grassDark: '#6BC24C',
  grassLight: '#93E06C',
  dirt: '#D9B77A',
  dirtDark: '#C9A266',
  tuft: '#58AE3E',
  flowers: ['#FF6B9A', '#FFE14D', '#FFFFFF', '#8EC5FF'],
  pebble: '#B9C1C6',
  outline: '#2B2238',
  shadow: 'rgba(20, 40, 20, 0.22)',
  trunk: '#9B5E2E',
  trunkLight: '#B87842',
  stumpTop: '#E3B57A',
  canopies: [
    ['#3FA83A', '#5BC94F', '#8BE05A'],
    ['#2E9447', '#43B25A', '#74D47A'],
    ['#4FA32E', '#6CC23C', '#A6E35C'],
  ],
  skin: '#FFCE9E',
  shirt: '#FF7A3D',
  shirtDark: '#E05A22',
  pants: '#4A5BD6',
  hair: '#5A3420',
  white: '#FFFFFF',
  axeHandle: '#8A5A33',
  axeHeads: ['#D7DEE6', '#D7DEE6', '#8EC5FF', '#FFD25A'],
  zombieSkin: ['#8FCB5A', '#9BD07A', '#7DB85E'],
  zombieShirt: ['#7A5AA6', '#A65A5A', '#4F7FA6'],
  zombiePants: '#5B4B3A',
  bossSkin: '#6FA84A',
  bossShirt: '#3B2A5C',
  gem: '#5BE0FF',
  gemBig: '#C77DFF',
  bolt: '#FFF6B0',
  boltGlow: 'rgba(160,220,255,0.6)',
  boltStorm: '#E6D2FF',
  boltGlowStorm: 'rgba(170,120,255,0.65)',
  fireGlow: 'rgba(255,140,40,0.45)',
  iceGlow: 'rgba(91,224,255,0.5)',
  zombieEye: '#FFE14D',
  plank: '#C88A4E',
  plankDark: '#A86D38',
  straw: '#F2C94C',
  strawDark: '#D9A92E',
  roofRed: '#E0533D',
  roofRedDark: '#B83E2C',
  roofBlue: '#4E7BD6',
  roofBlueDark: '#3A5FB0',
  stone: '#B9C1C6',
  stoneDark: '#8E979E',
  window: '#FFE7A0',
  door: '#5A3420',
  flag: '#FF5A5A',
  chest: '#B8733A',
  chestBand: '#FFD25A',
  hpBack: 'rgba(43,34,56,0.85)',
  hpHero: '#7BD35A',
  hpEnemy: '#FF5A5A',
  hpBuilding: '#FFD25A',
  padFill: 'rgba(255,255,255,0.22)',
  padFillActive: 'rgba(255,255,255,0.38)',
  padProgress: 'rgba(255,210,90,0.75)',
  padStroke: '#FFFFFF',
  arrow: '#6B4423',
  night: 'rgba(12,18,52,0.78)',
  nightClear: 'rgba(12,18,52,0)',
  glow: 'rgba(255,170,60,0.35)',
  glowClear: 'rgba(255,170,60,0)',
  joystickBase: 'rgba(255,255,255,0.22)',
  joystickRing: 'rgba(255,255,255,0.55)',
  joystickKnob: 'rgba(255,255,255,0.9)',
} as const;

const fills = new Map<string, SkPaint>();
const strokes = new Map<string, SkPaint>();

/** Pinceaux réutilisés (créer un SkPaint à chaque image coûte cher). */
export function fill(color: string): SkPaint {
  let p = fills.get(color);
  if (!p) {
    p = Skia.Paint();
    p.setAntiAlias(true);
    p.setColor(Skia.Color(color));
    fills.set(color, p);
  }
  return p;
}

export function stroke(color: string, width: number): SkPaint {
  const key = `${color}|${width}`;
  let p = strokes.get(key);
  if (!p) {
    p = Skia.Paint();
    p.setAntiAlias(true);
    p.setStyle(PaintStyle.Stroke);
    p.setStrokeWidth(width);
    p.setColor(Skia.Color(color));
    strokes.set(key, p);
  }
  return p;
}

const alphaPaints = new Map<number, SkPaint>();
/** Pinceau pour saveLayer avec transparence (arrondi au 1/20). */
export function layerAlpha(alpha: number): SkPaint {
  const key = Math.round(alpha * 20);
  let p = alphaPaints.get(key);
  if (!p) {
    p = Skia.Paint();
    p.setAlphaf(key / 20);
    alphaPaints.set(key, p);
  }
  return p;
}


let theme: WorldDef = WORLDS[0];
/** Le monde courant donne ses couleurs au décor (sol, arbres, bâtiments, zombies). */
export const setTheme = (t: WorldDef) => {
  theme = t;
};
export const THEME = () => theme;
