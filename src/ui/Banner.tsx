import { StyleSheet, Text, View } from 'react-native';
import Animated, { ZoomIn, FadeOut } from 'react-native-reanimated';
import { FONT } from './fonts';

export interface BannerData {
  id: number;
  title: string;
  sub?: string;
  tone: 'day' | 'night' | 'good' | 'bad';
}

const TONE = {
  day: '#FFD25A',
  night: '#9FB4FF',
  good: '#7BD35A',
  bad: '#FF5A5A',
} as const;

export function Banner({ banner }: { banner: BannerData | null }) {
  return (
    <View pointerEvents="none" style={styles.root}>
      {banner && (
        <Animated.View key={banner.id} entering={ZoomIn.springify().damping(12)} exiting={FadeOut.duration(250)} style={styles.card}>
          <Text style={[styles.title, { color: TONE[banner.tone] }]}>{banner.title}</Text>
          {banner.sub ? <Text style={styles.sub}>{banner.sub}</Text> : null}
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', top: '24%', left: 16, right: 16, alignItems: 'center' },
  card: { alignItems: 'center', paddingHorizontal: 20, paddingVertical: 8 },
  title: {
    fontSize: 38,
    fontFamily: FONT.bold,
    textAlign: 'center',
    textShadowColor: '#2B2238',
    textShadowRadius: 6,
    textShadowOffset: { width: 0, height: 3 },
  },
  sub: {
    marginTop: 2,
    fontSize: 18,
    color: '#FFFFFF',
    fontFamily: FONT.semi,
    textAlign: 'center',
    textShadowColor: '#2B2238',
    textShadowRadius: 4,
  },
});
