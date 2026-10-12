import { useCallback, useState } from 'react';
import { Platform, View } from 'react-native';
import { useMeta } from '../meta/useMeta';
import { runBonuses } from '../meta/upgrades';
import { GameScreen } from './GameScreen';
import { MenuScreen } from './MenuScreen';
import { RefugeScreen } from './RefugeScreen';

export type Mode = 'waves' | 'refuge';
type Screen = 'menu' | Mode;

/** Raccourcis de test dans le navigateur : #refuge lance le mode Refuges, les autres (#nuit, #boss...) le mode Vagues. */
function initialScreen(): Screen {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || window.location.hash.length <= 1) return 'menu';
  return window.location.hash.includes('refuge') ? 'refuge' : 'waves';
}

/** Accueil (choix du mode, âmes, améliorations) ↔ partie. */
export function Root() {
  const meta = useMeta();
  const [screen, setScreen] = useState<Screen>(initialScreen);
  const [run, setRun] = useState(0);

  const play = useCallback((mode: Mode) => {
    setRun((r) => r + 1);
    setScreen(mode);
  }, []);
  const home = useCallback(() => setScreen('menu'), []);

  if (!meta.loaded) return <View style={{ flex: 1, backgroundColor: '#1E3B2E' }} />;
  if (screen === 'menu') return <MenuScreen meta={meta} onPlay={play} />;
  if (screen === 'refuge') return <RefugeScreen key={run} onFinish={meta.recordSouls} onRetry={() => play('refuge')} onMenu={home} />;
  return <GameScreen key={run} mods={runBonuses(meta.meta)} onGameOver={meta.recordRun} onRetry={() => play('waves')} onMenu={home} />;
}
