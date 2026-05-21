import * as Haptics from 'expo-haptics';
import { NativeModules, Platform, Vibration } from 'react-native';

/** Dev client eskiyse veya modül yoksa false — çağrı Uncaught promise üretmesin. */
export function isExpoHapticsNativeAvailable(): boolean {
  if (Platform.OS === 'web') return false;
  return Boolean((NativeModules as { ExpoHaptics?: unknown }).ExpoHaptics);
}

function androidFallbackTap(): void {
  if (Platform.OS === 'android') Vibration.vibrate(12);
}

export function hapticSelection(): void {
  if (Platform.OS === 'android') return;
  if (!isExpoHapticsNativeAvailable()) {
    androidFallbackTap();
    return;
  }
  void Haptics.selectionAsync().catch(() => {
    androidFallbackTap();
  });
}

export function hapticImpactLight(): void {
  if (Platform.OS === 'android') return;
  if (!isExpoHapticsNativeAvailable()) {
    androidFallbackTap();
    return;
  }
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {
    androidFallbackTap();
  });
}
