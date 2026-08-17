import { supabase } from '@/lib/supabase';
import { displayCapturedName, type KbsCapturedDocumentRow } from '@/lib/kbsCaptureHistory';
import { enrichKbsParsedFromSources } from '@/lib/kbsCaptureParsedFields';
import { log } from '@/lib/logger';
import { OPS_SCHEMA_NOT_EXPOSED_MSG } from '@/lib/resolveOpsHotelId';
import {
  isOpsSchemaNotExposedError,
  isTransientSupabaseDbError,
  sleepMs,
  toSupabaseUserMessage,
} from '@/lib/supabaseTransientErrors';

export type KbsAccessEventType =
  | 'view_open'
  | 'view_close'
  | 'image_zoom'
  | 'field_copy'
  | 'pdf_share'
  | 'pdf_print'
  | 'notify'
  | 'assign_room'
  | 'manual_edit'
  | 'screenshot'
  | 'delete';

export type KbsAccessReasonCode =
  | 'checkin_verify'
  | 'guest_request'
  | 'complaint'
  | 'audit'
  | 'room_change'
  | 'other';

export type KbsAccessClient = 'staff_app' | 'web_kbs' | 'admin';

export const KBS_ACCESS_EVENT_LABELS: Record<KbsAccessEventType, string> = {
  view_open: 'Belgeyi açtı',
  view_close: 'Belgeden çıktı',
  image_zoom: 'Görseli büyüttü',
  field_copy: 'Alan kopyaladı',
  pdf_share: 'PDF paylaştı / indirdi',
  pdf_print: 'Yazdırmaya gönderdi',
  notify: 'KBS’ye bildirdi',
  assign_room: 'Oda atadı',
  manual_edit: 'Manuel düzeltti',
  screenshot: 'Ekran görüntüsü aldı',
  delete: 'Belgeyi sildi',
};

export const KBS_ACCESS_REASON_LABELS: Record<KbsAccessReasonCode, string> = {
  checkin_verify: 'Check-in doğrulama',
  guest_request: 'Misafir talebi',
  complaint: 'Şikayet / olay',
  audit: 'Denetim / kontrol',
  room_change: 'Oda değişikliği',
  other: 'Diğer',
};

export type LogKbsDocumentAccessInput = {
  hotelId?: string | null;
  guestDocumentId: string;
  eventType: KbsAccessEventType;
  actorAuthId?: string | null;
  actorStaffId?: string | null;
  actorStaffName?: string | null;
  sessionId?: string | null;
  reasonCode?: KbsAccessReasonCode | null;
  reasonText?: string | null;
  dwellMs?: number | null;
  guestName?: string | null;
  documentNumber?: string | null;
  client?: KbsAccessClient;
  pathname?: string | null;
  metadata?: Record<string, unknown> | null;
};

function newSessionId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (typeof g.crypto?.randomUUID === 'function') {
    try {
      return g.crypto.randomUUID();
    } catch {
      /* fall through */
    }
  }
  // uuid v4 benzeri (DB session_id uuid bekler; "sess_..." geçersiz)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function documentNumberFromRow(row: KbsCapturedDocumentRow): string | null {
  const parsed = enrichKbsParsedFromSources(row.parsed_payload);
  const n = parsed?.documentNumber?.trim();
  return n || null;
}

