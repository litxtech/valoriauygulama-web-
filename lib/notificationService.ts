/**
 * Valoria Hotel - Bildirim gönderme servisi
 * In-app kayıt + Expo Push (Edge Function) ile cihaza push gönderir.
 */
import { supabase, supabaseAnonKey, supabaseUrl } from '@/lib/supabase';
import type { BulkGuestTarget, BulkStaffTarget, BulkCategory } from '@/lib/notifications';
import { log } from '@/lib/logger';

const EDGE_FN_PUSH = 'send-expo-push';
const EDGE_FN_NOTIFY_ADMINS = 'notify-admins';
const EDGE_FN_NOTIFY_CONV_RECIPIENTS = 'notify-conversation-recipients';

type ExpoPushFnResult = {
  sent?: number;
  failed?: number;
  message?: string;
  expoHttpError?: string;
  pushTicketErrors?: string[];
};

type StaffRecipientRow = { staff_id: string };

/** Push token’ları olan hedeflere Expo push gönderir (sessiz hata). */
async function sendExpoPushToRecipients(params: {
  guestIds?: string[];
  staffIds?: string[];
  title: string;
  body?: string | null;
  data?: Record<string, unknown>;
}): Promise<void> {
  const { guestIds = [], staffIds = [], title, body, data } = params;
  if (guestIds.length === 0 && staffIds.length === 0) return;
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const jwt = sessionData.session?.access_token ?? supabaseAnonKey;
    const { data: result, error } = await supabase.functions.invoke(EDGE_FN_PUSH, {
      body: { guestIds, staffIds, title, body, data },
      headers: { Authorization: `Bearer ${jwt}` },
    });
    if (error) {
      log.warn('notificationService', 'sendExpoPush', error);
      return;
    }
    const r = result as ExpoPushFnResult | null;
    if (r?.message) log.warn('notificationService', 'push (sunucu mesajı)', r.message);
    if (r?.expoHttpError) log.warn('notificationService', 'Expo Push API HTTP hatası', r.expoHttpError);
    if (r?.pushTicketErrors?.length) log.warn('notificationService', 'Expo push ticket hataları', r.pushTicketErrors);
    if (r?.sent === 0 && (r?.failed ?? 0) > 0) {
      log.warn('notificationService', 'push hiç iletilmedi (ticket/api)', { sent: r.sent, failed: r.failed });
    }
    if (r?.sent != null) log.info('notificationService', 'push gönderildi', { sent: r.sent, failed: r.failed ?? 0 });
  } catch (e) {
    log.warn('notificationService', 'sendExpoPush exception', e);
  }
}

export interface SendNotificationParams {
  guestId?: string | null;
  staffId?: string | null;
  title: string;
  body?: string | null;
  notificationType?: string | null;
  category?: 'emergency' | 'guest' | 'staff' | 'admin' | 'bulk';
  data?: Record<string, unknown>;
  createdByStaffId?: string | null;
}

async function filterStaffRecipientsByPreference(
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
      log.warn('notificationService', 'filter_staff_notification_recipients', error);
      return staffIds;
    }
    const rows = (data ?? []) as StaffRecipientRow[];
    return rows.map((r) => r.staff_id).filter(Boolean);
  } catch (e) {
    log.warn('notificationService', 'filter staff recipients exception', e);
    return staffIds;
  }
}

/**
 * supabase.from().insert() PostgREST'te `Prefer: return=representation` (ve bazen ?select) ile
 * RETURNING çalıştırır; dönen satır için SELECT RLS devreye girer → alıcıya giden satırı ekleyen 403 alır.
 * Doğrudan REST + `return=minimal`: yanıt gövdesi yok, SELECT RLS yok, sadece INSERT WITH CHECK.
 */
