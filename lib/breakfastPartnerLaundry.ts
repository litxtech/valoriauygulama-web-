/**
 * Partner çamaşır kayıtları — kahvaltı partner carisine bağlı.
 */
import { supabase } from '@/lib/supabase';
import {
  fmtPartnerMoney,
  type BreakfastPartnerHotel,
} from '@/lib/breakfastPartner';
import type { StaffPermissionSlice } from '@/lib/staffPermissions';

export type PartnerLaundryUnitLabel = 'Adet' | 'Kg' | 'Poşet' | 'Çanta' | 'Makine' | string;

export type PartnerLaundryEntry = {
  id: string;
  partner_hotel_id: string;
  organization_id: string;
  wash_date: string;
  quantity: number;
  unit_label: string;
  unit_price_snapshot: number;
  line_total: number;
  guest_name: string | null;
  room_number: string | null;
  photo_urls: string[];
  note: string | null;
  agreement_id: string | null;
  created_at: string;
  updated_at: string;
  hotel_name?: string | null;
};

export type PartnerLaundryLedgerRow = PartnerLaundryEntry & {
  amount_remaining: number;
  agreement_status: string | null;
};

const HK_LAUNDRY_DEPARTMENTS = new Set([
  'housekeeping',
  'hk',
  'camasir',
  'camasirhane',
  'laundry',
  'temizlik',
  'kitchen',
  'kitchen_staff',
  'mutfak',
  'chef',
  'head_chef',
  'pastry',
  'restaurant',
]);

export function canManagePartnerLaundry(staff: StaffPermissionSlice): boolean {
  if (!staff) return false;
  if (staff.role === 'admin') return true;
  const dept = ((staff as { department?: string | null }).department ?? '').toLowerCase();
  if (HK_LAUNDRY_DEPARTMENTS.has(dept)) return true;
  const perms = staff.app_permissions ?? {};
  return (
    perms.mutfak_operasyon === true ||
    perms.yemek_listesi_mutfak_onay === true ||
    perms.housekeeping === true ||
    perms.oda_temizlik === true
  );
}

export function partnerLaundryIsPayable(
  row: Pick<PartnerLaundryLedgerRow, 'quantity' | 'amount_remaining'>
): boolean {
  return row.quantity > 0 && row.amount_remaining > 0.009;
}

export function partnerLaundryPayLabel(
  row: Pick<PartnerLaundryLedgerRow, 'quantity' | 'amount_remaining'>
): string {
  if (row.quantity <= 0) return '—';
  if (partnerLaundryIsPayable(row)) return fmtPartnerMoney(row.amount_remaining);
  return 'Ödendi';
}

export function formatLaundryQty(quantity: number, unitLabel: string): string {
  const q = Number(quantity) || 0;
  const trimmed = Number.isInteger(q) ? String(q) : String(Math.round(q * 1000) / 1000);
  return `${trimmed} ${unitLabel || 'Adet'}`;
}

export function resolvePartnerLaundryUnitPriceSync(
  hotel: Pick<BreakfastPartnerHotel, 'laundry_unit_price'>,
  defaultLaundryUnitPrice: number
): number {
  if (hotel.laundry_unit_price != null && hotel.laundry_unit_price > 0) return hotel.laundry_unit_price;
  return defaultLaundryUnitPrice > 0 ? defaultLaundryUnitPrice : 0;
}

export async function resolveEffectiveLaundryUnitPrice(
  hotel: Pick<BreakfastPartnerHotel, 'id' | 'organization_id' | 'laundry_unit_price'>
): Promise<number> {
  if (hotel.laundry_unit_price != null && hotel.laundry_unit_price > 0) return hotel.laundry_unit_price;

  const { data: rpcPrice, error: rpcError } = await supabase.rpc(
    'breakfast_partner_resolve_laundry_unit_price',
    { p_hotel_id: hotel.id }
  );
  if (!rpcError && rpcPrice != null) return Number(rpcPrice) || 0;

  const { data } = await supabase
    .from('breakfast_partner_settings')
    .select('default_laundry_unit_price')
    .eq('organization_id', hotel.organization_id)
    .maybeSingle();

  return Number(data?.default_laundry_unit_price) || 0;
}

