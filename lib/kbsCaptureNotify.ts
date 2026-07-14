import { supabase } from '@/lib/supabase';
import { assignKbsRoom, submitKbsCheckInEdge } from '@/lib/kbsStaffOpsEdge';
import {
  enrichKbsParsedFromSources,
  normalizeKbsParsedPayload,
} from '@/lib/kbsCaptureParsedFields';
import { inferKbsPersonKind } from '@/lib/kbsInferPersonKind';
import type { KbsCapturedDocumentRow } from '@/lib/kbsCaptureHistory';
import type { ParsedDocument } from '@/lib/scanner/types';
import { fetchKbsCaptureNotifyStaffIds } from '@/lib/kbsCaptureSettings';
import { sendNotificationToStaffIds } from '@/lib/notificationService';

export type KbsCaptureManualEdit = {
  firstName?: string | null;
  lastName?: string | null;
  documentNumber?: string | null;
  birthDate?: string | null;
  nationalityCode?: string | null;
  issuingCountryCode?: string | null;
  gender?: 'M' | 'F' | 'X' | null;
  motherName?: string | null;
  fatherName?: string | null;
  expiryDate?: string | null;
  documentSeries?: string | null;
  maritalStatus?: 'married' | 'single' | null;
  placeOfBirth?: string | null;
  personalNumber?: string | null;
  middleName?: string | null;
};

/**
 * Kimlik çekimi kaydedilince admin’in seçtiği personele push.
 */
export async function notifyKbsDocumentCaptured(params: {
  organizationId: string;
  createdByStaffId: string;
  roomNumber: string | number;
  count?: number;
}): Promise<{ count: number }> {
  const { organizationId, createdByStaffId, roomNumber, count } = params;
  const staffIds = await fetchKbsCaptureNotifyStaffIds(organizationId);
  if (staffIds.length === 0) return { count: 0 };

  const n = count && count > 1 ? count : 1;
  const body =
    n > 1
      ? `${n} yeni kimlik kaydı ${roomNumber} odasına eklendi.`
      : `${roomNumber} odası için yeni kimlik kaydı oluşturuldu.`;

  const result = await sendNotificationToStaffIds({
    staffIds,
    title: 'Yeni Kimlik Girişi',
    body,
    createdByStaffId,
    notificationType: 'kbs_document_captured',
    category: 'staff',
    data: {
      screen: '/staff/kbs/capture-history',
      url: '/staff/kbs/capture-history',
      roomNumber,
      batchCount: n,
    },
  });
  return { count: result.count };
}

