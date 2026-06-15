import { supabase } from '@/lib/supabase';
import { resolveNotificationFeatureKey } from '@/lib/notificationSoundCatalog';
import { log } from '@/lib/logger';

export type NotificationEventRow = {
  id: string;
  organization_id: string | null;
  user_id: string | null;
  user_kind: string | null;
  feature_key: string | null;
  notification_title: string | null;
  notification_body: string | null;
  sound_key: string | null;
  sound_file_name: string | null;
  delivery_status: string | null;
  opened_at: string | null;
  acknowledged_at: string | null;
  delivery_group_id: string | null;
  staff_display_name: string | null;
  staff_name: string | null;
  created_at: string;
  metadata: Record<string, unknown>;
};

export type NotificationEventsSummary = {
  total: number;
  opened: number;
  acknowledged: number;
  pending_ack: number;
  emergency: number;
};

function eventIdFromPayload(payload: Record<string, unknown> | undefined): string | null {
  if (!payload) return null;
  const raw = payload.notificationEventId ?? payload.notification_event_id;
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  return null;
}

/** Push payload'dan event açıldı işaretle */
export async function markNotificationEventOpenedFromPayload(
  payload: Record<string, unknown> | undefined
): Promise<void> {
  const eventId = eventIdFromPayload(payload);
  if (!eventId) return;
  try {
    await supabase.rpc('mark_notification_event_opened', { p_event_id: eventId });
  } catch (e) {
    log.warn('notificationEventLog', 'markOpened', e);
  }
}

/** Acil durum — personel "Gördüm" */
export async function acknowledgeNotificationEvent(
  eventId: string,
  note?: string
): Promise<{ ok: boolean; error?: string }> {
  if (!eventId) return { ok: false, error: 'event id yok' };
  const { data, error } = await supabase.rpc('mark_notification_event_acknowledged', {
    p_event_id: eventId,
    p_note: note ?? null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: data === true };
}

/** Manuel log (uygulama içi bildirim listesinden) */
export async function logNotificationEventClient(params: {
  organizationId?: string | null;
  userId: string;
  userKind: 'staff' | 'guest' | 'admin';
  notificationType?: string | null;
  category?: string | null;
  title: string;
  body?: string | null;
  soundKey?: string | null;
  soundFileName?: string | null;
  deliveryStatus?: string;
  metadata?: Record<string, unknown>;
}): Promise<string | null> {
  const featureKey = resolveNotificationFeatureKey(params.notificationType, params.category);
  try {
    const { data, error } = await supabase.rpc('log_notification_event', {
      p_organization_id: params.organizationId ?? null,
      p_user_id: params.userId,
      p_user_kind: params.userKind,
      p_feature_key: featureKey,
      p_title: params.title,
      p_body: params.body ?? null,
      p_sound_key: params.soundKey ?? featureKey,
      p_sound_file_name: params.soundFileName ?? null,
      p_delivery_status: params.deliveryStatus ?? 'delivered',
      p_metadata: params.metadata ?? {},
    });
    if (error) {
      log.warn('notificationEventLog', 'log', error.message);
      return null;
    }
    return typeof data === 'string' ? data : null;
  } catch (e) {
    log.warn('notificationEventLog', 'log exception', e);
    return null;
  }
}

export async function fetchAdminNotificationEvents(
  organizationId: string | null,
  featureKey?: string | null,
  limit = 80
): Promise<NotificationEventRow[]> {
  const { data, error } = await supabase.rpc('list_admin_notification_events', {
    p_organization_id: organizationId,
    p_feature_key: featureKey ?? null,
    p_limit: limit,
    p_offset: 0,
  });
  if (error) {
    log.warn('notificationEventLog', 'list', error.message);
    return [];
  }
  return (data ?? []) as NotificationEventRow[];
}

export async function fetchAdminNotificationEventsSummary(
  organizationId: string | null,
  hours = 24
): Promise<NotificationEventsSummary> {
  const empty: NotificationEventsSummary = {
    total: 0,
    opened: 0,
    acknowledged: 0,
    pending_ack: 0,
    emergency: 0,
  };
  const { data, error } = await supabase.rpc('admin_notification_events_summary', {
    p_organization_id: organizationId,
    p_hours: hours,
  });
  if (error || !data || typeof data !== 'object') return empty;
  const o = data as Record<string, unknown>;
  return {
    total: typeof o.total === 'number' ? o.total : 0,
    opened: typeof o.opened === 'number' ? o.opened : 0,
    acknowledged: typeof o.acknowledged === 'number' ? o.acknowledged : 0,
    pending_ack: typeof o.pending_ack === 'number' ? o.pending_ack : 0,
    emergency: typeof o.emergency === 'number' ? o.emergency : 0,
  };
}

export function eventIdFromNotificationData(
  data: Record<string, unknown> | null | undefined
): string | null {
  if (!data) return null;
  return eventIdFromPayload(data);
}

export function isEmergencyNotificationPayload(
  data: Record<string, unknown> | null | undefined,
  notificationType?: string | null
): boolean {
  const t = (notificationType ?? '').toLowerCase();
  if (t.includes('emergency') || t === 'staff_emergency_alert') return true;
  if (!data) return false;
  if (data.emergency === true) return true;
  const fk = typeof data.feature_key === 'string' ? data.feature_key : '';
  return fk === 'emergency_alert';
}
