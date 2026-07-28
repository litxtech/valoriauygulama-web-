import { supabase } from '@/lib/supabase';
import { edgeInvokeToApiResult } from '@/lib/functionsError';
import { invokeSupabaseEdgeFunction, withPromiseTimeout } from '@/lib/edgeInvokeTimeout';
import { apiGet, type ApiResult } from '@/lib/kbsApi';
import { resolveOpsHotelIdForCaller } from '@/lib/resolveOpsHotelId';

const OPS_ROOMS_QUERY_TIMEOUT_MS = 18_000;

export type KbsOpsRoom = { id: string; room_number: string; floor?: string | null; capacity?: number | null };

const FN = 'kbs-staff-ops';
const DEPLOY_HINT =
  'kbs-staff-ops deploy edilmemiş. Çalıştırın: supabase functions deploy kbs-staff-ops — SQL: 285_kbs_edge_rooms_and_assign.sql';

function mapOpsRoomRows(rows: unknown[]): KbsOpsRoom[] {
  const out: KbsOpsRoom[] = [];
  const seen = new Set<string>();
  for (const raw of rows) {
    const r = raw as Record<string, unknown>;
    const id = r?.id != null ? String(r.id) : '';
    const room_number = String(r?.room_number ?? '').trim();
    if (!id || !room_number) continue;
    const key = room_number.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id,
      room_number,
      floor: (r.floor as string | null) ?? null,
      capacity: typeof r.capacity === 'number' ? r.capacity : null,
    });
  }
  out.sort((a, b) => a.room_number.localeCompare(b.room_number, 'tr', { numeric: true }));
  return out;
}

async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function invokeStaffOps<T>(body: Record<string, unknown>): Promise<ApiResult<T>> {
  const token = await getAccessToken();
  if (!token) return { ok: false, error: { code: 'AUTH', message: 'Oturum gerekli' } };

  try {
    const { data, error } = await invokeSupabaseEdgeFunction(FN, {
      body,
      headers: { Authorization: `Bearer ${token}` },
    });
    return edgeInvokeToApiResult<T>({ data, error, deployHint: DEPLOY_HINT });
  } catch (e) {
    return {
      ok: false,
      error: {
        code: 'TIMEOUT',
        message: e instanceof Error ? e.message : String(e),
      },
    };
  }
}

/**
 * KBS oda listesi — KBS Odalar / gateway ile aynı kapsam:
 * 1) Gateway GET /rooms (hotel_id scoped)
 * 2) ops.rooms + açık hotel_id filtresi
 * 3) Edge list_rooms RPC
 */
export async function fetchKbsOpsRooms(): Promise<ApiResult<KbsOpsRoom[]>> {
  // 1) KBS gateway — Odalar ekranı ile aynı kaynak
  try {
    const gateway = await apiGet<KbsOpsRoom[]>('/rooms');
    if (gateway.ok && Array.isArray(gateway.data)) {
      return { ok: true, data: mapOpsRoomRows(gateway.data) };
    }
  } catch {
    /* gateway yoksa ops / edge */
  }

  // 2) ops.rooms — mutlaka hotel_id ile (RLS yetmez; yanlış otel sızıntısını keser)
  const ctx = await resolveOpsHotelIdForCaller();
  let directError: { message?: string; code?: string } | null = null;
  if (ctx.ok) {
    const roomsQuery = supabase
      .schema('ops')
      .from('rooms')
      .select('id, room_number, floor, capacity')
      .eq('hotel_id', ctx.hotelId)
      .eq('is_active', true)
      .order('room_number')
      .limit(300);
    try {
      const { data, error } = await withPromiseTimeout(
        roomsQuery,
        OPS_ROOMS_QUERY_TIMEOUT_MS,
        'ops.rooms'
      );
      directError = error;
      if (!error && data) {
        return { ok: true, data: mapOpsRoomRows(data) };
      }
    } catch (e) {
      directError = { message: e instanceof Error ? e.message : String(e) };
    }
  }

  // 3) Edge RPC (kbs_edge_list_rooms — hotel scoped)
  const edge = await invokeStaffOps<KbsOpsRoom[]>({ action: 'list_rooms' });
  if (edge.ok) {
    const rows = Array.isArray(edge.data) ? edge.data : [];
    return { ok: true, data: mapOpsRoomRows(rows) };
  }

  const hint =
    directError?.message?.includes('PGRST106') ||
    directError?.message?.includes('schema') ||
    (!ctx.ok && ctx.code === 'PGRST106')
      ? ' ops şeması expose değil; Edge deploy + migration 285 gerekli.'
      : '';
  return {
    ok: false,
    error: {
      code: edge.error.code,
      message: (edge.error.message || (!ctx.ok ? ctx.message : null) || 'Oda listesi alınamadı') + hint,
      details: directError?.message ?? (!ctx.ok ? ctx.message : undefined),
    },
  };
}

