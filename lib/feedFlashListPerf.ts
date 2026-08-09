import { Platform } from 'react-native';

export const FEED_FLASH_ESTIMATED_ITEM_SIZE = Platform.OS === 'android' ? 380 : 420;

/**
 * X (Twitter) tarzı feed kaydırma — hassas takip, temiz momentum, az jank.
 * Staff + misafir ana akış FlashList ortak props.
 */
export const FEED_FLASH_LIST_PROPS = {
  estimatedItemSize: FEED_FLASH_ESTIMATED_ITEM_SIZE,
  /** Hızlı fling’de boş hücreyi azalt (X gibi sürekli dolu akış) */
  drawDistance: Platform.OS === 'android' ? 520 : 640,
  removeClippedSubviews: Platform.OS === 'android',
  /** iOS varsayılanı (~0.998) — uzun, yumuşak süzülme */
  decelerationRate: 'normal' as const,
  /** 60fps scroll event — etkileşimler kaydırmayı bozmasın */
  scrollEventThrottle: 16,
  showsVerticalScrollIndicator: false,
  /** iOS: hafif bounce; Android glow yok */
  bounces: true,
  alwaysBounceVertical: true,
  overScrollMode: 'never' as const,
  /** Nested yatay story/avatar şeritleri ana dikey kaydırmayı çalmasın */
  nestedScrollEnabled: true,
  keyboardDismissMode: 'on-drag' as const,
  /** Android: fling sırasında layout thrash azaltır */
  disableIntervalMomentum: false,
} as const;
