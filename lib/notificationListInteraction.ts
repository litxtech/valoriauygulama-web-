import type { Href } from 'expo-router';
import {
  isNotificationsListHref,
  notificationPayloadFromRow,
  resolveNotificationHref,
  type NotificationNavContext,
} from '@/lib/notificationNavigation';
import { buildAnnouncementActionHref, parseStaffNotificationAction } from '@/lib/staffNotificationActions';

export const NOTIFICATION_BODY_COLLAPSE_CHARS = 120;
export const NOTIFICATION_BODY_COLLAPSE_LINES = 3;

function pickStr(data: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const raw = data[k];
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
  }
  return '';
}

/** Liste satırında gövde metni kısaltılsın mı */
export function isLongNotificationBody(body: string | null | undefined): boolean {
  const text = body?.trim();
  if (!text) return false;
  if (text.length > NOTIFICATION_BODY_COLLAPSE_CHARS) return true;
  if (text.split('\n').filter((line) => line.trim()).length > NOTIFICATION_BODY_COLLAPSE_LINES) return true;
  return false;
}

/** Bildirim satırından modül rotası — yalnızca bildirimler sekmesi değilse döner. */
export function resolveNotificationModuleHref(
  row: { notification_type?: string | null; data?: Record<string, unknown> | null | undefined },
  ctx?: NotificationNavContext
): Href | null {
  const payload = notificationPayloadFromRow(row);
  const nType = typeof row.notification_type === 'string' ? row.notification_type.trim() : '';

  if (nType === 'staff_personnel_warning') {
    const wid = pickStr(payload, 'warningId', 'warning_id');
    if (wid) return { pathname: '/staff/warnings', params: { focus: wid } };
    return '/staff/warnings';
  }
  if (nType === 'staff_personnel_warning_ack') {
    const sid = pickStr(payload, 'subjectStaffId', 'subject_staff_id');
    if (sid) return { pathname: '/admin/staff/[id]', params: { id: sid } } as Href;
    return '/admin/staff';
  }

  if (nType === 'staff_feature_intro' || nType === 'staff_board_announcement') {
    const action = parseStaffNotificationAction(payload);
    if (action?.videoUrl) return buildAnnouncementActionHref(payload);
    if (action?.openScreen?.startsWith('/')) return action.openScreen as Href;
  }

  const href = resolveNotificationHref(payload, ctx);
  if (isNotificationsListHref(href)) return null;
  return href;
}