/** Oda yoksa oluşturur, varsa döner (Edge RPC). */
export async function ensureKbsOpsRoom(roomNumber: string): Promise<ApiResult<KbsOpsRoom>> {
  const trimmed = roomNumber.trim();
  if (!trimmed) {
    return { ok: false, error: { code: 'BAD_REQUEST', message: 'Oda numarası gerekli' } };
  }
  return invokeStaffOps<KbsOpsRoom>({ action: 'ensure_room', roomNumber: trimmed });
}

/** Odayı pasifleştir (listeden kaldır). FK güvenli soft-delete. */
export async function deactivateKbsOpsRoom(roomId: string): Promise<ApiResult<{ id: string }>> {
  const id = roomId.trim();
  if (!id) {
    return { ok: false, error: { code: 'BAD_REQUEST', message: 'Oda id gerekli' } };
  }

  const { error } = await supabase
    .schema('ops')
    .from('rooms')
    .update({ is_active: false })
    .eq('id', id);

  if (!error) return { ok: true, data: { id } };

  const edge = await invokeStaffOps<{ id: string }>({ action: 'deactivate_room', roomId: id });
  if (edge.ok) return edge;

  return {
    ok: false,
    error: {
      code: edge.error.code,
      message: error.message || edge.error.message,
    },
  };
}

/** Toplu oda ataması — tek Edge çağrısı (kayıt hızlandırma). */
export async function assignKbsRoomsBatch(args: {
  roomId: string;
  guestDocumentIds: string[];
}): Promise<ApiResult<{ assigned: number; total: number }>> {
  const ids = args.guestDocumentIds.filter(Boolean);
  if (!ids.length) {
    return { ok: false, error: { code: 'BAD_REQUEST', message: 'Belge listesi boş' } };
  }
  if (ids.length === 1) {
    const one = await assignKbsRoom({ guestDocumentId: ids[0]!, roomId: args.roomId });
    if (!one.ok) return one;
    return { ok: true, data: { assigned: 1, total: 1 } };
  }
  const edge = await invokeStaffOps<{ assigned: number; total: number }>({
    action: 'assign_rooms_batch',
    roomId: args.roomId,
    assignments: ids.map((guestDocumentId) => ({ guestDocumentId })),
  });
  return edge;
}

/** Oda ataması — önce Edge (VPS yok), köprü yalnızca yedek. */
export async function assignKbsRoom(args: {
  guestDocumentId: string;
  roomId: string;
}): Promise<ApiResult<{ id: string; room_id: string; stay_status?: string }>> {
  const edge = await invokeStaffOps<{ id: string; room_id: string; stay_status?: string }>({
    action: 'assign_room',
    guestDocumentId: args.guestDocumentId,
    roomId: args.roomId,
  });
  if (edge.ok) return edge;

  const { apiPost } = await import('@/lib/kbsApi');
  const bridge = await apiPost<{ id: string; room_id: string; stay_status?: string }>('/stay/assign-room', {
    guestDocumentId: args.guestDocumentId,
    roomId: args.roomId,
  });
  if (bridge.ok) return bridge;

  return {
    ok: false,
    error: {
      code: edge.error.code,
      message: `${edge.error.message}\n\n(Köprü yedek: ${bridge.error.message})`,
    },
  };
}

/** Check-in Bildir — Edge → kbs-core (Railway JWT / Unauthorized yok). */
export async function submitKbsCheckInEdge(args: {
  guestDocumentId: string;
}): Promise<ApiResult<{ transactionId: string; idempotent?: boolean }>> {
  return invokeStaffOps<{ transactionId: string; idempotent?: boolean }>({
    action: 'submit_check_in',
    guestDocumentId: args.guestDocumentId,
  });
}
