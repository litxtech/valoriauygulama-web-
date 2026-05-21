import { Platform } from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';
import { initialWindowMetrics } from 'react-native-safe-area-context';

/**
 * Bazı Android cihazlarda (özellikle edge-to-edge / gesture nav) useSafeAreaInsets().bottom 0 gelir;
 * sistem gezinme çubuğu uygulama tab bar ve inputunun üstüne biner.
 */
const ANDROID_MIN_BOTTOM_INSET = 32;

export function getEffectiveBottomInset(insets: Pick<EdgeInsets, 'bottom'>): number {
  if (Platform.OS !== 'android') return insets.bottom;
  const boot = initialWindowMetrics?.insets.bottom ?? 0;
  return Math.max(insets.bottom, boot, ANDROID_MIN_BOTTOM_INSET);
}

/** Sohbet alt giriş satırı — iOS home indicator + Android nav bar. */
export function getChatInputBottomPadding(insets: Pick<EdgeInsets, 'bottom'>, extra = 8): number {
  if (Platform.OS === 'ios') return Math.max(insets.bottom, 20) + extra;
  return getEffectiveBottomInset(insets) + extra;
}
