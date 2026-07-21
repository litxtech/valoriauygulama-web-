import { supabase } from '@/lib/supabase';
import { resolveOpsHotelIdForCaller } from '@/lib/resolveOpsHotelId';
import { enrichKbsParsedFromSources } from '@/lib/kbsCaptureParsedFields';
import { formatIcao3ForTr } from '@/lib/scanner/mrzIssuingLabel';
import type { ParsedDocument } from '@/lib/scanner/types';
import type { KbsCapturedDocumentRow } from '@/lib/kbsCaptureHistory';

export type KbsOpsHotel = { id: string; code: string; name: string; short_label: string };

export type KbsCaptureStats = { total: number; today: number; week: number };

export type NationalityFilterOption = { code: string; label: string; count: number };

export type PassportHotelBreakdown = { hotelId: string; hotelName: string; count: number };

export type KbsBrowseFetchOpts = {
  hotelId?: string | null;
  documentType?: 'passport' | null;
  limit?: number;
};

function shortenHotelLabel(name: string, code: string): string {
  const n = name.trim();
  const c = code.trim().toLowerCase();
  if (c.startsWith('valoria') || n.toLowerCase().includes('valoria')) return 'Valoria';
  if (c.includes('bavul-suite') || n.toLowerCase().includes('bavul suite')) return 'Bavul Suite';
  if (c.includes('bavultur') || n.toLowerCase().includes('bavultur')) return 'Bavultur';
  return n.replace(/\s*\(OPS\)\s*$/i, '').trim() || n;
}

export async function listAccessibleHotels(): Promise<KbsOpsHotel[]> {
  const { data, error } = await supabase.rpc('kbs_web_list_hotels');
  if (error) {
    const { data: fallback } = await supabase.schema('ops').from('hotels').select('id, code, name').order('name');
    return ((fallback ?? []) as Array<{ id: string; code: string; name: string }>).map((h) => ({
      id: h.id,
      code: h.code,
      name: h.name,
      short_label: shortenHotelLabel(h.name, h.code),
    }));
  }
  return ((data ?? []) as KbsOpsHotel[]).map((h) => ({
    ...h,
    short_label: h.short_label || shortenHotelLabel(h.name, h.code),
  }));
}

export async function resolveKbsMultiHotelContext(
  knownAuthUserId?: string | null
): Promise<
  { ok: true; hotelId: string; canViewAllHotels: boolean } | { ok: false; message: string }
> {
  const ctx = await resolveOpsHotelIdForCaller(knownAuthUserId);
  if (!ctx.ok) return ctx;
  const hotels = await listAccessibleHotels();
  return { ok: true, hotelId: ctx.hotelId, canViewAllHotels: hotels.length > 1 };
}

function startOfTodayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function startOfWeekIso(): string {
  const d = new Date();
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

async function countBrowseDocuments(opts: {
  hotelId?: string | null;
  sinceIso?: string | null;
  documentType?: 'passport' | null;
}): Promise<number> {
  let query = supabase.schema('ops').from('guest_documents').select('id', { count: 'exact', head: true });
  if (opts.documentType === 'passport') {
    query = query.eq('document_type', 'passport').not('front_image_url', 'is', null);
  } else {
    query = query.or('front_image_url.not.is.null,capture_source.eq.tc');
  }
  if (opts.hotelId) query = query.eq('hotel_id', opts.hotelId);
  if (opts.sinceIso) query = query.gte('created_at', opts.sinceIso);
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function fetchKbsCaptureStats(opts: {
  hotelId?: string | null;
  documentType?: 'passport' | null;
}): Promise<KbsCaptureStats> {
  const [total, today, week] = await Promise.all([
    countBrowseDocuments(opts),
    countBrowseDocuments({ ...opts, sinceIso: startOfTodayIso() }),
    countBrowseDocuments({ ...opts, sinceIso: startOfWeekIso() }),
  ]);
  return { total, today, week };
}

export async function fetchPassportHotelBreakdown(hotels: KbsOpsHotel[]): Promise<PassportHotelBreakdown[]> {
  const counts = await Promise.all(
    hotels.map(async (h) => ({
      hotelId: h.id,
      hotelName: h.short_label,
      count: await countBrowseDocuments({ hotelId: h.id, documentType: 'passport' }),
    }))
  );
  return counts
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count || a.hotelName.localeCompare(b.hotelName, 'tr'));
}

export function nationalityCodeOf(row: KbsCapturedDocumentRow): string {
  const p = row.parsed_payload as ParsedDocument | null;
  const code =
    (row as KbsCapturedDocumentRow & { nationality_code?: string }).nationality_code?.trim() ||
    p?.nationalityCode?.trim() ||
    '';
  return code ? code.toUpperCase() : '—';
}

export function buildNationalityFilterOptions(rows: KbsCapturedDocumentRow[]): NationalityFilterOption[] {
  const map = new Map<string, NationalityFilterOption>();
  for (const row of rows) {
    const code = nationalityCodeOf(row);
    const existing = map.get(code);
    if (existing) existing.count += 1;
    else {
      map.set(code, {
        code,
        label: code === '—' ? 'Belirsiz' : formatIcao3ForTr(code),
        count: 1,
      });
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'tr'));
}

const ACTIVE_STAY = ['assigned', 'checked_in', 'checkout_pending'];

type RawBrowseDoc = {
  id: string;
  guest_id: string;
  hotel_id: string | null;
  captured_at: string | null;
  created_at: string;
  front_image_url: string | null;
  capture_source?: string | null;
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

/** Çoklu otel + pasaport filtresi — web-kbs ile aynı sorgu modeli. */
export async function fetchKbsBrowseDocuments(
  knownAuthUserId?: string | null,
  opts?: KbsBrowseFetchOpts
): Promise<KbsCapturedDocumentRow[]> {
  const ctx = await resolveKbsMultiHotelContext(knownAuthUserId);
  if (!ctx.ok) throw new Error(ctx.message);

  const limit = opts?.limit ?? 300;
  const hotels = await listAccessibleHotels();
  const hotelNameById = new Map(hotels.map((h) => [h.id, h.short_label]));

  const fetchHotelId =
    opts?.hotelId !== undefined
      ? opts.hotelId
      : ctx.canViewAllHotels
        ? null
        : ctx.hotelId;

  let query = supabase
    .schema('ops')
    .from('guest_documents')
    .select(
      `id, guest_id, hotel_id, captured_at, created_at, front_image_url, capture_source, parsed_payload, scan_status, ocr_status, ocr_engine, mrz_batch_key, scanned_by_user_id, guest_phone_submitted,
      document_number, nationality_code, issuing_country_code, expiry_date, document_type,
      guest:guest_id(first_name, last_name, birth_date, gender, nationality_code)`
    )
    .order('created_at', { ascending: false })
    .limit(limit);

  if (opts?.documentType === 'passport') {
    query = query.eq('document_type', 'passport').not('front_image_url', 'is', null);
  } else {
    query = query.or('front_image_url.not.is.null,capture_source.eq.tc');
  }
  if (fetchHotelId) query = query.eq('hotel_id', fetchHotelId);

  const { data: docs, error } = await query;
  if (error) throw new Error(error.message);

  const list = (docs ?? []) as unknown as RawBrowseDoc[];
  if (list.length === 0) return [];

  const hotelIds = [...new Set(list.map((d) => d.hotel_id).filter(Boolean))] as string[];
  if (hotelIds.length > 0) {
    const missing = hotelIds.filter((id) => !hotelNameById.has(id));
    if (missing.length > 0) {
      const { data: hotelRows } = await supabase
        .schema('ops')
        .from('hotels')
        .select('id, name, code')
        .in('id', missing);
      for (const h of (hotelRows ?? []) as Array<{ id: string; name: string; code: string }>) {
        hotelNameById.set(h.id, shortenHotelLabel(h.name, h.code));
      }
    }
  }

  const scannerAuthIds = [...new Set(list.map((d) => d.scanned_by_user_id).filter(Boolean))] as string[];
  const guestIds = [...new Set(list.map((d) => d.guest_id))];
  const stayHotelIds = fetchHotelId ? [fetchHotelId] : hotelIds;

  const [staffResult, stayResult] = await Promise.all([
    scannerAuthIds.length > 0
      ? supabase.from('staff').select('auth_id, full_name').in('auth_id', scannerAuthIds)
      : Promise.resolve({ data: [], error: null } as const),
    guestIds.length > 0 && stayHotelIds.length > 0
      ? supabase
          .schema('ops')
          .from('stay_assignments')
          .select('guest_id, hotel_id, updated_at, room:room_id(room_number)')
          .in('guest_id', guestIds)
          .in('hotel_id', stayHotelIds)
          .in('stay_status', ACTIVE_STAY)
          .order('updated_at', { ascending: false })
      : Promise.resolve({ data: [], error: null } as const),
  ]);

  if (staffResult.error) throw new Error(staffResult.error.message);
  const nameByAuthId = new Map(
    (staffResult.data ?? []).map((s) => [String(s.auth_id), String(s.full_name ?? '').trim() || '—'])
  );

  const roomByGuestHotel = new Map<string, string>();
  for (const s of (stayResult.data ?? []) as Array<{
    guest_id: string;
    hotel_id: string;
    room: { room_number?: string | number | null } | null;
  }>) {
    const key = `${s.guest_id}:${s.hotel_id}`;
    if (roomByGuestHotel.has(key)) continue;
    const num = s.room?.room_number;
    if (num != null) roomByGuestHotel.set(key, String(num));
  }

  return list.map((d) => {
    const docHotelId = d.hotel_id ?? null;
    const roomKey = docHotelId ? `${d.guest_id}:${docHotelId}` : '';
    return {
      id: d.id,
      guest_id: d.guest_id,
      hotel_id: docHotelId,
      hotel_name: docHotelId ? hotelNameById.get(docHotelId) ?? null : null,
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
      ocr_status: (d as { ocr_status?: string | null }).ocr_status ?? null,
      ocr_engine: d.ocr_engine ?? null,
      room_number: roomKey ? roomByGuestHotel.get(roomKey) ?? null : null,
      mrz_batch_key: d.mrz_batch_key ?? null,
      scanned_by_user_id: d.scanned_by_user_id ?? null,
      captured_by_staff_name: d.scanned_by_user_id
        ? nameByAuthId.get(d.scanned_by_user_id) ?? 'Personel'
        : null,
      guest_phone_submitted: d.guest_phone_submitted ?? null,
    };
  });
}
