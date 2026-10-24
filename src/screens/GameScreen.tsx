import { Canvas, Picture, Skia, useFont, type SkPicture } from '@shopify/react-native-skia';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View, useWindowDimensions, type GestureResponderEvent } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { createGame, step } from '../game/simulation';
import { chooseCard, rerollCards } from '../game/systems/progression';
import type { RunResult } from '../meta/useMeta';
import { resolveWeaponOffer } from '../game/systems/happenings';
import type { CardId, GameEvent, RunModifiers, WeaponType } from '../game/types';
import { worldDef } from '../game/data/worlds';
import { t, type TranslationKey } from '../i18n';
import { createJoystick, joystickEnd, joystickMove, joystickStart, readInput } from '../input/joystick';
import { applyDebugHash } from '../platform/debug';
import { audio, type SfxName } from '../platform/audio';
import { haptics } from '../platform/haptics';
import { drawWorld } from '../render/drawWorld';
import { Banner, type BannerData } from '../ui/Banner';
import { GameOver } from '../ui/GameOver';
import { Hint } from '../ui/Hint';
import { Hud, Quests } from '../ui/Hud';
import { LevelUp } from '../ui/LevelUp';
import { WeaponOffer } from '../ui/WeaponOffer';
import { readHud, sameHud, type HudState } from '../ui/hudState';

const MAX_DT = 1 / 30;
const BANNER_TIME = 2200;
const FONT_FILE = require('@expo-google-fonts/fredoka/700Bold/Fredoka_700Bold.ttf');

function emptyPicture(): SkPicture {
  const recorder = Skia.PictureRecorder();
  recorder.beginRecording(Skia.XYWHRect(0, 0, 1, 1));
  return recorder.finishRecordingAsPicture();
}

type HintKey = 'hint.move' | 'hint.chop' | 'hint.build' | null;

interface Props {
  mods: RunModifiers;
  /** Fin de partie : enregistre la partie et renvoie les âmes gagnées. */
  onGameOver: (r: RunResult) => number;
  onRetry: () => void;
  onMenu: () => void;
}

/** Bruitage joué pour chaque événement du jeu. */
const WAVES_SOUNDS: Partial<Record<GameEvent['type'], SfxName>> = {
  treeHit: 'chop',
  treeFelled: 'treefall',
  zombieHit: 'hit',
  zombieKilled: 'splat',
  heroHurt: 'hurt',
  heroDied: 'eliminated',
  animalKilled: 'hit',
  padFed: 'coin',
  built: 'build',
  structureHit: 'door_hit',
  structureDestroyed: 'door_break',
  nightStart: 'horn',
  dayStart: 'go',
  roundCleared: 'wheel_win',
  bossSpawn: 'roar',
  bossKilled: 'explosion',
  levelUp: 'levelup',
  gemPicked: 'coin',
  bombExploded: 'explosion',
  lightning: 'zap',
  equipGained: 'buy',
  weaponFound: 'buy',
  happening: 'card',
  unitSpawned: 'spawn',
  crit: 'slash',
  questDone: 'wheel_win',
  worldAdvance: 'evolve',
  gameOver: 'lose',
};

