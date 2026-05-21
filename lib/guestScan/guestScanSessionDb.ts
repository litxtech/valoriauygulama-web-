import { supabase } from '@/lib/supabase';
import { resolveOpsHotelIdForCaller } from '@/lib/resolveOpsHotelId';
import type { GuestScanItem, GuestScanSession, GuestScanSessionType } from '@/lib/guestScan/types';

function rowToItem(row: Record<string, unknown>): GuestScanItem {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    guestType: row.guest_type as GuestScanItem['guestType'],
    documentType: row.document_type as GuestScanItem['documentType'],
    sourceType: (row.source_type as GuestScanItem['sourceType']) ?? 'camera',
    firstName: (row.first_name as string) ?? null,
    lastName: (row.last_name as string) ?? null,
    identityNo: (row.identity_no as string) ?? null,
    passportNo: (row.passport_no as string) ?? null,
    documentSerialNo: (row.document_serial_no as string) ?? null,
    birthDate: row.birth_date ? String(row.birth_date).slice(0, 10) : null,
    gender: (row.gender as GuestScanItem['gender']) ?? null,
    nationality: (row.nationality as string) ?? null,
    country: (row.country as string) ?? null,
    motherName: (row.mother_name as string) ?? null,
    fatherName: (row.father_name as string) ?? null,
    passportExpiryDate: row.passport_expiry_date ? String(row.passport_expiry_date).slice(0, 10) : null,
    rawMrz: (row.raw_mrz as string) ?? null,
    rawOcr: Array.isArray(row.raw_ocr) ? (row.raw_ocr as string[]) : null,
    confidenceScore: row.confidence_score != null ? Number(row.confidence_score) : null,
    validationStatus: row.validation_status as GuestScanItem['validationStatus'],
    kbsStatus: row.kbs_status as GuestScanItem['kbsStatus'],
    kbsErrorMessage: (row.kbs_error_message as string) ?? null,
    guestDocumentId: (row.guest_document_id as string) ?? null,
    guestPhone: (row.guest_phone as string) ?? null,
    plateNumber: (row.plate_number as string) ?? null,
    usageKind: (row.usage_kind as GuestScanItem['usageKind']) ?? 'konaklama',
    forwardDated: !!row.forward_dated,
    lowConfidenceFields: [],
  };
}

export async function createGuestScanSessionDb(
  sessionType: GuestScanSessionType
): Promise<{ ok: true; session: GuestScanSession } | { ok: false; message: string }> {
  const ctx = await resolveOpsHotelIdForCaller();
  if (!ctx.ok) return { ok: false, message: ctx.message };
  const uid = ctx.userId;
  const hotelId = ctx.hotelId;

  const { data, error } = await supabase
    .schema('ops')
    .from('guest_scan_sessions')
    .insert({
      hotel_id: hotelId,
      created_by: uid,
      session_type: sessionType,
      status: 'draft',
    })
    .select('id, session_type, status, room_no, checkin_at, checkout_at')
    .single();

  if (error || !data) return { ok: false, message: error?.message ?? 'Oturum oluşturulamadı' };

  return {
    ok: true,
    session: {
      id: data.id,
      sessionType: data.session_type,
      status: data.status,
      roomNo: data.room_no,
      checkinAt: data.checkin_at,
      checkoutAt: data.checkout_at,
      items: [],
    },
  };
}

export async function persistGuestScanItemDb(
  item: GuestScanItem,
  hotelId: string
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const { data, error } = await supabase
    .schema('ops')
    .from('guest_scan_items')
    .insert({
      id: item.id.startsWith('tmp-') ? undefined : item.id,
      session_id: item.sessionId,
      hotel_id: hotelId,
      guest_type: item.guestType,
      document_type: item.documentType,
      source_type: item.sourceType,
      first_name: item.firstName,
      last_name: item.lastName,
      identity_no: item.identityNo,
      passport_no: item.passportNo,
      document_serial_no: item.documentSerialNo,
      birth_date: item.birthDate,
      gender: item.gender,
      nationality: item.nationality,
      country: item.country,
      mother_name: item.motherName,
      father_name: item.fatherName,
      passport_expiry_date: item.passportExpiryDate,
      raw_mrz: item.rawMrz,
      raw_ocr: item.rawOcr,
      confidence_score: item.confidenceScore,
      validation_status: item.validationStatus,
      kbs_status: item.kbsStatus,
      guest_phone: item.guestPhone,
      plate_number: item.plateNumber,
      usage_kind: item.usageKind,
      forward_dated: item.forwardDated,
    })
    .select('id')
    .single();

  if (error || !data) return { ok: false, message: error?.message ?? 'Kayıt eklenemedi' };
  return { ok: true, id: data.id };
}

export async function updateGuestScanSessionDb(
  sessionId: string,
  patch: Partial<Pick<GuestScanSession, 'roomNo' | 'checkinAt' | 'checkoutAt' | 'status'>>
): Promise<void> {
  const body: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.roomNo !== undefined) body.room_no = patch.roomNo;
  if (patch.checkinAt !== undefined) body.checkin_at = patch.checkinAt;
  if (patch.checkoutAt !== undefined) body.checkout_at = patch.checkoutAt;
  if (patch.status !== undefined) body.status = patch.status;
  await supabase.schema('ops').from('guest_scan_sessions').update(body).eq('id', sessionId);
}

export async function insertKbsSubmissionLogDb(args: {
  hotelId: string;
  sessionId: string;
  guestScanItemId: string;
  guestDocumentId?: string | null;
  status: 'success' | 'failed' | 'pending';
  errorMessage?: string | null;
  requestPayload?: Record<string, unknown>;
  responsePayload?: unknown;
}): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  await supabase.schema('ops').from('kbs_submission_logs').insert({
    hotel_id: args.hotelId,
    session_id: args.sessionId,
    guest_scan_item_id: args.guestScanItemId,
    guest_document_id: args.guestDocumentId ?? null,
    created_by: userData.user?.id ?? null,
    status: args.status,
    error_message: args.errorMessage ?? null,
    request_payload: args.requestPayload ?? null,
    response_payload: args.responsePayload != null ? JSON.parse(JSON.stringify(args.responsePayload)) : null,
  });
}

export { rowToItem };
