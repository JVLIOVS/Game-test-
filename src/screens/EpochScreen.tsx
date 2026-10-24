import { Canvas, Picture, Skia, useFont, type SkPicture } from '@shopify/react-native-skia';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions, type GestureResponderEvent } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t, type TranslationKey } from '../i18n';
import { AGES, AGE_ICONS, EVOLVE_XP, LANE, OVERTIME_START, SKILLS, DIFFICULTIES, SPECIAL_ICONS, SUDDEN_DEATH, TURRET_IDS, TURRET_MAX, TURRET_SLOTS, TURRET_TYPES, UNIT_ICONS, UNIT_KINDS, UPGRADES, UPGRADE_MAX, turretPrice, unitCost, upgradeCost } from '../modes/epoch/data';
import { MINIMAP, drawEpoch, makeProjection } from '../modes/epoch/render';
import { buildTurret, buyUpgrade, collectCrate, createEpoch, evolve, stepEpoch, trainUnit, turretOffer, useSkill, useSpecial, type EpochSetup } from '../modes/epoch/sim';
import type { EpochEvent, EpochState, Side, SkillId, TurretType, UnitKind } from '../modes/epoch/types';
import { applyEpochDebugHash } from '../platform/debug';
import { audio, type SfxName } from '../platform/audio';
import { haptics } from '../platform/haptics';
import { perf } from '../platform/perf';
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
  /** Tourelles : "type:niveau" par emplacement ("-" si vide). */
  turrets: string;
  /** Duel : ce que voit le joueur 2 (en haut). */
  gold2: number;
  xp2: number;
  queue2: number;
  special2: number;
  warcry2: number;
  special: number;
  warcry: number;
  heal: number;
  /** Niveaux d'amélioration : "attaque,armure,économie,remparts". */
  upgrades: string;
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
    turrets: me.turrets.map((t) => (t.type ? `${t.type}:${t.level}` : '-')).join(','),
    gold2: Math.floor(foe.gold),
    xp2: foe.age >= AGES - 1 ? 0 : Math.round(Math.min(1, foe.xp / EVOLVE_XP[foe.age]) * 40) / 40,
    queue2: foe.queue.length,
    special2: Math.ceil(foe.special),
    warcry2: Math.ceil(foe.skills.warcry),
    special: Math.ceil(me.special),
    warcry: Math.ceil(me.skills.warcry),
    heal: Math.ceil(me.skills.heal),
    upgrades: UPGRADES.map((u) => me.upgrades[u.id]).join(','),
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

/** Bruit d'une attaque selon l'époque : gourdin, épée, flèche, mousquet, canon, laser… */
function attackSound(kind: UnitKind | 'turret', age: number): SfxName {
  if (age >= 4) return 'laser';
  if (kind === 'inf') return age === 0 ? 'hit' : 'slash';
  if (kind === 'archer' || kind === 'turret') return age === 0 ? 'swing' : age === 1 ? 'arrow' : 'shot';
  return age === 0 ? 'hit' : age === 1 ? 'slash' : 'cannon';
}

function epochSound(ev: EpochEvent) {
  switch (ev.type) {
    case 'attack':
      audio.sfx(attackSound(ev.kind, ev.age), ev.side === 0 ? 0.9 : 0.6);
      break;
    case 'impact':
      audio.sfx(ev.age >= 4 ? 'zap' : 'explosion', 0.7);
      break;
    case 'spawn':
      if (ev.side === 0) audio.sfx('spawn');
      break;
    case 'kill':
      audio.sfx(ev.side === 0 ? 'coin' : 'hurt', 0.6);
      break;
    case 'baseHit':
      if (ev.side === 0) audio.sfx('base_hit', 0.7);
      break;
    case 'evolve':
      audio.sfx(ev.side === 0 ? 'evolve' : 'horn', ev.side === 0 ? 1 : 0.6);
      break;
    case 'special':
      audio.sfx('special');
      break;
    case 'crate':
      audio.sfx('crate');
      break;
    case 'skill':
      audio.sfx(ev.skill === 'warcry' ? 'warcry' : 'heal', ev.side === 0 ? 1 : 0.6);
      break;
    case 'upgrade':
      if (ev.side === 0) audio.sfx('buy');
      break;
    case 'turret':
      audio.sfx(ev.level > 1 ? 'levelup' : 'build', ev.side === 0 ? 1 : 0.5);
      break;
    case 'over':
      audio.sfx(ev.won ? 'win' : 'lose');
      break;
  }
}

