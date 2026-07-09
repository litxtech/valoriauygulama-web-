import { supabase } from './supabase';
import type { KbsCapturedDocumentRow, ParsedDocument } from './types';
import { parseRow } from './parse';

export type CaptureItem = KbsCapturedDocumentRow & { parsed: ParsedDocument | null };

export type OpsContext = { ok: true; hotelId: string; canViewAllHotels: boolean } | { ok: false; message: string };

export type KbsWebHotel = { id: string; code: string; name: string; short_label: string };

export type StaffFilterOption = { authId: string; name: string; count: number };

const ENSURE_MSG: Record<string, string> = {
  PGRST106:
    'Supabase Data API ayarında «ops» şeması açık değil. Dashboard → Project Settings → Data API → Exposed schemas listesine ops ekleyin.',
  ENSURE_RPC_MISSING: 'Sunucuda ensure_my_ops_app_user fonksiyonu yok. İlgili migration uygulanmalı.',
  NO_STAFF_ROW: 'Personel kaydı bulunamadı. Yöneticinizle iletişime geçin.',
  STAFF_ROLE_NOT_OPS_ELIGIBLE:
    'Bu hesabın kimlik çekimlerine erişimi yok. Yöneticiden «Kimlik / pasaport çekim» iznini açmasını isteyin.',
  USER_ID_REQUIRED: 'Oturum geçersiz.',
};

type EnsureRpc = { ok?: boolean; hotel_id?: string; code?: string; message?: string };

/** Oturumdaki kullanıcı için ops.app_users.hotel_id döner; yoksa RPC ile oluşturur. */
export async function resolveOpsContext(): Promise<OpsContext> {
  const { data, error } = await supabase.rpc('ensure_my_ops_app_user');
  if (error) {
    if (error.code === 'PGRST106') return { ok: false, message: ENSURE_MSG.PGRST106 };
    if (error.code === 'PGRST202' || /ensure_my_ops_app_user/i.test(error.message ?? '')) {
      return { ok: false, message: ENSURE_MSG.ENSURE_RPC_MISSING };
    }
    return { ok: false, message: error.message };
  }
  const row = (data ?? {}) as EnsureRpc;
  if (!row.ok || !row.hotel_id) {
    const code = row.code ?? '';
    return { ok: false, message: ENSURE_MSG[code] ?? row.message ?? 'ops.app_users kaydı oluşturulamadı.' };
  }
  const hotels = await listAccessibleHotels();
  const canViewAllHotels = hotels.length > 1;
  return { ok: true, hotelId: row.hotel_id, canViewAllHotels };
}

/** Erişilebilir ops otelleri (super admin: tümü; diğer: kendi oteli). */
export async function listAccessibleHotels(): Promise<KbsWebHotel[]> {
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
  return ((data ?? []) as KbsWebHotel[]).map((h) => ({
    ...h,
    short_label: h.short_label || shortenHotelLabel(h.name, h.code),
  }));
}

function shortenHotelLabel(name: string, code: string): string {
  const n = name.trim();
  const c = code.trim().toLowerCase();
  if (c.startsWith('valoria') || n.toLowerCase().includes('valoria')) return 'Valoria';
  if (c.includes('bavul-suite') || n.toLowerCase().includes('bavul suite')) return 'Bavul Suite';
  if (c.includes('bavultur') || n.toLowerCase().includes('bavultur')) return 'Bavultur';
  return n.replace(/\s*\(OPS\)\s*$/i, '').trim() || n;
}

const SELECT_COLS = `id, guest_id, hotel_id, captured_at, created_at, front_image_url, back_image_url, parsed_payload,
  scan_status, ocr_engine, mrz_batch_key, scanned_by_user_id, guest_phone_submitted,
  document_number, nationality_code, issuing_country_code, expiry_date, document_type,
  guest:guest_id(first_name, last_name, birth_date, gender, nationality_code)`;

