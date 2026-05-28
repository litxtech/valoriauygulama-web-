import { supabase } from '@/lib/supabase';
import { log } from '@/lib/logger';

type StaffRecipientRow = { staff_id: string };

/** Profil → Bildirim tercihleri: staff_notif_<type> kapalı olanları çıkarır. */
export async function filterStaffIdsByNotificationType(
  staffIds: string[],
  notificationType?: string | null
): Promise<string[]> {
  if (staffIds.length === 0) return [];
  const nt = (notificationType ?? '').trim();
  if (!nt) return staffIds;
  try {
    const { data, error } = await supabase.rpc('filter_staff_notification_recipients', {
      p_staff_ids: staffIds,
      p_notification_type: nt,
    });
    if (error) {
      log.warn('staffNotificationFilter', 'filter_staff_notification_recipients', error);
      return [];
    }
    const rows = (data ?? []) as StaffRecipientRow[];
    return rows.map((r) => r.staff_id).filter(Boolean);
  } catch (e) {
    log.warn('staffNotificationFilter', 'filter exception', e);
    return [];
  }
}

/** Profil → "Gönderi bildirimleri" kapalı (mute_feed_notifications.enabled = true). */
export async function filterStaffIdsFeedNotMuted(staffIds: string[]): Promise<string[]> {
  if (staffIds.length === 0) return [];
  try {
    const { data, error } = await supabase
      .from('notification_preferences')
      .select('staff_id')
      .in('staff_id', staffIds)
      .eq('pref_key', 'mute_feed_notifications')
      .eq('enabled', true);
    if (error) {
      log.warn('staffNotificationFilter', 'mute_feed_notifications', error);
      return staffIds;
    }
    const muted = new Set((data ?? []).map((r: { staff_id: string }) => r.staff_id));
    return staffIds.filter((id) => !muted.has(id));
  } catch (e) {
    log.warn('staffNotificationFilter', 'feed mute exception', e);
    return staffIds;
  }
}

/** Sohbet @mention push — tercih anahtarı staff_mention. */
export function mentionNotificationPrefType(data?: Record<string, unknown>): string {
  const raw = data?.notificationType ?? data?.notification_type;
  const t = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (t === 'chat_mention') return 'staff_mention';
  return t || 'message';
}
