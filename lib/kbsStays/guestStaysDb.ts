import { supabase } from '@/lib/supabase';
import { withPromiseTimeout } from '@/lib/edgeInvokeTimeout';

const OPS_QUERY_TIMEOUT_MS = 20_000;
import { maskIdentityNumber } from '@/lib/kbsStays/maskIdentity';
import type { GuestStayRow, GuestStayStatus, KbsLogActionType, CheckoutType } from '@/lib/kbsStays/types';
import type { GuestScanItem } from '@/lib/guestScan/types';

export function rowToGuestStay(row: Record<string, unknown>): GuestStayRow {
  return row as unknown as GuestStayRow;
}

export async function fetchGuestStays(args?: {
  statuses?: GuestStayStatus[];
  roomNo?: string;
  limit?: number;
}): Promise<GuestStayRow[]> {
  let q = supabase
    .schema('ops')
    .from('guest_stays')
    .select('*')
    .order('checkin_at', { ascending: false })
    .limit(args?.limit ?? 200);

  if (args?.statuses?.length) q = q.in('stay_status', args.statuses);
  if (args?.roomNo) q = q.eq('room_no', args.roomNo);

  const { data, error } = await withPromiseTimeout(q, OPS_QUERY_TIMEOUT_MS, 'ops.guest_stays');
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => rowToGuestStay(r as Record<string, unknown>));
}

export async function fetchGuestStayById(id: string): Promise<GuestStayRow | null> {
  const { data, error } = await supabase.schema('ops').from('guest_stays').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToGuestStay(data as Record<string, unknown>) : null;
}

export async function insertGuestStay(args: {
  hotelId: string;
  roomNo: string;
  item?: GuestScanItem;
  guestDocumentId: string;
  stayAssignmentId?: string | null;
  kbsReferenceNo?: string | null;
  kbsCheckinStatus: 'sent' | 'failed' | 'pending';
  kbsErrorMessage?: string | null;
  submittedBy: string;
  groupId?: string | null;
  scanSessionId?: string | null;
}): Promise<GuestStayRow> {
  const it = args.item;
  const identityRaw = it?.identityNo ?? null;
  const passportRaw = it?.passportNo ?? it?.parsed?.documentNumber ?? null;

  const { data, error } = await supabase
    .schema('ops')
    .from('guest_stays')
    .insert({
      hotel_id: args.hotelId,
      room_no: args.roomNo,
      group_id: args.groupId ?? args.scanSessionId ?? null,
      scan_session_id: args.scanSessionId ?? it?.sessionId ?? null,
      guest_scan_item_id: it?.id ?? null,
      guest_document_id: args.guestDocumentId,
      stay_assignment_id: args.stayAssignmentId ?? null,
      first_name: it?.firstName ?? null,
      last_name: it?.lastName ?? null,
      guest_type: it?.guestType ?? null,
      document_type: it?.documentType ?? null,
      nationality: it?.nationality ?? it?.country ?? null,
      identity_no_masked: maskIdentityNumber(identityRaw),
      passport_no_masked: maskIdentityNumber(passportRaw),
      checkin_at: new Date().toISOString(),
      stay_status: args.kbsCheckinStatus === 'sent' ? 'checked_in' : 'correction_required',
      kbs_checkin_status: args.kbsCheckinStatus,
      kbs_reference_no: args.kbsReferenceNo ?? null,
      kbs_error_message: args.kbsErrorMessage ?? null,
      submitted_by: args.submittedBy,
      submitted_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (error || !data) throw new Error(error?.message ?? 'guest_stays insert failed');
  return rowToGuestStay(data as Record<string, unknown>);
}

export async function updateGuestStay(
  id: string,
  patch: Partial<{
    stay_status: GuestStayStatus;
    kbs_checkin_status: string;
    kbs_checkout_status: string;
    kbs_delete_status: string;
    kbs_reference_no: string | null;
    kbs_error_message: string | null;
    kbs_checkout_error_message: string | null;
    kbs_delete_error_message: string | null;
    checkout_at: string | null;
    checkout_by: string | null;
    deleted_by: string | null;
    corrected_by: string | null;
    checkout_type: CheckoutType;
    first_name: string;
    last_name: string;
    room_no: string;
  }>
): Promise<void> {
  const { error } = await supabase.schema('ops').from('guest_stays').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function insertKbsOpLog(args: {
  hotelId: string;
  guestStayId?: string | null;
  sessionId?: string | null;
  guestScanItemId?: string | null;
  guestDocumentId?: string | null;
  actionType: KbsLogActionType;
  status: 'success' | 'failed' | 'pending';
  errorMessage?: string | null;
  requestPayload?: Record<string, unknown>;
  responsePayload?: unknown;
  submittedBy?: string | null;
}): Promise<void> {
  const { error } = await supabase.schema('ops').from('kbs_submission_logs').insert({
    hotel_id: args.hotelId,
    guest_stay_id: args.guestStayId ?? null,
    session_id: args.sessionId ?? null,
    guest_scan_item_id: args.guestScanItemId ?? null,
    guest_document_id: args.guestDocumentId ?? null,
    action_type: args.actionType,
    status: args.status,
    error_message: args.errorMessage ?? null,
    request_payload: args.requestPayload ?? null,
    response_payload: args.responsePayload != null ? JSON.parse(JSON.stringify(args.responsePayload)) : null,
    submitted_by: args.submittedBy ?? null,
    created_by: args.submittedBy ?? null,
  });
  if (error) console.warn('[kbs_submission_logs]', error.message);
}

export async function insertCorrectionHistory(args: {
  hotelId: string;
  guestStayId: string;
  oldData: Record<string, unknown>;
  newData: Record<string, unknown>;
  correctionType: 'local_edit' | 'delete_and_resubmit';
  reason?: string;
  correctedBy: string;
}): Promise<void> {
  await supabase.schema('ops').from('guest_correction_history').insert({
    hotel_id: args.hotelId,
    guest_stay_id: args.guestStayId,
    old_data: args.oldData,
    new_data: args.newData,
    correction_type: args.correctionType,
    correction_reason: args.reason ?? null,
    corrected_by: args.correctedBy,
  });
}
