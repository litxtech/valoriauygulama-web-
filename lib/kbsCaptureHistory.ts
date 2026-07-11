import { supabase } from '@/lib/supabase';
import { resolveOpsHotelIdForCaller } from '@/lib/resolveOpsHotelId';
import type { ParsedDocument } from '@/lib/scanner/types';
import { kbsDisplayFullName } from '@/lib/kbsDisplayFormat';
import { isKbsPlaceholderName, mergeKbsOcrIntoExisting } from '@/lib/kbsCaptureOcrMerge';
import { enrichKbsParsedFromSources, isKbsTcOnlyCapture } from '@/lib/kbsCaptureParsedFields';
import { MRZ_OCR_ENGINE_VISION_MLKIT } from '@/lib/scanner/mrzOcrEngine';
import { canStaffViewAllKbsCaptures } from '@/lib/kbsMrzAccess';
import { findGuestDocumentByIdentity } from '@/lib/kbsGuestDocumentIdentity';
import { log } from '@/lib/logger';

export type KbsCapturedDocumentRow = {
  id: string;
  guest_id: string;
  captured_at: string | null;
  created_at: string;
  front_image_url: string | null;
  parsed_payload: ParsedDocument | Record<string, unknown> | null;
  scan_status: string;
  ocr_engine: string | null;
  room_number: string | null;
  /** Aynı toplu çekim / MRZ partisi — listede aile grubu. */
  mrz_batch_key: string | null;
  scanned_by_user_id: string | null;
  captured_by_staff_name: string | null;
  /** Personelin girdiği müşteri telefon numarası (web + uygulama ortak). */
  guest_phone_submitted: string | null;
};

/** Kimlik çekim listesi — ops.guest_documents (+ oda ataması). guest_stays kullanılmaz. */
export async function fetchKbsCapturedDocuments(
  limit = 300,
  knownAuthUserId?: string | null
): Promise<KbsCapturedDocumentRow[]> {
  const ctx = await resolveOpsHotelIdForCaller(knownAuthUserId);
  if (!ctx.ok) throw new Error(ctx.message);

  const { data: docs, error } = await supabase
    .schema('ops')
    .from('guest_documents')
    .select(
      `id, guest_id, captured_at, created_at, front_image_url, capture_source, parsed_payload, scan_status, ocr_engine, mrz_batch_key, scanned_by_user_id, guest_phone_submitted,
      document_number, nationality_code, issuing_country_code, expiry_date, document_type,
      guest:guest_id(first_name, last_name, birth_date, gender, nationality_code)`
    )
    .eq('hotel_id', ctx.hotelId)
    .or('front_image_url.not.is.null,capture_source.eq.tc')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);

  const list = (docs ?? []) as unknown as {
    id: string;
    guest_id: string;
    captured_at: string | null;
    created_at: string;
    front_image_url: string | null;
    parsed_payload: KbsCapturedDocumentRow['parsed_payload'];
    scan_status: string;
    ocr_engine: string | null;
    mrz_batch_key: string | null;
    scanned_by_user_id: string | null;
    guest_phone_submitted: string | null;
    document_number: string | null;
    nationality_code: string | null;
    issuing_country_code: string | null;
    expiry_date: string | null;
    document_type: string | null;
    guest: {
      first_name: string | null;
      last_name: string | null;
      birth_date: string | null;
      gender: string | null;
      nationality_code: string | null;
    } | null;
  }[];
  if (list.length === 0) return [];

  const scannerAuthIds = [...new Set(list.map((d) => d.scanned_by_user_id).filter(Boolean))] as string[];
  const guestIds = [...new Set(list.map((d) => d.guest_id))];

  // Personel adları ve konaklama bilgileri birbirinden bağımsız — paralel çek.
  const [staffResult, stayResult] = await Promise.all([
    scannerAuthIds.length > 0
      ? supabase.from('staff').select('auth_id, full_name').in('auth_id', scannerAuthIds)
      : Promise.resolve({ data: [], error: null } as const),
    guestIds.length > 0
      ? supabase
          .schema('ops')
          .from('stay_assignments')
          .select('guest_id, updated_at, room:room_id(room_number)')
          .eq('hotel_id', ctx.hotelId)
          .in('guest_id', guestIds)
          .in('stay_status', ['assigned', 'checked_in', 'checkout_pending'])
          .order('updated_at', { ascending: false })
      : Promise.resolve({ data: [], error: null } as const),
  ]);

  if (staffResult.error) throw new Error(staffResult.error.message);
  const nameByAuthId = new Map(
    (staffResult.data ?? []).map((s) => [String(s.auth_id), String(s.full_name ?? '').trim() || '—'])
  );

  const { data: stays, error: stayErr } = stayResult;
  if (stayErr) throw new Error(stayErr.message);

  const roomByGuest = new Map<string, string>();
  for (const s of stays ?? []) {
    const gid = s.guest_id as string;
    if (roomByGuest.has(gid)) continue;
    const room = s.room as { room_number?: string | number | null } | null;
    if (room?.room_number != null) roomByGuest.set(gid, String(room.room_number));
  }

  return list.map((d) => ({
    id: d.id,
    guest_id: d.guest_id,
    captured_at: d.captured_at,
    created_at: d.created_at,
    front_image_url: d.front_image_url,
    parsed_payload: enrichKbsParsedFromSources(d.parsed_payload, {
      document_number: d.document_number,
      nationality_code: d.nationality_code,
      issuing_country_code: d.issuing_country_code,
      expiry_date: d.expiry_date,
      document_type: d.document_type,
      guest: d.guest,
    }),
    scan_status: d.scan_status,
    ocr_engine: d.ocr_engine ?? null,
    room_number: roomByGuest.get(d.guest_id) ?? null,
    mrz_batch_key: d.mrz_batch_key ?? null,
    scanned_by_user_id: d.scanned_by_user_id ?? null,
    captured_by_staff_name: d.scanned_by_user_id
      ? nameByAuthId.get(d.scanned_by_user_id) ?? 'Personel'
      : null,
    guest_phone_submitted: d.guest_phone_submitted ?? null,
  }));
}

