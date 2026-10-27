import { FilterMode, MipmapMode, Skia, type SkCanvas, type SkImage, type SkPaint, type SkSurface } from '@shopify/react-native-skia';

// Cache d'images : un personnage est dessiné une seule fois (forme par forme) dans une petite image,
// puis on recopie l'image à chaque frame. Une image se dessine en une seule opération, alors qu'un
// zombie en demande une cinquantaine : c'est ce qui rend les modes chargés fluides sur téléphone.
// Les animations (marche, recul, orientation) sont découpées en quelques poses, une image par pose.

/** Pixels par unité du jeu dans les images (l'écran en affiche environ 1,4). */
const RES = 1.6;
const SCRATCH = 512;

// Au-delà de la limite, on oublie les images les moins récemment utilisées.
// Deux caches : les textes (chiffres de dégâts, tous différents) ne doivent pas chasser les personnages.
const caches = { sprite: new Map<string, SkImage>(), text: new Map<string, SkImage>() };
const LIMITS = { sprite: 500, text: 250 };
let scratch: SkSurface | null | undefined;
const clearColor = Skia.Color('transparent');
const paints = new Map<number, SkPaint>();
function alphaPaint(alpha: number) {
  const k = Math.round(Math.max(0, Math.min(1, alpha)) * 20);
  let p = paints.get(k);
  if (!p) {
    p = Skia.Paint();
    p.setAlphaf(k / 20);
    paints.set(k, p);
  }
  return p;
}

function surface() {
  if (scratch === undefined) {
    try {
      scratch = Skia.Surface.Make(SCRATCH, SCRATCH);
    } catch {
      scratch = null;
    }
  }
  return scratch;
}

/**
 * Dessine un personnage depuis le cache. `bounds` (gauche, haut, largeur, hauteur) entoure le dessin
 * autour de son point d'ancrage (x, y) ; `draw` le dessine avec l'ancrage en (0, 0).
 */
export function drawSprite(
  canvas: SkCanvas,
  key: string,
  x: number,
  y: number,
  bounds: readonly [number, number, number, number],
  draw: (c: SkCanvas) => void,
  opts: { res?: number; alpha?: number; group?: 'sprite' | 'text' } = {},
) {
  const [l, t, w, h] = bounds;
  const res = opts.res ?? RES;
  const group = opts.group ?? 'sprite';
  const sprites = caches[group];
  const max = LIMITS[group];
  let img = sprites.get(key);
  if (img) {
    sprites.delete(key);
    sprites.set(key, img);
  } else {
    const surf = surface();
    const pw = Math.ceil(w * res);
    const ph = Math.ceil(h * res);
    if (!surf || pw > SCRATCH || ph > SCRATCH) {
      // Trop grand ou pas de surface : dessin direct.
      canvas.save();
      canvas.translate(x, y);
      if (opts.alpha !== undefined && opts.alpha < 1) canvas.saveLayer(alphaPaint(opts.alpha));
      draw(canvas);
      if (opts.alpha !== undefined && opts.alpha < 1) canvas.restore();
      canvas.restore();
      return;
    }
    if (sprites.size >= max) {
      // Les plus anciennes sont en tête (chaque image utilisée est remise en fin de liste).
      let n = max / 4;
      for (const [k, old] of sprites) {
        if (n-- <= 0) break;
        old.dispose?.();
        sprites.delete(k);
      }
    }
    const c = surf.getCanvas();
    c.clear(clearColor);
    c.save();
    c.scale(res, res);
    c.translate(-l, -t);
    draw(c);
    c.restore();
    surf.flush();
    img = surf.makeImageSnapshot(Skia.XYWHRect(0, 0, pw, ph));
    sprites.set(key, img);
  }
  canvas.drawImageRectOptions(img, Skia.XYWHRect(0, 0, img.width(), img.height()), Skia.XYWHRect(x + l, y + t, w, h), FilterMode.Linear, MipmapMode.None, alphaPaint(opts.alpha ?? 1));
}

/** Numéro de pose (0 à n-1) d'une animation cyclique. */
export function poseOf(angle: number, n = 8) {
  const k = Math.floor((angle / (Math.PI * 2)) * n) % n;
  return k < 0 ? k + n : k;
}
