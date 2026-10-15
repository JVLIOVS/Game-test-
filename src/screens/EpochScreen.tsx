import { Canvas, Picture, Skia, useFont, type SkPicture } from '@shopify/react-native-skia';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions, type GestureResponderEvent } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t, type TranslationKey } from '../i18n';
import { AGES, AGE_ICONS, EVOLVE_XP, LANE, OVERTIME_START, SPECIAL_ICONS, SUDDEN_DEATH, UNIT_ICONS, UNIT_KINDS, turretCost, unitCost } from '../modes/epoch/data';
import { MINIMAP, drawEpoch, makeProjection } from '../modes/epoch/render';
import { buyTurret, collectCrate, createEpoch, evolve, stepEpoch, trainUnit, useSpecial } from '../modes/epoch/sim';
import type { EpochEvent, EpochState, UnitKind } from '../modes/epoch/types';
import { applyEpochDebugHash } from '../platform/debug';
import { haptics } from '../platform/haptics';
import { Banner, type BannerData } from '../ui/Banner';
import { FONT } from '../ui/fonts';

// Mode Époques : envoie tes troupes, fais évoluer ton camp de la préhistoire à l'espace,
// et détruis la base adverse.

const MAX_DT = 1 / 30;
const BANNER_TIME = 1800;
const FONT_FILE = require('@expo-google-fonts/fredoka/700Bold/Fredoka_700Bold.ttf');
/** La caméra reprend seule le suivi du front quelques secondes après un glissement du doigt. */
const MANUAL_HOLD = 3;
const CAM_MIN = 175;
const CAM_MAX = LANE - 300;

function emptyPicture(): SkPicture {
  const recorder = Skia.PictureRecorder();
  recorder.beginRecording(Skia.XYWHRect(0, 0, 1, 1));
  return recorder.finishRecordingAsPicture();
}

const clock = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

interface Hud {
  gold: number;
  age: number;
  xp: number;
  enemyAge: number;
  hp: number;
  enemyHp: number;
  queue: string;
  turret: number;
  special: number;
  rage: number;
  time: number;
  result: EpochState['result'];
}

function readHud(s: EpochState): Hud {
  const me = s.bases[0];
  const foe = s.bases[1];
  const next = EVOLVE_XP[me.age];
  return {
    gold: Math.floor(me.gold),
    age: me.age,
    xp: me.age >= AGES - 1 ? 1 : Math.round(Math.min(1, me.xp / next) * 40) / 40,
    enemyAge: foe.age,
    hp: Math.round((me.hp / me.maxHp) * 50) / 50,
    enemyHp: Math.round((foe.hp / foe.maxHp) * 50) / 50,
    queue: me.queue.join(','),
    turret: me.turret,
    special: Math.ceil(me.special),
    rage: Math.ceil(me.rage),
    time: Math.floor(s.time),
    result: s.result,
  };
}

const same = (a: Hud, b: Hud) => (Object.keys(a) as (keyof Hud)[]).every((k) => a[k] === b[k]);

/** Point du front : là où les deux armées se rencontrent. */
function frontZ(s: EpochState) {
  let mine = -1;
  let theirs = LANE + 1;
  for (const u of s.units) {
    if (u.side === 0) mine = Math.max(mine, u.z);
    else theirs = Math.min(theirs, u.z);
  }
  if (mine >= 0 && theirs <= LANE) return (mine + theirs) / 2;
  if (mine >= 0) return mine;
  // Seulement des ennemis : on ne les regarde qu'une fois le milieu du chemin passé.
  if (theirs <= LANE * 0.6) return theirs;
  return 0;
}

interface Props {
  onFinish: (souls: number) => number;
  onRetry: () => void;
  onMenu: () => void;
}

