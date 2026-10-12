import { Canvas, Picture, Skia, useFont, type SkPicture } from '@shopify/react-native-skia';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions, type GestureResponderEvent } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t } from '../i18n';
import { createJoystick, joystickEnd, joystickMove, joystickStart, readInput } from '../input/joystick';
import { SIEGE_TIME, refugeSouls } from '../modes/refuge/balance';
import { drawRefuge } from '../modes/refuge/render';
import { createRefuge, stepRefuge } from '../modes/refuge/sim';
import type { RefugeEvent, RefugeState } from '../modes/refuge/types';
import { haptics } from '../platform/haptics';
import { Banner, type BannerData } from '../ui/Banner';
import { FONT } from '../ui/fonts';
import { Hint } from '../ui/Hint';

const MAX_DT = 1 / 30;
const BANNER_TIME = 2000;
const FONT_FILE = require('@expo-google-fonts/fredoka/700Bold/Fredoka_700Bold.ttf');

function emptyPicture(): SkPicture {
  const recorder = Skia.PictureRecorder();
  recorder.beginRecording(Skia.XYWHRect(0, 0, 1, 1));
  return recorder.finishRecordingAsPicture();
}

const clock = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;

/** Ce que l'interface affiche (mis à jour seulement quand ça change). */
interface Hud {
  phase: RefugeState['phase'];
  timer: number;
  gold: number;
  alive: number;
  playerAlive: boolean;
  demonLevel: number;
  demonHp: number;
  doorHp: number;
  result: RefugeState['result'];
  /** Bilan du joueur, figé dès qu'il est trouvé (ou à la fin de la partie). */
  mine: { won: boolean; rank: number; survivedSeconds: number } | null;
}

function readHud(s: RefugeState): Hud {
  const p = s.survivors[0];
  const room = p.roomId !== null ? s.rooms[p.roomId] : null;
  return {
    phase: s.phase,
    timer: Math.ceil(s.phaseTimer),
    gold: Math.floor(p.gold),
    alive: s.survivors.filter((x) => x.alive).length,
    playerAlive: p.alive,
    demonLevel: s.demon.level,
    demonHp: Math.round((s.demon.hp / s.demon.maxHp) * 50) / 50,
    doorHp: room ? Math.round((room.door.hp / room.door.maxHp) * 50) / 50 : 1,
    result: s.result,
    mine: s.result ?? (p.alive ? null : { won: false, rank: s.survivors.length - p.eliminatedAt + 1, survivedSeconds: 0 }),
  };
}

const same = (a: Hud, b: Hud) => (Object.keys(a) as (keyof Hud)[]).every((k) => (k === 'mine' ? !a.mine === !b.mine : a[k] === b[k]));

interface Props {
  onFinish: (souls: number) => number;
  onRetry: () => void;
  onMenu: () => void;
}

