import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { t } from '../i18n';
import { FONT } from './fonts';

export function GameOver({ nights, zombies, onRetry }: { nights: number; zombies: number; onRetry: () => void }) {
  return (
    <Animated.View entering={FadeIn.duration(400)} style={styles.backdrop}>
      <Animated.View entering={ZoomIn.delay(250).springify().damping(13)} style={styles.card}>
        <Text style={styles.title}>{t('gameover.title')}</Text>
        <View style={styles.stats}>
          <Text style={styles.stat}>{t('gameover.nights', { n: nights })}</Text>
          <Text style={styles.stat}>{t('gameover.zombies', { n: zombies })}</Text>
        </View>
        <Pressable
          onPress={onRetry}
          accessibilityRole="button"
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        >
          <Text style={styles.buttonText}>{t('gameover.retry')}</Text>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(18,14,30,0.6)',
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
    padding: 24,
    alignItems: 'center',
    gap: 18,
  },
  title: { fontSize: 28, color: '#FF7A5A', fontFamily: FONT.bold, textAlign: 'center' },
  stats: { gap: 6, alignItems: 'center' },
  stat: { fontSize: 18, color: '#FFFFFF', fontFamily: FONT.semi },
  button: {
    backgroundColor: '#7BD35A',
    borderRadius: 20,
    borderWidth: 4,
    borderColor: '#2B2238',
    paddingVertical: 12,
    paddingHorizontal: 40,
    borderBottomWidth: 8,
  },
  buttonPressed: { transform: [{ translateY: 3 }], borderBottomWidth: 5 },
  buttonText: { fontSize: 22, color: '#2B2238', fontFamily: FONT.bold },
});
