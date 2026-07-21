import { supabase } from '@/lib/supabase';
import { resolveOpsHotelIdForCaller } from '@/lib/resolveOpsHotelId';
import type { ParsedDocument } from '@/lib/scanner/types';
import { kbsDisplayFullName } from '@/lib/kbsDisplayFormat';
import { isKbsPlaceholderName, mergeKbsOcrIntoExisting } from '@/lib/kbsCaptureOcrMerge';
import { enrichKbsParsedFromSources, isKbsTcOnlyCapture, listCoreMissingIdFields, withMissingFieldWarnings } from '@/lib/kbsCaptureParsedFields';
import { MRZ_OCR_ENGINE_VISION_MLKIT } from '@/lib/scanner/mrzOcrEngine';
import { canStaffViewAllKbsCaptures } from '@/lib/kbsMrzAccess';
import { findGuestDocumentByIdentity, withReturningGuestWarning, buildReturningGuestMeta } from '@/lib/kbsGuestDocumentIdentity';
import { inferKbsPersonKind } from '@/lib/kbsInferPersonKind';
import { resolveKbsDocumentSeries } from '@/lib/kbsDocumentSeries';
import { withPromiseTimeout } from '@/lib/edgeInvokeTimeout';
import { log } from '@/lib/logger';

/** Zayıf ağda takılı istek OCR kuyruğunu süresiz bloke etmesin. */
const OCR_DB_TIMEOUT_MS = 15_000;

function bounded<T>(query: PromiseLike<T>): Promise<T> {
  return withPromiseTimeout(query, OCR_DB_TIMEOUT_MS, 'OCR kayıt zaman aşımı');
}

export type KbsCapturedDocumentRow = {
  id: string;
  guest_id: string;
  hotel_id?: string | null;
  hotel_name?: string | null;
  captured_at: string | null;
  created_at: string;
  front_image_url: string | null;
  parsed_payload: ParsedDocument | Record<string, unknown> | null;
  scan_status: string;
  /** Kaynak gerçek OCR durumu (queued/processing/partial/succeeded/manual_review/…). */
  ocr_status?: string | null;
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
  const { fetchKbsBrowseDocuments } = await import('@/lib/kbsMultiHotelCaptures');
  return fetchKbsBrowseDocuments(knownAuthUserId, { limit });
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
      w !== 'ocr_partial' &&
      w !== 'ocr_manual_review' &&
      w !== 'manual_capture' &&
      !w.startsWith('kbs_side:')
  );
  return { ...parsed, warnings };
}

/** OCR kuyruk durumu (parsed_payload.warnings içinde). */
export async function markKbsCaptureOcrState(
  docId: string,
  state: 'pending' | 'processing' | 'failed' | 'partial' | 'manual_review'
): Promise<void> {
  try {
    await markKbsCaptureOcrStateInner(docId, state);
  } catch (e) {
    // Zayıf ağda zaman aşımı — OCR kuyruğu durum yazamasa da akmaya devam etmeli.
    log.warn('kbsCaptureHistory', 'markKbsCaptureOcrState timeout', { docId, state, e });
  }
}

