import { Platform } from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';
import { getEffectiveBottomInset } from '@/lib/effectiveSafeArea';

/** Android: ikon + etiket satırı (safe area BottomTabBar içinde) */
export const ANDROID_TAB_BAR_CONTENT_HEIGHT = 56;

/** iOS yüzen ada: daha kompakt iç satır */
export const IOS_TAB_BAR_CONTENT_HEIGHT = 50;

export function getFloatingTabBarInnerHeight(): number {
  return Platform.OS === 'android' ? ANDROID_TAB_BAR_CONTENT_HEIGHT : IOS_TAB_BAR_CONTENT_HEIGHT;
}

/** iOS: shell’de minimal boşluk; asıl safe area BottomTabBar içinde */
export const IOS_TAB_BAR_FLOAT_MARGIN = 2;

export function getIosFloatingTabBarBottomGap(insets: Pick<EdgeInsets, 'bottom'>): number {
  return IOS_TAB_BAR_FLOAT_MARGIN + insets.bottom;
}

/** Android: sistem gezinme çubuğu (gesture / 3 tuş) için taban boşluk */
export function getAndroidTabBarBottomGap(insets: Pick<EdgeInsets, 'bottom'>): number {
  return getEffectiveBottomInset(insets);
}

export function getFloatingTabBarBottomGap(insets: Pick<EdgeInsets, 'bottom'>): number {
  return Platform.OS === 'android' ? getAndroidTabBarBottomGap(insets) : getIosFloatingTabBarBottomGap(insets);
}

export function getFloatingTabBarTotalHeight(insets: Pick<EdgeInsets, 'bottom'>): number {
  return getFloatingTabBarInnerHeight() + getFloatingTabBarBottomGap(insets);
}