/** Tek satır veya toplu (JSON dizi) — ASLA return=representation kullanmaz; Logflare'de ?select= görünmemeli. */
export async function postNotificationsReturnMinimal(
  body: Record<string, unknown> | Record<string, unknown>[]
): Promise<{ error: { message: string } | null }> {
  if (!supabaseUrl) return { error: { message: 'Supabase URL yok' } };
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) return { error: { message: 'Oturum yok' } };
  if (Array.isArray(body) && body.length === 0) return { error: null };
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/notifications`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${accessToken}`,
        Prefer: 'return=minimal',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      let message = res.statusText;
      try {
        const j = (await res.json()) as { message?: string; error?: string; details?: string };
        message = j.message || j.error || j.details || message;
      } catch {
        const t = await res.text();
        if (t) message = t.slice(0, 400);
      }
      return { error: { message } };
    }
    return { error: null };
  } catch (e) {
    return { error: { message: (e as Error).message ?? 'Ağ hatası' } };
  }
}

/** Tekil bildirim gönder */
export async function sendNotification(params: SendNotificationParams): Promise<{ id?: string; error?: string }> {
  const { guestId, staffId, title, body, notificationType, category, data, createdByStaffId } = params;
  if (!guestId && !staffId) return { error: 'guestId veya staffId gerekli' };

  const originalStaffIds = staffId ? [typeof staffId === 'string' ? staffId : String(staffId)] : [];
  const staffIds = await filterStaffRecipientsByPreference(originalStaffIds, notificationType);
  const guestIds = guestId ? [typeof guestId === 'string' ? guestId : String(guestId)] : [];
  const resolvedStaffId = staffIds.length > 0 ? staffIds[0] : null;

  if (!resolvedStaffId && guestIds.length === 0) {
    return {};
  }

  const { error } = await postNotificationsReturnMinimal({
    guest_id: guestId ?? null,
    staff_id: resolvedStaffId,
    title,
    body: body ?? null,
    notification_type: notificationType ?? null,
    category: category ?? 'bulk',
    data: data ?? {},
    created_by: createdByStaffId ?? null,
    sent_via: 'both',
    sent_at: new Date().toISOString(),
  });

  // Push'u insert sonucundan bağımsız dene: RLS/insert hata verse bile (ör. beğeni/yorum) cihaz bildirimi kaybolmasın
  if (staffIds.length > 0 || guestIds.length > 0) {
    try {
      const pushData: Record<string, unknown> = {
        ...(data && typeof data === 'object' ? data : {}),
        ...(notificationType ? { notificationType } : {}),
      };
      await sendExpoPushToRecipients({
        guestIds: guestIds.length ? guestIds : undefined,
        staffIds: staffIds.length ? staffIds : undefined,
        title,
        body,
        data: pushData,
      });
    } catch (e) {
      log.warn('notificationService', 'push after sendNotification', e);
    }
  }

  if (error) {
    log.warn('notificationService', 'notifications tablosu insert hatası (push yine de denendi)', error.message);
    return { error: error.message };
  }
  return {};
}

