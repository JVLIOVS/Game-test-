import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FONT } from './fonts';

export function Hint({ text }: { text: string | null }) {
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="none" style={[styles.root, { bottom: insets.bottom + 40 }]}>
      {text && (
        <Animated.View key={text} entering={FadeIn.duration(300)} exiting={FadeOut.duration(250)} style={styles.bubble}>
          <Text style={styles.text}>{text}</Text>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  bubble: {
    backgroundColor: 'rgba(43,34,56,0.85)',
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderWidth: 3,
    borderColor: '#2B2238',
    maxWidth: 420,
  },
  text: { color: '#FFFFFF', fontSize: 17, fontFamily: FONT.semi, textAlign: 'center' },
});
