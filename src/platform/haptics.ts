import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

// Retours haptiques. Silencieux sur le web.
const enabled = Platform.OS === 'ios' || Platform.OS === 'android';

export const haptics = {
  light: () => enabled && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}),
  medium: () => enabled && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}),
  heavy: () => enabled && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {}),
};
