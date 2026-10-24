import { useCallback, useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { runBonuses } from '../meta/upgrades';
import { useMeta } from '../meta/useMeta';
import { audio } from '../platform/audio';
import type { RefugeSetup } from '../modes/refuge/sim';
import { EpochScreen } from './EpochScreen';
import { GameScreen } from './GameScreen';
import { MenuScreen } from './MenuScreen';
import { RefugeLobby } from './RefugeLobby';
import { RefugeScreen } from './RefugeScreen';

export type Mode = 'waves' | 'refuge' | 'epoch';
type Screen = 'menu' | 'waves' | 'refugeLobby' | 'refuge' | 'epoch';

/**
 * Dans le navigateur, l'adresse peut lancer un mode directement :
 * #epoque (mode Époques), #refuge (choix du camp), #refuge-jeu (survivant), #refuge-demon (Démon), #refuge-vitrine, sinon le mode Vagues.
 */
function fromHash(): { screen: Screen; setup: RefugeSetup } {
  const setup: RefugeSetup = { role: 'survivor', character: 'mecano' };
  if (Platform.OS !== 'web' || typeof window === 'undefined' || window.location.hash.length <= 1) return { screen: 'menu', setup };
  const hash = window.location.hash.toLowerCase();
  if (hash.includes('epoque')) return { screen: 'epoch', setup };
  if (!hash.includes('refuge')) return { screen: 'waves', setup };
  if (hash.includes('demon')) return { screen: 'refuge', setup: { ...setup, role: 'demon' } };
  if (['jeu', 'vitrine', 'roue', 'roi', 'devore'].some((k) => hash.includes(k))) return { screen: 'refuge', setup };
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
    setScreen(mode === 'refuge' ? 'refugeLobby' : mode);
  }, []);
  const startRefuge = useCallback((s: RefugeSetup) => {
    setSetup(s);
    setRun((r) => r + 1);
    setScreen('refuge');
  }, []);
  const home = useCallback(() => setScreen('menu'), []);

  useEffect(() => {
    void audio.init();
  }, []);
  // Musique de l'accueil et du choix du camp (chaque mode lance la sienne).
  useEffect(() => {
    if (screen === 'menu' || screen === 'refugeLobby') audio.music('menu');
  }, [screen]);

  let content;
  if (!meta.loaded) content = <View style={{ flex: 1, backgroundColor: '#1E3B2E' }} />;
  else if (screen === 'menu') content = <MenuScreen meta={meta} onPlay={play} />;
  else if (screen === 'refugeLobby') content = <RefugeLobby initial={setup} onStart={startRefuge} onBack={home} />;
  else if (screen === 'epoch') content = <EpochScreen key={run} onFinish={meta.recordSouls} onRetry={() => play('epoch')} onMenu={home} />;
  else if (screen === 'refuge') content = <RefugeScreen key={run} setup={setup} onFinish={meta.recordSouls} onRetry={() => startRefuge(setup)} onMenu={home} />;
  else content = <GameScreen key={run} mods={runBonuses(meta.meta)} onGameOver={meta.recordRun} onRetry={() => play('waves')} onMenu={home} />;
  // Sur le web, le son ne peut démarrer qu'après un premier toucher.
  return (
    <View style={{ flex: 1 }} onTouchStart={() => audio.unlock()} onPointerDown={() => audio.unlock()}>
      {content}
    </View>
  );
}