interface Props {
  setup: EpochSetup;
  onFinish: (souls: number) => number;
  onRetry: () => void;
  onMenu: () => void;
}

export function EpochScreen({ setup, onFinish, onRetry, onMenu }: Props) {
  const duel = setup.aiSides.length === 0;
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const fontBig = useFont(FONT_FILE, 20);
  const fontSmall = useFont(FONT_FILE, 14);
  const picture = useSharedValue<SkPicture>(emptyPicture());
  const stateRef = useRef<EpochState>(null as unknown as EpochState);
  if (!stateRef.current) stateRef.current = applyEpochDebugHash(createEpoch(setup));
  const cam = useRef({ z: CAM_MIN, manualUntil: 0 }).current;
  const touch = useRef({ x: 0, y: 0, camZ: 0, dragging: false, minimap: false }).current;
  const [hud, setHud] = useState<Hud>(() => readHud(stateRef.current));
  const [aiming, setAiming] = useState(false);
  const [shop, setShop] = useState(false);
  const [towers, setTowers] = useState(false);
  const [slotPick, setSlotPick] = useState<number | null>(null);
  /** Grande carte plein écran quand tu changes d'époque. */
  const [ageCard, setAgeCard] = useState<{ age: number; id: number } | null>(null);
  const ageCardTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    if (ageCardTimer.current) clearTimeout(ageCardTimer.current);
  }, []);
  const showAgeCard = useCallback((age: number) => {
    if (ageCardTimer.current) clearTimeout(ageCardTimer.current);
    setAgeCard({ age, id: Date.now() });
    ageCardTimer.current = setTimeout(() => setAgeCard(null), 2600);
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
    let lastHud = 0;

    const onEvent = (ev: EpochEvent, now: number) => {
      epochSound(ev);
      switch (ev.type) {
        case 'evolve':
          if (ev.side === 0) {
            haptics.success();
            showAgeCard(ev.age);
          } else if (duel) {
            haptics.success();
            showBanner({ title: `${AGE_ICONS[ev.age]} ${t('epoch.p2')} → ${t(`age.${ev.age}` as TranslationKey)}`, tone: 'bad' });
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
        case 'skill':
          if (ev.side === 1) showBanner({ title: `${SKILLS[ev.skill].icon} ${t(`skill.${ev.skill}` as TranslationKey)}`, sub: t('epoch.enemySkill'), tone: 'bad' });
          break;
        case 'over':
          if (ev.won) haptics.success();
          else {
                    haptics.error();
                    audio.sfx('error');
                  }
          break;
        default:
          break;
      }
    };

    const frame = (now: number) => {
      const dt = last === 0 ? 1 / 60 : Math.min(MAX_DT, (now - last) / 1000);
      last = now;
      const s = stateRef.current;
      perf.frame();
      perf.time('simulation', () => stepEpoch(s, dt));
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
      const next = perf.time('interface', () => readHud(s));
      // L'interface n'est redessinée que quelques fois par seconde (sauf la fin de partie).
      if (!same(next, current) && (next.result !== current.result || now - lastHud > 150)) {
        current = next;
        lastHud = now;
        setHud(next);
      }
      const canvas = recorder.beginRecording(bounds);
      perf.time('dessin', () => drawEpoch(canvas, s, { width, height, camZ: cam.z, aiming: aimingRef.current }, fonts));
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
  }, [width, height, fontBig, fontSmall, picture, showBanner, showAgeCard, duel, cam]);

  // Fin de partie : âmes enregistrées une seule fois.
  useEffect(() => {
    if (!hud.result || souls !== null) return;
    const r = hud.result;
    // Plus l'adversaire est fort, plus la victoire rapporte d'âmes.
    const mult = duel ? 0.5 : { easy: 0.6, normal: 1, hard: 1.5, hardcore: 2.2 }[setup.difficulty];
    setSouls(onFinish(Math.round((r.won ? 40 + r.age * 10 : 5 + r.age * 8 + Math.floor(r.kills / 8)) * mult)));
  }, [hud.result, souls, onFinish, duel, setup.difficulty]);

  // Musique orchestrale pendant la partie.
  useEffect(() => {
    audio.music('epoch');
  }, []);

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
    if (trainUnit(s, 0, kind)) {
      haptics.light();
      audio.sfx('tap');
    }
    else {
                    haptics.error();
                    audio.sfx('error');
                  }
  };
  const queue = hud.queue ? (hud.queue.split(',') as UnitKind[]) : [];
  const canEvolveNow = hud.age < AGES - 1 && hud.xp >= 1;
  const slots = hud.turrets.split(',').map((x) => {
    if (x === '-') return null;
    const [type, level] = x.split(':');
    return { type: type as TurretType, level: Number(level) };
  });
  const tapSlot = (i: number) => {
    const slot = slots[i];
    if (!slot) {
      audio.sfx('tap');
      setSlotPick((v) => (v === i ? null : i));
      return;
    }
    if (buildTurret(stateRef.current, 0, i)) haptics.success();
    else {
      haptics.error();
      audio.sfx('error');
    }
  };
  const pickTurret = (type: TurretType) => {
    if (slotPick === null) return;
    if (buildTurret(stateRef.current, 0, slotPick, type)) {
      haptics.success();
      setSlotPick(null);
    } else {
      haptics.error();
      audio.sfx('error');
    }
  };
  // Duel : le joueur 2 joue en haut de l'écran, tourné vers lui.
  const p2 = (fn: (st: EpochState) => boolean) => {
    if (fn(stateRef.current)) {
      haptics.light();
      audio.sfx('tap');
    } else {
      haptics.error();
      audio.sfx('error');
    }
  };
  const p2Turret = (st: EpochState) => {
    const b = st.bases[1];
    const empty = b.turrets.findIndex((x) => x.type === null);
    if (empty >= 0) return buildTurret(st, 1, empty, TURRET_IDS[empty]);
    const low = b.turrets.reduce((best, x, i) => (x.level < b.turrets[best].level ? i : best), 0);
    return buildTurret(st, 1, low);
  };
  const p2Special = (st: EpochState) => {
    // Le pouvoir du joueur 2 tombe sur le groupe ennemi le plus avancé vers sa base.
    const foes = st.units.filter((u) => u.side === 0);
    const z = foes.length ? Math.max(...foes.map((u) => u.z)) - 60 : LANE * 0.6;
    return useSpecial(st, 1, z);
  };
  const foeAge = hud.enemyAge;
  const p2TurretOffer = (() => {
    const b = s.bases[1];
    const empty = b.turrets.findIndex((x) => x.type === null);
    if (empty >= 0) return turretOffer(s, 1, empty, TURRET_IDS[empty]);
    const low = b.turrets.reduce((best, x, i) => (x.level < b.turrets[best].level ? i : best), 0);
    return turretOffer(s, 1, low);
  })();
  const levels = hud.upgrades.split(',').map(Number);

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
      {duel && (
        <View pointerEvents="box-none" style={[styles.p2, { top: insets.top + 4, left: insets.left + 8, right: insets.right + 8 }]}>
          <View style={styles.row}>
            <View style={styles.pill}>
              <Text style={styles.gold}>🪙 {hud.gold2}</Text>
            </View>
            <View style={[styles.pill, styles.agePill]}>
              <Text style={styles.ageText}>
                {t('epoch.p2')} · {AGE_ICONS[foeAge]} {t(`age.${foeAge}` as TranslationKey)}
              </Text>
              <View style={styles.xpBack}>
                <View style={[styles.xpFill, { width: `${Math.round(hud.xp2 * 100)}%`, backgroundColor: '#FF8A7A' }]} />
              </View>
            </View>
            {foeAge < AGES - 1 && hud.xp2 >= 1 && (
              <Pressable onPress={() => p2((st) => evolve(st, 1))} accessibilityRole="button" style={({ pressed }) => [styles.p2Evolve, pressed && styles.pressed]}>
                <Text style={styles.smallText}>⏩ {AGE_ICONS[foeAge + 1]}</Text>
              </Pressable>
            )}
          </View>
          <View style={styles.buttons}>
            {UNIT_KINDS.map((k) => {
              const cost = unitCost(k, foeAge);
              return (
                <Pressable key={k} onPress={() => p2((st) => trainUnit(st, 1, k))} accessibilityRole="button" style={({ pressed }) => [styles.small, styles[k], (hud.gold2 < cost || hud.queue2 >= 5) && styles.off, pressed && styles.pressed]}>
                  <Text style={styles.smallIcon}>{UNIT_ICONS[foeAge][k]}</Text>
                  <Text style={styles.smallText}>{cost}</Text>
                </Pressable>
              );
            })}
            <Pressable onPress={() => p2(p2Turret)} accessibilityRole="button" style={({ pressed }) => [styles.small, styles.turret, (!p2TurretOffer || hud.gold2 < p2TurretOffer.cost) && styles.off, pressed && styles.pressed]}>
              <Text style={styles.smallIcon}>🗼</Text>
              <Text style={styles.smallText}>{p2TurretOffer ? p2TurretOffer.cost : 'MAX'}</Text>
            </Pressable>
            <Pressable onPress={() => p2((st) => useSkill(st, 1, 'warcry'))} accessibilityRole="button" style={({ pressed }) => [styles.small, styles.skill, hud.warcry2 > 0 && styles.off, pressed && styles.pressed]}>
              <Text style={styles.smallIcon}>{SKILLS.warcry.icon}</Text>
              <Text style={styles.smallText}>{hud.warcry2 > 0 ? `${hud.warcry2}s` : '!'}</Text>
            </Pressable>
            <Pressable onPress={() => p2(p2Special)} accessibilityRole="button" style={({ pressed }) => [styles.small, styles.special, hud.special2 > 0 && styles.off, pressed && styles.pressed]}>
              <Text style={styles.smallIcon}>{SPECIAL_ICONS[foeAge]}</Text>
              <Text style={styles.smallText}>{hud.special2 > 0 ? `${hud.special2}s` : '!'}</Text>
            </Pressable>
          </View>
        </View>
      )}

      <View pointerEvents="box-none" style={[styles.top, { top: insets.top + (duel ? 132 : 6), left: insets.left + 10, right: insets.right + 10 }]}>
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
            <Text style={styles.time}>
              {duel ? '👥' : DIFFICULTIES[setup.difficulty].icon} {clock(hud.time)}
            </Text>
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
                audio.sfx('tap');
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

      {/* Bas : améliorations (si ouvertes), file de recrutement, troupes, puis tourelle, améliorations et compétences */}
      <View pointerEvents="box-none" style={[styles.bottom, { bottom: insets.bottom + 10, left: insets.left + 8, right: insets.right + 8 }]}>
        {shop && (
          <Animated.View entering={FadeIn.duration(150)} style={styles.shop}>
            {UPGRADES.map((u, i) => {
              const level = levels[i];
              const max = level >= UPGRADE_MAX;
              const cost = upgradeCost(level);
              return (
                <Pressable
                  key={u.id}
                  onPress={() => {
                    if (buyUpgrade(stateRef.current, 0, u.id)) haptics.success();
                    else {
                    haptics.error();
                    audio.sfx('error');
                  }
                  }}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.upCard, (max || hud.gold < cost) && styles.off, pressed && styles.pressed]}
                >
                  <Text style={styles.upIcon}>{u.icon}</Text>
                  <Text style={styles.upName}>{t(`upgrade.${u.id}` as TranslationKey)}</Text>
                  <Text style={styles.upDesc}>{t(`upgrade.${u.id}.desc` as TranslationKey, { n: Math.round(u.per * 100) })}</Text>
                  <View style={styles.pips}>
                    {Array.from({ length: UPGRADE_MAX }, (_, n) => (
                      <View key={n} style={[styles.pip, n < level && styles.pipOn]} />
                    ))}
                  </View>
                  <Text style={styles.btnCost}>{max ? 'MAX' : `🪙 ${cost}`}</Text>
                </Pressable>
              );
            })}
          </Animated.View>
        )}
        {towers && slotPick !== null && (
          <Animated.View entering={FadeIn.duration(150)} style={styles.shop}>
            {TURRET_IDS.map((type) => {
              const cost = turretPrice(type, 1, hud.age);
              return (
                <Pressable key={type} onPress={() => pickTurret(type)} accessibilityRole="button" style={({ pressed }) => [styles.upCard, hud.gold < cost && styles.off, pressed && styles.pressed]}>
                  <Text style={styles.upIcon}>{TURRET_TYPES[type].icon}</Text>
                  <Text style={styles.upName}>{t(`turret.${type}` as TranslationKey)}</Text>
                  <Text style={styles.upDesc}>{t(`turret.${type}.desc` as TranslationKey)}</Text>
                  <Text style={styles.btnCost}>🪙 {cost}</Text>
                </Pressable>
              );
            })}
          </Animated.View>
        )}
        {towers && (
          <Animated.View entering={FadeIn.duration(150)} style={styles.shop}>
            {Array.from({ length: TURRET_SLOTS }, (_, i) => {
              const slot = slots[i];
              const max = !!slot && slot.level >= TURRET_MAX;
              const cost = slot && !max ? turretPrice(slot.type, slot.level + 1, hud.age) : 0;
              return (
                <Pressable
                  key={i}
                  onPress={() => tapSlot(i)}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.upCard, slotPick === i && styles.slotOn, slot && !max && hud.gold < cost && styles.off, pressed && styles.pressed]}
                >
                  <Text style={styles.upIcon}>{slot ? TURRET_TYPES[slot.type].icon : '➕'}</Text>
                  <Text style={styles.upName}>{slot ? t(`turret.${slot.type}` as TranslationKey) : t('epoch.slot', { n: i + 1 })}</Text>
                  {slot ? (
                    <View style={styles.pips}>
                      {Array.from({ length: TURRET_MAX }, (_, n) => (
                        <View key={n} style={[styles.pip, n < slot.level && styles.pipOn]} />
                      ))}
                    </View>
                  ) : (
                    <Text style={styles.upDesc}>{t('epoch.slotEmpty')}</Text>
                  )}
                  <Text style={styles.btnCost}>{!slot ? '…' : max ? 'MAX' : `⬆️ ${cost}`}</Text>
                </Pressable>
              );
            })}
          </Animated.View>
        )}
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
        </View>
        <View pointerEvents="box-none" style={styles.buttons}>
          <Pressable
            onPress={() => {
              audio.sfx('tap');
              setTowers((v) => !v);
              setShop(false);
              setSlotPick(null);
            }}
            accessibilityRole="button"
            style={({ pressed }) => [styles.small, styles.turret, towers && styles.aimingBtn, pressed && styles.pressed]}
          >
            <Text style={styles.smallIcon}>🗼</Text>
            <Text style={styles.smallText}>{t('epoch.turrets')}</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              audio.sfx('tap');
              setShop((v) => !v);
              setTowers(false);
            }} accessibilityRole="button" style={({ pressed }) => [styles.small, styles.shopBtn, shop && styles.aimingBtn, pressed && styles.pressed]}>
            <Text style={styles.smallIcon}>🔧</Text>
            <Text style={styles.smallText}>{t('epoch.upgrades')}</Text>
          </Pressable>
          {(['warcry', 'heal'] as SkillId[]).map((k) => {
            const wait = k === 'warcry' ? hud.warcry : hud.heal;
            return (
              <Pressable
                key={k}
                onPress={() => {
                  if (useSkill(stateRef.current, 0, k)) haptics.heavy();
                  else {
                    haptics.error();
                    audio.sfx('error');
                  }
                }}
                accessibilityRole="button"
                accessibilityLabel={t(`skill.${k}` as TranslationKey)}
                style={({ pressed }) => [styles.small, styles.skill, wait > 0 && styles.off, pressed && styles.pressed]}
              >
                <Text style={styles.smallIcon}>{SKILLS[k].icon}</Text>
                <Text style={styles.smallText}>{wait > 0 ? `${wait}s` : t(`skill.${k}` as TranslationKey)}</Text>
              </Pressable>
            );
          })}
          <Pressable
            onPress={() => {
              if (hud.special <= 0) {
                audio.sfx('tap');
                setAiming((a) => !a);
              }
              else {
                    haptics.error();
                    audio.sfx('error');
                  }
            }}
            accessibilityRole="button"
            style={({ pressed }) => [styles.small, styles.special, hud.special > 0 && styles.off, aiming && styles.aimingBtn, pressed && styles.pressed]}
          >
            <Text style={styles.smallIcon}>{SPECIAL_ICONS[hud.age]}</Text>
            <Text style={styles.smallText}>{hud.special > 0 ? `${hud.special}s` : t('epoch.power')}</Text>
          </Pressable>
        </View>
      </View>

      {ageCard && !hud.result && (
        <Animated.View key={ageCard.id} pointerEvents="none" entering={FadeIn.duration(200)} style={styles.ageBackdrop}>
          <Animated.View entering={ZoomIn.springify().damping(8)} style={styles.ageCard}>
            <Text style={styles.ageStep}>{t('epoch.ageStep', { n: ageCard.age + 1, max: AGES })}</Text>
            <Text style={styles.ageBig}>{AGE_ICONS[ageCard.age]}</Text>
            <Text style={styles.ageName}>{t(`age.${ageCard.age}` as TranslationKey)}</Text>
            <View style={styles.ageUnits}>
              {UNIT_KINDS.map((k, i) => (
                <Animated.Text key={k} entering={ZoomIn.delay(300 + i * 150).springify()} style={styles.ageUnit}>
                  {UNIT_ICONS[ageCard.age][k]}
                </Animated.Text>
              ))}
              <Animated.Text entering={ZoomIn.delay(750).springify()} style={styles.ageUnit}>
                {SPECIAL_ICONS[ageCard.age]}
              </Animated.Text>
            </View>
            <Text style={styles.ageSub}>{t('epoch.evolved')}</Text>
          </Animated.View>
        </Animated.View>
      )}

      {hud.result && (
        <Animated.View entering={FadeIn.duration(300)} style={styles.backdrop}>
          <Animated.View entering={ZoomIn.delay(400).springify().damping(13)} style={styles.card}>
            <Text style={[styles.title, hud.result.won && styles.titleWin]}>
              {duel ? (hud.result.won ? t('epoch.p1wins') : t('epoch.p2wins')) : hud.result.won ? t('epoch.win') : t('epoch.lose')}
            </Text>
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
  small: { flex: 1, alignItems: 'center', borderRadius: 14, borderWidth: 3, borderColor: '#2B2238', borderBottomWidth: 6, paddingVertical: 3 },
  smallIcon: { fontSize: 18 },
  smallText: { fontSize: 11, color: '#2B2238', fontFamily: FONT.bold },
  shopBtn: { backgroundColor: '#FFE38A' },
  skill: { backgroundColor: '#A8E0C8' },
  shop: { flexDirection: 'row', gap: 6, backgroundColor: 'rgba(30,24,52,0.92)', borderRadius: 18, borderWidth: 3, borderColor: '#2B2238', padding: 6 },
  upCard: { flex: 1, alignItems: 'center', backgroundColor: '#F4EEE0', borderRadius: 12, borderWidth: 2, borderColor: '#2B2238', paddingVertical: 6, paddingHorizontal: 2, gap: 2 },
  upIcon: { fontSize: 22 },
  upName: { fontSize: 12, color: '#2B2238', fontFamily: FONT.bold },
  upDesc: { fontSize: 10, color: '#4A3E5E', fontFamily: FONT.semi, textAlign: 'center' },
  pips: { flexDirection: 'row', gap: 2 },
  pip: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#C9C2D8' },
  pipOn: { backgroundColor: '#7BD35A' },
  btn: { flex: 1, alignItems: 'center', borderRadius: 16, borderWidth: 3, borderColor: '#2B2238', borderBottomWidth: 7, paddingVertical: 6 },
  inf: { backgroundColor: '#9EC8FF' },
  archer: { backgroundColor: '#A8E08A' },
  heavy: { backgroundColor: '#FFC27A' },
  turret: { backgroundColor: '#C9C2D8' },
  slotOn: { borderColor: '#FFD25A', backgroundColor: '#FFF4C8' },
  p2: { position: 'absolute', gap: 6, transform: [{ rotate: '180deg' }] },
  p2Evolve: { backgroundColor: '#7BD35A', borderRadius: 14, borderWidth: 3, borderColor: '#2B2238', borderBottomWidth: 6, paddingHorizontal: 10, paddingVertical: 6 },
  ageBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(12,10,20,0.45)' },
  ageCard: { width: '84%', maxWidth: 340, backgroundColor: '#3A2E52', borderRadius: 30, borderWidth: 5, borderColor: '#FFD25A', paddingVertical: 22, paddingHorizontal: 16, alignItems: 'center', gap: 6 },
  ageStep: { color: '#FFD25A', fontSize: 16, fontFamily: FONT.bold, letterSpacing: 2 },
  ageBig: { fontSize: 86 },
  ageName: { color: '#FFFFFF', fontSize: 30, fontFamily: FONT.bold, textAlign: 'center' },
  ageUnits: { flexDirection: 'row', gap: 12, marginVertical: 6 },
  ageUnit: { fontSize: 36 },
  ageSub: { color: '#D8D0E8', fontSize: 15, fontFamily: FONT.semi, textAlign: 'center' },
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
