import { Platform } from 'react-native';

/** Misafir liste ekranları — FlatList / FlashList ortak pencere ayarları */
export const CUSTOMER_LIST_PERF = {
  initialNumToRender: 10,
  maxToRenderPerBatch: 8,
  windowSize: 7,
  updateCellsBatchingPeriod: 50,
  removeClippedSubviews: Platform.OS === 'android',
} as const;

export const CUSTOMER_FLASH_DRAW_DISTANCE = Platform.OS === 'android' ? 280 : 360;

/** FlashList estimatedItemSize — kart yükseklikleri (px) */
export const CUSTOMER_ROW_HEIGHT = {
  notification: 88,
  newChatStaff: 76,
  room: 108,
  facilityJournal: 96,
  myPost: 248,
  serviceRequest: 128,
  diningVenue: 420,
  transferTour: 380,
  localGuide: 248,
  complaint: 148,
} as const;