/** Fire-and-forget: UI’yi asla bloklamaz. */
export function logKbsDocumentAccess(input: LogKbsDocumentAccessInput): void {
  void (async () => {
    try {
      if (!input.guestDocumentId || !input.eventType) return;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const actorAuthId = input.actorAuthId ?? user?.id ?? null;
      if (!actorAuthId) return;

      let actorStaffId = input.actorStaffId ?? null;
      let actorStaffName = input.actorStaffName?.trim() || null;
      if (!actorStaffId || !actorStaffName) {
        try {
          const { useAuthStore } = await import('@/stores/authStore');
          const me = useAuthStore.getState().staff;
          if (me && (me.auth_id === actorAuthId || !actorStaffId)) {
            actorStaffId = actorStaffId ?? me.id ?? null;
            actorStaffName = actorStaffName || me.full_name?.trim() || null;
          }
        } catch {
          /* RPC personeli auth.uid üzerinden çözer */
        }
      }

      let hotelId = input.hotelId?.trim() || '';
      if (!hotelId) {
        const { resolveOpsHotelIdForCaller } = await import('@/lib/resolveOpsHotelId');
        const ctx = await resolveOpsHotelIdForCaller(actorAuthId);
        if (ctx.ok) hotelId = ctx.hotelId;
      }

      const { error } = await supabase.rpc('log_kbs_document_access', {
        p_guest_document_id: input.guestDocumentId,
        p_event_type: input.eventType,
        p_session_id: input.sessionId ?? null,
        p_reason_code: input.reasonCode ?? null,
        p_reason_text: input.reasonText ?? null,
        p_dwell_ms:
          typeof input.dwellMs === 'number' && input.dwellMs >= 0 ? Math.round(input.dwellMs) : null,
        p_guest_name: input.guestName ?? null,
        p_document_number: input.documentNumber ?? null,
        p_client: input.client ?? 'staff_app',
        p_pathname: input.pathname ?? null,
        p_metadata: input.metadata ?? {},
        p_actor_staff_id: actorStaffId,
        p_actor_staff_name: actorStaffName,
        p_hotel_id: hotelId || null,
      });
      if (error) {
        const { error: opsRpcError } = await supabase.schema('ops').rpc('log_guest_document_access', {
          p_guest_document_id: input.guestDocumentId,
          p_event_type: input.eventType,
          p_session_id: input.sessionId ?? null,
          p_reason_code: input.reasonCode ?? null,
          p_reason_text: input.reasonText ?? null,
          p_dwell_ms:
            typeof input.dwellMs === 'number' && input.dwellMs >= 0 ? Math.round(input.dwellMs) : null,
          p_guest_name: input.guestName ?? null,
          p_document_number: input.documentNumber ?? null,
          p_client: input.client ?? 'staff_app',
          p_pathname: input.pathname ?? null,
          p_metadata: input.metadata ?? {},
          p_actor_staff_id: actorStaffId,
          p_actor_staff_name: actorStaffName,
          p_hotel_id: hotelId || null,
        });
        if (opsRpcError) {
        // RPC yoksa eski doğrudan insert (migration öncesi)
        const { error: insertError } = await supabase.schema('ops').from('guest_document_access_events').insert({
          hotel_id: hotelId || null,
          guest_document_id: input.guestDocumentId,
          actor_auth_id: actorAuthId,
          actor_staff_id: actorStaffId,
          actor_staff_name: actorStaffName,
          session_id: input.sessionId ?? null,
          event_type: input.eventType,
          reason_code: input.reasonCode ?? null,
          reason_text: input.reasonText?.trim() || null,
          dwell_ms: typeof input.dwellMs === 'number' && input.dwellMs >= 0 ? Math.round(input.dwellMs) : null,
          guest_name_snapshot: input.guestName?.trim() || null,
          document_number_snapshot: input.documentNumber?.trim() || null,
          client: input.client ?? 'staff_app',
          pathname: input.pathname ?? null,
          metadata: input.metadata ?? {},
        });
        if (insertError) log.warn('kbsDocumentAccessLog', insertError.message || opsRpcError.message || error.message);
        }
      }
    } catch (e) {
      log.warn('kbsDocumentAccessLog', e);
    }
  })();
}

export function logKbsDocumentAccessFromRow(
  row: KbsCapturedDocumentRow,
  eventType: KbsAccessEventType,
  opts?: Omit<LogKbsDocumentAccessInput, 'hotelId' | 'guestDocumentId' | 'eventType' | 'guestName' | 'documentNumber'>
): void {
  logKbsDocumentAccess({
    hotelId: row.hotel_id?.trim() || null,
    guestDocumentId: row.id,
    eventType,
    guestName: displayCapturedName(row),
    documentNumber: documentNumberFromRow(row),
    ...opts,
  });
}

