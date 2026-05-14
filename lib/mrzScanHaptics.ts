import * as Haptics from 'expo-haptics';
import { Platform, Vibration } from 'react-native';

/** Misafir sırasına göre hafif, profesyonel dokunsal geri bildirim */
export function triggerMrzSuccessHaptic(variant: number, enabled: boolean): void {
  if (!enabled) return;
  const v = Math.abs(variant) % 5;
  try {
    if (Platform.OS === 'ios') {
      if (v === 0) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      else if (v === 1) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      else if (v === 2) {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setTimeout(() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light), 45);
      } else if (v === 3) void Haptics.selectionAsync();
      else void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      const patterns: number[] | number =
        v === 0
          ? 35
          : v === 1
            ? 55
            : v === 2
              ? [0, 35, 40, 35]
              : v === 3
                ? [0, 28, 35, 28]
                : [0, 30, 50, 30];
      Vibration.vibrate(patterns);
    }
  } catch {
    /* yok say */
  }
}
