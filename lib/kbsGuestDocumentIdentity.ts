import { supabase } from '@/lib/supabase';
import type { ParsedDocument } from '@/lib/scanner/types';

export type GuestDocumentIdentityRow = {
  id: string;
  guest_id: string;
  scan_status: string;
};

export function normalizeGuestDocumentNumber(raw: string | null | undefined): string | null {
  const s = (raw ?? '').trim();
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
 * Aynı otelde aynı belge kimliği (tür + no) — büyük/küçük harf ve kenar boşlukları yok sayılır.
 */
export async function findGuestDocumentByIdentity(
  hotelId: string,
  documentType: ParsedDocument['documentType'] | string,
  documentNumber: string | null | undefined
): Promise<GuestDocumentIdentityRow | null> {
  const docNo = normalizeGuestDocumentNumber(documentNumber);
  if (!docNo || !hotelId) return null;

  const target = docNo.toLowerCase();

  const { data, error } = await supabase
    .schema('ops')
    .from('guest_documents')
    .select('id, guest_id, scan_status, document_number')
    .eq('hotel_id', hotelId)
    .eq('document_type', documentType)
    .ilike('document_number', docNo);

  if (error || !data?.length) return null;

  const hit = data.find((row) => (row.document_number ?? '').trim().toLowerCase() === target);
  if (!hit) return null;

  return {
    id: hit.id,
    guest_id: hit.guest_id,
    scan_status: hit.scan_status,
  };
}