export function RefugeScreen({ onFinish, onRetry, onMenu }: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const fontBig = useFont(FONT_FILE, 22);
  const fontSmall = useFont(FONT_FILE, 15);
  const picture = useSharedValue<SkPicture>(emptyPicture());
  const stateRef = useRef(createRefuge());
  const joystick = useRef(createJoystick()).current;
  const keys = useRef(new Set<string>()).current;
  const [hud, setHud] = useState<Hud>(() => readHud(stateRef.current));
  const [banner, setBanner] = useState<BannerData | null>(null);
  const [souls, setSouls] = useState<number | null>(null);
  const [summary, setSummary] = useState<Hud['mine']>(null);
  const [spectating, setSpectating] = useState(false);
  const bannerQueue = useRef<Omit<BannerData, 'id'>[]>([]);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bannerId = useRef(0);

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

  useEffect(() => {
    const recorder = Skia.PictureRecorder();
    const bounds = Skia.XYWHRect(0, 0, width, height);
    const previous: SkPicture[] = [];
    const fonts = { big: fontBig, small: fontSmall };
    let last = 0;
    let raf = 0;
    let lastHit = 0;
    let current = readHud(stateRef.current);

    const onEvent = (ev: RefugeEvent, now: number, s: RefugeState) => {
      const mine = s.survivors[0].roomId;
      switch (ev.type) {
        case 'phase':
          haptics.heavy();
          showBanner({ title: t('refuge.wake'), sub: t('refuge.wakeSub'), tone: 'night' });
          break;
        case 'bought':
          if (ev.survivorId === 0) haptics.success();
          break;
        case 'doorHit':
          if (ev.roomId === mine && now - lastHit > 150) {
            lastHit = now;
            haptics.medium();
          }
          break;
        case 'doorBroken':
          if (ev.roomId === mine) {
            haptics.error();
            showBanner({ title: t('refuge.doorBroken'), tone: 'bad' });
          }
          break;
        case 'eliminated':
          haptics.heavy();
          showBanner({ title: ev.isPlayer ? t('refuge.foundYou') : t('refuge.found', { name: ev.name }), tone: 'bad' });
          break;
        case 'wave':
          showBanner({ title: ev.boss ? t('refuge.waveBoss') : t('refuge.wave', { n: ev.wave }), tone: ev.boss ? 'bad' : 'night' });
          break;
        case 'demonLevel':
          showBanner({ title: t('refuge.level', { n: ev.level }), tone: 'bad' });
          break;
        case 'demonRetreat':
          showBanner({ title: t('refuge.retreat'), tone: 'good' });
          break;
        case 'demonKilled':
          haptics.success();
          showBanner({ title: t('refuge.killed'), tone: 'good' });
          break;
        default:
          break;
      }
    };

    const frame = (now: number) => {
      const dt = last === 0 ? 1 / 60 : Math.min(MAX_DT, (now - last) / 1000);
      last = now;
      const s = stateRef.current;
      stepRefuge(s, readInput(joystick, keys), dt);
      for (const ev of s.events) onEvent(ev, now, s);
      s.events.length = 0;
      const next = readHud(s);
      if (!same(next, current)) {
        current = next;
        setHud(next);
      }
      const canvas = recorder.beginRecording(bounds);
      drawRefuge(canvas, s, { width, height }, fonts, joystick);
      const pic = recorder.finishRecordingAsPicture();
      picture.value = pic;
      if (Platform.OS === 'web') {
        previous.push(pic);
        if (previous.length > 3) previous.shift()?.dispose();
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [width, height, fontBig, fontSmall, joystick, keys, picture, showBanner]);

  // Fin de partie : âmes enregistrées une seule fois.
  useEffect(() => {
    if (!hud.mine || souls !== null) return;
    const s = stateRef.current;
    const mine = { ...hud.mine, survivedSeconds: hud.result ? hud.mine.survivedSeconds : Math.round(s.time) };
    setSummary(mine);
    setSouls(onFinish(refugeSouls({ ...mine, zombiesKilled: s.zombiesKilled })));
  }, [hud.mine, hud.result, souls, onFinish]);

  const onStart = (e: GestureResponderEvent) => joystickStart(joystick, e.nativeEvent.pageX, e.nativeEvent.pageY);
  const onMove = (e: GestureResponderEvent) => joystickMove(joystick, e.nativeEvent.pageX, e.nativeEvent.pageY);
  const onEnd = () => joystickEnd(joystick);

  const showEnd = hud.result !== null || (!hud.playerAlive && !spectating);
  const hint = hud.phase === 'choose' ? t('refuge.choose', { n: hud.timer }) : hud.phase === 'siege' && hud.timer > SIEGE_TIME - 25 && hud.playerAlive ? t('refuge.hintBuild') : null;

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

      <View pointerEvents="none" style={[styles.hud, { top: insets.top + 8, left: insets.left + 12, right: insets.right + 12 }]}>
        <View style={styles.row}>
          <View style={styles.pill}>
            <Text style={styles.coin}>🪙</Text>
            <Text style={styles.gold}>{hud.gold}</Text>
          </View>
          <View style={[styles.pill, styles.pillDark]}>
            <Text style={styles.phase}>{hud.phase === 'choose' ? `⏳ ${hud.timer}s` : `⏱ ${clock(hud.timer)}`}</Text>
            <Text style={styles.alive}>{t('refuge.alive', { n: hud.alive })}</Text>
          </View>
        </View>
        <View style={styles.bars}>
          <View style={styles.barRow}>
            <Text style={styles.barLabel}>😈 {t('refuge.demon', { n: hud.demonLevel })}</Text>
            <View style={styles.barBack}>
              <View style={[styles.barFill, { width: `${Math.round(hud.demonHp * 100)}%`, backgroundColor: '#FF5A5A' }]} />
            </View>
          </View>
          {hud.phase !== 'choose' && hud.playerAlive && (
            <View style={styles.barRow}>
              <Text style={styles.barLabel}>🚪</Text>
              <View style={styles.barBack}>
                <View style={[styles.barFill, { width: `${Math.round(hud.doorHp * 100)}%`, backgroundColor: '#7BD35A' }]} />
              </View>
            </View>
          )}
        </View>
      </View>

      <Hint text={hint} />
      <Banner banner={banner} />

      {showEnd && (
        <Animated.View entering={FadeIn.duration(300)} style={styles.backdrop}>
          <Animated.View entering={ZoomIn.delay(200).springify().damping(13)} style={styles.card}>
            <Text style={[styles.title, hud.result?.won && styles.titleWin]}>
              {hud.result ? (hud.result.won ? (hud.playerAlive ? t('refuge.survived') : t('refuge.win')) : t('refuge.foundYou')) : t('refuge.foundYou')}
            </Text>
            {summary && <Text style={styles.stat}>{t('refuge.rank', { n: summary.rank })}</Text>}
            {summary && <Text style={styles.stat}>{t('refuge.time', { time: clock(summary.survivedSeconds) })}</Text>}
            {souls !== null && <Text style={styles.souls}>💜 {t('gameover.souls', { n: souls })}</Text>}
            {!hud.result && (
              <Pressable onPress={() => setSpectating(true)} style={({ pressed }) => [styles.button, styles.buttonAlt, pressed && styles.pressed]}>
                <Text style={styles.buttonText}>{t('refuge.spectate')}</Text>
              </Pressable>
            )}
            <Pressable onPress={onRetry} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
              <Text style={styles.buttonText}>{t('refuge.again')}</Text>
            </Pressable>
            <Pressable onPress={onMenu} style={({ pressed }) => [styles.button, styles.buttonSouls, pressed && styles.pressed]}>
              <Text style={styles.buttonText}>{t('refuge.home')}</Text>
            </Pressable>
          </Animated.View>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#16131F' },
  hud: { position: 'absolute', gap: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(43,34,56,0.85)',
    borderRadius: 20,
    borderWidth: 3,
    borderColor: '#2B2238',
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  pillDark: { flexDirection: 'column', alignItems: 'flex-end', gap: 0, backgroundColor: 'rgba(30,24,52,0.92)' },
  coin: { fontSize: 20 },
  gold: { color: '#FFD25A', fontSize: 24, fontFamily: FONT.bold, minWidth: 36 },
  phase: { color: '#FFFFFF', fontSize: 18, fontFamily: FONT.bold },
  alive: { color: '#FF8A7A', fontSize: 14, fontFamily: FONT.semi },
  bars: { gap: 4 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barLabel: { color: '#FFFFFF', fontSize: 13, fontFamily: FONT.bold, minWidth: 96, textShadowColor: '#2B2238', textShadowRadius: 3 },
  barBack: { flex: 1, maxWidth: 220, height: 12, borderRadius: 6, backgroundColor: 'rgba(43,34,56,0.85)', padding: 2 },
  barFill: { height: 8, borderRadius: 4 },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(12,10,20,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#3A2E52',
    borderRadius: 28,
    borderWidth: 4,
    borderColor: '#2B2238',
    padding: 22,
    alignItems: 'center',
    gap: 12,
  },
  title: { fontSize: 26, color: '#FF7A5A', fontFamily: FONT.bold, textAlign: 'center' },
  titleWin: { color: '#FFD25A' },
  stat: { fontSize: 17, color: '#FFFFFF', fontFamily: FONT.semi },
  souls: { fontSize: 26, color: '#E6C8FF', fontFamily: FONT.bold },
  button: {
    alignSelf: 'stretch',
    alignItems: 'center',
    backgroundColor: '#7BD35A',
    borderRadius: 18,
    borderWidth: 4,
    borderColor: '#2B2238',
    borderBottomWidth: 8,
    paddingVertical: 10,
  },
  buttonAlt: { backgroundColor: '#8EC5FF' },
  buttonSouls: { backgroundColor: '#C77DFF' },
  pressed: { transform: [{ translateY: 3 }], borderBottomWidth: 5 },
  buttonText: { fontSize: 20, color: '#2B2238', fontFamily: FONT.bold },
});