type GuestJoin = {
  first_name: string | null;
  last_name: string | null;
  birth_date: string | null;
  gender: string | null;
  nationality_code: string | null;
} | null;

const ACTIVE_STAY = ['assigned', 'checked_in', 'checkout_pending'];

type RawDoc = KbsCapturedDocumentRow & {
  hotel_id?: string | null;
  guest: GuestJoin | GuestJoin[];
};

/** Kimlik çekim listesi — ops.guest_documents + personel + oda + otel adı. */
export async function fetchCaptures(opts: {
  hotelId?: string | null;
  limit?: number;
  hotelNameById?: Map<string, string>;
}): Promise<CaptureItem[]> {
  const limit = opts.limit ?? 300;
  let query = supabase
    .schema('ops')
    .from('guest_documents')
    .select(SELECT_COLS)
    .not('front_image_url', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (opts.hotelId) {
    query = query.eq('hotel_id', opts.hotelId);
  }

  const { data: docs, error } = await query;
  if (error) throw new Error(error.message);

  const list = (docs ?? []) as unknown as RawDoc[];
  if (list.length === 0) return [];

  const hotelIds = [...new Set(list.map((d) => d.hotel_id).filter(Boolean))] as string[];
  const hotelNameById = new Map(opts.hotelNameById ?? []);
  if (hotelIds.length > 0 && hotelNameById.size === 0) {
    const { data: hotels } = await supabase
      .schema('ops')
      .from('hotels')
      .select('id, name, code')
      .in('id', hotelIds);
    for (const h of (hotels ?? []) as Array<{ id: string; name: string; code: string }>) {
      hotelNameById.set(h.id, shortenHotelLabel(h.name, h.code));
    }
  }

  const scannerAuthIds = [...new Set(list.map((d) => d.scanned_by_user_id).filter(Boolean))] as string[];
  const guestIds = [...new Set(list.map((d) => d.guest_id))];
  const hotelIdForStays = opts.hotelId ?? list[0]?.hotel_id ?? null;

  const [staffResult, stayResult] = await Promise.all([
    scannerAuthIds.length > 0
      ? supabase.from('staff').select('auth_id, full_name, organization_id').in('auth_id', scannerAuthIds)
      : Promise.resolve({ data: [], error: null } as const),
    guestIds.length > 0 && hotelIdForStays
      ? supabase
          .schema('ops')
          .from('stay_assignments')
          .select('guest_id, hotel_id, updated_at, room:room_id(room_number)')
          .in('guest_id', guestIds)
          .in('stay_status', ACTIVE_STAY)
          .order('updated_at', { ascending: false })
      : Promise.resolve({ data: [], error: null } as const),
  ]);

  const staffRows = (staffResult.data ?? []) as Array<{
    auth_id: string;
    full_name: string | null;
    organization_id: string | null;
  }>;

  const nameByAuthId = new Map(
    staffRows.map((s) => [String(s.auth_id), String(s.full_name ?? '').trim() || '—'])
  );

  const orgIdByAuthId = new Map(
    staffRows.filter((s) => s.organization_id).map((s) => [String(s.auth_id), String(s.organization_id)])
  );

  const orgIds = [...new Set([...orgIdByAuthId.values()])];
  const orgNameById = new Map<string, string>();
  if (orgIds.length > 0) {
    const { data: orgs } = await supabase.from('organizations').select('id, name').in('id', orgIds);
    for (const o of (orgs ?? []) as Array<{ id: string; name: string | null }>) {
      const nm = String(o.name ?? '').trim();
      if (nm) orgNameById.set(String(o.id), nm);
    }
  }

  const scannerOrgName = (authId: string | null): string | null => {
    if (!authId) return null;
    const orgId = orgIdByAuthId.get(authId);
    return orgId ? orgNameById.get(orgId) ?? null : null;
  };

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
    const guest = Array.isArray(d.guest) ? d.guest[0] ?? null : d.guest ?? null;
    const docHotelId = d.hotel_id ?? null;
    const hotelName = docHotelId ? hotelNameById.get(docHotelId) ?? null : null;
    const roomKey = docHotelId ? `${d.guest_id}:${docHotelId}` : '';
    const row: KbsCapturedDocumentRow = {
      id: d.id,
      guest_id: d.guest_id,
      captured_at: d.captured_at,
      created_at: d.created_at,
      front_image_url: d.front_image_url,
      back_image_url: d.back_image_url ?? null,
      parsed_payload: d.parsed_payload,
      scan_status: d.scan_status,
      ocr_engine: d.ocr_engine ?? null,
      room_number: roomKey ? roomByGuestHotel.get(roomKey) ?? null : null,
      mrz_batch_key: d.mrz_batch_key ?? null,
      scanned_by_user_id: d.scanned_by_user_id ?? null,
      captured_by_staff_name: d.scanned_by_user_id
        ? nameByAuthId.get(d.scanned_by_user_id) ?? 'Personel'
        : null,
      captured_by_hotel_name: scannerOrgName(d.scanned_by_user_id ?? null),
      hotel_id: docHotelId,
      hotel_name: hotelName,
      guest_phone_submitted: d.guest_phone_submitted ?? null,
      document_number: d.document_number ?? null,
      nationality_code: d.nationality_code ?? null,
      issuing_country_code: d.issuing_country_code ?? null,
      expiry_date: d.expiry_date ?? null,
      document_type: d.document_type ?? null,
    };
    return { ...row, parsed: parseRow(row, guest) };
  });
}