async function markKbsCaptureOcrStateInner(
  docId: string,
  state: 'pending' | 'processing' | 'failed' | 'partial' | 'manual_review'
): Promise<void> {
  const { data, error: loadErr } = await bounded(
    supabase
      .schema('ops')
      .from('guest_documents')
      .select('parsed_payload')
      .eq('id', docId)
      .maybeSingle()
  );
  if (loadErr) return;
  const prev = (data?.parsed_payload ?? {}) as ParsedDocument;
  let warnings = (prev.warnings ?? []).filter(
    (w) =>
      w !== 'ocr_pending' &&
      w !== 'ocr_processing' &&
      w !== 'ocr_failed' &&
      w !== 'ocr_partial' &&
      w !== 'ocr_manual_review'
  );
  if (state === 'pending') warnings = [...warnings, 'ocr_pending'];
  if (state === 'processing') warnings = [...warnings, 'ocr_processing'];
  if (state === 'failed') warnings = [...warnings, 'ocr_failed'];
  if (state === 'partial') warnings = [...warnings, 'ocr_partial'];
  if (state === 'manual_review') warnings = [...warnings, 'ocr_manual_review'];
  const ocrStatus =
    state === 'pending'
      ? 'queued'
      : state === 'processing'
        ? 'processing'
        : state === 'partial'
          ? 'partial'
          : state === 'manual_review'
            ? 'manual_review'
            : 'failed_terminal';
  const { error: updateErr } = await bounded(
    supabase
      .schema('ops')
      .from('guest_documents')
      .update({
        parsed_payload: { ...prev, warnings },
        ocr_status: ocrStatus,
      })
      .eq('id', docId)
  );
  if (updateErr) {
    // ocr_status kolonu henüz yoksa yalnız payload güncelle
    const { error: fallbackErr } = await bounded(
      supabase
        .schema('ops')
        .from('guest_documents')
        .update({ parsed_payload: { ...prev, warnings } })
        .eq('id', docId)
    );
    if (fallbackErr) {
      log.warn('kbsCaptureHistory', 'markKbsCaptureOcrState failed', { docId, state, updateErr });
    }
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
  const { docId, guestId, payload: rawPayload, scanConfidence, ocrEngine, writeDocumentNumber } = args;
  const payload = withMissingFieldWarnings(rawPayload);
  const missingCore = listCoreMissingIdFields(payload);
  const fullName =
    payload.fullName ??
    ([payload.firstName, payload.lastName].filter(Boolean).join(' ').trim() || null);
  const birthDate =
    payload.birthDate && payload.birthDate.length >= 10 ? payload.birthDate.slice(0, 10) : null;
  const expiryDate =
    payload.expiryDate && payload.expiryDate.length >= 10 ? payload.expiryDate.slice(0, 10) : null;
  const docNo = writeDocumentNumber
    ? (payload.documentNumber ?? '').trim().replace(/\s+/g, '').toUpperCase() || null
    : null;
  const coreReady = missingCore.length === 0;
  const effectiveConfidence =
    scanConfidence != null
      ? Math.max(scanConfidence, payload.confidence ?? 0)
      : payload.confidence ?? scanConfidence;

  const kind = inferKbsPersonKind(payload);
  const series = resolveKbsDocumentSeries({
    documentSeries: payload.documentSeries,
    documentNumber: docNo ?? payload.documentNumber,
    documentType: payload.documentType,
  });

  const ocrStatus = coreReady
    ? 'succeeded'
    : missingCore.length >= 4
      ? 'manual_review'
      : 'partial';

  const patch: Record<string, unknown> = {
    parsed_payload: {
      ...payload,
      documentSeries: series,
      documentNumber: writeDocumentNumber ? docNo ?? payload.documentNumber : payload.documentNumber,
      warnings:
        ocrStatus === 'manual_review' && !(payload.warnings ?? []).includes('ocr_manual_review')
          ? [...(payload.warnings ?? []).filter((w) => w !== 'ocr_partial'), 'ocr_manual_review']
          : ocrStatus === 'partial' && !(payload.warnings ?? []).includes('ocr_partial')
            ? [...(payload.warnings ?? []).filter((w) => w !== 'ocr_manual_review'), 'ocr_partial']
            : payload.warnings ?? [],
    },
    scan_confidence: effectiveConfidence,
    ocr_engine: ocrEngine ?? MRZ_OCR_ENGINE_VISION_MLKIT,
    issuing_country_code: payload.issuingCountryCode,
    nationality_code: payload.nationalityCode,
    expiry_date: expiryDate,
    raw_mrz: payload.rawMrz,
    document_series: series,
    kbs_person_kind: kind,
    document_type: payload.documentType,
    scan_status: coreReady ? 'ready_to_submit' : payload.rawMrz ? 'scanned' : 'incomplete',
    ocr_status: ocrStatus,
    ocr_last_error: coreReady ? null : missingCore.join(', '),
    ocr_next_retry_at: ocrStatus === 'partial' ? new Date(Date.now() + 2000).toISOString() : null,
  };
  if (writeDocumentNumber) {
    patch.document_number = docNo;
  }

  const applyGuestPatch = async (): Promise<{ ok: true } | { ok: false; message: string }> => {
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
      const { error: guestErr } = await bounded(
        supabase
          .schema('ops')
          .from('guests')
          .update(guestPatch)
          .eq('id', guestId)
      );
      if (guestErr) return { ok: false, message: guestErr.message };
    }
    return { ok: true };
  };

  let { error: docErr } = await bounded(
    supabase
      .schema('ops')
      .from('guest_documents')
      .update(patch)
      .eq('id', docId)
  );

  if (docErr && /ocr_status|ocr_last_error|ocr_next_retry/i.test(docErr.message)) {
    const { ocr_status: _s, ocr_last_error: _e, ocr_next_retry_at: _r, ...legacyPatch } = patch;
    const legacy = await bounded(
      supabase
        .schema('ops')
        .from('guest_documents')
        .update(legacyPatch)
        .eq('id', docId)
    );
    docErr = legacy.error;
  }

  if (docErr) {
    if (writeDocumentNumber && docNo && docErr.code === '23505' && args.hotelId) {
      const conflict = await findGuestDocumentByIdentity(args.hotelId, args.documentType, docNo);
      if (conflict && conflict.id !== docId) {
        const meta = buildReturningGuestMeta(conflict, docNo);
        const dupPayload = withReturningGuestWarning(
          { ...payload, documentNumber: null },
          meta
        );
        const dupRes = await commitKbsCaptureOcrPatch({
          ...args,
          payload: dupPayload,
          writeDocumentNumber: false,
        });
        if (!dupRes.ok) return dupRes;
        const canonicalPayload = withReturningGuestWarning(payload, meta);
        return applyKbsCaptureOcrResult(
          conflict.id,
          conflict.guest_id,
          canonicalPayload,
          scanConfidence,
          ocrEngine
        );
      }
    }
    return { ok: false, message: docErr.message };
  }

  return applyGuestPatch();
}

