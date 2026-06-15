/**
 * Valoria Hotel - Bildirim Sistemi
 * Bildirim tipleri, kategoriler, şablon anahtarları ve yardımcı fonksiyonlar.
 */

import { guestNotificationCopy } from '@/lib/guestNotificationsI18n';
import { emergencyNotificationCopy } from '@/lib/emergencyNotificationsI18n';
import { ADMIN_TYPES, EMERGENCY_TYPES, GUEST_TYPES, STAFF_TYPES } from '@/lib/notificationTypes';

export type NotificationCategory = 'emergency' | 'guest' | 'staff' | 'admin' | 'bulk';

export { ADMIN_TYPES, EMERGENCY_TYPES, GUEST_TYPES, STAFF_TYPES };

export type NotificationType =
  | (typeof EMERGENCY_TYPES)[keyof typeof EMERGENCY_TYPES]
  | (typeof GUEST_TYPES)[keyof typeof GUEST_TYPES]
  | (typeof STAFF_TYPES)[keyof typeof STAFF_TYPES]
  | (typeof ADMIN_TYPES)[keyof typeof ADMIN_TYPES]
  | string;

/** Toplu bildirim hedefi (misafir) */
export type BulkGuestTarget =
  | 'all_guests'
  | 'checkin_today'
  | 'checkout_tomorrow'
  | 'specific_rooms'
  | 'long_stay';

/** Toplu bildirim hedefi (personel) */
export type BulkStaffTarget =
  | 'all_staff'
  | 'housekeeping'
  | 'technical'
  | 'reception'
  | 'security';

/** Toplu bildirim kategorisi (misafir) */
export type BulkCategory = 'info' | 'warning' | 'campaign';

/** Acil durum metni — `lang` misafirin contract_lang; yoksa uygulama dili */
export function emergencyMessageTemplate(type: string, lang?: string | null): { title: string; body: string } {
  return emergencyNotificationCopy(type, lang);
}

/** @deprecated `emergencyMessageTemplate(type, lang)` kullanın */
export const EMERGENCY_MESSAGES: Record<string, { title: string; body: string }> = Object.fromEntries(
  Object.values(EMERGENCY_TYPES).map((type) => [type, emergencyNotificationCopy(type, 'tr')])
);

/** Misafir bildirimi — `lang` misafirin `contract_lang` veya uygulama dili olmalı. */
export function guestMessageTemplate(
  type: string,
  ctx: Record<string, string> = {},
  lang?: string | null
): { title: string; body: string } {
  return guestNotificationCopy(type, ctx, lang);
}

/** @deprecated `guestMessageTemplate(type, ctx, contract_lang)` kullanın */
export const GUEST_MESSAGE_TEMPLATES: Record<string, (ctx: Record<string, string>) => { title: string; body: string }> =
  Object.fromEntries(
    Object.values(GUEST_TYPES).map((type) => [
      type,
      (ctx: Record<string, string>) => guestNotificationCopy(type, ctx),
    ])
  );

/** Misafir bildirim tercih anahtarları */
export const GUEST_PREF_KEYS = {
  service_updates: 'service_updates',
  checkin_checkout_reminders: 'checkin_checkout_reminders',
  hotel_announcements: 'hotel_announcements',
  campaigns: 'campaigns',
  marketing: 'marketing',
} as const;

/** Personel bildirim tercih anahtarları (acil kapatılamaz) */
export const STAFF_PREF_KEYS = {
  new_tasks: 'new_tasks',
  emergency: 'emergency',
  meeting_reminders: 'meeting_reminders',
  shift_changes: 'shift_changes',
} as const;

export interface NotificationRow {
  id: string;
  guest_id: string | null;
  staff_id: string | null;
  title: string;
  body: string | null;
  data: Record<string, unknown>;
  notification_type: string | null;
  category: NotificationCategory | null;
  read_at: string | null;
  created_at: string;
  sent_at: string | null;
}

export interface NotificationTemplateRow {
  id: string;
  target_audience: 'guest' | 'staff';
  template_key: string;
  category: string;
  title_template: string;
  body_template: string;
  is_system: boolean;
  sort_order: number;
}