/** Personel filtresi için benzersiz çeken personel listesi. */
export function buildStaffFilterOptions(items: CaptureItem[]): StaffFilterOption[] {
  const map = new Map<string, StaffFilterOption>();
  for (const it of items) {
    const authId = it.scanned_by_user_id;
    if (!authId) continue;
    const existing = map.get(authId);
    if (existing) {
      existing.count += 1;
    } else {
      map.set(authId, {
        authId,
        name: it.captured_by_staff_name ?? 'Personel',
        count: 1,
      });
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'tr'));
}

/** Girdiyi telefon numarası olarak normalize et. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d+()\s-]/g, '').trim();
  return cleaned ? cleaned : null;
}

export async function updateCaptureGuestPhone(docId: string, phone: string | null): Promise<void> {
  const value = normalizePhone(phone);
  const { error } = await supabase
    .schema('ops')
    .from('guest_documents')
    .update({ guest_phone_submitted: value })
    .eq('id', docId);
  if (error) throw new Error(error.message);
}

export function buildFamilyIndex(items: CaptureItem[]): Map<string, CaptureItem[]> {
  const map = new Map<string, CaptureItem[]>();
  for (const it of items) {
    const key = it.mrz_batch_key;
    if (!key) continue;
    const arr = map.get(key) ?? [];
    arr.push(it);
    map.set(key, arr);
  }
  return map;
}

export function familyMembersOf(item: CaptureItem, index: Map<string, CaptureItem[]>): CaptureItem[] {
  if (!item.mrz_batch_key) return [];
  const arr = index.get(item.mrz_batch_key) ?? [];
  return arr.length > 1 ? arr : [];
}

export function captureDate(item: CaptureItem): Date {
  return new Date(item.captured_at ?? item.created_at);
}

/** Son 1 saat içinde eklenen çekimler «yeni» sayılır. */
export const NEW_CAPTURE_WINDOW_MS = 60 * 60 * 1000;

export function isRecentlyAddedCapture(item: CaptureItem, nowMs = Date.now()): boolean {
  const age = nowMs - captureDate(item).getTime();
  return age >= 0 && age < NEW_CAPTURE_WINDOW_MS;
}

export function subscribeCaptures(onChange: () => void): () => void {
  const channel = supabase
    .channel('web-kbs-guest-documents')
    .on('postgres_changes', { event: '*', schema: 'ops', table: 'guest_documents' }, () => {
      onChange();
    })
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
