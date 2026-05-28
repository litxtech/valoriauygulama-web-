import { supabase } from '@/lib/supabase';
import { edgeInvokeToApiResult } from '@/lib/functionsError';
import { invokeSupabaseEdgeFunction, withPromiseTimeout } from '@/lib/edgeInvokeTimeout';

const OPS_ROOMS_QUERY_TIMEOUT_MS = 18_000;
import type { ApiResult } from '@/lib/kbsApi';

export type KbsOpsRoom = { id: string; room_number: string; floor?: string | null; capacity?: number | null };

const FN = 'kbs-staff-ops';
const DEPLOY_HINT =
  'kbs-staff-ops deploy edilmemiş. Çalıştırın: supabase functions deploy kbs-staff-ops — SQL: 285_kbs_edge_rooms_and_assign.sql';

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

/** ops.rooms — önce doğrudan Supabase, olmazsa Edge RPC. */
export async function fetchKbsOpsRooms(): Promise<ApiResult<KbsOpsRoom[]>> {
  const roomsQuery = supabase
    .schema('ops')
    .from('rooms')
    .select('id, room_number, floor, capacity')
    .eq('is_active', true)
    .order('room_number');
  const { data, error } = await withPromiseTimeout(roomsQuery, OPS_ROOMS_QUERY_TIMEOUT_MS, 'ops.rooms');

  if (!error && data && data.length > 0) {
    return {
      ok: true,
      data: data.map((r) => ({
        id: String(r.id),
        room_number: String(r.room_number),
        floor: r.floor as string | null,
        capacity: r.capacity as number | null,
      })),
    };
  }

  const edge = await invokeStaffOps<KbsOpsRoom[]>({ action: 'list_rooms' });
  if (edge.ok) return edge;

  const hint =
    error?.message?.includes('PGRST106') || error?.message?.includes('schema')
      ? ' ops şeması expose değil; Edge deploy + migration 285 gerekli.'
      : '';
  return {
    ok: false,
    error: {
      code: edge.error.code,
      message: (edge.error.message || 'Oda listesi alınamadı') + hint,
      details: error?.message,
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
