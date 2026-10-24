import { Platform } from 'react-native';

// Mesure du temps de calcul de chaque image (simulation, dessin, interface), dans le navigateur avec #perf.
const enabled = Platform.OS === 'web' && typeof window !== 'undefined' && window.location.hash.includes('perf');
const sums: Record<string, number> = {};
let frames = 0;
let last = 0;

export const perf = {
  enabled,
  time<T>(label: string, fn: () => T): T {
    if (!enabled) return fn();
    const t0 = performance.now();
    const r = fn();
    sums[label] = (sums[label] ?? 0) + performance.now() - t0;
    return r;
  },
  frame() {
    if (!enabled) return;
    frames++;
    const now = performance.now();
    if (now - last > 3000) {
      const parts = Object.entries(sums).map(([k, v]) => `${k} ${(v / frames).toFixed(2)} ms`);
      // eslint-disable-next-line no-console
      console.log(`[perf] ${(frames / ((now - last) / 1000)).toFixed(0)} img/s · ${parts.join(' · ')}`);
      for (const k of Object.keys(sums)) sums[k] = 0;
      frames = 0;
      last = now;
    }
  },
};
