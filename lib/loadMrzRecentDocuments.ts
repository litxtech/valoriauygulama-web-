import { supabase } from '@/lib/supabase';
import { resolveOpsHotelIdForCaller } from '@/lib/resolveOpsHotelId';

export type MrzRecentDocRow = {
  id: string;
  created_at: string;
  document_type: string;
  document_number: string | null;
  nationality_code: string | null;
  issuing_country_code: string | null;
  expiry_date: string | null;
  raw_mrz: string | null;
  parsed_payload: Record<string, unknown> | null;
  scan_confidence: number | null;
  scan_status: string;
  guest_id: string;
  guest?: {
    full_name: string | null;
    first_name: string | null;
    last_name: string | null;
    middle_name: string | null;
    birth_date: string | null;
    nationality_code: string | null;
    gender: string | null;
  } | null;
};

/**
 * Pasaportlar (MRZ) listesi — doğrudan ops.guest_documents (RLS).
 * VPS köprüsü (KBS_GATEWAY_URL) gerekmez; yanlış placeholder URL hatası oluşmaz.
 */
export async function loadMrzRecentDocuments(): Promise<
  { ok: true; data: MrzRecentDocRow[] } | { ok: false; message: string; code: string }
> {
  const ctx = await resolveOpsHotelIdForCaller();
  if (!ctx.ok) return { ok: false, message: ctx.message, code: ctx.code };
  const hotelId = ctx.hotelId;

  const { data: docs, error: e0 } = await supabase
    .schema('ops')
    .from('guest_documents')
    .select(
      'id, created_at, document_type, document_number, nationality_code, issuing_country_code, expiry_date, raw_mrz, parsed_payload, scan_confidence, scan_status, guest_id'
    )
    .eq('hotel_id', hotelId)
    .not('raw_mrz', 'is', null)
    .order('created_at', { ascending: false })
    .limit(500);
  if (e0) return { ok: false, message: e0.message, code: 'DB' };

  const list = (docs ?? []) as Array<{
    id: string;
    guest_id: string | null;
    created_at: string;
    document_type: string;
    document_number: string | null;
    nationality_code: string | null;
    issuing_country_code: string | null;
    expiry_date: string | null;
    raw_mrz: string | null;
    parsed_payload: Record<string, unknown> | null;
    scan_confidence: number | null;
    scan_status: string;
  }>;
  const gids = [...new Set(list.map((d) => d.guest_id).filter(Boolean))] as string[];

  const guestMap: Record<string, NonNullable<MrzRecentDocRow['guest']>> = {};
  if (gids.length) {
    const { data: guests, error: e1 } = await supabase
      .schema('ops')
      .from('guests')
      .select('id, full_name, first_name, last_name, middle_name, birth_date, nationality_code, gender')
      .in('id', gids);
    if (e1) return { ok: false, message: e1.message, code: 'DB' };
    for (const g of guests ?? []) {
      const row = g as {
        id: string;
        full_name: string | null;
        first_name: string | null;
        last_name: string | null;
        middle_name: string | null;
        birth_date: string | null;
        nationality_code: string | null;
        gender: string | null;
      };
      guestMap[row.id] = {
        full_name: row.full_name,
        first_name: row.first_name,
        last_name: row.last_name,
        middle_name: row.middle_name,
        birth_date: row.birth_date,
        nationality_code: row.nationality_code,
        gender: row.gender,
      };
    }
  }

  const items: MrzRecentDocRow[] = list.map((d) => ({
    ...d,
    guest_id: d.guest_id ?? '',
    guest: d.guest_id ? guestMap[d.guest_id] ?? null : null,
  }));

  return { ok: true, data: items };
}
