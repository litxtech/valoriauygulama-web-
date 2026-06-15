import { supabase } from '@/lib/supabase';
import { getOccupancyCached, occupancyCacheKey, setOccupancyCached } from '@/lib/occupancyCache';

export type OccupancyGuest = {
  id: string;
  full_name: string;
  status: string;
  check_in_at: string | null;
  check_out_at: string | null;
  nights_count: number | null;
  signature_data: string | null;
  contract_lang: string | null;
  room_id: string | null;
  room_number: string | null;
  phone: string | null;
  assigned_staff_name: string | null;
  contract_accepted_at: string | null;
};

export type OccupancyRoom = {
  id: string;
  room_number: string;
  floor: number | null;
  status: string;
  bed_type: string | null;
  guests: OccupancyGuest[];
  pending_contract_name: string | null;
};

export type OccupancySnapshot = {
  rooms: OccupancyRoom[];
  pendingGuests: OccupancyGuest[];
  todayCheckIns: OccupancyGuest[];
  todayCheckOuts: OccupancyGuest[];
  recentHistory: OccupancyGuest[];
  stats: {
    totalRooms: number;
    occupiedRooms: number;
    vacantRooms: number;
    occupancyPct: number;
    pendingCount: number;
    guestsInHouse: number;
  };
};

function roomNum(g: { rooms: { room_number: string } | { room_number: string }[] | null }): string | null {
  const r = g.rooms;
  if (!r) return null;
  return Array.isArray(r) ? r[0]?.room_number ?? null : r.room_number ?? null;
}

function mapGuest(
  g: Record<string, unknown>,
  staffByGuest: Map<string, { name: string | null; accepted_at: string | null }>
): OccupancyGuest {
  const id = String(g.id);
  const meta = staffByGuest.get(id);
  return {
    id,
    full_name: String(g.full_name ?? '—'),
    status: String(g.status ?? ''),
    check_in_at: (g.check_in_at as string | null) ?? null,
    check_out_at: (g.check_out_at as string | null) ?? null,
    nights_count: g.nights_count != null ? Number(g.nights_count) : null,
    signature_data: (g.signature_data as string | null) ?? null,
    contract_lang: (g.contract_lang as string | null) ?? null,
    room_id: (g.room_id as string | null) ?? null,
    room_number: roomNum(g as never),
    phone: (g.phone as string | null) ?? null,
    assigned_staff_name: meta?.name ?? null,
    contract_accepted_at: meta?.accepted_at ?? null,
  };
}

const OPS_TTL_MS = 90_000;

