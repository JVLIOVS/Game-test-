import { Skia, type SkCanvas, type SkFont } from '@shopify/react-native-skia';
import type { FloatingText, Particle, Projectile } from '../game/types';
import { PALETTE as C, fill, stroke } from './palette';
import { drawSprite } from './spriteCache';
import { drawLogIcon } from './sprites';

// Effets communs à tous les modes : particules, chiffres qui sautent, projectiles.

const fontIds = new WeakMap<SkFont, number>();
const widths = new Map<string, number>();

/**
 * Texte avec un contour sombre. Le contour d'un texte coûte très cher à dessiner sur téléphone :
 * chaque texte est donc dessiné une fois dans une image (cache), puis recopié.
 */
export function drawOutlinedText(canvas: SkCanvas, text: string, x: number, y: number, font: SkFont, color: string, alpha = 1) {
  let id = fontIds.get(font);
  if (id === undefined) {
    id = Math.random();
    fontIds.set(font, id);
  }
  const wkey = `${id}|${text}`;
  let w = widths.get(wkey);
  if (w === undefined) {
    w = font.getTextWidth(text);
    if (widths.size > 2000) widths.clear();
    widths.set(wkey, w);
  }
  const size = font.getSize();
  const tw = w;
  drawSprite(canvas, `txt|${wkey}|${color}`, x, y, [-tw / 2 - 5, -size - 4, tw + 10, size * 1.45 + 8], (c) => drawOutlinedTextNow(c, text, 0, 0, font, color, tw), { alpha, group: 'text' });
  return w;
}

function drawOutlinedTextNow(canvas: SkCanvas, text: string, x: number, y: number, font: SkFont, color: string, w: number) {
  canvas.drawText(text, x - w / 2, y, stroke(C.outline, 5), font);
  canvas.drawText(text, x - w / 2, y, fill(color), font);
}

export function drawParticles(canvas: SkCanvas, particles: Particle[], visible: (x: number, y: number) => boolean) {
  for (const p of particles) {
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
}

export function drawFloatingTexts(canvas: SkCanvas, texts: FloatingText[], font: SkFont) {
  for (const tx of texts) {
    const k = 1 - tx.life / tx.maxLife;
    const pop = (k < 0.15 ? 0.5 + (k / 0.15) * 0.8 : 1.3 - Math.min(0.3, (k - 0.15) * 1.5)) * tx.size;
    const alpha = Math.min(1, tx.life / (tx.maxLife * 0.35));
    canvas.save();
    canvas.translate(tx.x, tx.y - tx.z);
    canvas.scale(pop, pop);
    if (tx.log) {
      const w = drawOutlinedText(canvas, tx.text, -8, 8, font, tx.color, alpha);
      drawLogIcon(canvas, w / 2 + 6, 0, 0.9);
    } else {
      drawOutlinedText(canvas, tx.text, 0, 8, font, tx.color, alpha);
    }
    canvas.restore();
  }
}

/** Flèches, carreaux, boulets et orbes : l'apparence suit l'arme qui tire. */
export function drawProjectile(canvas: SkCanvas, p: Projectile) {
  if (p.style === 'cannon') {
    canvas.drawCircle(p.x, p.y, 7, fill(C.outline));
    canvas.drawCircle(p.x - 2, p.y - 2, 2, fill(C.white));
    return;
  }
  if (p.style === 'magic') {
    canvas.drawCircle(p.x, p.y, 13, fill('rgba(91,224,255,0.35)'));
    canvas.drawCircle(p.x, p.y, 7, fill('#5BE0FF'));
    canvas.drawCircle(p.x - 2, p.y - 2, 3, fill(C.white));
    return;
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
