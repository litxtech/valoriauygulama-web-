import { supabase } from '@/lib/supabase';
import { assignKbsRoom, submitKbsCheckInEdge } from '@/lib/kbsStaffOpsEdge';
import {
  enrichKbsParsedFromSources,
  normalizeKbsParsedPayload,
} from '@/lib/kbsCaptureParsedFields';
import { inferKbsPersonKind } from '@/lib/kbsInferPersonKind';
import { looksLikeAlphanumericPassportNo } from '@/lib/kbsDocumentNumberValidate';
import { resolveKbsDocumentSeries } from '@/lib/kbsDocumentSeries';
import { parseKbsDateInputToIso } from '@/lib/kbsDisplayFormat';
import { normalizeGuestDocumentNumber } from '@/lib/kbsGuestDocumentIdentity';
import { mapNationalityTextToCode } from '@/lib/kbsNationalityMap';
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
    edit.documentNumber !== undefined
      ? normalizeGuestDocumentNumber(edit.documentNumber)
      : normalizeGuestDocumentNumber(base.documentNumber) ?? base.documentNumber;
  const birthDateRaw = edit.birthDate !== undefined ? edit.birthDate?.trim() || null : base.birthDate;
  const birthDate =
    edit.birthDate !== undefined
      ? parseKbsDateInputToIso(birthDateRaw)
      : parseKbsDateInputToIso(base.birthDate) ?? base.birthDate;
  const nationalityCode =
    edit.nationalityCode !== undefined
      ? mapNationalityTextToCode(edit.nationalityCode) ??
        (edit.nationalityCode?.trim().toUpperCase() || null)
      : mapNationalityTextToCode(base.nationalityCode) ?? base.nationalityCode;
  const issuingCountryCode =
    edit.issuingCountryCode !== undefined
      ? mapNationalityTextToCode(edit.issuingCountryCode) ??
        (edit.issuingCountryCode?.trim().toUpperCase() || null)
      : mapNationalityTextToCode(base.issuingCountryCode) ?? base.issuingCountryCode;
  const gender = edit.gender !== undefined ? edit.gender : base.gender;
  const motherName = edit.motherName !== undefined ? edit.motherName?.trim() || null : base.motherName;
  const fatherName = edit.fatherName !== undefined ? edit.fatherName?.trim() || null : base.fatherName;
  const expiryRaw = edit.expiryDate !== undefined ? edit.expiryDate?.trim() || null : base.expiryDate;
  const expiryDate =
    edit.expiryDate !== undefined
      ? parseKbsDateInputToIso(expiryRaw)
      : parseKbsDateInputToIso(base.expiryDate) ?? base.expiryDate;
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

  // Önce atomik RPC (migration varsa)
  try {
    const { saveDocumentManualFieldsRpc } = await import('@/lib/kbsDocumentOcrJobs');
    const rpc = await saveDocumentManualFieldsRpc({
      guestDocumentId: row.id,
      fields: {
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
        motherName,
        fatherName,
        maritalStatus,
        placeOfBirth,
        personalNumber,
        documentType: looksLikeAlphanumericPassportNo(documentNumber) ? 'passport' : undefined,
      },
      lockedFields: [
        'firstName',
        'lastName',
        'documentNumber',
        'birthDate',
        'nationalityCode',
        'expiryDate',
      ],
    });
    if (rpc.ok) return { ok: true };
  } catch {
    // fallback below
  }

  const documentType =
    looksLikeAlphanumericPassportNo(documentNumber) && payload.documentType !== 'passport'
      ? 'passport'
      : payload.documentType;
  const payloadTyped = { ...payload, documentType };
  const kind = inferKbsPersonKind(payloadTyped);
  const seriesForDb = resolveKbsDocumentSeries({
    documentSeries: documentSeries,
    documentNumber,
    documentType,
  });

  const coreReady = !!(
    documentNumber &&
    fullName &&
    birthDate &&
    nationalityCode &&
    expiryDate &&
    firstName &&
    lastName
  );
  const docPatch: Record<string, unknown> = {
    parsed_payload: {
      ...payloadTyped,
      documentSeries: seriesForDb,
      warnings: [
        ...new Set([
          ...(payloadTyped.warnings ?? []).filter(
            (w) =>
              w !== 'ocr_pending' &&
              w !== 'ocr_processing' &&
              w !== 'ocr_failed' &&
              w !== 'ocr_partial' &&
              w !== 'ocr_manual_review'
          ),
          'manual_name',
        ]),
      ],
    },
    document_number: documentNumber,
    document_series: seriesForDb,
    nationality_code: nationalityCode,
    issuing_country_code: issuingCountryCode,
    expiry_date: expiryDate,
    kbs_person_kind: kind,
    document_type: documentType,
    scan_status: coreReady
      ? 'ready_to_submit'
      : row.scan_status === 'submitted'
        ? 'submitted'
        : 'incomplete',
    ocr_status: coreReady ? 'succeeded' : 'manual_review',
    manual_fields: [
      'firstName',
      'lastName',
      'documentNumber',
      'birthDate',
      'nationalityCode',
      'expiryDate',
    ],
  };

  const { error: docErr } = await supabase
    .schema('ops')
    .from('guest_documents')
    .update(docPatch)
    .eq('id', row.id);
  if (docErr) {
    if (docErr.code === '23505' && documentNumber) {
      return {
        ok: false,
        message:
          'Bu pasaport / kimlik numarası zaten başka bir kayıtta. Mevcut kaydı açın veya numarayı kontrol edin.',
      };
    }
    return { ok: false, message: docErr.message };
  }

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
  const detail = message.replace(/^KBS check-in failed:\s*/i, '').trim() || message;
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
  if (/belge seri|belgeseri|seri no zorunlu/i.test(lower)) {
    return `Pasaport seri/belge no KBS’e eksik gitti. Seri veya pasaport numarasını kontrol edip tekrar bildirin. (${message})`;
  }
  if (/doğum|dogumtarihi|birth/i.test(lower)) {
    return `Doğum tarihi hatalı. Örnek: 01.01.1990 (gün.ay.yıl). (${message})`;
  }
  if (/ülke\/uyruk kbs|ulke zorunlu|ülke zorunlu|geçersiz/i.test(lower)) {
    return `Uyruk KBS kodu geçersiz. 3 harfli kod kullanın (UZB, SAU, DEU…). Türkiye için TC/TUR. Jandarma: ${detail}`;
  }
  if (/adı zorunlu|soyadı zorunlu/i.test(lower)) {
    return `Pasaport zorunlu alanları eksik. Ad ve soyad dolu olmalı. (${message})`;
  }
  if (/provider check-in failed|provider_error|kbs check-in failed/i.test(lower)) {
    // Jenerik mesaj = genelde eski kbs-core veya WCF alan sırası; asıl Jandarma satırını göster.
    if (/^provider check-in failed$/i.test(detail.trim())) {
      return (
        'Jandarma reddetti (ayrıntı gelmedi).\n\n' +
        'Railway kbs-core yeniden deploy edilmeli. Admin → KBS ayarları → bağlantı testi; ' +
        'health yanıtında build: 2026-07-15-wcf-alpha-order görünmeli.\n\n' +
        'Alanlar dolu görünse de SOAP alan sırası / uyruk kodu (TC, UZB…) hatalı olabilir.'
      );
    }
    return `Jandarma reddetti:\n${detail}`;
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