/** Tüm misafirlere toplu bildirim (hedefe göre filtre) */
export async function sendBulkToGuests(params: {
  target: BulkGuestTarget;
  roomNumbers?: string[];
  organizationId?: string | null;
  title: string;
  body: string;
  category: BulkCategory;
  createdByStaffId: string;
}): Promise<{ count: number; error?: string }> {
  const { target, roomNumbers, organizationId, title, body, category, createdByStaffId } = params;

  const selectFields = target === 'long_stay' ? 'id, check_in_at, check_out_at' : 'id';
  let query = supabase
    .from('guests')
    .select(selectFields)
    .in('status', ['pending', 'checked_in']);
  if (organizationId) query = query.eq('organization_id', organizationId);

  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  if (target === 'checkin_today') {
    query = query.not('check_in_at', 'is', null);
    query = query.gte('check_in_at', `${today}T00:00:00.000Z`).lte('check_in_at', `${today}T23:59:59.999Z`);
  } else if (target === 'checkout_tomorrow') {
    query = query.not('check_out_at', 'is', null);
    query = query.gte('check_out_at', `${tomorrow}T00:00:00.000Z`).lte('check_out_at', `${tomorrow}T23:59:59.999Z`);
  } else if (target === 'specific_rooms' && roomNumbers?.length) {
    let roomQuery = supabase.from('rooms').select('id').in('room_number', roomNumbers);
    if (organizationId) roomQuery = roomQuery.eq('organization_id', organizationId);
    const { data: rooms } = await roomQuery;
    const ids = (rooms ?? []).map((r: { id: string }) => r.id);
    if (ids.length) query = query.in('room_id', ids);
    else return { count: 0 };
  }

  const { data: guests, error: fetchError } = await query;
  if (fetchError) return { count: 0, error: fetchError.message };
  let list = guests ?? [];

  if (target === 'long_stay') {
    list = list.filter((g: { check_in_at?: string | null; check_out_at?: string | null }) => {
      const ci = g.check_in_at ? new Date(g.check_in_at).getTime() : 0;
      const co = g.check_out_at ? new Date(g.check_out_at).getTime() : 0;
      if (!ci || !co) return false;
      const nights = (co - ci) / 86400000;
      return nights >= 3;
    });
  }
  if (list.length === 0) return { count: 0 };

  const rows = list.map((g: { id: string }) => ({
    guest_id: g.id,
    staff_id: null,
    title,
    body,
    category: 'bulk',
    notification_type: `bulk_${category}`,
    data: {},
    created_by: createdByStaffId,
    sent_via: 'in_app',
    sent_at: new Date().toISOString(),
  }));

  const { error: insErr } = await postNotificationsReturnMinimal(rows);
  if (insErr) return { count: 0, error: insErr.message };
  const guestIds = list.map((g: { id: string }) => g.id);
  sendExpoPushToRecipients({ guestIds, title, body, data: { screen: 'notifications' } }).catch(() => {});
  return { count: rows.length };
}

/** Duyuru panosu — hedef personele push (uygulama açılınca /staff/board) */
export async function notifyStaffBoardAnnouncementPush(params: {
  title: string;
  body: string;
  targetStaffId?: string | null;
  organizationId?: string | null;
}): Promise<void> {
  const title = params.title.trim() || 'Yeni duyuru';
  const body = (params.body.trim() || title).slice(0, 200);

  let query = supabase.from('staff').select('id').eq('is_active', true);
  if (params.targetStaffId) {
    query = query.eq('id', params.targetStaffId);
  } else if (params.organizationId) {
    query = query.eq('organization_id', params.organizationId);
  }

  const { data: staffList, error } = await query;
  if (error || !staffList?.length) return;

  const staffIds = await filterStaffRecipientsByPreference(
    staffList.map((s: { id: string }) => s.id),
    'staff_board_announcement'
  );
  if (staffIds.length === 0) return;

  await sendExpoPushToRecipients({
    staffIds,
    title,
    body,
    data: {
      screen: '/staff/board',
      url: '/staff/board',
      notificationType: 'staff_board_announcement',
    },
  });
}

