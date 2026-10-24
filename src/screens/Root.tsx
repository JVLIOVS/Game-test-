import { useCallback, useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { runBonuses } from '../meta/upgrades';
import { useMeta } from '../meta/useMeta';
import { audio } from '../platform/audio';
import type { EpochSetup } from '../modes/epoch/sim';
import type { RefugeSetup } from '../modes/refuge/sim';
import { EpochLobby } from './EpochLobby';
import { EpochScreen } from './EpochScreen';
import { GameScreen } from './GameScreen';
import { MenuScreen } from './MenuScreen';
import { RefugeLobby } from './RefugeLobby';
import { RefugeScreen } from './RefugeScreen';

export type Mode = 'waves' | 'refuge' | 'epoch';
type Screen = 'menu' | 'waves' | 'refugeLobby' | 'refuge' | 'epochLobby' | 'epoch';

/**
 * Dans le navigateur, l'adresse peut lancer un mode directement :
 * #epoque (choix de l'adversaire), #epoque-jeu, #epoque-hardcore, #epoque-duel…, #refuge (choix du camp), #refuge-jeu (survivant), #refuge-demon (Démon), #refuge-vitrine, sinon le mode Vagues.
 */
const EPOCH_DEFAULT: EpochSetup = { difficulty: 'normal', aiSides: [1] };

function fromHash(): { screen: Screen; setup: RefugeSetup; epoch: EpochSetup } {
  const setup: RefugeSetup = { role: 'survivor', character: 'mecano' };
  const epoch = EPOCH_DEFAULT;
  if (Platform.OS !== 'web' || typeof window === 'undefined' || window.location.hash.length <= 1) return { screen: 'menu', setup, epoch };
  const hash = window.location.hash.toLowerCase();
  if (hash.includes('epoque')) {
    const difficulty = (['easy', 'hard', 'hardcore'] as const).find((d) => hash.includes(d)) ?? (hash.includes('facile') ? 'easy' : 'normal');
    const e: EpochSetup = { difficulty: hash.includes('hardcore') ? 'hardcore' : difficulty, aiSides: hash.includes('duel') ? [] : [1] };
    return { screen: hash === '#epoque' ? 'epochLobby' : 'epoch', setup, epoch: e };
  }
  if (!hash.includes('refuge')) return { screen: 'waves', setup, epoch };
  if (hash.includes('demon')) return { screen: 'refuge', setup: { ...setup, role: 'demon' }, epoch };
  if (['jeu', 'vitrine', 'roue', 'roi', 'devore'].some((k) => hash.includes(k))) return { screen: 'refuge', setup, epoch };
  return { screen: 'refugeLobby', setup, epoch };
}

export function Root() {
  const meta = useMeta();
  const [initial] = useState(fromHash);
  const [screen, setScreen] = useState<Screen>(initial.screen);
  const [setup, setSetup] = useState<RefugeSetup>(initial.setup);
  const [epochSetup, setEpochSetup] = useState<EpochSetup>(initial.epoch);
  const [run, setRun] = useState(0);
  const play = useCallback((mode: Mode) => {
    setRun((r) => r + 1);
    setScreen(mode === 'refuge' ? 'refugeLobby' : mode === 'epoch' ? 'epochLobby' : mode);
  }, []);
  const startRefuge = useCallback((s: RefugeSetup) => {
    setSetup(s);
    setRun((r) => r + 1);
    setScreen('refuge');
  }, []);
  const startEpoch = useCallback((s: EpochSetup) => {
    setEpochSetup(s);
    setRun((r) => r + 1);
    setScreen('epoch');
  }, []);
  const home = useCallback(() => setScreen('menu'), []);

  useEffect(() => {
    void audio.init();
  }, []);
  // Musique de l'accueil et du choix du camp (chaque mode lance la sienne).
  useEffect(() => {
    if (screen === 'menu' || screen === 'refugeLobby' || screen === 'epochLobby') audio.music('menu');
  }, [screen]);

  let content;
  if (!meta.loaded) content = <View style={{ flex: 1, backgroundColor: '#1E3B2E' }} />;
  else if (screen === 'menu') content = <MenuScreen meta={meta} onPlay={play} />;
  else if (screen === 'refugeLobby') content = <RefugeLobby initial={setup} onStart={startRefuge} onBack={home} />;
  else if (screen === 'epochLobby') content = <EpochLobby initial={epochSetup} onStart={startEpoch} onBack={home} />;
  else if (screen === 'epoch') content = <EpochScreen key={run} setup={epochSetup} onFinish={meta.recordSouls} onRetry={() => startEpoch(epochSetup)} onMenu={home} />;
  else if (screen === 'refuge') content = <RefugeScreen key={run} setup={setup} onFinish={meta.recordSouls} onRetry={() => startRefuge(setup)} onMenu={home} />;
  else content = <GameScreen key={run} mods={runBonuses(meta.meta)} onGameOver={meta.recordRun} onRetry={() => play('waves')} onMenu={home} />;
  // Sur le web, le son ne peut démarrer qu'après un premier toucher.
  return (
    <View style={{ flex: 1 }} onTouchStart={() => audio.unlock()} onPointerDown={() => audio.unlock()}>
      {content}
    </View>
  );
}
