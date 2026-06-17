import { supabase } from '@/lib/supabase';
import { resolveOpsHotelIdForCaller } from '@/lib/resolveOpsHotelId';
import type { ParsedDocument } from '@/lib/scanner/types';
import { kbsDisplayFullName } from '@/lib/kbsDisplayFormat';
import { isKbsPlaceholderName, mergeKbsOcrIntoExisting } from '@/lib/kbsCaptureOcrMerge';
import { isKbsOcrPending, isKbsOcrProcessing } from '@/lib/kbsCaptureParsedFields';
import { MRZ_OCR_ENGINE_VISION_MLKIT } from '@/lib/scanner/mrzOcrEngine';
import { canStaffViewAllKbsCaptures } from '@/lib/kbsMrzAccess';

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
};

/** Kimlik çekim listesi — ops.guest_documents (+ oda ataması). guest_stays kullanılmaz. */
export async function fetchKbsCapturedDocuments(limit = 300): Promise<KbsCapturedDocumentRow[]> {
  const ctx = await resolveOpsHotelIdForCaller();
  if (!ctx.ok) throw new Error(ctx.message);

  const { data: docs, error } = await supabase
    .schema('ops')
    .from('guest_documents')
    .select(
      'id, guest_id, captured_at, created_at, front_image_url, parsed_payload, scan_status, ocr_engine, mrz_batch_key, scanned_by_user_id'
    )
    .eq('hotel_id', ctx.hotelId)
    .not('front_image_url', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);

  const list = (docs ?? []) as {
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
  }[];
  if (list.length === 0) return [];

  const scannerAuthIds = [...new Set(list.map((d) => d.scanned_by_user_id).filter(Boolean))] as string[];
  let nameByAuthId = new Map<string, string>();
  if (scannerAuthIds.length > 0) {
    const { data: staffRows, error: staffErr } = await supabase
      .from('staff')
      .select('auth_id, full_name')
      .in('auth_id', scannerAuthIds);
    if (staffErr) throw new Error(staffErr.message);
    nameByAuthId = new Map(
      (staffRows ?? []).map((s) => [String(s.auth_id), String(s.full_name ?? '').trim() || '—'])
    );
  }

  const guestIds = [...new Set(list.map((d) => d.guest_id))];
  const { data: stays, error: stayErr } = await supabase
    .schema('ops')
    .from('stay_assignments')
    .select('guest_id, room_id, updated_at')
    .eq('hotel_id', ctx.hotelId)
    .in('guest_id', guestIds)
    .in('stay_status', ['assigned', 'checked_in', 'checkout_pending'])
    .order('updated_at', { ascending: false });
  if (stayErr) throw new Error(stayErr.message);

  const roomIds = [...new Set((stays ?? []).map((s: { room_id: string }) => s.room_id))];
  let roomById = new Map<string, string>();
  if (roomIds.length > 0) {
    const { data: rooms, error: roomErr } = await supabase
      .schema('ops')
      .from('rooms')
      .select('id, room_number')
      .in('id', roomIds);
    if (roomErr) throw new Error(roomErr.message);
    roomById = new Map((rooms ?? []).map((r) => [r.id as string, String(r.room_number)]));
  }

  const roomByGuest = new Map<string, string>();
  for (const s of stays ?? []) {
    const gid = s.guest_id as string;
    if (roomByGuest.has(gid)) continue;
    const num = roomById.get(s.room_id as string);
    if (num) roomByGuest.set(gid, num);
  }

  return list.map((d) => ({
    id: d.id,
    guest_id: d.guest_id,
    captured_at: d.captured_at,
    created_at: d.created_at,
    front_image_url: d.front_image_url,
    parsed_payload: d.parsed_payload,
    scan_status: d.scan_status,
    ocr_engine: d.ocr_engine ?? null,
    room_number: roomByGuest.get(d.guest_id) ?? null,
    mrz_batch_key: d.mrz_batch_key ?? null,
    scanned_by_user_id: d.scanned_by_user_id ?? null,
    captured_by_staff_name: d.scanned_by_user_id
      ? nameByAuthId.get(d.scanned_by_user_id) ?? null
      : null,
  }));
}