export async function loadOccupancySnapshot(
  orgScoped: string | null,
  options?: { force?: boolean }
): Promise<OccupancySnapshot> {
  const cacheKey = occupancyCacheKey(['ops', orgScoped]);
  if (!options?.force) {
    const cached = getOccupancyCached<OccupancySnapshot>(cacheKey, OPS_TTL_MS);
    if (cached) return cached;
  }
  const today = new Date();
  const dayStart = new Date(today);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(today);
  dayEnd.setHours(23, 59, 59, 999);
  const dayStartIso = dayStart.toISOString();
  const dayEndIso = dayEnd.toISOString();

  let roomsQuery = supabase
    .from('rooms')
    .select('id, room_number, floor, status, bed_type')
    .order('room_number');
  let inHouseQuery = supabase
    .from('guests')
    .select(
      'id, full_name, status, check_in_at, check_out_at, nights_count, signature_data, contract_lang, room_id, phone, rooms(room_number)'
    )
    .eq('status', 'checked_in')
    .not('room_id', 'is', null);
  let pendingQuery = supabase
    .from('guests')
    .select(
      'id, full_name, status, check_in_at, check_out_at, nights_count, signature_data, contract_lang, room_id, phone, rooms(room_number)'
    )
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(80);
  let checkInsTodayQuery = supabase
    .from('guests')
    .select(
      'id, full_name, status, check_in_at, check_out_at, nights_count, signature_data, contract_lang, room_id, phone, rooms(room_number)'
    )
    .not('check_in_at', 'is', null)
    .gte('check_in_at', dayStartIso)
    .lte('check_in_at', dayEndIso)
    .order('check_in_at', { ascending: false });
  let checkOutsTodayQuery = supabase
    .from('guests')
    .select(
      'id, full_name, status, check_in_at, check_out_at, nights_count, signature_data, contract_lang, room_id, phone, rooms(room_number)'
    )
    .not('check_out_at', 'is', null)
    .gte('check_out_at', dayStartIso)
    .lte('check_out_at', dayEndIso)
    .order('check_out_at', { ascending: false });
  let historyQuery = supabase
    .from('guests')
    .select(
      'id, full_name, status, check_in_at, check_out_at, nights_count, signature_data, contract_lang, room_id, phone, rooms(room_number)'
    )
    .eq('status', 'checked_out')
    .not('check_out_at', 'is', null)
    .order('check_out_at', { ascending: false })
    .limit(120);

  if (orgScoped) {
    roomsQuery = roomsQuery.eq('organization_id', orgScoped);
    inHouseQuery = inHouseQuery.eq('organization_id', orgScoped);
    pendingQuery = pendingQuery.eq('organization_id', orgScoped);
    checkInsTodayQuery = checkInsTodayQuery.eq('organization_id', orgScoped);
    checkOutsTodayQuery = checkOutsTodayQuery.eq('organization_id', orgScoped);
    historyQuery = historyQuery.eq('organization_id', orgScoped);
  }

  const [roomsRes, inHouseRes, pendingRes, checkInsRes, checkOutsRes, historyRes, previewCasRes] = await Promise.all([
    roomsQuery,
    inHouseQuery,
    pendingQuery,
    checkInsTodayQuery,
    checkOutsTodayQuery,
    historyQuery,
    orgScoped
      ? supabase
          .from('contract_acceptances')
          .select('room_id, guests(full_name, status, room_id)')
          .eq('organization_id', orgScoped)
          .not('guest_id', 'is', null)
      : supabase
          .from('contract_acceptances')
          .select('room_id, guests(full_name, status, room_id)')
          .not('guest_id', 'is', null),
  ]);

  const guestIds = new Set<string>();
  for (const g of [...(inHouseRes.data ?? []), ...(pendingRes.data ?? []), ...(historyRes.data ?? [])]) {
    guestIds.add((g as { id: string }).id);
  }

  const staffByGuest = new Map<string, { name: string | null; accepted_at: string | null }>();
  if (guestIds.size > 0) {
    const { data: cas } = await supabase
      .from('contract_acceptances')
      .select('guest_id, accepted_at, assigned_at, staff:assigned_staff_id(full_name)')
      .in('guest_id', [...guestIds])
      .order('accepted_at', { ascending: false });
    for (const row of cas ?? []) {
      const gid = row.guest_id as string | null;
      if (!gid || staffByGuest.has(gid)) continue;
      const st = Array.isArray(row.staff) ? row.staff[0] : row.staff;
      staffByGuest.set(gid, {
        name: (st as { full_name?: string } | null)?.full_name ?? null,
        accepted_at: (row.accepted_at as string) ?? null,
      });
    }
  }

  const guestsByRoom = new Map<string, OccupancyGuest[]>();
  for (const raw of inHouseRes.data ?? []) {
    const g = mapGuest(raw as Record<string, unknown>, staffByGuest);
    if (!g.room_id) continue;
    const list = guestsByRoom.get(g.room_id) ?? [];
    list.push(g);
    guestsByRoom.set(g.room_id, list);
  }

  const previewByRoom: Record<string, string> = {};
  for (const row of previewCasRes.data ?? []) {
    const rid = row.room_id as string | null;
    if (!rid || previewByRoom[rid]) continue;
    const guest = Array.isArray(row.guests) ? row.guests[0] : row.guests;
    if (guest?.status === 'pending' && !guest.room_id && guest.full_name?.trim()) {
      previewByRoom[rid] = guest.full_name.trim();
    }
  }

  const rooms: OccupancyRoom[] = (roomsRes.data ?? []).map((r: Record<string, unknown>) => ({
    id: String(r.id),
    room_number: String(r.room_number),
    floor: r.floor != null ? Number(r.floor) : null,
    status: String(r.status ?? 'available'),
    bed_type: (r.bed_type as string | null) ?? null,
    guests: guestsByRoom.get(String(r.id)) ?? [],
    pending_contract_name: previewByRoom[String(r.id)] ?? null,
  }));

  const occupiedRooms = rooms.filter((r) => r.guests.length > 0 || r.status === 'occupied').length;
  const totalRooms = rooms.length;
  const guestsInHouse = [...guestsByRoom.values()].reduce((s, list) => s + list.length, 0);

  const snapshot: OccupancySnapshot = {
    rooms,
    pendingGuests: (pendingRes.data ?? []).map((g) => mapGuest(g as Record<string, unknown>, staffByGuest)),
    todayCheckIns: (checkInsRes.data ?? []).map((g) => mapGuest(g as Record<string, unknown>, staffByGuest)),
    todayCheckOuts: (checkOutsRes.data ?? []).map((g) => mapGuest(g as Record<string, unknown>, staffByGuest)),
    recentHistory: (historyRes.data ?? []).map((g) => mapGuest(g as Record<string, unknown>, staffByGuest)),
    stats: {
      totalRooms,
      occupiedRooms,
      vacantRooms: Math.max(0, totalRooms - occupiedRooms),
      occupancyPct: totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0,
      pendingCount: (pendingRes.data ?? []).length,
      guestsInHouse,
    },
  };

  setOccupancyCached(cacheKey, snapshot);
  return snapshot;
}
