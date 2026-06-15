import { Platform } from 'react-native';

export const FEED_FLASH_ESTIMATED_ITEM_SIZE = Platform.OS === 'android' ? 380 : 420;

/** Ana sayfa / personel feed FlashList — uzun kaydırmada jank azaltır. */
export const FEED_FLASH_LIST_PROPS = {
  estimatedItemSize: FEED_FLASH_ESTIMATED_ITEM_SIZE,
  drawDistance: Platform.OS === 'android' ? 360 : 480,
  removeClippedSubviews: Platform.OS === 'android',
} as const;