/** Personele toplu bildirim (departman/rol filtresi) */
export async function sendBulkToStaff(params: {
  target: BulkStaffTarget;
  organizationId?: string | null;
  title?: string;
  body: string;
  createdByStaffId: string;
  notificationType?: string;
  category?: 'emergency' | 'guest' | 'staff' | 'admin' | 'bulk';
  data?: Record<string, unknown>;
}): Promise<{ count: number; error?: string }> {
  const { target, organizationId, title: titleParam, body, createdByStaffId, notificationType, category, data } = params;
  const title = (titleParam && titleParam.trim()) || 'Toplu Duyuru';
  const resolvedNotificationType = (notificationType && notificationType.trim()) || 'bulk_staff';

  let query = supabase.from('staff').select('id').eq('is_active', true);
  if (organizationId) query = query.eq('organization_id', organizationId);

  const roleMap: Record<BulkStaffTarget, string[] | null> = {
    all_staff: null,
    housekeeping: ['housekeeping'],
    technical: ['technical'],
    reception: ['reception_chief', 'receptionist'],
    security: ['security'],
  };
  const roles = roleMap[target];
  if (roles?.length) query = query.in('role', roles);

  const { data: staffList, error: fetchError } = await query;
  if (fetchError) return { count: 0, error: fetchError.message };
  const list = staffList ?? [];
  if (list.length === 0) return { count: 0 };

  const filteredStaffIds = await filterStaffRecipientsByPreference(
    list.map((s: { id: string }) => s.id),
    resolvedNotificationType
  );
  if (filteredStaffIds.length === 0) return { count: 0 };

  const rows = filteredStaffIds.map((staffId) => ({
    guest_id: null,
    staff_id: staffId,
    title,
    body,
    category: category ?? 'bulk',
    notification_type: resolvedNotificationType,
    data: data ?? {},
    created_by: createdByStaffId,
    sent_via: 'in_app',
    sent_at: new Date().toISOString(),
  }));

  const { error: insErr } = await postNotificationsReturnMinimal(rows);
  if (insErr) return { count: 0, error: insErr.message };
  sendExpoPushToRecipients({
    staffIds: filteredStaffIds,
    title,
    body,
    data: { screen: 'notifications', notificationType: resolvedNotificationType, ...(data ?? {}) },
  }).catch(() => {});
  return { count: rows.length };
}

/** Sohbet mesajı sonrası konuşmadaki alıcılara (gönderen hariç) sesli push bildirimi gönder. */
export async function notifyConversationRecipients(params: {
  conversationId: string;
  excludeAppToken?: string | null;
  excludeStaffId?: string | null;
  excludeStaffIds?: string[];
  excludeGuestIds?: string[];
  onlyStaffIds?: string[];
  onlyGuestIds?: string[];
  title: string;
  body?: string | null;
  data?: Record<string, unknown>;
}): Promise<{ sent?: number; failed?: number; error?: string }> {
  const {
    conversationId,
    excludeAppToken,
    excludeStaffId,
    excludeStaffIds,
    excludeGuestIds,
    onlyStaffIds,
    onlyGuestIds,
    title,
    body,
    data,
  } = params;
  if (!conversationId || !title?.trim()) return { error: 'conversationId ve title gerekli' };
  try {
    const { data: result, error } = await supabase.functions.invoke(EDGE_FN_NOTIFY_CONV_RECIPIENTS, {
      body: {
        conversationId,
        excludeAppToken: excludeAppToken ?? undefined,
        excludeStaffId: excludeStaffId ?? undefined,
        excludeStaffIds: excludeStaffIds?.length ? excludeStaffIds : undefined,
        excludeGuestIds: excludeGuestIds?.length ? excludeGuestIds : undefined,
        onlyStaffIds: onlyStaffIds?.length ? onlyStaffIds : undefined,
        onlyGuestIds: onlyGuestIds?.length ? onlyGuestIds : undefined,
        title: title.trim(),
        body: body ?? null,
        data: data ?? {},
      },
    });
    if (error) {
      log.warn('notificationService', 'notifyConversationRecipients', error);
      return { error: error.message };
    }
    const r = result as ExpoPushFnResult | null;
    if (r?.message) log.warn('notificationService', 'mesaj push (sunucu)', r.message);
    if (r?.expoHttpError) log.warn('notificationService', 'mesaj push Expo HTTP', r.expoHttpError);
    if (r?.pushTicketErrors?.length) log.warn('notificationService', 'mesaj push ticket', r.pushTicketErrors);
    if (r?.sent != null) log.info('notificationService', 'mesaj push', { sent: r.sent, failed: r.failed ?? 0 });
    return { sent: r?.sent, failed: r?.failed };
  } catch (e) {
    log.warn('notificationService', 'notifyConversationRecipients exception', e);
    return { error: (e as Error).message };
  }
}

/**
 * Admin panel olayları (onay, stok, harcama vb.) — notify-admins edge + doğru deep link.
 * sendBulkToStaff(all_staff) yerine bunu kullanın; aksi halde admin cihazına push gitmeyebilir.
 */
