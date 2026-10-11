import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t } from '../i18n';
import { FONT } from './fonts';
import type { HudState } from './hudState';

function Bar({ ratio, color, width }: { ratio: number; color: string; width: number }) {
  return (
    <View style={[styles.barBack, { width }]}>
      <View style={[styles.barFill, { width: Math.max(0, Math.min(1, ratio)) * (width - 6), backgroundColor: color }]} />
    </View>
  );
}

const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, s % 60)).padStart(2, '0')}`;

export function Hud({ hud }: { hud: HudState }) {
  const insets = useSafeAreaInsets();
  const bump = useSharedValue(1);

  useEffect(() => {
    bump.value = withSequence(withTiming(1.2, { duration: 70 }), withSpring(1, { damping: 8, stiffness: 300 }));
  }, [hud.wood, bump]);

  const woodStyle = useAnimatedStyle(() => ({ transform: [{ scale: bump.value }] }));
  const night = hud.phase === 'night';

  return (
    <View pointerEvents="none" style={[styles.root, { top: insets.top + 8, left: insets.left + 12, right: insets.right + 12 }]}>
      <View style={styles.column}>
        <Animated.View style={[styles.pill, woodStyle]} accessibilityLabel={`${t('resource.wood')} ${hud.wood}`}>
          <View style={styles.log}>
            <View style={styles.logEnd} />
          </View>
          <Text style={styles.count}>{hud.wood}</Text>
        </Animated.View>
        <View style={styles.row}>
          <View style={styles.heart} />
          <Bar ratio={hud.heroHp} color="#7BD35A" width={96} />
        </View>
      </View>

      <View style={[styles.column, styles.right]}>
        <View style={[styles.pill, night && styles.pillNight]}>
          <View style={[styles.sun, night && styles.moon]} />
          <Text style={styles.phase}>
            {night ? t('hud.night', { n: hud.night }) : t('hud.day', { n: hud.night + 1 })}
            {'  '}
            <Text style={styles.phaseSub}>{night ? t('hud.zombies', { n: hud.zombiesLeft }) : formatTime(hud.dayTimer)}</Text>
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>{t('hud.base')}</Text>
          <Bar ratio={hud.houseHp} color="#FFD25A" width={96} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', flexDirection: 'row', justifyContent: 'space-between' },
  column: { gap: 6 },
  right: { alignItems: 'flex-end' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(43,34,56,0.82)',
    borderRadius: 22,
    paddingVertical: 6,
    paddingLeft: 10,
    paddingRight: 14,
    borderWidth: 3,
    borderColor: '#2B2238',
    gap: 8,
  },
  pillNight: { backgroundColor: 'rgba(30,36,90,0.9)' },
  log: {
    width: 30,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#9B5E2E',
    borderWidth: 2,
    borderColor: '#2B2238',
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: 1,
  },
  logEnd: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#E3B57A' },
  count: { color: '#FFD25A', fontSize: 24, fontFamily: FONT.bold, minWidth: 28 },
  sun: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#FFD25A', borderWidth: 2, borderColor: '#2B2238' },
  moon: { backgroundColor: '#DDE6FF' },
  phase: { color: '#FFFFFF', fontSize: 17, fontFamily: FONT.bold },
  phaseSub: { color: '#FFD25A', fontSize: 15, fontFamily: FONT.semi },
  label: { color: '#FFFFFF', fontSize: 13, fontFamily: FONT.semi, textShadowColor: '#2B2238', textShadowRadius: 3 },
  heart: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#FF5A5A', borderWidth: 2, borderColor: '#2B2238' },
  barBack: { height: 14, borderRadius: 7, backgroundColor: 'rgba(43,34,56,0.85)', padding: 3, borderWidth: 0 },
  barFill: { height: 8, borderRadius: 4 },
});
