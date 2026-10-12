import { useCallback, useState } from 'react';
import { Platform, View } from 'react-native';
import { useMeta } from '../meta/useMeta';
import { runBonuses } from '../meta/upgrades';
import { GameScreen } from './GameScreen';
import { MenuScreen } from './MenuScreen';

/** Accueil (âmes, améliorations) ↔ partie. */
export function Root() {
  const meta = useMeta();
  // Raccourcis de test dans le navigateur (#nuit, #boss...) : on lance directement la partie.
  const [screen, setScreen] = useState<'menu' | 'game'>(() =>
    Platform.OS === 'web' && typeof window !== 'undefined' && window.location.hash.length > 1 ? 'game' : 'menu',
  );
  const [run, setRun] = useState(0);

  const play = useCallback(() => {
    setRun((r) => r + 1);
    setScreen('game');
  }, []);

  if (!meta.loaded) return <View style={{ flex: 1, backgroundColor: '#1E3B2E' }} />;
  if (screen === 'menu') return <MenuScreen meta={meta} onPlay={play} />;
  return (
    <GameScreen
      key={run}
      mods={runBonuses(meta.meta)}
      onGameOver={meta.recordRun}
      onRetry={play}
      onMenu={() => setScreen('menu')}
    />
  );
}