/** OCR sonucu: belge + misafir kaydı güncellenir (mevcut dolu alanlar korunur). */
export async function applyKbsCaptureOcrResult(
  docId: string,
  guestId: string,
  parsed: ParsedDocument,
  scanConfidence: number | null,
  ocrEngine?: string | null
): Promise<{ ok: true } | { ok: false; message: string }> {
  let docRow: { parsed_payload: unknown; hotel_id: unknown; document_type: unknown } | null;
  try {
    const res = await bounded(
      supabase
        .schema('ops')
        .from('guest_documents')
        .select('parsed_payload, hotel_id, document_type')
        .eq('id', docId)
        .maybeSingle()
    );
    if (res.error) return { ok: false, message: res.error.message };
    docRow = res.data;
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'OCR kayıt zaman aşımı' };
  }

  const existing = (docRow?.parsed_payload ?? {}) as ParsedDocument;
  const merged = mergeKbsOcrIntoExisting(existing, parsed);
  const payload = stripOcrFlags(merged);
  const docNo = (payload.documentNumber ?? '').trim().replace(/\s+/g, '').toUpperCase() || null;
  if (docNo) payload.documentNumber = docNo;
  const hotelId = (docRow?.hotel_id as string | null) ?? null;
  const documentType = (payload.documentType ?? docRow?.document_type ?? 'id_card') as string;

  let writeDocumentNumber = !!docNo;
  if (docNo && hotelId) {
    const conflict = await findGuestDocumentByIdentity(hotelId, documentType, docNo, {
      excludeDocumentId: docId,
    });
    if (conflict && conflict.id !== docId) {
      const meta = buildReturningGuestMeta(conflict, docNo);
      const returningForCanonical = withReturningGuestWarning(payload, meta);
      // Kanonik kaydı doğrudan güncelle (recursion yok)
      const canonical = await commitKbsCaptureOcrPatch({
        docId: conflict.id,
        guestId: conflict.guest_id,
        hotelId,
        documentType,
        payload: returningForCanonical,
        scanConfidence,
        ocrEngine,
        writeDocumentNumber: true,
      });
      if (!canonical.ok) return canonical;
      writeDocumentNumber = false;
      Object.assign(payload, withReturningGuestWarning({ ...payload, documentNumber: null }, meta));
    }
  }

  try {
    return await commitKbsCaptureOcrPatch({
      docId,
      guestId,
      hotelId,
      documentType,
      payload,
      scanConfidence,
      ocrEngine,
      writeDocumentNumber,
    });
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'OCR kayıt zaman aşımı' };
  }
}

