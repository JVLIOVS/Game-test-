import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t } from '../i18n';
import { FONT } from './fonts';

export function Hud({ wood }: { wood: number }) {
  const insets = useSafeAreaInsets();
  const bump = useSharedValue(1);

  useEffect(() => {
    if (wood === 0) return;
    bump.value = withSequence(withTiming(1.25, { duration: 70 }), withSpring(1, { damping: 8, stiffness: 300 }));
  }, [wood, bump]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: bump.value }] }));

  return (
    <View pointerEvents="none" style={[styles.root, { top: insets.top + 8, left: insets.left + 12 }]}>
      <Animated.View style={[styles.pill, style]} accessibilityLabel={`${t('resource.wood')} ${wood}`}>
        <View style={styles.log}>
          <View style={styles.logEnd} />
        </View>
        <Text style={styles.count}>{wood}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(43,34,56,0.82)',
    borderRadius: 22,
    paddingVertical: 6,
    paddingLeft: 10,
    paddingRight: 16,
    borderWidth: 3,
    borderColor: '#2B2238',
    gap: 8,
  },
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
});