/** Rakam, +, boşluk, tire, parantez dışını temizler; boşsa null. */
export function normalizeKbsGuestPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d+()\s-]/g, '').trim();
  return cleaned ? cleaned : null;
}

/**
 * Müşteri numarasını (guest_phone_submitted) kaydeder. ops.guest_documents realtime
 * yayınında olduğu için web paneli ve diğer cihazlar anında güncellenir.
 */
export async function updateKbsCaptureGuestPhone(
  docId: string,
  phone: string | null
): Promise<{ ok: true; phone: string | null } | { ok: false; message: string }> {
  const value = normalizeKbsGuestPhone(phone);
  const { error } = await supabase
    .schema('ops')
    .from('guest_documents')
    .update({ guest_phone_submitted: value })
    .eq('id', docId);
  if (error) return { ok: false, message: error.message };
  return { ok: true, phone: value };
}

/** Kimlik çekim yetkisi olan personel tüm çekimleri görür. */
export function filterKbsCapturesForViewer(
  rows: KbsCapturedDocumentRow[],
  staff: { role?: string | null } | null | undefined,
  viewerAuthId?: string | null
): KbsCapturedDocumentRow[] {
  if (canStaffViewAllKbsCaptures(staff)) return rows;
  if (!viewerAuthId) return rows;
  return rows.filter((r) => !r.scanned_by_user_id || r.scanned_by_user_id === viewerAuthId);
}

export function displayCapturedName(row: KbsCapturedDocumentRow): string {
  const p = enrichKbsParsedFromSources(row.parsed_payload) as ParsedDocument | null;
  if (!p) return '—';

  const label = kbsDisplayFullName(p);
  if (label && !isKbsPlaceholderName(p)) return label;

  if (isKbsTcOnlyCapture(p) && p.documentNumber) {
    return `T.C. ${p.documentNumber}`;
  }

  return label || '—';
}

export function capturedAtTs(row: KbsCapturedDocumentRow): string {
  return row.captured_at ?? row.created_at;
}

function stripOcrFlags(parsed: ParsedDocument): ParsedDocument {
  const warnings = (parsed.warnings ?? []).filter(
    (w) =>
      w !== 'ocr_pending' &&
      w !== 'ocr_processing' &&
      w !== 'ocr_failed' &&
      w !== 'manual_capture' &&
      !w.startsWith('kbs_side:')
  );
  return { ...parsed, warnings };
}

/** OCR kuyruk durumu (parsed_payload.warnings içinde). */
export async function markKbsCaptureOcrState(
  docId: string,
  state: 'pending' | 'processing' | 'failed'
): Promise<void> {
  const { data, error: loadErr } = await supabase
    .schema('ops')
    .from('guest_documents')
    .select('parsed_payload')
    .eq('id', docId)
    .maybeSingle();
  if (loadErr) return;
  const prev = (data?.parsed_payload ?? {}) as ParsedDocument;
  let warnings = (prev.warnings ?? []).filter(
    (w) => w !== 'ocr_pending' && w !== 'ocr_processing' && w !== 'ocr_failed'
  );
  if (state === 'pending') warnings = [...warnings, 'ocr_pending'];
  if (state === 'processing') warnings = [...warnings, 'ocr_processing'];
  if (state === 'failed') warnings = [...warnings, 'ocr_failed'];
  const { error: updateErr } = await supabase
    .schema('ops')
    .from('guest_documents')
    .update({ parsed_payload: { ...prev, warnings } })
    .eq('id', docId);
  if (updateErr) {
    log.warn('kbsCaptureHistory', 'markKbsCaptureOcrState failed', { docId, state, updateErr });
  }
}