export function GameScreen({ mods, onGameOver, onRetry, onMenu }: Props) {
  const { width, height } = useWindowDimensions();
  const fontBig = useFont(FONT_FILE, 22);
  const fontSmall = useFont(FONT_FILE, 15);
  const picture = useSharedValue<SkPicture>(emptyPicture());

  const gameRef = useRef(applyDebugHash(createGame(mods)));
  const [soulsWon, setSoulsWon] = useState<number | null>(null);
  const joystick = useRef(createJoystick()).current;
  const keys = useRef(new Set<string>()).current;

  const [hud, setHud] = useState<HudState>(() => readHud(gameRef.current));
  const [hint, setHint] = useState<HintKey>('hint.move');
  const [banner, setBanner] = useState<BannerData | null>(null);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bannerId = useRef(0);

  // File d'attente : plusieurs annonces peuvent arriver en même temps (manche, équipement, monde).
  const bannerQueue = useRef<Omit<BannerData, 'id'>[]>([]);
  const nextBanner = useCallback(() => {
    const b = bannerQueue.current.shift();
    if (!b) {
      bannerTimer.current = null;
      setBanner(null);
      return;
    }
    bannerId.current++;
    setBanner({ ...b, id: bannerId.current });
    bannerTimer.current = setTimeout(nextBanner, BANNER_TIME);
  }, []);
  const showBanner = useCallback(
    (b: Omit<BannerData, 'id'>) => {
      bannerQueue.current.push(b);
      if (!bannerTimer.current) nextBanner();
    },
    [nextBanner],
  );

  useEffect(() => () => {
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
  }, []);

  // Musique de bataille pendant la partie.
  useEffect(() => {
    audio.music('waves');
  }, []);

  // Clavier pour tester dans un navigateur d'ordinateur.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const norm = (e: KeyboardEvent) => (e.key.length === 1 ? e.key.toLowerCase() : e.key);
    const down = (e: KeyboardEvent) => keys.add(norm(e));
    const up = (e: KeyboardEvent) => keys.delete(norm(e));
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [keys]);

  // Boucle de jeu : simulation, réactions de l'interface, puis enregistrement d'une image Skia.
  useEffect(() => {
    const recorder = Skia.PictureRecorder();
    const bounds = Skia.XYWHRect(0, 0, width, height);
    const previous: SkPicture[] = [];
    const fonts = { big: fontBig, small: fontSmall };
    let last = 0;
    let raf = 0;
    let lastFeedHaptic = 0;
    let lastHitHaptic = 0;
    let lastHeavyHaptic = 0;
    // Avec des centaines de zombies, on espace les vibrations pour ne pas saturer.
    const throttled = (kind: 'light' | 'medium', now: number) => {
      if (kind === 'light' && now - lastHitHaptic > 70) {
        lastHitHaptic = now;
        haptics.light();
      } else if (kind === 'medium' && now - lastHeavyHaptic > 120) {
        lastHeavyHaptic = now;
        haptics.medium();
      }
    };
    let currentHud = readHud(gameRef.current);
    const progress = { moved: false };

    const onEvent = (ev: GameEvent, now: number) => {
      const sound = WAVES_SOUNDS[ev.type];
      if (sound) audio.sfx(sound);
      switch (ev.type) {
        case 'treeHit':
        case 'zombieHit':
          throttled('light', now);
          break;
        case 'treeFelled':
        case 'zombieKilled':
        case 'heroHurt':
        case 'animalKilled':
          throttled('medium', now);
          break;
        case 'questDone':
          haptics.success();
          showBanner({ title: t('banner.quest'), sub: t(`quest.${ev.kind}`, { n: '' }).replace(/\s+/g, ' ').trim(), tone: 'good' });
          break;
        case 'padFed':
          if (now - lastFeedHaptic > 110) {
            lastFeedHaptic = now;
            haptics.light();
          }
          break;
        case 'built': {
          haptics.success();
          const a = ev.action;
          if (a.type === 'upgradeHouse') showBanner({ title: t('banner.house', { level: a.level }), tone: 'good' });
          else if (a.type === 'forge') showBanner({ title: t('banner.axe'), sub: t('pad.forge', { level: a.level }), tone: 'good' });
          else if (a.type === 'upgradeWalls') showBanner({ title: t('banner.walls'), sub: t('pad.walls', { level: a.level }), tone: 'good' });
          else if (a.type === 'upgradeStructure') {
            const key = a.slot.startsWith('tower') ? 'pad.towerUp' : a.slot === 'barracks' ? 'pad.barracksUp' : a.slot === 'lodge' ? 'pad.lodgeUp' : 'pad.lumberUp';
            showBanner({ title: t('banner.built'), sub: t(key, { level: a.level }), tone: 'good' });
          } else showBanner({ title: t('banner.built'), sub: t(`pad.${a.kind}`), tone: 'good' });
          break;
        }
        case 'nightStart':
          haptics.heavy();
          showBanner({ title: t('banner.night'), sub: t('banner.nightSub', { n: ev.night }), tone: 'night' });
          break;
        case 'roundCleared':
          haptics.success();
          showBanner({ title: t('banner.round', { n: ev.round }), sub: gameRef.current.bossesKilled <= 2 ? t('banner.evolution') : t('banner.roundSub'), tone: 'day' });
          break;
        case 'bossSpawn': {
          haptics.heavy();
          const big = ev.round >= 3;
          showBanner({
            title: big ? t('banner.bigBoss') : t('banner.miniBoss'),
            sub: big ? t('banner.bigBossSub') : t('banner.bossSub'),
            tone: 'bad',
          });
          break;
        }
        case 'equipGained': {
          haptics.success();
          const stats = { sword: 25 * ev.tier, shield: Math.min(60, 15 * ev.tier), armor: 7 * ev.tier };
          showBanner({
            title: `${t(`equip.${ev.slot}`)} ${t(`equip.tier${Math.min(4, ev.tier)}` as TranslationKey)} !`,
            sub: t(`equip.${ev.slot}Sub`, { n: stats[ev.slot] }),
            tone: 'good',
          });
          break;
        }
        case 'happening':
          haptics.medium();
          showBanner({ title: t(`hap.${ev.kind}`), sub: t(`hap.${ev.kind}Sub`), tone: ev.kind === 'ambush' ? 'bad' : 'good' });
          break;
        case 'weaponFound':
          haptics.success();
          break;
        case 'crit':
          throttled('medium', now);
          break;
        case 'worldAdvance':
          haptics.heavy();
          showBanner({
            title: t('banner.world', { world: t(`world.${worldDef(ev.world).id}` as TranslationKey) }),
            sub: t('banner.worldSub'),
            tone: 'day',
          });
          break;
        case 'bossKilled':
          haptics.heavy();
          break;
        case 'levelUp':
          haptics.success();
          break;
        case 'bombExploded':
        case 'lightning':
          throttled('medium', now);
          break;
        case 'heroDied':
          haptics.heavy();
          showBanner({ title: t('banner.died'), sub: t('banner.diedSub'), tone: 'bad' });
          break;
        case 'gameOver':
          haptics.error();
          break;
      }
    };

    const frame = (now: number) => {
      const dt = last === 0 ? 1 / 60 : Math.min(MAX_DT, (now - last) / 1000);
      last = now;
      const game = gameRef.current;

      const input = readInput(joystick, keys);
      if (!progress.moved && (input.moveX !== 0 || input.moveY !== 0)) progress.moved = true;
      step(game, input, dt);

      for (const ev of game.events) onEvent(ev, now);
      game.events.length = 0;

      const next = readHud(game);
      if (!sameHud(next, currentHud)) {
        currentHud = next;
        setHud(next);
      }
      // Bulles d'aide du début de partie.
      const nextHint: HintKey = !progress.moved
        ? 'hint.move'
        : game.stats.built > 0 || game.cycle.night > 0
          ? null
          : game.inventory.wood >= 8
            ? 'hint.build'
            : game.inventory.wood === 0
              ? 'hint.chop'
              : null;
      setHint((h) => (h === nextHint ? h : nextHint));

      const canvas = recorder.beginRecording(bounds);
      drawWorld(canvas, game, { width, height }, fonts, joystick);
      const pic = recorder.finishRecordingAsPicture();
      picture.value = pic;

      // Sur le web, la mémoire de CanvasKit doit être libérée à la main.
      if (Platform.OS === 'web') {
        previous.push(pic);
        if (previous.length > 3) previous.shift()?.dispose();
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [width, height, fontBig, fontSmall, joystick, keys, picture, showBanner]);

  const pickCard = useCallback(
    (card: CardId) => {
      const game = gameRef.current;
      audio.sfx('card');
      chooseCard(game, card);
      joystickEnd(joystick);
      game.events.length = 0;
      setHud(readHud(game));
    },
    [joystick],
  );

  const answerOffer = useCallback(
    (take: boolean) => {
      const game = gameRef.current;
      audio.sfx(take ? 'buy' : 'tap');
      resolveWeaponOffer(game, take);
      joystickEnd(joystick);
      setHud(readHud(game));
    },
    [joystick],
  );

  // Fin de partie : on enregistre une seule fois les âmes gagnées.
  useEffect(() => {
    if (hud.status !== 'gameover' || soulsWon !== null) return;
    const g = gameRef.current;
    setSoulsWon(
      onGameOver({
        kills: g.stats.zombiesKilled,
        bosses: g.bossesKilled,
        nights: hud.nightsSurvived,
        world: g.world,
        quests: g.questsDone,
      }),
    );
  }, [hud.status, hud.nightsSurvived, soulsWon, onGameOver]);

  const reroll = useCallback(() => {
    audio.sfx('card');
    rerollCards(gameRef.current);
    setHud(readHud(gameRef.current));
  }, []);

  const onStart = (e: GestureResponderEvent) => joystickStart(joystick, e.nativeEvent.pageX, e.nativeEvent.pageY);
  const onMove = (e: GestureResponderEvent) => joystickMove(joystick, e.nativeEvent.pageX, e.nativeEvent.pageY);
  const onEnd = () => joystickEnd(joystick);

  return (
    <View
      style={styles.root}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={onStart}
      onResponderMove={onMove}
      onResponderRelease={onEnd}
      onResponderTerminate={onEnd}
    >
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Canvas style={StyleSheet.absoluteFill}>
          <Picture picture={picture} />
        </Canvas>
      </View>
      <Hud hud={hud} />
      <Quests hud={hud} />
      <Hint text={hud.heroDead ? t('respawn', { n: hud.respawnIn }) : hint ? t(hint) : null} />
      <Banner banner={banner} />
      {hud.weaponOffer !== '' && hud.status === 'playing' && (
        <WeaponOffer
          offer={hud.weaponOffer as WeaponType}
          current={hud.weaponType as WeaponType}
          forge={hud.forge}
          meltWood={15 + 5 * gameRef.current.world}
          onTake={() => answerOffer(true)}
          onKeep={() => answerOffer(false)}
        />
      )}
      {hud.choice !== '' && hud.weaponOffer === '' && hud.status === 'playing' && (
        <LevelUp
          level={hud.level}
          cards={hud.choice.split(',') as CardId[]}
          levels={hud.choiceLevels.split(',').map(Number)}
          ownedCount={hud.slots ? hud.slots.split(',').length : 0}
          rerolls={hud.rerolls}
          onReroll={reroll}
          onPick={pickCard}
        />
      )}
      {hud.status === 'gameover' && (
        <GameOver
          nights={hud.nightsSurvived}
          zombies={hud.zombiesKilled}
          bosses={hud.bossesKilled}
          level={hud.level}
          souls={soulsWon ?? 0}
          onRetry={onRetry}
          onMenu={onMenu}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#1E5B3A' },
});