/** Admin tüm çekimleri görür; diğer personel yalnızca kendi çekimlerini. */
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
  const p = row.parsed_payload as ParsedDocument | null;
  if (!p) return '—';

  const label = kbsDisplayFullName(p);

  if (label && !isKbsPlaceholderName(p)) return label;

  if (isKbsOcrProcessing(p) || isKbsOcrPending(p)) return 'Okunuyor…';
  if (isKbsPlaceholderName(p)) return 'Ad okunamadı';

  return label || '—';
}

export function capturedAtTs(row: KbsCapturedDocumentRow): string {
  return row.captured_at ?? row.created_at;
}

function stripOcrFlags(parsed: ParsedDocument): ParsedDocument {
  const warnings = (parsed.warnings ?? []).filter(
    (w) => w !== 'ocr_pending' && w !== 'ocr_processing' && w !== 'manual_capture'
  );
  return { ...parsed, warnings };
}

/** OCR kuyruk durumu (parsed_payload.warnings içinde). */
export async function markKbsCaptureOcrState(
  docId: string,
  state: 'pending' | 'processing' | 'failed'
): Promise<void> {
  const { data } = await supabase
    .schema('ops')
    .from('guest_documents')
    .select('parsed_payload')
    .eq('id', docId)
    .maybeSingle();
  const prev = (data?.parsed_payload ?? {}) as ParsedDocument;
  let warnings = (prev.warnings ?? []).filter(
    (w) => w !== 'ocr_pending' && w !== 'ocr_processing' && w !== 'ocr_failed'
  );
  if (state === 'pending') warnings = [...warnings, 'ocr_pending'];
  if (state === 'processing') warnings = [...warnings, 'ocr_processing'];
  if (state === 'failed') warnings = [...warnings, 'ocr_failed'];
  await supabase
    .schema('ops')
    .from('guest_documents')
    .update({ parsed_payload: { ...prev, warnings } })
    .eq('id', docId);
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
    .select('parsed_payload')
    .eq('id', docId)
    .maybeSingle();
  if (loadErr) return { ok: false, message: loadErr.message };

  const existing = (docRow?.parsed_payload ?? {}) as ParsedDocument;
  const merged = mergeKbsOcrIntoExisting(existing, parsed);
  const payload = stripOcrFlags(merged);
  const fullName =
    payload.fullName ??
    ([payload.firstName, payload.lastName].filter(Boolean).join(' ').trim() || null);
  const birthDate =
    payload.birthDate && payload.birthDate.length >= 10 ? payload.birthDate.slice(0, 10) : null;
  const expiryDate =
    payload.expiryDate && payload.expiryDate.length >= 10 ? payload.expiryDate.slice(0, 10) : null;
  const docNo = payload.documentNumber?.trim() || null;
  const coreReady = !!(docNo && fullName);
  const effectiveConfidence =
    scanConfidence != null
      ? Math.max(scanConfidence, payload.confidence ?? 0)
      : payload.confidence ?? scanConfidence;

  const { error: docErr } = await supabase
    .schema('ops')
    .from('guest_documents')
    .update({
      parsed_payload: payload,
      scan_confidence: effectiveConfidence,
      ocr_engine: ocrEngine ?? MRZ_OCR_ENGINE_VISION_MLKIT,
      document_number: docNo,
      issuing_country_code: payload.issuingCountryCode,
      nationality_code: payload.nationalityCode,
      expiry_date: expiryDate,
      raw_mrz: payload.rawMrz,
      scan_status: coreReady ? 'ready_to_submit' : payload.rawMrz ? 'scanned' : 'draft',
    })
    .eq('id', docId);
  if (docErr) return { ok: false, message: docErr.message };

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
  const all = await fetchKbsCapturedDocuments(400);
  return all.find((r) => r.id === docId) ?? null;
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