type KbsOcrCommitArgs = {
  docId: string;
  guestId: string;
  hotelId: string | null;
  documentType: string;
  payload: ParsedDocument;
  scanConfidence: number | null;
  ocrEngine?: string | null;
  /** false: aynı kimlik no başka kayıtta — sütuna yazma (unique index). */
  writeDocumentNumber: boolean;
};

async function commitKbsCaptureOcrPatch(
  args: KbsOcrCommitArgs
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { docId, guestId, payload, scanConfidence, ocrEngine, writeDocumentNumber } = args;
  const fullName =
    payload.fullName ??
    ([payload.firstName, payload.lastName].filter(Boolean).join(' ').trim() || null);
  const birthDate =
    payload.birthDate && payload.birthDate.length >= 10 ? payload.birthDate.slice(0, 10) : null;
  const expiryDate =
    payload.expiryDate && payload.expiryDate.length >= 10 ? payload.expiryDate.slice(0, 10) : null;
  const docNo = writeDocumentNumber ? payload.documentNumber?.trim() || null : null;
  const coreReady = !!(docNo && fullName);
  const effectiveConfidence =
    scanConfidence != null
      ? Math.max(scanConfidence, payload.confidence ?? 0)
      : payload.confidence ?? scanConfidence;

  const patch: Record<string, unknown> = {
    parsed_payload: payload,
    scan_confidence: effectiveConfidence,
    ocr_engine: ocrEngine ?? MRZ_OCR_ENGINE_VISION_MLKIT,
    issuing_country_code: payload.issuingCountryCode,
    nationality_code: payload.nationalityCode,
    expiry_date: expiryDate,
    raw_mrz: payload.rawMrz,
    scan_status: coreReady ? 'ready_to_submit' : payload.rawMrz ? 'scanned' : 'draft',
  };
  if (writeDocumentNumber) {
    patch.document_number = docNo;
  }

  const { error: docErr } = await supabase
    .schema('ops')
    .from('guest_documents')
    .update(patch)
    .eq('id', docId);

  if (docErr) {
    if (writeDocumentNumber && docNo && docErr.code === '23505' && args.hotelId) {
      const conflict = await findGuestDocumentByIdentity(args.hotelId, args.documentType, docNo);
      if (conflict && conflict.id !== docId) {
        const dupPayload: ParsedDocument = {
          ...payload,
          documentNumber: null,
          warnings: [...(payload.warnings ?? []), 'duplicate_identity'],
        };
        const dupRes = await commitKbsCaptureOcrPatch({
          ...args,
          payload: dupPayload,
          writeDocumentNumber: false,
        });
        if (!dupRes.ok) return dupRes;
        return applyKbsCaptureOcrResult(conflict.id, conflict.guest_id, payload, scanConfidence, ocrEngine);
      }
    }
    return { ok: false, message: docErr.message };
  }

  const guestPatch: Record<string, string | null> = {};
  if (fullName) guestPatch.full_name = fullName;
  if (payload.firstName) guestPatch.first_name = payload.firstName;
  if (payload.lastName) guestPatch.last_name = payload.lastName;
  if (payload.middleName) guestPatch.middle_name = payload.middleName;
  if (payload.nationalityCode) guestPatch.nationality_code = payload.nationalityCode;
  if (payload.gender) guestPatch.gender = payload.gender;
  if (birthDate) guestPatch.birth_date = birthDate;
  if (payload.fatherName) guestPatch.father_name = payload.fatherName;
  if (payload.motherName) guestPatch.mother_name = payload.motherName;

  if (Object.keys(guestPatch).length > 0) {
    const { error: guestErr } = await supabase
      .schema('ops')
      .from('guests')
      .update(guestPatch)
      .eq('id', guestId);
    if (guestErr) return { ok: false, message: guestErr.message };
  }
  return { ok: true };
}

