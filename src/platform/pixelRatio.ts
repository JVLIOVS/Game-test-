import { Platform } from 'react-native';

// Sur le web, un iPhone récent affiche 3 pixels par point : le jeu dessinerait alors 9 fois plus de
// pixels qu'à l'écran d'un ordinateur. On limite à 1,5 : les dessins arrondis restent nets, et chaque
// image coûte 4 fois moins qu'en pleine résolution (un tiers de moins qu'à 2).
// Ce fichier doit être importé avant tout le reste (voir index.ts).
const MAX_RATIO = 1.5;

if (Platform.OS === 'web' && typeof window !== 'undefined' && window.devicePixelRatio > MAX_RATIO) {
  try {
    Object.defineProperty(window, 'devicePixelRatio', { get: () => MAX_RATIO, configurable: true });
  } catch {
    // tant pis : on garde la résolution d'origine
  }
}