type ActiveViewSession = {
  sessionId: string;
  guestDocumentId: string;
  hotelId: string;
  openedAt: number;
  guestName: string | null;
  documentNumber: string | null;
  reasonCode: KbsAccessReasonCode | null;
  actorStaffId: string | null;
  actorStaffName: string | null;
  actorAuthId: string | null;
  pathname: string | null;
};

let activeView: ActiveViewSession | null = null;

export function getActiveKbsDocumentAccessSession(): ActiveViewSession | null {
  return activeView;
}

export function setActiveKbsAccessReason(reasonCode: KbsAccessReasonCode | null): void {
  if (activeView) activeView.reasonCode = reasonCode;
}

export function beginKbsDocumentViewSession(params: {
  row: KbsCapturedDocumentRow;
  actorStaffId?: string | null;
  actorStaffName?: string | null;
  actorAuthId?: string | null;
  reasonCode?: KbsAccessReasonCode | null;
  pathname?: string | null;
}): string | null {
  const hotelId = params.row.hotel_id?.trim() || '';
  // hotel_id yoksa yine de session aç; RPC belge üzerinden hotel çözer
  const effectiveHotel = hotelId || '00000000-0000-0000-0000-000000000000';

  if (activeView?.guestDocumentId === params.row.id) {
    if (params.reasonCode) activeView.reasonCode = params.reasonCode;
    return activeView.sessionId;
  }

  if (activeView) endKbsDocumentViewSession();

  const sessionId = newSessionId();
  activeView = {
    sessionId,
    guestDocumentId: params.row.id,
    hotelId: hotelId || effectiveHotel,
    openedAt: Date.now(),
    guestName: displayCapturedName(params.row),
    documentNumber: documentNumberFromRow(params.row),
    reasonCode: params.reasonCode ?? null,
    actorStaffId: params.actorStaffId ?? null,
    actorStaffName: params.actorStaffName ?? null,
    actorAuthId: params.actorAuthId ?? null,
    pathname: params.pathname ?? null,
  };

  logKbsDocumentAccess({
    hotelId: hotelId || null,
    guestDocumentId: params.row.id,
    eventType: 'view_open',
    sessionId,
    actorStaffId: activeView.actorStaffId,
    actorStaffName: activeView.actorStaffName,
    actorAuthId: activeView.actorAuthId,
    reasonCode: activeView.reasonCode,
    guestName: activeView.guestName,
    documentNumber: activeView.documentNumber,
    pathname: activeView.pathname,
  });

  return sessionId;
}

export function endKbsDocumentViewSession(): void {
  const cur = activeView;
  if (!cur) return;
  activeView = null;
  const dwellMs = Math.max(0, Date.now() - cur.openedAt);
  logKbsDocumentAccess({
    hotelId: cur.hotelId,
    guestDocumentId: cur.guestDocumentId,
    eventType: 'view_close',
    sessionId: cur.sessionId,
    actorStaffId: cur.actorStaffId,
    actorStaffName: cur.actorStaffName,
    actorAuthId: cur.actorAuthId,
    reasonCode: cur.reasonCode,
    dwellMs,
    guestName: cur.guestName,
    documentNumber: cur.documentNumber,
    pathname: cur.pathname,
    metadata: { dwell_sec: Math.round(dwellMs / 1000) },
  });
}

export function logKbsAccessAction(
  eventType: Exclude<KbsAccessEventType, 'view_open' | 'view_close'>,
  opts?: {
    row?: KbsCapturedDocumentRow | null;
    metadata?: Record<string, unknown> | null;
    reasonCode?: KbsAccessReasonCode | null;
    pathname?: string | null;
  }
): void {
  const row = opts?.row;
  const session = activeView;
  if (row?.hotel_id) {
    logKbsDocumentAccessFromRow(row, eventType, {
      sessionId: session?.guestDocumentId === row.id ? session.sessionId : session?.sessionId ?? null,
      actorStaffId: session?.actorStaffId,
      actorStaffName: session?.actorStaffName,
      actorAuthId: session?.actorAuthId,
      reasonCode: opts?.reasonCode ?? session?.reasonCode ?? null,
      pathname: opts?.pathname ?? session?.pathname ?? null,
      metadata: opts?.metadata ?? null,
    });
    return;
  }
  if (!session) return;
  logKbsDocumentAccess({
    hotelId: session.hotelId,
    guestDocumentId: session.guestDocumentId,
    eventType,
    sessionId: session.sessionId,
    actorStaffId: session.actorStaffId,
    actorStaffName: session.actorStaffName,
    actorAuthId: session.actorAuthId,
    reasonCode: opts?.reasonCode ?? session.reasonCode,
    guestName: session.guestName,
    documentNumber: session.documentNumber,
    pathname: opts?.pathname ?? session.pathname,
    metadata: opts?.metadata ?? null,
  });
}

