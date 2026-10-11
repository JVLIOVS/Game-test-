import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

// Retours haptiques. Silencieux sur le web.
const enabled = Platform.OS === 'ios' || Platform.OS === 'android';
const ignore = () => {};

export const haptics = {
  light: () => enabled && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(ignore),
  medium: () => enabled && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(ignore),
  heavy: () => enabled && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(ignore),
  success: () => enabled && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(ignore),
  error: () => enabled && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(ignore),
};
