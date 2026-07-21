import { supabase } from '@/lib/supabase';
import { withPromiseTimeout } from '@/lib/edgeInvokeTimeout';
import type { ParsedDocument } from '@/lib/scanner/types';

/** Zayıf ağda takılı sorgu tüm kayıt akışını kilitlemesin; unique index yine korur. */
const IDENTITY_LOOKUP_TIMEOUT_MS = 15_000;

export type GuestDocumentIdentityRow = {
  id: string;
  guest_id: string;
  scan_status: string;
  document_type?: string | null;
  document_number?: string | null;
  captured_at?: string | null;
  created_at?: string | null;
  guest_name?: string | null;
};

/** parsed_payload içindeki “daha önce geldi” meta. */
export type KbsReturningGuestMeta = {
  previousDocumentId: string;
  previousGuestId?: string | null;
  previousCapturedAt?: string | null;
  previousGuestName?: string | null;
  documentNumber?: string | null;
};

export function normalizeGuestDocumentNumber(raw: string | null | undefined): string | null {
  // Index lower(btrim(...)) — iç boşlukları da kaldır ki FA 5213328 ≡ FA5213328.
  const s = (raw ?? '').trim().replace(/\s+/g, '').toUpperCase();
  return s || null;
}

/** `ops_guest_documents_identity_uidx` ile uyumlu: hotel + type + lower(btrim(no)). */
export function guestDocumentIdentityKey(
  documentType: string,
  documentNumber: string | null | undefined
): string | null {
  const no = normalizeGuestDocumentNumber(documentNumber);
  if (!no) return null;
  return `${documentType}\0${no.toLowerCase()}`;
}

type RawIdentityDoc = {
  id: string;
  guest_id: string;
  scan_status: string;
  document_number: string | null;
  document_type: string | null;
  captured_at: string | null;
  created_at: string | null;
  guest?:
    | { full_name?: string | null; first_name?: string | null; last_name?: string | null }
    | { full_name?: string | null; first_name?: string | null; last_name?: string | null }[]
    | null;
};

function guestNameFromJoin(guest: RawIdentityDoc['guest']): string | null {
  const g = Array.isArray(guest) ? guest[0] : guest;
  if (!g) return null;
  const full = (g.full_name ?? '').trim();
  if (full) return full;
  const joined = [g.first_name, g.last_name].filter(Boolean).join(' ').trim();
  return joined || null;
}

function toIdentityRow(hit: RawIdentityDoc): GuestDocumentIdentityRow {
  return {
    id: hit.id,
    guest_id: hit.guest_id,
    scan_status: hit.scan_status,
    document_type: hit.document_type,
    document_number: hit.document_number,
    captured_at: hit.captured_at,
    created_at: hit.created_at,
    guest_name: guestNameFromJoin(hit.guest),
  };
}

/**
 * Aynı otelde aynı belge no — önce tür eşleşmesi, yoksa numaraya göre (duplicate önleme).
 * Index: (hotel_id, document_type, lower(btrim(document_number))).
 */
export async function findGuestDocumentByIdentity(
  hotelId: string,
  documentType: ParsedDocument['documentType'] | string,
  documentNumber: string | null | undefined,
  opts?: { excludeDocumentId?: string | null }
): Promise<GuestDocumentIdentityRow | null> {
  const docNo = normalizeGuestDocumentNumber(documentNumber);
  if (!docNo || !hotelId) return null;

  const target = docNo.toLowerCase();
  const selectCols =
    'id, guest_id, scan_status, document_number, document_type, captured_at, created_at, guest:guest_id(full_name, first_name, last_name)';

  let data: RawIdentityDoc[] | null;
  try {
    const res = await withPromiseTimeout(
      supabase
        .schema('ops')
        .from('guest_documents')
        .select(selectCols)
        .eq('hotel_id', hotelId)
        .ilike('document_number', docNo)
        .order('updated_at', { ascending: false })
        .limit(20),
      IDENTITY_LOOKUP_TIMEOUT_MS,
      'Kimlik sorgusu zaman aşımı'
    );
    if (res.error) return null;
    data = res.data as RawIdentityDoc[] | null;
  } catch {
    return null;
  }
  if (!data?.length) return null;

  const exclude = opts?.excludeDocumentId?.trim() || null;
  const matches = data.filter((row) => {
    if (exclude && row.id === exclude) return false;
    return normalizeGuestDocumentNumber(row.document_number)?.toLowerCase() === target;
  });
  if (!matches.length) return null;

  const exactType = matches.find((row) => String(row.document_type) === String(documentType));
  const hit = exactType ?? matches[0]!;
  return toIdentityRow(hit);
}

