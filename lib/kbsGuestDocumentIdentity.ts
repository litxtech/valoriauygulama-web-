import { supabase } from '@/lib/supabase';
import type { ParsedDocument } from '@/lib/scanner/types';

export type GuestDocumentIdentityRow = {
  id: string;
  guest_id: string;
  scan_status: string;
  document_type?: string | null;
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

/**
 * Aynı otelde aynı belge no — önce tür eşleşmesi, yoksa numaraya göre (duplicate önleme).
 * Index: (hotel_id, document_type, lower(btrim(document_number))).
 */
export async function findGuestDocumentByIdentity(
  hotelId: string,
  documentType: ParsedDocument['documentType'] | string,
  documentNumber: string | null | undefined
): Promise<GuestDocumentIdentityRow | null> {
  const docNo = normalizeGuestDocumentNumber(documentNumber);
  if (!docNo || !hotelId) return null;

  const target = docNo.toLowerCase();
  const selectCols = 'id, guest_id, scan_status, document_number, document_type, updated_at';

  // PostgREST ilike = case-insensitive eşitlik (wildcard yok).
  const { data, error } = await supabase
    .schema('ops')
    .from('guest_documents')
    .select(selectCols)
    .eq('hotel_id', hotelId)
    .ilike('document_number', docNo)
    .order('updated_at', { ascending: false })
    .limit(20);

  if (error || !data?.length) return null;

  const matches = data.filter(
    (row) => normalizeGuestDocumentNumber(row.document_number)?.toLowerCase() === target
  );
  if (!matches.length) return null;

  const exactType = matches.find((row) => String(row.document_type) === String(documentType));
  const hit = exactType ?? matches[0]!;

  return {
    id: hit.id,
    guest_id: hit.guest_id,
    scan_status: hit.scan_status,
    document_type: hit.document_type,
  };
}