export function EpochScreen({ onFinish, onRetry, onMenu }: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const fontBig = useFont(FONT_FILE, 20);
  const fontSmall = useFont(FONT_FILE, 14);
  const picture = useSharedValue<SkPicture>(emptyPicture());
  const stateRef = useRef<EpochState>(null as unknown as EpochState);
  if (!stateRef.current) stateRef.current = applyEpochDebugHash(createEpoch());
  const cam = useRef({ z: CAM_MIN, manualUntil: 0 }).current;
  const touch = useRef({ x: 0, y: 0, camZ: 0, dragging: false, minimap: false }).current;
  const [hud, setHud] = useState<Hud>(() => readHud(stateRef.current));
  const [aiming, setAiming] = useState(false);
  const aimingRef = useRef(false);
  aimingRef.current = aiming;
  const [banner, setBanner] = useState<BannerData | null>(null);
  const [souls, setSouls] = useState<number | null>(null);
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
      if (bannerQueue.current.length > 2) bannerQueue.current.shift();
      bannerQueue.current.push(b);
      if (!bannerTimer.current) nextBanner();
    },
    [nextBanner],
  );
  useEffect(() => () => {
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
  }, []);

  useEffect(() => {
    const recorder = Skia.PictureRecorder();
    const bounds = Skia.XYWHRect(0, 0, width, height);
    const previous: SkPicture[] = [];
    const fonts = { big: fontBig, small: fontSmall };
    let last = 0;
    let raf = 0;
    let lastHit = 0;
    let overtimeShown = false;
    let suddenShown = false;
    let current = readHud(stateRef.current);

    const onEvent = (ev: EpochEvent, now: number) => {
      switch (ev.type) {
        case 'evolve':
          if (ev.side === 0) {
            haptics.success();
            showBanner({ title: `${AGE_ICONS[ev.age]} ${t(`age.${ev.age}` as TranslationKey)} !`, sub: t('epoch.evolved'), tone: 'good' });
          } else {
            haptics.medium();
            showBanner({ title: t('epoch.enemyEvolved'), sub: `${AGE_ICONS[ev.age]} ${t(`age.${ev.age}` as TranslationKey)}`, tone: 'bad' });
          }
          break;
        case 'special':
          haptics.heavy();
          showBanner({ title: `${SPECIAL_ICONS[ev.age]} ${t(`special.${ev.age}` as TranslationKey)}`, tone: ev.side === 0 ? 'good' : 'bad' });
          break;
        case 'baseHit':
          if (ev.side === 0 && now - lastHit > 400) {
            lastHit = now;
            haptics.medium();
          }
          break;
        case 'crate':
          haptics.success();
          break;
        case 'over':
          if (ev.won) haptics.success();
          else haptics.error();
          break;
        default:
          break;
      }
    };

    const frame = (now: number) => {
      const dt = last === 0 ? 1 / 60 : Math.min(MAX_DT, (now - last) / 1000);
      last = now;
      const s = stateRef.current;
      stepEpoch(s, dt);
      for (const ev of s.events) onEvent(ev, now);
      s.events.length = 0;
      if (!overtimeShown && s.time > OVERTIME_START) {
        overtimeShown = true;
        showBanner({ title: t('epoch.overtime'), sub: t('epoch.overtimeSub'), tone: 'night' });
      }
      if (!suddenShown && s.time > SUDDEN_DEATH) {
        suddenShown = true;
        showBanner({ title: t('epoch.sudden'), sub: t('epoch.suddenSub'), tone: 'bad' });
      }
      // La caméra suit le front, sauf juste après un glissement du doigt.
      if (s.time > cam.manualUntil) cam.z += (clamp(frontZ(s) - 120, CAM_MIN, CAM_MAX) - cam.z) * Math.min(1, dt * 1.8);
      const next = readHud(s);
      if (!same(next, current)) {
        current = next;
        setHud(next);
      }
      const canvas = recorder.beginRecording(bounds);
      drawEpoch(canvas, s, { width, height, camZ: cam.z, aiming: aimingRef.current }, fonts);
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
  }, [width, height, fontBig, fontSmall, picture, showBanner, cam]);

  // Fin de partie : âmes enregistrées une seule fois.
  useEffect(() => {
    if (!hud.result || souls !== null) return;
    const r = hud.result;
    setSouls(onFinish(r.won ? 40 + r.age * 10 : 5 + r.age * 8 + Math.floor(r.kills / 8)));
  }, [hud.result, souls, onFinish]);

  // ---------- Toucher : glisser pour regarder le chemin, toucher pour viser ou ramasser ----------

  const minimapZ = (y: number) => clamp(((height * MINIMAP.bottom - y) / (height * (MINIMAP.bottom - MINIMAP.top))) * LANE - 150, CAM_MIN, CAM_MAX);
  const onStart = (e: GestureResponderEvent) => {
    const { pageX, pageY } = e.nativeEvent;
    touch.x = pageX;
    touch.y = pageY;
    touch.camZ = cam.z;
    touch.dragging = false;
    touch.minimap = pageX > width - MINIMAP.margin - MINIMAP.width - 24 && pageY > height * MINIMAP.top - 20 && pageY < height * MINIMAP.bottom + 20;
    if (touch.minimap) {
      cam.z = minimapZ(pageY);
      cam.manualUntil = stateRef.current.time + MANUAL_HOLD;
    }
  };
  const onMove = (e: GestureResponderEvent) => {
    const { pageX, pageY } = e.nativeEvent;
    if (touch.minimap) {
      cam.z = minimapZ(pageY);
      cam.manualUntil = stateRef.current.time + MANUAL_HOLD;
      return;
    }
    if (!touch.dragging && Math.hypot(pageX - touch.x, pageY - touch.y) > 10) touch.dragging = true;
    if (touch.dragging) {
      // Tirer le chemin vers le bas fait avancer le regard vers l'ennemi.
      cam.z = clamp(touch.camZ + (pageY - touch.y) * 2.4, CAM_MIN, CAM_MAX);
      cam.manualUntil = stateRef.current.time + MANUAL_HOLD;
    }
  };
  const onEnd = (e: GestureResponderEvent) => {
    if (touch.dragging || touch.minimap) return;
    const { pageX, pageY } = e.nativeEvent;
    const s = stateRef.current;
    const proj = makeProjection({ width, height, camZ: cam.z, aiming: false });
    if (aimingRef.current) {
      if (useSpecial(s, 0, proj.zAt(pageY))) setAiming(false);
      return;
    }
    // Une caisse sous le doigt ?
    for (const c of s.crates) {
      const p = proj.at(c.z, c.x, c.h);
      if (p && Math.hypot(p.x - pageX, p.y - 20 * p.s - pageY) < 46 * Math.max(0.7, p.s) + 14) {
        collectCrate(s, c.id);
        return;
      }
    }
  };

  const s = stateRef.current;
  const press = (kind: UnitKind) => {
    if (trainUnit(s, 0, kind)) haptics.light();
    else haptics.error();
  };
  const queue = hud.queue ? (hud.queue.split(',') as UnitKind[]) : [];
  const canEvolveNow = hud.age < AGES - 1 && hud.xp >= 1;
  const turretPrice = turretCost(hud.age);
  const turretDone = hud.turret >= hud.age;

  return (
    <View
      style={styles.root}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={onStart}
      onResponderMove={onMove}
      onResponderRelease={onEnd}
    >
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Canvas style={StyleSheet.absoluteFill}>
          <Picture picture={picture} />
        </Canvas>
      </View>

      {/* Haut : or, époque et expérience, temps ; puis les deux bases */}
      <View pointerEvents="box-none" style={[styles.top, { top: insets.top + 6, left: insets.left + 10, right: insets.right + 10 }]}>
        <View pointerEvents="none" style={styles.row}>
          <View style={styles.pill}>
            <Text style={styles.gold}>🪙 {hud.gold}</Text>
          </View>
          <View style={[styles.pill, styles.agePill]}>
            <Text style={styles.ageText}>
              {AGE_ICONS[hud.age]} {t(`age.${hud.age}` as TranslationKey)}
            </Text>
            <View style={styles.xpBack}>
              <View style={[styles.xpFill, { width: `${Math.round(hud.xp * 100)}%` }, canEvolveNow && styles.xpReady]} />
            </View>
          </View>
          <View style={styles.pill}>
            <Text style={styles.time}>{clock(hud.time)}</Text>
          </View>
        </View>
        <View pointerEvents="none" style={styles.baseRow}>
          <Text style={styles.baseLabel}>{AGE_ICONS[hud.age]}</Text>
          <View style={styles.baseBack}>
            <View style={[styles.baseFill, { width: `${Math.round(hud.hp * 100)}%`, backgroundColor: '#4E8BF0' }]} />
          </View>
          <Text style={styles.vs}>VS</Text>
          <View style={styles.baseBack}>
            <View style={[styles.baseFill, { width: `${Math.round(hud.enemyHp * 100)}%`, backgroundColor: '#E85A4A', alignSelf: 'flex-end' }]} />
          </View>
          <Text style={styles.baseLabel}>{AGE_ICONS[hud.enemyAge]}</Text>
        </View>
        {canEvolveNow && !hud.result && (
          <Animated.View entering={ZoomIn.springify().damping(9)} style={styles.evolveWrap}>
            <Pressable
              onPress={() => {
                if (evolve(stateRef.current, 0)) haptics.success();
              }}
              accessibilityRole="button"
              style={({ pressed }) => [styles.evolve, pressed && styles.pressed]}
            >
              <Text style={styles.evolveText}>
                ⏩ {t('epoch.evolve')} {AGE_ICONS[hud.age + 1]}
              </Text>
            </Pressable>
          </Animated.View>
        )}
        {hud.rage > 0 && <Text style={styles.rage}>🔥 {t('epoch.rage', { n: hud.rage })}</Text>}
      </View>

      {aiming && (
        <View pointerEvents="none" style={styles.aimHint}>
          <Text style={styles.aimText}>{t('epoch.aim')}</Text>
        </View>
      )}

      <Banner banner={banner} />

      {/* Bas : file de recrutement et boutons */}
      <View pointerEvents="box-none" style={[styles.bottom, { bottom: insets.bottom + 10, left: insets.left + 8, right: insets.right + 8 }]}>
        <View pointerEvents="none" style={styles.queue}>
          {queue.map((k, i) => (
            <Text key={i} style={[styles.queueIcon, i === 0 && styles.queueFirst]}>
              {UNIT_ICONS[hud.age][k]}
            </Text>
          ))}
        </View>
        <View pointerEvents="box-none" style={styles.buttons}>
          {UNIT_KINDS.map((k) => {
            const cost = unitCost(k, hud.age);
            const off = hud.gold < cost || queue.length >= 5;
            return (
              <Pressable key={k} onPress={() => press(k)} accessibilityRole="button" style={({ pressed }) => [styles.btn, styles[k], off && styles.off, pressed && styles.pressed]}>
                <Text style={styles.btnIcon}>{UNIT_ICONS[hud.age][k]}</Text>
                <Text style={styles.btnName} numberOfLines={1}>
                  {t(`unit.${hud.age}.${k}` as TranslationKey)}
                </Text>
                <Text style={styles.btnCost}>{cost}</Text>
              </Pressable>
            );
          })}
          <Pressable
            onPress={() => {
              if (buyTurret(stateRef.current, 0)) haptics.success();
              else haptics.error();
            }}
            accessibilityRole="button"
            style={({ pressed }) => [styles.btn, styles.turret, (turretDone || hud.gold < turretPrice) && styles.off, pressed && styles.pressed]}
          >
            <Text style={styles.btnIcon}>🗼</Text>
            <Text style={styles.btnName}>{t('epoch.turret')}</Text>
            <Text style={styles.btnCost}>{turretDone ? '✓' : turretPrice}</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              if (hud.special <= 0) setAiming((a) => !a);
              else haptics.error();
            }}
            accessibilityRole="button"
            style={({ pressed }) => [styles.btn, styles.special, hud.special > 0 && styles.off, aiming && styles.aimingBtn, pressed && styles.pressed]}
          >
            <Text style={styles.btnIcon}>{SPECIAL_ICONS[hud.age]}</Text>
            <Text style={styles.btnName}>{t('epoch.power')}</Text>
            <Text style={styles.btnCost}>{hud.special > 0 ? `${hud.special}s` : '!'}</Text>
          </Pressable>
        </View>
      </View>

      {hud.result && (
        <Animated.View entering={FadeIn.duration(300)} style={styles.backdrop}>
          <Animated.View entering={ZoomIn.delay(400).springify().damping(13)} style={styles.card}>
            <Text style={[styles.title, hud.result.won && styles.titleWin]}>{hud.result.won ? t('epoch.win') : t('epoch.lose')}</Text>
            <Text style={styles.stat}>
              {AGE_ICONS[hud.result.age]} {t(`age.${hud.result.age}` as TranslationKey)}
            </Text>
            <Text style={styles.stat}>{t('epoch.stats', { time: clock(hud.result.time), n: hud.result.kills })}</Text>
            {souls !== null && <Text style={styles.souls}>💜 {t('gameover.souls', { n: souls })}</Text>}
            <Pressable onPress={onRetry} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
              <Text style={styles.buttonText}>{t('refuge.again')}</Text>
            </Pressable>
            <Pressable onPress={onMenu} style={({ pressed }) => [styles.button, styles.buttonHome, pressed && styles.pressed]}>
              <Text style={styles.buttonText}>{t('refuge.home')}</Text>
            </Pressable>
          </Animated.View>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#1E1830' },
  top: { position: 'absolute', gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pill: { backgroundColor: 'rgba(30,24,52,0.88)', borderRadius: 16, borderWidth: 3, borderColor: '#2B2238', paddingHorizontal: 10, paddingVertical: 4 },
  gold: { color: '#FFD25A', fontSize: 19, fontFamily: FONT.bold },
  agePill: { flex: 1, gap: 3 },
  ageText: { color: '#FFFFFF', fontSize: 14, fontFamily: FONT.bold },
  xpBack: { height: 8, borderRadius: 4, backgroundColor: '#15111F', overflow: 'hidden' },
  xpFill: { height: 8, borderRadius: 4, backgroundColor: '#8EC5FF' },
  xpReady: { backgroundColor: '#7BD35A' },
  time: { color: '#FFFFFF', fontSize: 16, fontFamily: FONT.bold },
  baseRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 2 },
  baseLabel: { fontSize: 16 },
  baseBack: { flex: 1, height: 10, borderRadius: 5, backgroundColor: 'rgba(21,17,31,0.9)', padding: 2 },
  baseFill: { height: 6, borderRadius: 3 },
  vs: { color: '#FFFFFF', fontSize: 12, fontFamily: FONT.bold, textShadowColor: '#2B2238', textShadowRadius: 3 },
  evolveWrap: { alignSelf: 'center', marginTop: 4 },
  evolve: { backgroundColor: '#7BD35A', borderRadius: 18, borderWidth: 4, borderColor: '#2B2238', borderBottomWidth: 8, paddingHorizontal: 18, paddingVertical: 8 },
  evolveText: { fontSize: 20, color: '#2B2238', fontFamily: FONT.bold },
  rage: { alignSelf: 'center', color: '#FF5A5A', fontSize: 16, fontFamily: FONT.bold, textShadowColor: '#2B2238', textShadowRadius: 4 },
  aimHint: { position: 'absolute', top: '42%', left: 20, right: 20, alignItems: 'center' },
  aimText: { color: '#FFFFFF', fontSize: 18, fontFamily: FONT.bold, backgroundColor: 'rgba(168,52,42,0.85)', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8, overflow: 'hidden', textAlign: 'center' },
  bottom: { position: 'absolute', gap: 6 },
  queue: { flexDirection: 'row', gap: 4, alignSelf: 'center', minHeight: 26 },
  queueIcon: { fontSize: 18, opacity: 0.7 },
  queueFirst: { opacity: 1, fontSize: 22 },
  buttons: { flexDirection: 'row', gap: 6 },
  btn: { flex: 1, alignItems: 'center', borderRadius: 16, borderWidth: 3, borderColor: '#2B2238', borderBottomWidth: 7, paddingVertical: 6 },
  inf: { backgroundColor: '#9EC8FF' },
  archer: { backgroundColor: '#A8E08A' },
  heavy: { backgroundColor: '#FFC27A' },
  turret: { backgroundColor: '#C9C2D8' },
  special: { backgroundColor: '#FF8A7A' },
  aimingBtn: { backgroundColor: '#FFD25A' },
  off: { opacity: 0.5 },
  pressed: { transform: [{ translateY: 3 }], borderBottomWidth: 4 },
  btnIcon: { fontSize: 24 },
  btnName: { fontSize: 11, color: '#2B2238', fontFamily: FONT.bold },
  btnCost: { fontSize: 14, color: '#2B2238', fontFamily: FONT.bold },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(12,10,20,0.65)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 360, backgroundColor: '#3A2E52', borderRadius: 28, borderWidth: 4, borderColor: '#2B2238', padding: 22, alignItems: 'center', gap: 12 },
  title: { fontSize: 28, color: '#FF7A5A', fontFamily: FONT.bold, textAlign: 'center' },
  titleWin: { color: '#FFD25A' },
  stat: { fontSize: 17, color: '#FFFFFF', fontFamily: FONT.semi, textAlign: 'center' },
  souls: { fontSize: 26, color: '#E6C8FF', fontFamily: FONT.bold },
  button: { alignSelf: 'stretch', alignItems: 'center', backgroundColor: '#7BD35A', borderRadius: 18, borderWidth: 4, borderColor: '#2B2238', borderBottomWidth: 8, paddingVertical: 10 },
  buttonHome: { backgroundColor: '#C77DFF' },
  buttonText: { fontSize: 20, color: '#2B2238', fontFamily: FONT.bold },
});
