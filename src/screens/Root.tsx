import { useCallback, useState } from 'react';
import { Platform, View } from 'react-native';
import { runBonuses } from '../meta/upgrades';
import { useMeta } from '../meta/useMeta';
import type { RefugeSetup } from '../modes/refuge/sim';
import { GameScreen } from './GameScreen';
import { MenuScreen } from './MenuScreen';
import { RefugeLobby } from './RefugeLobby';
import { RefugeScreen } from './RefugeScreen';

export type Mode = 'waves' | 'refuge';
type Screen = 'menu' | 'waves' | 'refugeLobby' | 'refuge';

/**
 * Dans le navigateur, l'adresse peut lancer un mode directement :
 * #refuge (choix du camp), #refuge-jeu (survivant), #refuge-demon (Démon), #refuge-vitrine, sinon le mode Vagues.
 */
function fromHash(): { screen: Screen; setup: RefugeSetup } {
  const setup: RefugeSetup = { role: 'survivor', character: 'mecano' };
  if (Platform.OS !== 'web' || typeof window === 'undefined' || window.location.hash.length <= 1) return { screen: 'menu', setup };
  const hash = window.location.hash.toLowerCase();
  if (!hash.includes('refuge')) return { screen: 'waves', setup };
  if (hash.includes('demon')) return { screen: 'refuge', setup: { ...setup, role: 'demon' } };
  if (hash.includes('jeu') || hash.includes('vitrine') || hash.includes('roue')) return { screen: 'refuge', setup };
  return { screen: 'refugeLobby', setup };
}

export function Root() {
  const meta = useMeta();
  const [initial] = useState(fromHash);
  const [screen, setScreen] = useState<Screen>(initial.screen);
  const [setup, setSetup] = useState<RefugeSetup>(initial.setup);
  const [run, setRun] = useState(0);
  const play = useCallback((mode: Mode) => {
    setRun((r) => r + 1);
    setScreen(mode === 'refuge' ? 'refugeLobby' : 'waves');
  }, []);
  const startRefuge = useCallback((s: RefugeSetup) => {
    setSetup(s);
    setRun((r) => r + 1);
    setScreen('refuge');
  }, []);
  const home = useCallback(() => setScreen('menu'), []);

  if (!meta.loaded) return <View style={{ flex: 1, backgroundColor: '#1E3B2E' }} />;
  if (screen === 'menu') return <MenuScreen meta={meta} onPlay={play} />;
  if (screen === 'refugeLobby') return <RefugeLobby initial={setup} onStart={startRefuge} onBack={home} />;
  if (screen === 'refuge') return <RefugeScreen key={run} setup={setup} onFinish={meta.recordSouls} onRetry={() => startRefuge(setup)} onMenu={home} />;
  return <GameScreen key={run} mods={runBonuses(meta.meta)} onGameOver={meta.recordRun} onRetry={() => play('waves')} onMenu={home} />;
}