function mapLaundryRow(r: Record<string, unknown>): PartnerLaundryEntry {
  const photos = r.photo_urls;
  return {
    id: String(r.id),
    partner_hotel_id: String(r.partner_hotel_id),
    organization_id: String(r.organization_id),
    wash_date: String(r.wash_date),
    quantity: Number(r.quantity) || 0,
    unit_label: String(r.unit_label ?? 'Adet'),
    unit_price_snapshot: Number(r.unit_price_snapshot) || 0,
    line_total: Number(r.line_total) || 0,
    guest_name: (r.guest_name as string | null) ?? null,
    room_number: (r.room_number as string | null) ?? null,
    photo_urls: Array.isArray(photos) ? photos.map(String).filter(Boolean) : [],
    note: (r.note as string | null) ?? null,
    agreement_id: (r.agreement_id as string | null) ?? null,
    created_at: String(r.created_at ?? ''),
    updated_at: String(r.updated_at ?? ''),
    hotel_name: (r.hotel_name as string | null) ?? null,
  };
}

function mapLaundryLedgerRow(r: Record<string, unknown>): PartnerLaundryLedgerRow {
  return {
    ...mapLaundryRow(r),
    amount_remaining: Number(r.amount_remaining) || 0,
    agreement_status: (r.agreement_status as string | null) ?? null,
  };
}

async function listPartnerLaundryLedgerViaTable(
  limit: number,
  partnerHotelId: string
): Promise<PartnerLaundryLedgerRow[]> {
  const { data, error } = await supabase
    .from('breakfast_partner_laundry_entries')
    .select(
      'id, partner_hotel_id, organization_id, wash_date, quantity, unit_label, unit_price_snapshot, line_total, guest_name, room_number, photo_urls, note, agreement_id, created_at, updated_at, breakfast_partner_hotels(name)'
    )
    .eq('partner_hotel_id', partnerHotelId)
    .order('wash_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.min(limit, 200)));

  if (error) {
    // Eski şema (foto/kişi kolonları yok) — çekirdek alanlarla tekrar dene
    const { data: fallback, error: fbErr } = await supabase
      .from('breakfast_partner_laundry_entries')
      .select(
        'id, partner_hotel_id, organization_id, wash_date, quantity, unit_label, unit_price_snapshot, line_total, note, agreement_id, created_at, updated_at, breakfast_partner_hotels(name)'
      )
      .eq('partner_hotel_id', partnerHotelId)
      .order('wash_date', { ascending: false })
      .limit(Math.max(1, Math.min(limit, 200)));
    if (fbErr) throw new Error(fbErr.message);
    return (fallback ?? []).map((row) => {
      const hotelJoin = row.breakfast_partner_hotels as { name?: string } | { name?: string }[] | null;
      const hotelName = Array.isArray(hotelJoin) ? hotelJoin[0]?.name : hotelJoin?.name;
      const { breakfast_partner_hotels: _, ...rest } = row as Record<string, unknown> & {
        breakfast_partner_hotels?: unknown;
      };
      const mapped = mapLaundryRow({ ...rest, hotel_name: hotelName ?? null });
      return {
        ...mapped,
        amount_remaining: mapped.quantity > 0 && mapped.agreement_id ? mapped.line_total : 0,
        agreement_status: mapped.quantity > 0 && mapped.agreement_id ? 'open' : null,
      };
    });
  }

  return (data ?? []).map((row) => {
    const hotelJoin = row.breakfast_partner_hotels as { name?: string } | { name?: string }[] | null;
    const hotelName = Array.isArray(hotelJoin) ? hotelJoin[0]?.name : hotelJoin?.name;
    const { breakfast_partner_hotels: _, ...rest } = row as Record<string, unknown> & {
      breakfast_partner_hotels?: unknown;
    };
    const mapped = mapLaundryRow({ ...rest, hotel_name: hotelName ?? null });
    return {
      ...mapped,
      amount_remaining: mapped.quantity > 0 && mapped.agreement_id ? mapped.line_total : 0,
      agreement_status: mapped.quantity > 0 && mapped.agreement_id ? 'open' : null,
    };
  });
}

/**
 * Partner portal + staff çamaşır carisi.
 * Kahvaltı ledger gibi ana `supabase` istemcisini kullanır (oturum paylaşımı).
 */
export async function listPartnerLaundryLedger(
  limit = 60,
  partnerHotelId?: string | null
): Promise<PartnerLaundryLedgerRow[]> {
  const { data, error } = await supabase.rpc('breakfast_partner_laundry_ledger', {
    p_limit: limit,
    p_partner_hotel_id: partnerHotelId ?? null,
  });

  if (!error) {
    return (Array.isArray(data) ? data : []).map((row) =>
      mapLaundryLedgerRow(row as Record<string, unknown>)
    );
  }

  // RPC yok / imza uyumsuz / geçici hata → tablo + RLS ile düş
  let hotelId = partnerHotelId ?? null;
  if (!hotelId) {
    const { data: sessionData } = await supabase.auth.getSession();
    const uid = sessionData.session?.user?.id;
    if (uid) {
      const { data: userRow } = await supabase
        .from('breakfast_partner_users')
        .select('partner_hotel_id')
        .eq('auth_id', uid)
        .eq('is_active', true)
        .maybeSingle();
      hotelId = (userRow?.partner_hotel_id as string | undefined) ?? null;
    }
  }
  if (!hotelId) throw new Error(error.message);
  return listPartnerLaundryLedgerViaTable(limit, hotelId);
}

export async function upsertPartnerLaundryEntry(input: {
  partnerHotelId: string;
  washDate: string;
  quantity: number;
  unitLabel?: string;
  unitPrice?: number | null;
  note?: string | null;
  guestName?: string | null;
  roomNumber?: string | null;
  photoUrls?: string[] | null;
  entryId?: string | null;
}): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('breakfast_partner_upsert_laundry_entry', {
    p_partner_hotel_id: input.partnerHotelId,
    p_wash_date: input.washDate,
    p_quantity: input.quantity,
    p_unit_label: input.unitLabel ?? 'Adet',
    p_unit_price: input.unitPrice != null && input.unitPrice > 0 ? input.unitPrice : null,
    p_note: input.note ?? null,
    p_entry_id: input.entryId ?? null,
    p_guest_name: input.guestName?.trim() || null,
    p_room_number: input.roomNumber?.trim() || null,
    p_photo_urls: input.photoUrls?.length ? input.photoUrls : [],
  });
  if (error) return { id: null, error: error.message };
  return { id: data ? String(data) : null, error: null };
}

