import { Canvas, Picture, Skia, useFont, type SkPicture } from '@shopify/react-native-skia';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions, type GestureResponderEvent } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t, type TranslationKey } from '../i18n';
import { createJoystick, joystickEnd, joystickMove, joystickStart, readInput } from '../input/joystick';
import { ROUNDS, SIEGE_TIME, refugeSouls } from '../modes/refuge/balance';
import { ACTIVE_POWERS, CHARACTERS, DEMON_POWERS } from '../modes/refuge/data';
import { chooseDemonPower, graceLeft, useDemonPower } from '../modes/refuge/demon';
import { drawRefuge } from '../modes/refuge/render';
import { createRefuge, playerSurvivor, stepRefuge, type RefugeSetup } from '../modes/refuge/sim';
import type { DemonPower, RefugeEvent, RefugeState } from '../modes/refuge/types';
import { applyRefugeDebugHash } from '../platform/debug';
import { haptics } from '../platform/haptics';
import { Banner, type BannerData } from '../ui/Banner';
import { DemonPowerPick } from '../ui/DemonPowerPick';
import { FONT } from '../ui/fonts';
import { Hint } from '../ui/Hint';
import { RefugeWheel } from '../ui/RefugeWheel';

const MAX_DT = 1 / 30;
const BANNER_TIME = 2000;
const FONT_FILE = require('@expo-google-fonts/fredoka/700Bold/Fredoka_700Bold.ttf');
/** Touches du clavier pour les pouvoirs du Démon (test dans un navigateur). */
const POWER_KEYS: Record<string, DemonPower> = { '1': 'clone', '2': 'roar', '3': 'dash' };

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
  round: number;
  roundTimer: number;
  gold: number;
  alive: number;
  found: number;
  /** Le joueur est encore en jeu (survivant en vie, ou Démon debout). */
  playerAlive: boolean;
  demonLevel: number;
  demonHp: number;
  doorHp: number;
  shield: number;
  boostPower: number;
  boostTurbo: number;
  boostStorm: number;
  grace: number;
  /** Pouvoirs actifs : "clone:2:0,roar:1:12" (niveau et recharge), pour savoir quand redessiner. */
  powersKey: string;
  paused: boolean;
  result: RefugeState['result'];
  /** Bilan du joueur, figé dès qu'il est éliminé (ou à la fin de la partie). */
  mine: { won: boolean; rank: number; survivedSeconds: number; found: number } | null;
}

function readHud(s: RefugeState): Hud {
  const p = playerSurvivor(s);
  const room = p && p.roomId !== null ? s.rooms[p.roomId] : null;
  const playerAlive = p ? p.alive : s.demon.hp > 0;
  return {
    phase: s.phase,
    timer: Math.ceil(s.phaseTimer),
    round: s.round,
    roundTimer: Math.ceil(s.roundTimer),
    gold: p ? Math.floor(p.gold) : 0,
    alive: s.survivors.filter((x) => x.alive).length,
    found: s.eliminations,
    playerAlive,
    demonLevel: s.demon.level,
    demonHp: Math.round((s.demon.hp / s.demon.maxHp) * 50) / 50,
    doorHp: room ? Math.round((room.door.hp / room.door.maxHp) * 50) / 50 : 1,
    shield: room && room.shieldMax > 0 ? Math.round((room.shield / room.shieldMax) * 20) / 20 : 0,
    boostPower: room ? Math.ceil(room.boosts.power) : 0,
    boostTurbo: room ? Math.ceil(room.boosts.turbo) : 0,
    boostStorm: room ? Math.ceil(room.boosts.storm) : 0,
    grace: s.role === 'demon' && s.phase === 'siege' ? Math.ceil(graceLeft(s)) : 0,
    powersKey: ACTIVE_POWERS.filter((k) => s.powers[k]).map((k) => `${k}:${s.powers[k]}:${Math.ceil(s.powerCooldowns[k] ?? 0)}`).join(','),
    paused: s.wheel !== null || s.powerChoice !== null,
    result: s.result,
    mine:
      s.result ??
      (playerAlive
        ? null
        : p
          ? { won: false, rank: s.survivors.length - p.eliminatedAt + 1, survivedSeconds: 0, found: s.eliminations }
          : { won: false, rank: 2, survivedSeconds: 0, found: s.eliminations }),
  };
}

