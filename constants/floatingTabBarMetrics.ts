import { Platform } from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';
import { getEffectiveBottomInset } from '@/lib/effectiveSafeArea';

/** Yüzen ada — sol/sağ kenardan boşluk (tüm platformlar) */
export const FLOAT_SIDE_INSET = 16;
/** Yüzen ada — güvenli alanın üstüne eklenen alt boşluk (ada havada dursun) */
export const FLOAT_BOTTOM_GAP = 12;

/** Android: ikon + etiket satırı (safe area BottomTabBar içinde) */
export const ANDROID_TAB_BAR_CONTENT_HEIGHT = 56;

/** iOS yüzen ada: daha kompakt iç satır */
export const IOS_TAB_BAR_CONTENT_HEIGHT = 50;

export function getFloatingTabBarInnerHeight(): number {
  return Platform.OS === 'android' ? ANDROID_TAB_BAR_CONTENT_HEIGHT : IOS_TAB_BAR_CONTENT_HEIGHT;
}

/** Görünür yüzen ada yüksekliği (güvenli alan HARİÇ) — tabBarStyle.height için */
export function getFloatingTabBarBarHeight(): number {
  return getFloatingTabBarInnerHeight() + 14;
}

/** Adanın altındaki boşluk = güvenli alan + yüzen boşluk */
export function getFloatingTabBarBottomGap(insets: Pick<EdgeInsets, 'bottom'>): number {
  const safe = Platform.OS === 'android' ? getEffectiveBottomInset(insets) : insets.bottom;
  return safe + FLOAT_BOTTOM_GAP;
}

/** İçeriğin tab bar arkasında kalmaması için rezerve edilen toplam yükseklik */
export function getFloatingTabBarTotalHeight(insets: Pick<EdgeInsets, 'bottom'>): number {
  return getFloatingTabBarBarHeight() + getFloatingTabBarBottomGap(insets);
}