/** Elle düzeltme: parsed_payload + guests + belge sütunları (KBS bağlamına yazılır). */
export async function updateKbsCaptureManualFields(
  row: KbsCapturedDocumentRow,
  edit: KbsCaptureManualEdit
): Promise<{ ok: true } | { ok: false; message: string }> {
  const existing = enrichKbsParsedFromSources(row.parsed_payload) ?? normalizeKbsParsedPayload(row.parsed_payload);
  const base: ParsedDocument = existing ?? {
    documentType: 'id_card',
    fullName: null,
    firstName: null,
    lastName: null,
    middleName: null,
    documentNumber: null,
    nationalityCode: null,
    issuingCountryCode: null,
    birthDate: null,
    expiryDate: null,
    gender: null,
    rawMrz: null,
    confidence: null,
    checksumsValid: null,
    warnings: [],
  };

  const firstName = edit.firstName !== undefined ? edit.firstName?.trim() || null : base.firstName;
  const lastName = edit.lastName !== undefined ? edit.lastName?.trim() || null : base.lastName;
  const middleName = edit.middleName !== undefined ? edit.middleName?.trim() || null : base.middleName;
  const documentNumber =
    edit.documentNumber !== undefined ? edit.documentNumber?.trim() || null : base.documentNumber;
  const birthDateRaw = edit.birthDate !== undefined ? edit.birthDate?.trim() || null : base.birthDate;
  const birthDate = birthDateRaw && birthDateRaw.length >= 10 ? birthDateRaw.slice(0, 10) : birthDateRaw;
  const nationalityCode =
    edit.nationalityCode !== undefined
      ? edit.nationalityCode?.trim().toUpperCase() || null
      : base.nationalityCode;
  const issuingCountryCode =
    edit.issuingCountryCode !== undefined
      ? edit.issuingCountryCode?.trim().toUpperCase() || null
      : base.issuingCountryCode;
  const gender = edit.gender !== undefined ? edit.gender : base.gender;
  const motherName = edit.motherName !== undefined ? edit.motherName?.trim() || null : base.motherName;
  const fatherName = edit.fatherName !== undefined ? edit.fatherName?.trim() || null : base.fatherName;
  const expiryRaw = edit.expiryDate !== undefined ? edit.expiryDate?.trim() || null : base.expiryDate;
  const expiryDate = expiryRaw && expiryRaw.length >= 10 ? expiryRaw.slice(0, 10) : expiryRaw;
  const documentSeries =
    edit.documentSeries !== undefined ? edit.documentSeries?.trim() || null : base.documentSeries;
  const maritalStatus = edit.maritalStatus !== undefined ? edit.maritalStatus : base.maritalStatus;
  const placeOfBirth =
    edit.placeOfBirth !== undefined ? edit.placeOfBirth?.trim() || null : base.placeOfBirth;
  const personalNumber =
    edit.personalNumber !== undefined ? edit.personalNumber?.trim() || null : base.personalNumber;

  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim() || base.fullName;
  const payload: ParsedDocument = {
    ...base,
    firstName,
    lastName,
    middleName,
    fullName,
    documentNumber,
    documentSeries,
    birthDate,
    expiryDate,
    nationalityCode,
    issuingCountryCode,
    gender,
    motherName: motherName ?? undefined,
    fatherName: fatherName ?? undefined,
    maritalStatus: maritalStatus ?? undefined,
    placeOfBirth: placeOfBirth ?? undefined,
    personalNumber: personalNumber ?? undefined,
    warnings: (base.warnings ?? []).filter(
      (w) => w !== 'ocr_pending' && w !== 'ocr_processing' && w !== 'ocr_failed'
    ),
  };

  const kind = inferKbsPersonKind(payload);
  const seriesForDb =
    documentSeries ||
    (kind !== 'tc_citizen' && documentNumber ? documentNumber : null);

  const coreReady = !!(documentNumber && fullName);
  const docPatch: Record<string, unknown> = {
    parsed_payload: payload,
    document_number: documentNumber,
    document_series: seriesForDb,
    nationality_code: nationalityCode,
    issuing_country_code: issuingCountryCode,
    expiry_date: expiryDate,
    kbs_person_kind: kind,
    document_type: payload.documentType,
    scan_status: coreReady ? 'ready_to_submit' : row.scan_status ?? 'draft',
  };

  const { error: docErr } = await supabase
    .schema('ops')
    .from('guest_documents')
    .update(docPatch)
    .eq('id', row.id);
  if (docErr) return { ok: false, message: docErr.message };

  if (row.guest_id) {
    const guestPatch: Record<string, string | null> = {
      first_name: firstName,
      last_name: lastName,
      middle_name: middleName,
      full_name: fullName,
      nationality_code: nationalityCode,
      gender: gender,
      birth_date: birthDate,
      mother_name: motherName ?? null,
      father_name: fatherName ?? null,
    };
    const { error: guestErr } = await supabase
      .schema('ops')
      .from('guests')
      .update(guestPatch)
      .eq('id', row.guest_id);
    if (guestErr) return { ok: false, message: guestErr.message };
  }

  return { ok: true };
}

function mapNotifyError(code: string, message: string): string {
  const lower = `${code} ${message}`.toLowerCase();
  if (/unauthorized|invalid.?signature|gateway_sign|invalid token|not authenticated/i.test(lower)) {
    return (
      'KBS bildirimi yetki/imza hatası. Oturumu yenileyin; ' +
      'Edge kbs-staff-ops + KBS_CORE_URL / GATEWAY_SHARED_SECRET kontrol edin. ' +
      `(${message})`
    );
  }
  if (/forbidden|izin|permission|kbs_bildir/i.test(lower)) {
    return `Bildir izni yok. Admin → Personel → KBS Bildir açın. (${message})`;
  }
  return message;
}

/** Oda ata → Edge üzerinden check-in (Railway JWT yok). */
export async function notifyKbsCaptureToKbs(args: {
  guestDocumentId: string;
  roomId: string;
  currentStatus?: string | null;
}): Promise<{ ok: true; transactionId?: string } | { ok: false; message: string }> {
  const assign = await assignKbsRoom({
    guestDocumentId: args.guestDocumentId,
    roomId: args.roomId,
  });
  if (!assign.ok) return { ok: false, message: assign.error.message };

  const submit = await submitKbsCheckInEdge({ guestDocumentId: args.guestDocumentId });
  if (!submit.ok) {
    return { ok: false, message: mapNotifyError(submit.error.code, submit.error.message) };
  }
  return { ok: true, transactionId: submit.data.transactionId };
}