const same = (a: Hud, b: Hud) => (Object.keys(a) as (keyof Hud)[]).every((k) => (k === 'mine' ? !a.mine === !b.mine : a[k] === b[k]));

/** Âmes gagnées : en rôle Démon, selon le nombre de survivants trouvés. */
function soulsFor(s: RefugeState, mine: NonNullable<Hud['mine']>) {
  if (s.role === 'demon') return mine.found * 9 + Math.floor(mine.survivedSeconds / 10) + (mine.won ? 30 : 0);
  return refugeSouls({ ...mine, zombiesKilled: s.zombiesKilled });
}

function Boost({ icon, n }: { icon: string; n: number }) {
  if (n <= 0) return null;
  return (
    <View style={styles.boost}>
      <Text style={styles.boostText}>
        {icon} {n}s
      </Text>
    </View>
  );
}

interface Props {
  setup: RefugeSetup;
  onFinish: (souls: number) => number;
  onRetry: () => void;
  onMenu: () => void;
}

export function RefugeScreen({ setup, onFinish, onRetry, onMenu }: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const fontBig = useFont(FONT_FILE, 22);
  const fontSmall = useFont(FONT_FILE, 15);
  const picture = useSharedValue<SkPicture>(emptyPicture());
  const stateRef = useRef<RefugeState>(null as unknown as RefugeState);
  if (!stateRef.current) stateRef.current = applyRefugeDebugHash(createRefuge(setup));
  const demonRole = setup.role === 'demon';
  const joystick = useRef(createJoystick()).current;
  const keys = useRef(new Set<string>()).current;
  const [hud, setHud] = useState<Hud>(() => readHud(stateRef.current));
  const [banner, setBanner] = useState<BannerData | null>(null);
  const [souls, setSouls] = useState<number | null>(null);
  const [summary, setSummary] = useState<Hud['mine']>(null);
  const [spectating, setSpectating] = useState(false);
  // Caméra et place prise par l'interface du haut (le jeu se centre en dessous).
  const camera = useRef({ x: 0, y: 0, ready: false }).current;
  const hudBottom = useRef(0);
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

  const firePower = useCallback((p: DemonPower) => {
    if (useDemonPower(stateRef.current, p)) haptics.heavy();
  }, []);

  // Clavier pour tester dans un navigateur d'ordinateur.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const norm = (e: KeyboardEvent) => (e.key.length === 1 ? e.key.toLowerCase() : e.key);
    const down = (e: KeyboardEvent) => {
      keys.add(norm(e));
      const p = POWER_KEYS[e.key];
      if (p) firePower(p);
    };
    const up = (e: KeyboardEvent) => keys.delete(norm(e));
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [keys, firePower]);

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
      const player = playerSurvivor(s);
      const mine = player ? player.roomId : null;
      switch (ev.type) {
        case 'phase':
          if (ev.phase === 'choose') {
            haptics.success();
            showBanner({ title: demonRole ? t('refuge.demonWait') : t('refuge.go'), tone: 'good' });
          } else if (ev.phase === 'arrival') {
            haptics.heavy();
            showBanner({ title: demonRole ? t('refuge.demonRise') : t('refuge.wake'), tone: 'bad' });
          } else {
            haptics.error();
            if (demonRole) showBanner({ title: t('refuge.demonHunt'), sub: t('refuge.demonHuntSub'), tone: 'night' });
            else showBanner({ title: t('refuge.defend'), sub: t('refuge.wakeSub'), tone: 'night' });
          }
          break;
        case 'bought':
          if (player && ev.survivorId === player.id) haptics.success();
          break;
        case 'doorHit':
          if (now - lastHit > 150 && (ev.roomId === mine || (demonRole && s.demon.targetRoom === ev.roomId))) {
            lastHit = now;
            haptics.medium();
          }
          break;
        case 'doorBroken':
          if (ev.roomId === mine) {
            haptics.error();
            showBanner({ title: t('refuge.doorBroken'), tone: 'bad' });
          } else if (demonRole) {
            haptics.success();
            showBanner({ title: t('refuge.doorOpen'), tone: 'good' });
          }
          break;
        case 'eliminated':
          haptics.heavy();
          showBanner({ title: ev.isPlayer ? t('refuge.foundYou') : t('refuge.found', { name: ev.name }), tone: demonRole ? 'good' : 'bad' });
          break;
        case 'wave':
          showBanner({ title: ev.boss ? t('refuge.waveBoss') : t('refuge.wave', { n: ev.wave }), tone: ev.boss ? 'bad' : 'night' });
          break;
        case 'demonLevel':
          if (!demonRole) showBanner({ title: t('refuge.level', { n: ev.level }), tone: 'bad' });
          break;
        case 'demonPower':
          showBanner({
            title: `${DEMON_POWERS[ev.power].icon} ${t(`power.${ev.power}` as TranslationKey)}`,
            sub: demonRole ? undefined : t('refuge.demonGotPower'),
            tone: demonRole ? 'good' : 'bad',
          });
          break;
        case 'demonRetreat':
          showBanner({ title: t('refuge.retreat'), tone: 'good' });
          break;
        case 'demonKilled':
          haptics.success();
          showBanner({ title: t('refuge.killed'), tone: demonRole ? 'bad' : 'good' });
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
      drawRefuge(canvas, s, { width, height, top: s.phase === 'arrival' ? 0 : hudBottom.current, cam: camera }, fonts, joystick, dt);
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
  }, [width, height, fontBig, fontSmall, joystick, keys, picture, showBanner, camera, demonRole]);

  // Fin de partie : âmes enregistrées une seule fois.
  useEffect(() => {
    if (!hud.mine || souls !== null) return;
    const s = stateRef.current;
    const mine = { ...hud.mine, survivedSeconds: hud.result ? hud.mine.survivedSeconds : Math.round(s.time) };
    setSummary(mine);
    setSouls(onFinish(soulsFor(s, mine)));
  }, [hud.mine, hud.result, souls, onFinish]);

  const closeWheel = useCallback(() => {
    stateRef.current.wheel = null;
  }, []);
  const pickPower = useCallback((p: DemonPower) => {
    haptics.success();
    chooseDemonPower(stateRef.current, p);
  }, []);

  const onStart = (e: GestureResponderEvent) => joystickStart(joystick, e.nativeEvent.pageX, e.nativeEvent.pageY);
  const onMove = (e: GestureResponderEvent) => joystickMove(joystick, e.nativeEvent.pageX, e.nativeEvent.pageY);
  const onEnd = () => joystickEnd(joystick);

  const s = stateRef.current;
  const inSiege = hud.phase === 'siege' || hud.phase === 'over';
  const showEnd = hud.result !== null || (!hud.playerAlive && !spectating);
  const hint = demonRole
    ? hud.phase === 'siege' && hud.grace > 0
      ? t('refuge.chained', { n: hud.grace })
      : null
    : hud.phase === 'choose'
      ? t('refuge.choose', { n: hud.timer })
      : hud.phase === 'siege' && hud.timer > SIEGE_TIME - 25 && hud.playerAlive
        ? t('refuge.hintBuild')
        : null;
  const character = !demonRole ? CHARACTERS[setup.character] : null;
  const actives = hud.powersKey ? hud.powersKey.split(',').map((x) => x.split(':')) : [];

  let endTitle: string;
  if (demonRole) endTitle = hud.result?.won ? t('refuge.demonWin') : hud.playerAlive ? t('refuge.demonLose') : t('refuge.demonDead');
  else endTitle = hud.result ? (hud.result.won ? (hud.playerAlive ? t('refuge.survived') : t('refuge.win')) : t('refuge.foundYou')) : t('refuge.foundYou');

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

      <View
        pointerEvents="none"
        onLayout={(e) => {
          hudBottom.current = e.nativeEvent.layout.y + e.nativeEvent.layout.height;
        }}
        style={[styles.hud, { top: insets.top + 8, left: insets.left + 12, right: insets.right + 12 }, hud.phase === 'arrival' && styles.hidden]}
      >
        <View style={styles.row}>
          {demonRole ? (
            <View style={[styles.pill, styles.pillDemon]}>
              <Text style={styles.coin}>😈</Text>
              <Text style={styles.foundText}>{t('refuge.foundCount', { n: hud.found })}</Text>
            </View>
          ) : (
            <View style={styles.pill}>
              <Text style={styles.coin}>{character?.icon ?? '🪙'}</Text>
              <Text style={styles.gold}>🪙 {hud.gold}</Text>
            </View>
          )}
          <View style={[styles.pill, styles.pillDark]}>
            <Text style={styles.phase}>{inSiege ? `⏱ ${clock(hud.timer)}` : `⏳ ${hud.phase === 'choose' ? hud.timer : 0}s`}</Text>
            {inSiege ? (
              <Text style={styles.round}>{t('refuge.round', { n: hud.round, max: ROUNDS })}</Text>
            ) : (
              <Text style={styles.alive}>{t('refuge.alive', { n: hud.alive })}</Text>
            )}
          </View>
        </View>
        {inSiege && (
          <View style={styles.bars}>
            <View style={styles.barRow}>
              <Text style={styles.barLabel}>😈 {t('refuge.demon', { n: hud.demonLevel })}</Text>
              <View style={styles.barBack}>
                <View style={[styles.barFill, { width: `${Math.round(hud.demonHp * 100)}%`, backgroundColor: '#FF5A5A' }]} />
              </View>
            </View>
            {!demonRole && hud.playerAlive && (
              <View style={styles.barRow}>
                <Text style={styles.barLabel}>🚪 {t('refuge.door')}</Text>
                <View style={styles.barBack}>
                  <View style={[styles.barFill, { width: `${Math.round(hud.doorHp * 100)}%`, backgroundColor: '#7BD35A' }]} />
                  {hud.shield > 0 && <View style={[styles.shieldFill, { width: `${Math.round(hud.shield * 100)}%` }]} />}
                </View>
              </View>
            )}
            {demonRole ? (
              <Text style={styles.subInfo}>{t('refuge.aliveLeft', { n: hud.alive })}</Text>
            ) : (
              <View style={styles.boosts}>
                <Text style={styles.subInfo}>{t('refuge.wheelIn', { time: clock(hud.roundTimer) })}</Text>
                <Boost icon="💪" n={hud.boostPower} />
                <Boost icon="⚙️" n={hud.boostTurbo} />
                <Boost icon="⚡" n={hud.boostStorm} />
              </View>
            )}
          </View>
        )}
      </View>

      {demonRole && hud.phase === 'siege' && actives.length > 0 && (
        <View pointerEvents="box-none" style={[styles.powers, { bottom: insets.bottom + 24, right: insets.right + 16 }]}>
          {actives.map(([id, , cd]) => {
            const wait = Number(cd);
            const off = wait > 0 || hud.grace > 0;
            return (
              <Pressable
                key={id}
                onPress={() => firePower(id as DemonPower)}
                accessibilityRole="button"
                accessibilityLabel={t(`power.${id}` as TranslationKey)}
                style={({ pressed }) => [styles.powerBtn, off && styles.powerOff, pressed && styles.pressed]}
              >
                <Text style={styles.powerIcon}>{DEMON_POWERS[id as DemonPower].icon}</Text>
                {wait > 0 && <Text style={styles.powerWait}>{wait}</Text>}
              </Pressable>
            );
          })}
        </View>
      )}

      {hud.phase === 'intro' && (
        <View pointerEvents="none" style={styles.countdown}>
          <Animated.Text key={hud.timer} entering={ZoomIn.springify().damping(10)} style={styles.countdownText}>
            {hud.timer}
          </Animated.Text>
          <Text style={styles.countdownSub}>{demonRole ? t('refuge.readyDemon') : t('refuge.ready')}</Text>
        </View>
      )}

      <Hint text={hint} />
      <Banner banner={banner} />

      {s.wheel && <RefugeWheel key={`${s.wheel.round}`} spin={s.wheel} onDone={closeWheel} />}
      {s.powerChoice && <DemonPowerPick level={hud.demonLevel} options={s.powerChoice} owned={s.powers} onPick={pickPower} />}

      {showEnd && (
        <Animated.View entering={FadeIn.duration(300)} style={styles.backdrop}>
          <Animated.View entering={ZoomIn.delay(200).springify().damping(13)} style={styles.card}>
            <Text style={[styles.title, hud.result?.won && styles.titleWin]}>{endTitle}</Text>
            {summary && <Text style={styles.stat}>{demonRole ? t('refuge.foundTotal', { n: summary.found }) : t('refuge.rank', { n: summary.rank })}</Text>}
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
  hidden: { opacity: 0 },
  pillDemon: { backgroundColor: 'rgba(126,24,48,0.92)' },
  foundText: { color: '#FFFFFF', fontSize: 18, fontFamily: FONT.bold },
  round: { color: '#FFD25A', fontSize: 14, fontFamily: FONT.semi },
  subInfo: { color: '#C9C2D8', fontSize: 13, fontFamily: FONT.semi },
  boosts: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  boost: { backgroundColor: '#4A3B66', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 1 },
  boostText: { color: '#FFFFFF', fontSize: 13, fontFamily: FONT.bold },
  shieldFill: { position: 'absolute', left: 2, top: 2, height: 4, borderRadius: 2, backgroundColor: '#9EDBFF' },
  powers: { position: 'absolute', flexDirection: 'row', gap: 12, alignItems: 'center' },
  powerBtn: { width: 66, height: 66, borderRadius: 33, backgroundColor: '#7E3AA3', borderWidth: 4, borderColor: '#2B2238', alignItems: 'center', justifyContent: 'center' },
  powerOff: { backgroundColor: '#3A2E52', opacity: 0.85 },
  powerIcon: { fontSize: 30 },
  powerWait: { position: 'absolute', bottom: -4, right: -4, backgroundColor: '#2B2238', color: '#FFFFFF', fontFamily: FONT.bold, fontSize: 13, borderRadius: 10, paddingHorizontal: 6, overflow: 'hidden' },
  bars: { gap: 6, backgroundColor: 'rgba(30,24,52,0.92)', borderRadius: 16, borderWidth: 3, borderColor: '#2B2238', paddingVertical: 7, paddingHorizontal: 10 },
  countdown: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  countdownText: { fontSize: 120, color: '#FFD25A', fontFamily: FONT.bold, textShadowColor: '#2B2238', textShadowRadius: 10, textShadowOffset: { width: 0, height: 6 } },
  countdownSub: { fontSize: 22, color: '#FFFFFF', fontFamily: FONT.bold, textShadowColor: '#2B2238', textShadowRadius: 6, textAlign: 'center', paddingHorizontal: 30 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barLabel: { color: '#FFFFFF', fontSize: 14, fontFamily: FONT.bold, minWidth: 104 },
  barBack: { flex: 1, height: 14, borderRadius: 7, backgroundColor: '#15111F', padding: 2 },
  barFill: { height: 10, borderRadius: 5 },
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