export type KbsDocumentAccessEventRow = {
  id: string;
  hotel_id: string;
  guest_document_id: string;
  actor_auth_id: string | null;
  actor_staff_id: string | null;
  actor_staff_name: string | null;
  actor_staff_role?: string | null;
  session_id: string | null;
  event_type: KbsAccessEventType;
  reason_code: KbsAccessReasonCode | null;
  reason_text: string | null;
  dwell_ms: number | null;
  guest_name_snapshot: string | null;
  document_number_snapshot: string | null;
  client: KbsAccessClient;
  pathname: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export function formatKbsAccessDwell(dwellMs: number | null | undefined): string | null {
  if (dwellMs == null || dwellMs < 0) return null;
  const sec = Math.round(dwellMs / 1000);
  if (sec < 60) return `${sec} sn`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return rem > 0 ? `${min} dk ${rem} sn` : `${min} dk`;
}

export function kbsAccessActorLabel(row: Pick<KbsDocumentAccessEventRow, 'actor_staff_name'>): string {
  return row.actor_staff_name?.trim() || 'Bilinmeyen personel';
}

export function formatKbsAccessEventLine(row: KbsDocumentAccessEventRow): string {
  const who = kbsAccessActorLabel(row);
  const action = KBS_ACCESS_EVENT_LABELS[row.event_type] ?? row.event_type;
  const guest = row.guest_name_snapshot?.trim() || 'İsimsiz belge';
  const doc = row.document_number_snapshot?.trim();
  const target = doc ? `${guest} · ${doc}` : guest;
  const reason = row.reason_code ? KBS_ACCESS_REASON_LABELS[row.reason_code] : null;
  const dwell = row.event_type === 'view_close' ? formatKbsAccessDwell(row.dwell_ms) : null;

  let line = `${who} ${action.toLowerCase()} — ${target}`;
  if (dwell) line += ` · ${dwell}`;
  if (reason) line += ` · ${reason}`;
  return line;
}

async function enrichAccessEventActors(
  rows: KbsDocumentAccessEventRow[]
): Promise<KbsDocumentAccessEventRow[]> {
  if (rows.length === 0) return rows;
  const needsEnrich = rows.some(
    (r) => !r.actor_staff_name?.trim() || (r.actor_staff_id && !r.actor_staff_role)
  );
  if (!needsEnrich) return rows;

  const staffIds = [...new Set(rows.map((r) => r.actor_staff_id).filter(Boolean))] as string[];
  const authIds = [...new Set(rows.map((r) => r.actor_auth_id).filter(Boolean))] as string[];
  const ors: string[] = [];
  if (staffIds.length) ors.push(`id.in.(${staffIds.slice(0, 80).join(',')})`);
  if (authIds.length) ors.push(`auth_id.in.(${authIds.slice(0, 80).join(',')})`);
  if (ors.length === 0) return rows;

  const { data, error } = await supabase
    .from('staff')
    .select('id, auth_id, full_name, role')
    .or(ors.join(','));
  if (error || !data?.length) return rows;

  const byId = new Map<string, { full_name: string | null; role: string | null }>();
  const byAuth = new Map<string, { full_name: string | null; role: string | null }>();
  for (const s of data as {
    id: string;
    auth_id: string | null;
    full_name: string | null;
    role: string | null;
  }[]) {
    byId.set(s.id, { full_name: s.full_name, role: s.role });
    if (s.auth_id) byAuth.set(s.auth_id, { full_name: s.full_name, role: s.role });
  }

  return rows.map((r) => {
    const hit =
      (r.actor_staff_id ? byId.get(r.actor_staff_id) : undefined) ??
      (r.actor_auth_id ? byAuth.get(r.actor_auth_id) : undefined);
    if (!hit) return r;
    return {
      ...r,
      actor_staff_name: r.actor_staff_name?.trim() || hit.full_name,
      actor_staff_role: r.actor_staff_role ?? hit.role,
    };
  });
}

function mapAccessLogFetchError(error: { code?: string; message?: string; status?: number } | null): string {
  if (!error) return 'Kayıtlar okunamadı';
  if (isOpsSchemaNotExposedError(error)) return OPS_SCHEMA_NOT_EXPOSED_MSG;
  if (error.code === 'PGRST202' || /list_kbs_document_access_events/i.test(error.message ?? '')) {
    return 'Sunucuda erişim logu fonksiyonu yok. Migration 625_kbs_access_log_list_rpc.sql uygulayın.';
  }
  if (error.message?.toLowerCase().includes('forbidden')) {
    return 'Bu listeyi görüntüleme yetkiniz yok (Kimlik çekim / KBS yönetim izni gerekir).';
  }
  return toSupabaseUserMessage(error, error.message ?? 'Kayıtlar okunamadı');
}

async function fetchKbsDocumentAccessEventsViaRpc(
  limit: number
): Promise<{ rows: KbsDocumentAccessEventRow[]; error: string | null }> {
  const { data, error } = await supabase.rpc('list_kbs_document_access_events', { p_limit: limit });
  if (error) {
    return { rows: [], error: mapAccessLogFetchError(error) };
  }
  return { rows: (data ?? []) as KbsDocumentAccessEventRow[], error: null };
}

async function fetchKbsDocumentAccessEventsViaOpsTable(
  limit: number
): Promise<{ rows: KbsDocumentAccessEventRow[]; error: string | null }> {
  const { data, error } = await supabase
    .schema('ops')
    .from('guest_document_access_events')
    .select(
      'id, hotel_id, guest_document_id, actor_auth_id, actor_staff_id, actor_staff_name, session_id, event_type, reason_code, reason_text, dwell_ms, guest_name_snapshot, document_number_snapshot, client, pathname, metadata, created_at'
    )
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    return { rows: [], error: mapAccessLogFetchError(error) };
  }
  const rows = await enrichAccessEventActors((data ?? []) as KbsDocumentAccessEventRow[]);
  return { rows, error: null };
}