/** OCR sonucu: belge + misafir kaydı güncellenir (mevcut dolu alanlar korunur). */
export async function applyKbsCaptureOcrResult(
  docId: string,
  guestId: string,
  parsed: ParsedDocument,
  scanConfidence: number | null,
  ocrEngine?: string | null
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { data: docRow, error: loadErr } = await supabase
    .schema('ops')
    .from('guest_documents')
    .select('parsed_payload, hotel_id, document_type')
    .eq('id', docId)
    .maybeSingle();
  if (loadErr) return { ok: false, message: loadErr.message };

  const existing = (docRow?.parsed_payload ?? {}) as ParsedDocument;
  const merged = mergeKbsOcrIntoExisting(existing, parsed);
  const payload = stripOcrFlags(merged);
  const docNo = payload.documentNumber?.trim() || null;
  const hotelId = (docRow?.hotel_id as string | null) ?? null;
  const documentType = (payload.documentType ?? docRow?.document_type ?? 'id_card') as string;

  let writeDocumentNumber = !!docNo;
  if (docNo && hotelId) {
    const conflict = await findGuestDocumentByIdentity(hotelId, documentType, docNo);
    if (conflict && conflict.id !== docId) {
      const canonical = await applyKbsCaptureOcrResult(
        conflict.id,
        conflict.guest_id,
        payload,
        scanConfidence,
        ocrEngine
      );
      if (!canonical.ok) return canonical;
      writeDocumentNumber = false;
      if (!(payload.warnings ?? []).includes('duplicate_identity')) {
        payload.warnings = [...(payload.warnings ?? []), 'duplicate_identity'];
      }
      payload.documentNumber = null;
    }
  }

  return commitKbsCaptureOcrPatch({
    docId,
    guestId,
    hotelId,
    documentType,
    payload,
    scanConfidence,
    ocrEngine,
    writeDocumentNumber,
  });
}

/** Düzelt — ad/soyad dahil OCR sonucunu zorla günceller (manuel ad korunur). */
export async function applyKbsCaptureOcrCorrection(
  docId: string,
  guestId: string,
  parsed: ParsedDocument,
  scanConfidence: number | null,
  ocrEngine?: string | null
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { data: docRow, error: loadErr } = await supabase
    .schema('ops')
    .from('guest_documents')
    .select('parsed_payload, hotel_id, document_type')
    .eq('id', docId)
    .maybeSingle();
  if (loadErr) return { ok: false, message: loadErr.message };

  const existing = (docRow?.parsed_payload ?? {}) as ParsedDocument;
  const merged = mergeKbsOcrIntoExisting(existing, parsed, { correction: true });
  const payload = stripOcrFlags(merged);
  const docNo = payload.documentNumber?.trim() || null;
  const hotelId = (docRow?.hotel_id as string | null) ?? null;
  const documentType = (payload.documentType ?? docRow?.document_type ?? 'id_card') as string;

  let writeDocumentNumber = !!docNo;
  if (docNo && hotelId) {
    const conflict = await findGuestDocumentByIdentity(hotelId, documentType, docNo);
    if (conflict && conflict.id !== docId) {
      const canonical = await applyKbsCaptureOcrCorrection(
        conflict.id,
        conflict.guest_id,
        payload,
        scanConfidence,
        ocrEngine
      );
      if (!canonical.ok) return canonical;
      writeDocumentNumber = false;
      if (!(payload.warnings ?? []).includes('duplicate_identity')) {
        payload.warnings = [...(payload.warnings ?? []), 'duplicate_identity'];
      }
      payload.documentNumber = null;
    }
  }

  return commitKbsCaptureOcrPatch({
    docId,
    guestId,
    hotelId,
    documentType,
    payload,
    scanConfidence,
    ocrEngine,
    writeDocumentNumber,
  });
}

/** Manuel okuma sonucunu belgeye yazar. */
export async function saveKbsCapturedDocumentParsed(
  docId: string,
  parsed: ParsedDocument,
  scanConfidence: number | null,
  ocrEngine?: string | null
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { data: row } = await supabase
    .schema('ops')
    .from('guest_documents')
    .select('guest_id')
    .eq('id', docId)
    .maybeSingle();
  if (!row?.guest_id) {
    const { error } = await supabase
      .schema('ops')
      .from('guest_documents')
      .update({
        parsed_payload: stripOcrFlags(parsed),
        scan_confidence: scanConfidence,
        ocr_engine: ocrEngine ?? MRZ_OCR_ENGINE_VISION_MLKIT,
      })
      .eq('id', docId);
    if (error) return { ok: false, message: error.message };
    return { ok: true };
  }
  return applyKbsCaptureOcrResult(docId, row.guest_id as string, parsed, scanConfidence, ocrEngine);
}

