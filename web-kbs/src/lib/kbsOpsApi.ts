import { supabase } from './supabase';

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

function coerceResult<T>(json: unknown): ApiResult<T> {
  if (json && typeof json === 'object' && 'ok' in json && typeof (json as { ok: unknown }).ok === 'boolean') {
    return json as ApiResult<T>;
  }
  return { ok: false, error: { code: 'NETWORK', message: 'Beklenmeyen sunucu yanıtı' } };
}

export async function kbsOpsRequest<T>(
  method: 'GET' | 'POST',
  path: string,
  payload?: unknown
): Promise<ApiResult<T>> {
  const token = await getAccessToken();
  if (!token) return { ok: false, error: { code: 'AUTH', message: 'Oturum gerekli' } };

  const pathNorm = path.trim();
  if (!pathNorm.startsWith('/')) {
    return { ok: false, error: { code: 'BAD_PATH', message: 'path / ile başlamalı' } };
  }

  const { data, error } = await supabase.functions.invoke('ops-proxy', {
    body:
      method === 'GET'
        ? { method: 'GET', path: pathNorm }
        : { method: 'POST', path: pathNorm, payload: payload ?? {} },
    headers: { Authorization: `Bearer ${token}` },
  });

  if (error) {
    return { ok: false, error: { code: 'EDGE', message: error.message } };
  }
  return coerceResult<T>(data);
}

export async function kbsOpsPost<T>(path: string, payload?: unknown) {
  return kbsOpsRequest<T>('POST', path, payload);
}

export type OpsRoom = { id: string; room_number: string; floor?: string | null };

export async function fetchOpsRooms(): Promise<ApiResult<OpsRoom[]>> {
  const { data, error } = await supabase
    .schema('ops')
    .from('rooms')
    .select('id, room_number, floor')
    .eq('is_active', true)
    .order('room_number');
  if (error) return { ok: false, error: { code: 'DB', message: error.message } };
  return { ok: true, data: (data ?? []) as OpsRoom[] };
}

export async function assignOpsRoom(guestDocumentId: string, roomId: string): Promise<ApiResult<unknown>> {
  const token = await getAccessToken();
  if (!token) return { ok: false, error: { code: 'AUTH', message: 'Oturum gerekli' } };

  const { data, error } = await supabase.functions.invoke('kbs-staff-ops', {
    body: { action: 'assign_room', guestDocumentId, roomId },
    headers: { Authorization: `Bearer ${token}` },
  });
  if (error) {
    // fallback Railway
    return kbsOpsPost('/stay/assign-room', { guestDocumentId, roomId });
  }
  return coerceResult(data);
}

export async function markReady(guestDocumentIds: string[]) {
  return kbsOpsPost('/documents/mark-ready', { guestDocumentIds });
}

export async function submitCheckIn(guestDocumentId: string) {
  return kbsOpsPost<{ transactionId: string }>('/submissions/check-in', { guestDocumentId });
}

export async function submitCheckOut(guestDocumentId: string) {
  return kbsOpsPost<{ transactionId: string }>('/submissions/check-out', { guestDocumentId });
}

export async function notifyCaptureToKbs(args: {
  guestDocumentId: string;
  roomId: string;
}): Promise<ApiResult<{ transactionId?: string }>> {
  const assign = await assignOpsRoom(args.guestDocumentId, args.roomId);
  if (!assign.ok) return assign;

  await supabase
    .schema('ops')
    .from('guest_documents')
    .update({ scan_status: 'ready_to_submit' })
    .eq('id', args.guestDocumentId);

  const mark = await markReady([args.guestDocumentId]);
  if (!mark.ok) {
    // local status already set
  }

  const submit = await submitCheckIn(args.guestDocumentId);
  if (!submit.ok) return submit;
  return { ok: true, data: { transactionId: submit.data.transactionId } };
}
