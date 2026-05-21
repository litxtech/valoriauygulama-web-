import type { TFunction } from 'i18next';

export type LostFoundCategory =
  | 'electronics'
  | 'clothing'
  | 'jewelry'
  | 'documents'
  | 'accessories'
  | 'other';

export type LostFoundLocationType =
  | 'room'
  | 'lobby'
  | 'restaurant'
  | 'pool'
  | 'spa'
  | 'parking'
  | 'other';

export type LostFoundValueTier = 'low' | 'medium' | 'high';

export type LostFoundStatus = 'stored' | 'returned' | 'disposed';

export const LOST_FOUND_CATEGORIES: LostFoundCategory[] = [
  'electronics',
  'clothing',
  'jewelry',
  'documents',
  'accessories',
  'other',
];

export const LOST_FOUND_LOCATION_TYPES: LostFoundLocationType[] = [
  'room',
  'lobby',
  'restaurant',
  'pool',
  'spa',
  'parking',
  'other',
];

export const LOST_FOUND_VALUE_TIERS: LostFoundValueTier[] = ['low', 'medium', 'high'];

export const LOST_FOUND_STATUSES: LostFoundStatus[] = ['stored', 'returned', 'disposed'];

export function lostFoundCategoryLabel(t: TFunction, key: LostFoundCategory): string {
  return t(`lfCategory_${key}`);
}

export function lostFoundLocationLabel(t: TFunction, key: LostFoundLocationType): string {
  return t(`lfLocation_${key}`);
}

export function lostFoundValueTierLabel(t: TFunction, key: LostFoundValueTier): string {
  return t(`lfValue_${key}`);
}

export function lostFoundStatusLabel(t: TFunction, key: LostFoundStatus): string {
  return t(`lfStatus_${key}`);
}

export const LOST_FOUND_STATUS_COLOR: Record<LostFoundStatus, string> = {
  stored: '#2563eb',
  returned: '#16a34a',
  disposed: '#6b7280',
};