export async function notifyAdminPanel(params: {
  title: string;
  body?: string | null;
  /** Örn. /admin/approvals, /admin/stock/approvals */
  href?: string;
  notificationType?: string;
  conversationId?: string | null;
}): Promise<{ sent?: number; failed?: number; error?: string }> {
  const href = (params.href ?? '/admin/approvals').trim() || '/admin/approvals';
  return notifyAdmins({
    title: params.title,
    body: params.body,
    conversationId: params.conversationId,
    data: {
      url: href,
      screen: href,
      notificationType: params.notificationType ?? 'admin_panel_alert',
    },
  });
}

/** Tüm admin hesaplarına (açık olan telefona) push bildirimi gönder. Panel bildirimleri için kullanın. */
export async function notifyAdmins(params: {
  title: string;
  body?: string | null;
  data?: Record<string, unknown>;
  /** Sohbet katılımcıları notify-conversation-recipients ile gideceği adminlere tekrar admin push yollanmasın. */
  conversationId?: string | null;
}): Promise<{ sent?: number; failed?: number; error?: string }> {
  const { title, body, data, conversationId } = params;
  if (!title?.trim()) return { error: 'title gerekli' };
  try {
    const { data: s } = await supabase.auth.getSession();
    const jwt = s.session?.access_token ?? supabaseAnonKey;
    const { data: result, error } = await supabase.functions.invoke(EDGE_FN_NOTIFY_ADMINS, {
      body: {
        title: title.trim(),
        body: body ?? null,
        data: data ?? {},
        ...(conversationId ? { conversationId: String(conversationId) } : {}),
      },
      headers: { Authorization: `Bearer ${jwt}` },
    });
    if (error) {
      log.warn('notificationService', 'notifyAdmins', error);
      return { error: error.message };
    }
    const r = result as ExpoPushFnResult | null;
    if (r?.message) log.warn('notificationService', 'admin push (sunucu)', r.message);
    if (r?.expoHttpError) log.warn('notificationService', 'admin push Expo HTTP', r.expoHttpError);
    if (r?.pushTicketErrors?.length) log.warn('notificationService', 'admin push ticket', r.pushTicketErrors);
    if (r?.sent != null) log.info('notificationService', 'admin push', { sent: r.sent, failed: r.failed ?? 0 });
    return { sent: r?.sent, failed: r?.failed };
  } catch (e) {
    log.warn('notificationService', 'notifyAdmins exception', e);
    return { error: (e as Error).message };
  }
}

/** Acil durum: tüm checked_in misafirlere gönder */
export async function sendEmergencyToAllGuests(params: {
  notificationType: string;
  title: string;
  body: string;
  organizationId?: string | null;
  createdByStaffId?: string | null;
}): Promise<{ count: number; error?: string }> {
  let query = supabase
    .from('guests')
    .select('id')
    .eq('status', 'checked_in');
  if (params.organizationId) query = query.eq('organization_id', params.organizationId);
  const { data: guests, error: fetchError } = await query;
  if (fetchError) return { count: 0, error: fetchError.message };
  const list = guests ?? [];
  if (list.length === 0) return { count: 0 };

  const rows = list.map((g: { id: string }) => ({
    guest_id: g.id,
    staff_id: null,
    title: params.title,
    body: params.body,
    category: 'emergency',
    notification_type: params.notificationType,
    data: {},
    created_by: params.createdByStaffId ?? null,
    sent_via: 'both',
    sent_at: new Date().toISOString(),
  }));

  const { error: insErr } = await postNotificationsReturnMinimal(rows);
  if (insErr) return { count: 0, error: insErr.message };
  const guestIds = list.map((g: { id: string }) => g.id);
  sendExpoPushToRecipients({
    guestIds,
    title: params.title,
    body: params.body,
    data: {
      screen: 'notifications',
      category: 'emergency',
      emergency: true,
      notificationType: params.notificationType,
      androidChannelId: 'valoria_emergency_alert',
      sound: 'emergency_alert.wav',
    },
  }).catch(() => {});
  return { count: rows.length };
}
