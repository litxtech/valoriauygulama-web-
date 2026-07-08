import { supabase } from '@/lib/supabase';
import { log } from '@/lib/logger';

export type InHouseGuestRow = {
  roomNumber: string;
  firstInitial: string;
  lastInitial: string;
  checkInAt: string | null;
  stayStatus: string;
};

export type InHouseRoomGroup = {
  roomNumber: string;
  guests: InHouseGuestRow[];
};

export type HotelInHouseSummary = {
  inHouse: number;
  occupiedRooms: number;
  checkinsToday: number;
};

/** Otel nüfusu özeti: içeride konaklayan, dolu oda ve bugün giriş yapan kişi sayısı. */
export async function fetchHotelInHouseSummary(): Promise<HotelInHouseSummary> {
  const { data, error } = await supabase.rpc('hotel_in_house_summary');
  if (error) {
    log.warn('hotelInHouse', 'summary rpc', error.message);
    return { inHouse: 0, occupiedRooms: 0, checkinsToday: 0 };
  }
  const row = (Array.isArray(data) ? data[0] : data) as
    | { in_house?: number; occupied_rooms?: number; checkins_today?: number }
    | null
    | undefined;
  return {
    inHouse: Number(row?.in_house ?? 0) || 0,
    occupiedRooms: Number(row?.occupied_rooms ?? 0) || 0,
    checkinsToday: Number(row?.checkins_today ?? 0) || 0,
  };
}

/** İçeride konaklayan misafir sayısı (aktif ops.stay_assignments). */
export async function fetchHotelInHousePopulation(): Promise<number> {
  const { data, error } = await supabase.rpc('hotel_in_house_population');
  if (error) {
    log.warn('hotelInHouse', 'population rpc', error.message);
    return 0;
  }
  return typeof data === 'number' ? data : Number(data ?? 0) || 0;
}

/** İçeride konaklayan misafirlerin maskeli listesi (ad/soyad baş harfleri). */
export async function fetchHotelInHouseGuests(): Promise<InHouseGuestRow[]> {
  const { data, error } = await supabase.rpc('hotel_in_house_guests');
  if (error) {
    log.warn('hotelInHouse', 'guests rpc', error.message);
    return [];
  }
  const rows = (data ?? []) as {
    room_number: string | number | null;
    first_initial: string | null;
    last_initial: string | null;
    check_in_at: string | null;
    stay_status: string | null;
  }[];
  return rows.map((r) => ({
    roomNumber: r.room_number != null ? String(r.room_number) : '—',
    firstInitial: (r.first_initial ?? '').trim(),
    lastInitial: (r.last_initial ?? '').trim(),
    checkInAt: r.check_in_at ?? null,
    stayStatus: r.stay_status ?? 'assigned',
  }));
}

/** Maskeli liste satırlarını odaya göre gruplar (oda numarasına göre sıralı). */
export function groupInHouseByRoom(rows: InHouseGuestRow[]): InHouseRoomGroup[] {
  const map = new Map<string, InHouseGuestRow[]>();
  for (const row of rows) {
    const arr = map.get(row.roomNumber) ?? [];
    arr.push(row);
    map.set(row.roomNumber, arr);
  }
  return Array.from(map.entries())
    .map(([roomNumber, guests]) => ({ roomNumber, guests }))
    .sort((a, b) => a.roomNumber.localeCompare(b.roomNumber, 'tr', { numeric: true }));
}

/** "A.Y." biçiminde maskeli ad. */
export function formatMaskedInitials(row: InHouseGuestRow): string {
  const first = row.firstInitial ? `${row.firstInitial}.` : '';
  const last = row.lastInitial ? `${row.lastInitial}.` : '';
  const joined = `${first}${last}`.trim();
  return joined || '—';
}

/**
 * Odaya yeni kimlik gelince önceki farklı misafirleri otomatik çıkışlar.
 * keepGuestIds: bu çekimde aynı odaya giren misafirler (çıkışlanmaz).
 */
export async function checkoutRoomOtherGuests(
  roomId: string,
  keepGuestIds: string[]
): Promise<number> {
  const keep = Array.from(new Set(keepGuestIds.filter(Boolean)));
  const { data, error } = await supabase.rpc('kbs_checkout_room_others', {
    p_room_id: roomId,
    p_keep_guest_ids: keep,
  });
  if (error) {
    log.warn('hotelInHouse', 'checkout others rpc', error.message);
    return 0;
  }
  return typeof data === 'number' ? data : Number(data ?? 0) || 0;
}