export async function fetchKbsCapturedDocumentById(
  docId: string
): Promise<KbsCapturedDocumentRow | null> {
  const ctx = await resolveOpsHotelIdForCaller();
  if (!ctx.ok) throw new Error(ctx.message);

  const { data: doc, error } = await supabase
    .schema('ops')
    .from('guest_documents')
    .select(
      `id, guest_id, captured_at, created_at, front_image_url, capture_source, parsed_payload, scan_status, ocr_engine, mrz_batch_key, scanned_by_user_id, guest_phone_submitted,
      document_number, nationality_code, issuing_country_code, expiry_date, document_type,
      guest:guest_id(first_name, last_name, birth_date, gender, nationality_code)`
    )
    .eq('hotel_id', ctx.hotelId)
    .eq('id', docId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const captureSource = (doc as { capture_source?: string | null } | null)?.capture_source ?? null;
  if (!doc?.front_image_url && captureSource !== 'tc') return null;

  const row = doc as unknown as {
    id: string;
    guest_id: string;
    captured_at: string | null;
    created_at: string;
    front_image_url: string | null;
    parsed_payload: KbsCapturedDocumentRow['parsed_payload'];
    scan_status: string;
    ocr_engine: string | null;
    mrz_batch_key: string | null;
    scanned_by_user_id: string | null;
    guest_phone_submitted: string | null;
    document_number: string | null;
    nationality_code: string | null;
    issuing_country_code: string | null;
    expiry_date: string | null;
    document_type: string | null;
    guest: {
      first_name: string | null;
      last_name: string | null;
      birth_date: string | null;
      gender: string | null;
      nationality_code: string | null;
    } | null;
  };

  const [staffResult, stayResult] = await Promise.all([
    row.scanned_by_user_id
      ? supabase.from('staff').select('auth_id, full_name').eq('auth_id', row.scanned_by_user_id).maybeSingle()
      : Promise.resolve({ data: null, error: null } as const),
    supabase
      .schema('ops')
      .from('stay_assignments')
      .select('guest_id, room:room_id(room_number)')
      .eq('hotel_id', ctx.hotelId)
      .eq('guest_id', row.guest_id)
      .in('stay_status', ['assigned', 'checked_in', 'checkout_pending'])
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (staffResult.error) throw new Error(staffResult.error.message);
  if (stayResult.error) throw new Error(stayResult.error.message);

  const room = stayResult.data?.room as { room_number?: string | number | null } | null;
  const roomNumber = room?.room_number != null ? String(room.room_number) : null;

  const staffName = staffResult.data?.full_name
    ? String(staffResult.data.full_name).trim() || null
    : null;

  return {
    id: row.id,
    guest_id: row.guest_id,
    captured_at: row.captured_at,
    created_at: row.created_at,
    front_image_url: row.front_image_url,
    parsed_payload: enrichKbsParsedFromSources(row.parsed_payload, {
      document_number: row.document_number,
      nationality_code: row.nationality_code,
      issuing_country_code: row.issuing_country_code,
      expiry_date: row.expiry_date,
      document_type: row.document_type,
      guest: row.guest,
    }),
    scan_status: row.scan_status,
    ocr_engine: row.ocr_engine ?? null,
    room_number: roomNumber,
    mrz_batch_key: row.mrz_batch_key ?? null,
    scanned_by_user_id: row.scanned_by_user_id ?? null,
    captured_by_staff_name: row.scanned_by_user_id ? staffName ?? 'Personel' : null,
    guest_phone_submitted: row.guest_phone_submitted ?? null,
  };
}

export function staffCanDeleteKbsCaptures(staff: {
  role?: string | null;
  app_permissions?: Record<string, boolean> | null;
} | null): boolean {
  if (!staff) return false;
  if (staff.app_permissions?.super_admin === true) return true;
  return staff.role === 'admin';
}

/** Admin: belge + yalnızca bu belgeye bağlı misafir (başka belge yoksa). */
export async function deleteKbsCapturedDocument(
  docId: string,
  guestId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error: docErr } = await supabase.schema('ops').from('guest_documents').delete().eq('id', docId);
  if (docErr) return { ok: false, message: docErr.message };

  const { count, error: countErr } = await supabase
    .schema('ops')
    .from('guest_documents')
    .select('id', { count: 'exact', head: true })
    .eq('guest_id', guestId);
  if (countErr) return { ok: true };

  if ((count ?? 0) === 0) {
    const { error: guestErr } = await supabase.schema('ops').from('guests').delete().eq('id', guestId);
    if (guestErr) return { ok: false, message: guestErr.message };
  }
  return { ok: true };
}
