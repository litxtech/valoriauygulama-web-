import { NativeModules, Platform } from 'react-native';

export type ScreenshotListenerSubscription = { remove: () => void };

/** Dev client yeniden derlenmeden native modül yoksa false (import patlamasın). */
export function isExpoScreenCaptureNativeAvailable(): boolean {
  if (Platform.OS === 'web') return false;
  return Boolean((NativeModules as { ExpoScreenCapture?: unknown }).ExpoScreenCapture);
}

function loadExpoScreenCaptureModule(): typeof import('expo-screen-capture') | null {
  if (!isExpoScreenCaptureNativeAvailable()) return null;
  try {
    // require: HMR sırasında dinamik import chunk kaymasını önler
    return require('expo-screen-capture') as typeof import('expo-screen-capture');
  } catch {
    return null;
  }
}

export async function addScreenshotListenerSafe(
  listener: () => void
): Promise<ScreenshotListenerSubscription | null> {
  const ScreenCapture = loadExpoScreenCaptureModule();
  if (!ScreenCapture || typeof ScreenCapture.addScreenshotListener !== 'function') return null;
  try {
    return ScreenCapture.addScreenshotListener(listener);
  } catch {
    return null;
  }
}
