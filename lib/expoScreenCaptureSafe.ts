import { NativeModules, Platform } from 'react-native';

export type ScreenshotListenerSubscription = { remove: () => void };

/** Dev client yeniden derlenmeden native modül yoksa false (import patlamasın). */
export function isExpoScreenCaptureNativeAvailable(): boolean {
  if (Platform.OS === 'web') return false;
  return Boolean((NativeModules as { ExpoScreenCapture?: unknown }).ExpoScreenCapture);
}

export async function addScreenshotListenerSafe(
  listener: () => void
): Promise<ScreenshotListenerSubscription | null> {
  if (!isExpoScreenCaptureNativeAvailable()) return null;
  try {
    const ScreenCapture = await import('expo-screen-capture');
    if (typeof ScreenCapture.addScreenshotListener !== 'function') return null;
    return ScreenCapture.addScreenshotListener(listener);
  } catch {
    return null;
  }
}
