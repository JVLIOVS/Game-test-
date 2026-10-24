import { Platform } from 'react-native';

// Sur le web, un iPhone récent affiche 3 pixels par point : le jeu dessinerait alors 9 fois plus de
// pixels qu'à l'écran d'un ordinateur. On limite à 2, la différence ne se voit pas et tout va bien plus vite.
// Ce fichier doit être importé avant tout le reste (voir index.ts).
const MAX_RATIO = 2;

if (Platform.OS === 'web' && typeof window !== 'undefined' && window.devicePixelRatio > MAX_RATIO) {
  try {
    Object.defineProperty(window, 'devicePixelRatio', { get: () => MAX_RATIO, configurable: true });
  } catch {
    // tant pis : on garde la résolution d'origine
  }
}
