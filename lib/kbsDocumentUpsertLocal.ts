import { supabase } from '@/lib/supabase';
import type { ParsedDocument } from '@/lib/scanner/types';
import { canSaveMrzDocument, isMrzPayload, type MrzSaveBlockReason } from '@/lib/scanner/mrzScanGate';

export type UpsertOk = { guestId: string; guestDocumentId: string; scanStatus: string };

const MRZ_CODE: Record<MrzSaveBlockReason, string> = {
  no_mrz: 'MRZ_NO_MRZ',
  parse_failed: 'MRZ_PARSE_FAILED',
  checksum_invalid: 'MRZ_CHECKSUM_INVALID',
  low_confidence_ocr: 'MRZ_LOW_OCR',
};

/**
 * MRZ sonrası belge kaydı — VPS köprüsü olmadan ops.guests + ops.guest_documents (RLS).
 * Sunucu route ile aynı mantık (documentsRoutes) özetlenmiştir.
 */
export async function upsertGuestDocumentLocal(args: {
  parsed: ParsedDocument;
  scanConfidence: number | null;
  rawMrz: string | null;
  arrivalGroupId?: string | null;
  /** `ops.guest_documents.ocr_engine` — varsayılan expo-text-extractor. */
  ocrEngine?: string | null;
  deferReady?: boolean;
  kbsPersonKind?: 'tc_citizen' | 'ykn_foreign' | 'foreign' | null;
  usageKind?: 'konaklama' | 'gunluk' | 'afetzede';
  documentSeries?: string | null;
  plateNumber?: string | null;
  guestPhone?: string | null;
  forwardDated?: boolean;
  mrzBatchKey?: string | null;
  fatherName?: string | null;
  motherName?: string | null;
}): Promise<{ ok: true; data: UpsertOk } | { ok: false; message: string; code?: string }> {
  const {
    parsed,
    scanConfidence,
    rawMrz,
    arrivalGroupId,
    ocrEngine,
    deferReady,
    kbsPersonKind,
    usageKind,
    documentSeries,
    plateNumber,
    guestPhone,
    forwardDated,
    mrzBatchKey,
    fatherName,
    motherName
  } = args;

  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) return { ok: false, message: 'Oturum yok', code: 'AUTH' };

  const { data: au, error: auErr } = await supabase
    .schema('ops')
    .from('app_users')
    .select('hotel_id')
    .eq('id', uid)
    .maybeSingle();
  if (auErr || !au?.hotel_id) {
    return { ok: false, message: 'Bu kullanıcı için ops.app_users kaydı yok.', code: 'NO_APP_USER' };
  }
  const hotelId = au.hotel_id;

  const effectiveRaw = parsed.rawMrz ?? rawMrz;
  if (isMrzPayload(effectiveRaw)) {
    const gate = canSaveMrzDocument({ rawMrz: effectiveRaw, parsed });
    if (!gate.allowed) {
      return { ok: false, message: 'MRZ doğrulama geçilmedi', code: MRZ_CODE[gate.reason] };
    }
  }

  const normalizedDocNo = parsed.documentNumber ? parsed.documentNumber.trim() : null;
  const fullName =
    parsed.fullName ??
    (([parsed.firstName, parsed.lastName].filter(Boolean).join(' ').trim() || null) as string | null);
  const birthDate = parsed.birthDate && parsed.birthDate.length >= 10 ? parsed.birthDate.slice(0, 10) : null;
  const expiryDate = parsed.expiryDate && parsed.expiryDate.length >= 10 ? parsed.expiryDate.slice(0, 10) : null;

  const hasMrz = !!(parsed.rawMrz ?? rawMrz);
  const defer = deferReady === true;
  const coreReady = !!(normalizedDocNo && fullName);
  const scanStatus = defer
    ? hasMrz || coreReady
      ? 'scanned'
      : 'draft'
    : coreReady
      ? 'ready_to_submit'
      : hasMrz
        ? 'scanned'
        : 'draft';

  const kbsExtras = {
    kbs_person_kind: kbsPersonKind ?? null,
    usage_kind: usageKind ?? 'konaklama',
    document_series: documentSeries ?? null,
    plate_number: plateNumber ?? null,
    guest_phone_submitted: guestPhone ?? null,
    forward_dated: forwardDated ?? false,
    mrz_batch_key: mrzBatchKey ?? null
  };

  const payloadJson = JSON.parse(JSON.stringify(parsed)) as Record<string, unknown>;
  const mrzAudit = isMrzPayload(effectiveRaw)
    ? {
        mrz_checksum_valid: true as const,
        ocr_engine: ocrEngine ?? 'expo-text-extractor',
        scanned_by_user_id: uid,
      }
    : { mrz_checksum_valid: null as const, ocr_engine: null as null, scanned_by_user_id: null as null };

  if (normalizedDocNo) {
    const { data: existing, error: exErr } = await supabase
      .schema('ops')
      .from('guest_documents')
      .select('id, guest_id, scan_status')
      .eq('hotel_id', hotelId)
      .eq('document_type', parsed.documentType)
      .eq('document_number', normalizedDocNo)
      .maybeSingle();
    if (exErr) return { ok: false, message: exErr.message };
    if (existing) {
      const { data: updated, error: updErr } = await supabase
        .schema('ops')
        .from('guest_documents')
        .update({
          document_number: normalizedDocNo,
          issuing_country_code: parsed.issuingCountryCode,
          nationality_code: parsed.nationalityCode,
          expiry_date: expiryDate,
          raw_mrz: parsed.rawMrz ?? rawMrz ?? null,
          parsed_payload: payloadJson,
          scan_confidence: scanConfidence ?? parsed.confidence ?? null,
          scan_status: scanStatus,
          ...kbsExtras,
          ...mrzAudit
        })
        .eq('id', existing.id)
        .select('id, guest_id, scan_status')
        .single();
      if (updErr || !updated) return { ok: false, message: updErr?.message ?? 'Belge güncellenemedi' };

      const guestUp: Record<string, unknown> = {
        full_name: fullName ?? 'UNKNOWN',
        first_name: parsed.firstName,
        last_name: parsed.lastName,
        middle_name: parsed.middleName,
        nationality_code: parsed.nationalityCode,
        gender: parsed.gender,
        birth_date: birthDate
      };
      if (fatherName !== undefined) guestUp.father_name = fatherName;
      if (motherName !== undefined) guestUp.mother_name = motherName;
      await supabase.schema('ops').from('guests').update(guestUp).eq('id', existing.guest_id).eq('hotel_id', hotelId);

      return {
        ok: true,
        data: {
          guestId: updated.guest_id,
          guestDocumentId: updated.id,
          scanStatus: updated.scan_status
        }
      };
    }
  }

  const { data: guest, error: gErr } = await supabase
    .schema('ops')
    .from('guests')
    .insert({
      hotel_id: hotelId,
      arrival_group_id: arrivalGroupId ?? null,
      full_name: fullName ?? 'UNKNOWN',
      first_name: parsed.firstName,
      last_name: parsed.lastName,
      middle_name: parsed.middleName,
      nationality_code: parsed.nationalityCode,
      gender: parsed.gender,
      birth_date: birthDate,
      father_name: fatherName ?? null,
      mother_name: motherName ?? null
    })
    .select('id')
    .single();

  if (gErr || !guest) {
    return { ok: false, message: gErr?.message ?? 'Misafir kaydı oluşturulamadı' };
  }

  const { data: doc, error: dErr } = await supabase
    .schema('ops')
    .from('guest_documents')
    .insert({
      guest_id: guest.id,
      hotel_id: hotelId,
      document_type: parsed.documentType,
      document_number: normalizedDocNo,
      issuing_country_code: parsed.issuingCountryCode,
      nationality_code: parsed.nationalityCode,
      expiry_date: expiryDate,
      raw_mrz: parsed.rawMrz ?? rawMrz ?? null,
      parsed_payload: payloadJson,
      scan_confidence: scanConfidence ?? parsed.confidence ?? null,
      scan_status: scanStatus,
      ...kbsExtras,
      ...mrzAudit
    })
    .select('id, scan_status')
    .single();

  if (dErr || !doc) {
    if (normalizedDocNo && dErr?.code === '23505') {
      const { data: again } = await supabase
        .schema('ops')
        .from('guest_documents')
        .select('id, guest_id, scan_status')
        .eq('hotel_id', hotelId)
        .eq('document_type', parsed.documentType)
        .eq('document_number', normalizedDocNo)
        .maybeSingle();
      if (again) {
        return {
          ok: true,
          data: {
            guestId: again.guest_id,
            guestDocumentId: again.id,
            scanStatus: again.scan_status
          }
        };
      }
    }
    return { ok: false, message: dErr?.message ?? 'Belge kaydı oluşturulamadı' };
  }

  return {
    ok: true,
    data: {
      guestId: guest.id,
      guestDocumentId: doc.id,
      scanStatus: doc.scan_status
    }
  };
}