/** Pasaport/kimlik daha önce sistemde var mı (mevcut kayıt hariç). */
export async function findPriorPassportVisit(
  hotelId: string,
  documentType: ParsedDocument['documentType'] | string,
  documentNumber: string | null | undefined,
  excludeDocumentId?: string | null
): Promise<GuestDocumentIdentityRow | null> {
  return findGuestDocumentByIdentity(hotelId, documentType, documentNumber, {
    excludeDocumentId,
  });
}

export function buildReturningGuestMeta(
  prior: GuestDocumentIdentityRow,
  documentNumber?: string | null
): KbsReturningGuestMeta {
  return {
    previousDocumentId: prior.id,
    previousGuestId: prior.guest_id,
    previousCapturedAt: prior.captured_at ?? prior.created_at ?? null,
    previousGuestName: prior.guest_name ?? null,
    documentNumber: documentNumber ?? prior.document_number ?? null,
  };
}

export function withReturningGuestWarning(
  parsed: ParsedDocument,
  meta: KbsReturningGuestMeta
): ParsedDocument {
  const warnings = [...(parsed.warnings ?? [])];
  if (!warnings.includes('returning_guest')) warnings.push('returning_guest');
  if (!warnings.includes('duplicate_identity')) warnings.push('duplicate_identity');
  return {
    ...parsed,
    warnings,
    returningGuest: meta,
  } as ParsedDocument & { returningGuest: KbsReturningGuestMeta };
}

export function isKbsReturningGuest(
  payload: ParsedDocument | Record<string, unknown> | null | undefined
): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const w = (payload as ParsedDocument).warnings;
  if (Array.isArray(w) && (w.includes('returning_guest') || w.includes('duplicate_identity'))) {
    return true;
  }
  return !!(payload as { returningGuest?: unknown }).returningGuest;
}

export function getKbsReturningGuestMeta(
  payload: ParsedDocument | Record<string, unknown> | null | undefined
): KbsReturningGuestMeta | null {
  if (!payload || typeof payload !== 'object') return null;
  const raw = (payload as { returningGuest?: unknown }).returningGuest;
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  const previousDocumentId = typeof m.previousDocumentId === 'string' ? m.previousDocumentId : null;
  if (!previousDocumentId) return null;
  return {
    previousDocumentId,
    previousGuestId: typeof m.previousGuestId === 'string' ? m.previousGuestId : null,
    previousCapturedAt: typeof m.previousCapturedAt === 'string' ? m.previousCapturedAt : null,
    previousGuestName: typeof m.previousGuestName === 'string' ? m.previousGuestName : null,
    documentNumber: typeof m.documentNumber === 'string' ? m.documentNumber : null,
  };
}

/** Personel uyarısı — “daha önce geldi”. */
export function formatKbsReturningGuestWarning(
  payload: ParsedDocument | Record<string, unknown> | null | undefined
): string | null {
  if (!isKbsReturningGuest(payload)) return null;
  const meta = getKbsReturningGuestMeta(payload);
  const when = meta?.previousCapturedAt
    ? new Date(meta.previousCapturedAt).toLocaleString('tr-TR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;
  const who = meta?.previousGuestName?.trim() || null;
  const doc = meta?.documentNumber?.trim() || null;
  const parts = ['Bu pasaport / kimlik daha önce sisteme eklendi — daha önce geldi.'];
  if (who) parts.push(`Önceki kayıt: ${who}`);
  if (when) parts.push(`Tarih: ${when}`);
  if (doc) parts.push(`Belge no: ${doc}`);
  return parts.join(' ');
}