export const PARTNER_LAUNDRY_PHOTO_BUCKET = 'feed-media';
export const PARTNER_LAUNDRY_MAX_PHOTOS = 4;

export function partnerLaundryPhotoSubfolder(organizationId: string, partnerHotelId: string): string {
  return `partner-laundry/${organizationId}/${partnerHotelId}`;
}

export async function updatePartnerHotelLaundryUnitPrice(
  hotelId: string,
  laundryUnitPrice: number | null
): Promise<string | null> {
  const normalized = laundryUnitPrice != null && laundryUnitPrice > 0 ? laundryUnitPrice : null;
  const { error } = await supabase
    .from('breakfast_partner_hotels')
    .update({ laundry_unit_price: normalized })
    .eq('id', hotelId);
  return error?.message ?? null;
}

export async function fetchPartnerLaundryMonthStats(partnerHotelId: string): Promise<{
  monthQty: number;
  monthAmount: number;
}> {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });
  const [y, m] = today.split('-');
  const start = `${y}-${m}-01`;

  const { data, error } = await supabase
    .from('breakfast_partner_laundry_entries')
    .select('quantity, line_total')
    .eq('partner_hotel_id', partnerHotelId)
    .gte('wash_date', start);

  if (error) throw new Error(error.message);
  const rows = data ?? [];
  return {
    monthQty: rows.reduce((s, r) => s + (Number(r.quantity) || 0), 0),
    monthAmount: rows.reduce((s, r) => s + (Number(r.line_total) || 0), 0),
  };
}

export async function fetchPartnerLaundryLifetimeTotal(partnerHotelId: string): Promise<number> {
  const { data, error } = await supabase
    .from('breakfast_partner_laundry_entries')
    .select('line_total')
    .eq('partner_hotel_id', partnerHotelId);
  if (error) throw new Error(error.message);
  return (data ?? []).reduce((s, r) => s + (Number(r.line_total) || 0), 0);
}

export { fmtPartnerMoney };
