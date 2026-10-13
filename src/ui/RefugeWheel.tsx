import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, ZoomIn, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { t, type TranslationKey } from '../i18n';
import { ARTIFACTS, WHEEL } from '../modes/refuge/data';
import type { WheelSpin } from '../modes/refuge/types';
import { haptics } from '../platform/haptics';
import { FONT } from './fonts';

// Roue de fin de manche : elle tourne, s'arrête sur le gain, puis la partie reprend.

const SIZE = 270;
const R = SIZE / 2;
const SEG = 360 / WHEEL.length;
const SPIN_MS = 2600;

/** Parts de la roue (créées une seule fois). */
function useSlices() {
  return useMemo(
    () =>
      WHEEL.map((_, i) => {
        const b = Skia.PathBuilder.Make();
        b.moveTo(R, R);
        b.arcToOval(Skia.XYWHRect(6, 6, SIZE - 12, SIZE - 12), -90 + i * SEG, SEG, false);
        b.close();
        return b.build();
      }),
    [],
  );
}

export function RefugeWheel({ spin, onDone }: { spin: WheelSpin; onDone: () => void }) {
  const slices = useSlices();
  const index = WHEEL.findIndex((w) => w.prize === spin.prize);
  const rotation = useSharedValue(0);
  const [stopped, setStopped] = useState(false);

  useEffect(() => {
    // Plusieurs tours, puis la case gagnée s'arrête sous la flèche (en haut).
    // L'animation est calculée image par image : elle repart de zéro à chaque nouvelle roue.
    const target = 360 * 5 - (index * SEG + SEG / 2) + (Math.random() - 0.5) * SEG * 0.6;
    const start = Date.now();
    let raf = 0;
    rotation.value = 0;
    const tick = () => {
      const p = Math.min(1, (Date.now() - start) / SPIN_MS);
      rotation.value = target * (1 - Math.pow(1 - p, 3));
      if (p < 1) raf = requestAnimationFrame(tick);
      else setStopped(true);
    };
    raf = requestAnimationFrame(tick);
    // Sécurité : la roue ne reste jamais bloquée à l'écran.
    const safety = setTimeout(onDone, SPIN_MS + 5000);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(safety);
    };
  }, [index, rotation, onDone]);

  useEffect(() => {
    if (!stopped) return;
    haptics.success();
    const timer = setTimeout(onDone, 2200);
    return () => clearTimeout(timer);
  }, [stopped, onDone]);

  const wheelStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }));
  const prize = WHEEL[index];
  const stars = spin.luck >= 0.66 ? '★★★' : spin.luck >= 0.33 ? '★★☆' : '★☆☆';

  return (
    <Animated.View entering={FadeIn.duration(200)} style={styles.backdrop}>
      <Pressable style={StyleSheet.absoluteFill} onPress={stopped ? onDone : undefined} />
      <Text style={styles.title}>{t('wheel.title', { n: spin.round })}</Text>
      <View style={styles.luckRow}>
        <Text style={styles.luckLabel}>
          {t('wheel.luck')} {stars}
        </Text>
        <View style={styles.luckBack}>
          <View style={[styles.luckFill, { width: `${Math.round(spin.luck * 100)}%` }]} />
        </View>
      </View>
      <Text style={styles.luckHint}>{t('wheel.luckHint')}</Text>

      <View style={styles.wheelWrap}>
        <Animated.View style={[styles.wheel, wheelStyle]}>
          <Canvas style={StyleSheet.absoluteFill}>
            {slices.map((p, i) => (
              <Path key={i} path={p} color={WHEEL[i].color} />
            ))}
            {slices.map((p, i) => (
              <Path key={`o${i}`} path={p} color="#2B2238" style="stroke" strokeWidth={3} />
            ))}
          </Canvas>
          {WHEEL.map((w, i) => {
            const a = ((i * SEG + SEG / 2 - 90) * Math.PI) / 180;
            return (
              <Text
                key={w.prize}
                style={[styles.segIcon, { left: R + Math.cos(a) * R * 0.66 - 18, top: R + Math.sin(a) * R * 0.66 - 18, transform: [{ rotate: `${i * SEG + SEG / 2}deg` }] }]}
              >
                {w.icon}
              </Text>
            );
          })}
          <View style={styles.hub} />
        </Animated.View>
        <View style={styles.pointer} />
      </View>

      {stopped && (
        <Animated.View entering={ZoomIn.springify().damping(11)} style={[styles.result, { borderColor: prize.color }]}>
          <Text style={styles.resultIcon}>{spin.artifact ? ARTIFACTS[spin.artifact].icon : prize.icon}</Text>
          <View style={styles.resultBody}>
            <Text style={styles.resultName}>{spin.artifact ? t(`artifact.${spin.artifact}` as TranslationKey) : t(`wheel.${prize.prize}` as TranslationKey)}</Text>
            <Text style={styles.resultDesc}>
              {spin.artifact ? `${t(`artifact.${spin.artifact}.desc` as TranslationKey)} ${t('wheel.toBag')}` : t(`wheel.${prize.prize}.desc` as TranslationKey)}
            </Text>
          </View>
        </Animated.View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(12,10,20,0.78)', alignItems: 'center', justifyContent: 'center', padding: 20, gap: 10 },
  title: { fontSize: 28, color: '#FFD25A', fontFamily: FONT.bold, textAlign: 'center', textShadowColor: '#2B2238', textShadowRadius: 6 },
  luckRow: { flexDirection: 'row', alignItems: 'center', gap: 10, width: '100%', maxWidth: 320 },
  luckLabel: { color: '#FFFFFF', fontSize: 16, fontFamily: FONT.bold },
  luckBack: { flex: 1, height: 14, borderRadius: 7, backgroundColor: '#15111F', padding: 2 },
  luckFill: { height: 10, borderRadius: 5, backgroundColor: '#7BD35A' },
  luckHint: { color: '#C9C2D8', fontSize: 13, fontFamily: FONT.semi, textAlign: 'center', maxWidth: 320 },
  wheelWrap: { width: SIZE, height: SIZE + 16, alignItems: 'center', marginTop: 8 },
  wheel: { width: SIZE, height: SIZE, marginTop: 16, borderRadius: R, borderWidth: 6, borderColor: '#2B2238', backgroundColor: '#2B2238' },
  segIcon: { position: 'absolute', width: 36, height: 36, fontSize: 26, textAlign: 'center', lineHeight: 36 },
  hub: { position: 'absolute', left: R - 22, top: R - 22, width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFD25A', borderWidth: 5, borderColor: '#2B2238' },
  pointer: {
    position: 'absolute',
    top: 0,
    width: 0,
    height: 0,
    borderLeftWidth: 16,
    borderRightWidth: 16,
    borderTopWidth: 30,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#FFFFFF',
  },
  result: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#3A2E52', borderRadius: 20, borderWidth: 4, padding: 12, width: '100%', maxWidth: 340 },
  resultIcon: { fontSize: 40 },
  resultBody: { flex: 1 },
  resultName: { color: '#FFFFFF', fontSize: 20, fontFamily: FONT.bold },
  resultDesc: { color: '#D8D0E8', fontSize: 14, fontFamily: FONT.semi },
});