/** Düzelt — ad/soyad dahil OCR sonucunu zorla günceller (manuel ad korunur). */
export async function applyKbsCaptureOcrCorrection(
  docId: string,
  guestId: string,
  parsed: ParsedDocument,
  scanConfidence: number | null,
  ocrEngine?: string | null
): Promise<{ ok: true } | { ok: false; message: string }> {
  let docRow: { parsed_payload: unknown; hotel_id: unknown; document_type: unknown } | null;
  try {
    const res = await bounded(
      supabase
        .schema('ops')
        .from('guest_documents')
        .select('parsed_payload, hotel_id, document_type')
        .eq('id', docId)
        .maybeSingle()
    );
    if (res.error) return { ok: false, message: res.error.message };
    docRow = res.data;
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'OCR kayıt zaman aşımı' };
  }

  const existing = (docRow?.parsed_payload ?? {}) as ParsedDocument;
  const merged = mergeKbsOcrIntoExisting(existing, parsed, { correction: true });
  const payload = stripOcrFlags(merged);
  const docNo = (payload.documentNumber ?? '').trim().replace(/\s+/g, '').toUpperCase() || null;
  if (docNo) payload.documentNumber = docNo;
  const hotelId = (docRow?.hotel_id as string | null) ?? null;
  const documentType = (payload.documentType ?? docRow?.document_type ?? 'id_card') as string;

  let writeDocumentNumber = !!docNo;
  if (docNo && hotelId) {
    const conflict = await findGuestDocumentByIdentity(hotelId, documentType, docNo, {
      excludeDocumentId: docId,
    });
    if (conflict && conflict.id !== docId) {
      const meta = buildReturningGuestMeta(conflict, docNo);
      const returningForCanonical = withReturningGuestWarning(payload, meta);
      const canonical = await commitKbsCaptureOcrPatch({
        docId: conflict.id,
        guestId: conflict.guest_id,
        hotelId,
        documentType,
        payload: returningForCanonical,
        scanConfidence,
        ocrEngine,
        writeDocumentNumber: true,
      });
      if (!canonical.ok) return canonical;
      writeDocumentNumber = false;
      Object.assign(payload, withReturningGuestWarning({ ...payload, documentNumber: null }, meta));
    }
  }

  try {
    return await commitKbsCaptureOcrPatch({
      docId,
      guestId,
      hotelId,
      documentType,
      payload,
      scanConfidence,
      ocrEngine,
      writeDocumentNumber,
    });
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'OCR kayıt zaman aşımı' };
  }
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
      `id, guest_id, captured_at, created_at, front_image_url, capture_source, parsed_payload, scan_status, ocr_status, ocr_engine, mrz_batch_key, scanned_by_user_id, guest_phone_submitted,
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
    ocr_status?: string | null;
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
    ocr_status: row.ocr_status ?? null,
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

/** Admin: belge + bildirim işlemleri; başka belge yoksa misafir de silinir (RPC). */
export async function deleteKbsCapturedDocument(
  docId: string,
  guestId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { data, error } = await supabase.rpc('kbs_delete_guest_document', {
    p_guest_document_id: docId,
    p_guest_id: guestId || null,
  });
  if (error) return { ok: false, message: error.message };

  const row = data as { ok?: boolean; error?: { message?: string } } | null;
  if (row && row.ok === false) {
    return { ok: false, message: row.error?.message ?? 'Silinemedi' };
  }
  return { ok: true };
}
