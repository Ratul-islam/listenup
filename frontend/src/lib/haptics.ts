import * as Haptics from 'expo-haptics';

// Fire-and-forget; haptics are a nicety and must never break a flow
export const haptics = {
  success: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}),
  error: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {}),
  tap: () => void Haptics.selectionAsync().catch(() => {}),
};
