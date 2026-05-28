import { supabase } from '@/lib/supabase';
import {
  postNotificationsReturnMinimal,
  sendExpoPushToRecipients,
  notifyAdmins,
  sendNotification,
} from '@/lib/notificationService';
import { filterStaffIdsByNotificationType } from '@/lib/staffNotificationFilter';
import { log } from '@/lib/logger';
// Caller passes already-translated title/body
export async function notifyTransferTourStaffAndAdmins(params: {
  organizationId: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}): Promise<void> {
  const { organizationId, title, body, data } = params;
  try {
    const { data: staffRows, error } = await supabase
      .from('staff')
      .select('id, role, app_permissions')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .is('deleted_at', null);
    if (error) {
      log.warn('transferTourNotify', 'staff fetch', error.message);
    }
    const list = (staffRows ?? []) as {
      id: string;
      role: string;
      app_permissions?: Record<string, boolean> | null;
    }[];
    const ids = list
      .filter(
        (s) =>
          s.role === 'admin' ||
          s.app_permissions?.transfer_tour_services === true ||
          s.app_permissions?.transfer_tour_requests === true
      )
      .map((s) => s.id);
    const unique = Array.from(new Set(ids));
    const filtered = await filterStaffIdsByNotificationType(unique, 'transfer_tour');
    if (filtered.length) {
      const rows = filtered.map((staff_id) => ({
        staff_id,
        guest_id: null,
        title,
        body,
        category: 'admin' as const,
        notification_type: 'transfer_tour',
        data: { ...(data ?? {}), kind: 'transfer_tour' },
        sent_via: 'both' as const,
        sent_at: new Date().toISOString(),
      }));
      await postNotificationsReturnMinimal(rows);
      sendExpoPushToRecipients({ staffIds: filtered, title, body, data: { ...data, screen: 'notifications' } }).catch(() => {});
    } else {
      await notifyAdmins({ title, body, data });
    }
  } catch (e) {
    log.warn('transferTourNotify', 'exception', e);
    await notifyAdmins({ title, body, data });
  }
}

/** Çağıran t() ile title/body verir */
export async function notifyGuestTransferEvent(params: {
  guestId: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}): Promise<void> {
  const { guestId, title, body, data } = params;
  await sendNotification({
    guestId,
    title,
    body,
    notificationType: 'transfer_tour',
    category: 'guest',
    data: { ...(data ?? {}), kind: 'transfer_tour' },
  });
}
