import { Platform } from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';
import { getEffectiveBottomInset } from '@/lib/effectiveSafeArea';

/** Yüzen cam ada — yan boşluk */
export const FLOAT_SIDE_INSET = 12;
/** Ada home indicator üstünde hafif boşluk */
export const FLOAT_BOTTOM_GAP = 8;
/** Partner portal — yüzen ada kenar boşluğu */
export const PARTNER_FLOAT_SIDE_INSET = 16;
export const PARTNER_FLOAT_BOTTOM_GAP = 12;

/** Kompakt tab satırı (FAB overhang yok) */
export const VALORIA_TAB_BAR_CONTENT_HEIGHT = 54;
export const VALORIA_TAB_BAR_RADIUS = 24;
export const VALORIA_TAB_FAB_OVERHANG = 0;

export const ANDROID_TAB_BAR_CONTENT_HEIGHT = VALORIA_TAB_BAR_CONTENT_HEIGHT;
export const IOS_TAB_BAR_CONTENT_HEIGHT = VALORIA_TAB_BAR_CONTENT_HEIGHT;

export function getFloatingTabBarInnerHeight(): number {
  return VALORIA_TAB_BAR_CONTENT_HEIGHT;
}

export function getFloatingTabBarBarHeight(): number {
  return getFloatingTabBarInnerHeight() + VALORIA_TAB_FAB_OVERHANG;
}

export function getFloatingTabBarBottomGap(
  insets?: Pick<EdgeInsets, 'bottom'> | null,
  opts?: { partner?: boolean }
): number {
  const safe =
    Platform.OS === 'android'
      ? getEffectiveBottomInset(insets ?? { bottom: 0 })
      : insets?.bottom ?? 0;
  return safe + (opts?.partner ? PARTNER_FLOAT_BOTTOM_GAP : FLOAT_BOTTOM_GAP);
}

export function getFloatingTabBarTotalHeight(
  insets?: Pick<EdgeInsets, 'bottom'> | null,
  opts?: { partner?: boolean }
): number {
  return getFloatingTabBarBarHeight() + getFloatingTabBarBottomGap(insets, opts);
}
