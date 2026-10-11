import { PaintStyle, Skia, type SkPaint } from '@shopify/react-native-skia';

// Palette cartoon : couleurs saturées, contours sombres.
export const PALETTE = {
  void: '#1E5B3A',
  grass: '#7BD35A',
  grassDark: '#6BC24C',
  grassLight: '#93E06C',
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
  axeHead: '#D7DEE6',
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