export async function fetchKbsDocumentAccessEvents(
  limit = 200
): Promise<{ rows: KbsDocumentAccessEventRow[]; error: string | null }> {
  const capped = Math.min(Math.max(limit, 1), 500);

  for (let attempt = 0; attempt < 2; attempt++) {
    const rpcRes = await fetchKbsDocumentAccessEventsViaRpc(capped);
    if (!rpcRes.error) return rpcRes;

    const rpcMissing =
      rpcRes.error.includes('625_kbs_access_log_list_rpc') ||
      rpcRes.error.includes('list_kbs_document_access_events');
    if (!rpcMissing) {
      log.warn('kbsDocumentAccessLog', 'fetch rpc', rpcRes.error);
      if (attempt === 0 && isTransientSupabaseDbError({ message: rpcRes.error })) {
        await sleepMs(350);
        continue;
      }
      if (!isOpsSchemaNotExposedError({ message: rpcRes.error })) {
        return rpcRes;
      }
    }

    const tableRes = await fetchKbsDocumentAccessEventsViaOpsTable(capped);
    if (!tableRes.error) return tableRes;

    log.warn('kbsDocumentAccessLog', 'fetch ops', tableRes.error);
    if (attempt === 0 && isTransientSupabaseDbError({ message: tableRes.error })) {
      await sleepMs(350);
      continue;
    }
    return tableRes;
  }

  return { rows: [], error: 'Kayıtlar okunamadı. Bağlantıyı kontrol edip tekrar deneyin.' };
}
