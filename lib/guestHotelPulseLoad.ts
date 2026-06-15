import { supabase } from '@/lib/supabase';

export type GuestPulseFlowRow = {
  id: string;
  room_number: string | null;
  check_in_at: string | null;
  check_out_at: string | null;
  status: string;
};

export type GuestPulseActivityKind =
  | 'check_in'
  | 'check_out'
  | 'contract'
  | 'cleaning'
  | 'breakfast'
  | 'info'
  | 'reservation';

export type GuestPulseActivity = {
  id: string;
  kind: GuestPulseActivityKind;
  label: string;
  created_at: string;
};

/** Misafir nabızında gösterilmeyen aktivite türleri (sözleşme, giriş/çıkış). */
const GUEST_HIDDEN_PULSE_ACTIVITY_KINDS = new Set<GuestPulseActivityKind>(['contract', 'check_in', 'check_out']);

export function filterGuestPulseActivitiesForGuest(activities: GuestPulseActivity[]): GuestPulseActivity[] {
  return activities.filter((a) => !GUEST_HIDDEN_PULSE_ACTIVITY_KINDS.has(a.kind));
}

function finalizePulseStats(stats: Partial<GuestHotelPulseData['stats']> | undefined): GuestHotelPulseData['stats'] {
  const guestsInHouse = Number(stats?.guestsInHouse) || 0;
  const staffActive = Number(stats?.staffActive) || 0;
  const totalOnSite = Number(stats?.totalOnSite) || guestsInHouse + staffActive;
  return {
    guestsInHouse,
    staffActive,
    totalOnSite,
    occupiedRooms: Number(stats?.occupiedRooms) || 0,
    vacantRooms: Number(stats?.vacantRooms) || 0,
    totalRooms: Number(stats?.totalRooms) || 0,
    checkInsToday: Number(stats?.checkInsToday) || 0,
    checkOutsToday: Number(stats?.checkOutsToday) || 0,
  };
}

/** RPC eski sürümde staffActive yoksa personel sayısını tamamlar. */
export async function fetchHotelPulseStaffCounts(
  orgScoped: string | null
): Promise<{ staffActive: number; staffOnline: number }> {
  const scope = <T extends { eq: (col: string, val: string) => T }>(q: T) =>
    orgScoped ? q.eq('organization_id', orgScoped) : q;

  let activeQ = supabase
    .from('staff')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true)
    .is('deleted_at', null);
  let onlineQ = supabase
    .from('staff')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true)
    .eq('is_online', true)
    .is('deleted_at', null);

  activeQ = scope(activeQ);
  onlineQ = scope(onlineQ);

  const [activeRes, onlineRes] = await Promise.all([activeQ, onlineQ]);
  return {
    staffActive: activeRes.count ?? 0,
    staffOnline: onlineRes.count ?? 0,
  };
}

export type GuestPulseStaffContact = {
  staffId: string | null;
  staffName: string;
  roleLabel: string;
  profileImage: string | null;
  department: string | null;
  shiftLabel: string;
  note: string;
  isOnline: boolean;
};

export type GuestPulseReception = GuestPulseStaffContact;
export type GuestPulseManager = GuestPulseStaffContact;

export type GuestPulseFacilities = {
  boilerLabel: string;
  boilerActive: boolean;
  breakfastHours: string;
  spaLabel: string;
  wifiStatus: string;
  wifiNetwork: string;
  wifiPassword: string;
  parkingLabel: string;
  elevatorLabel: string;
  restaurantLabel: string;
  announcementLabel: string;
  weatherLabel: string;
};

export type GuestHotelPulseData = {
  enabled: boolean;
  brandName: string;
  stats: {
    guestsInHouse: number;
    /** Aktif personel (çevrimiçi + mesai dışı) */
    staffActive: number;
    /** Misafir + personel toplamı */
    totalOnSite: number;
    occupiedRooms: number;
    vacantRooms: number;
    totalRooms: number;
    checkInsToday: number;
    checkOutsToday: number;
  };
  ops: {
    staffOnline: number;
    occupancyPercent: number;
    roomsReady: number;
    breakfastServed: number;
    activeContracts: number;
  };
  lifetime: {
    totalGuestsHosted: number;
    completedStays: number;
    contractApprovals: number;
  };
  todayCheckIns: GuestPulseFlowRow[];
  todayCheckOuts: GuestPulseFlowRow[];
  upcomingCheckOuts: GuestPulseFlowRow[];
  lateCheckoutRooms: GuestPulseFlowRow[];
  activities: GuestPulseActivity[];
  manager: GuestPulseManager;
  reception: GuestPulseReception;
  facilities: GuestPulseFacilities;
  /** Admin nabız kaydının zamanı (ISO) */
  configUpdatedAt: string | null;
};

const CACHE_TTL_MS = 90_000;
let cache: { key: string; at: number; data: GuestHotelPulseData } | null = null;

export function guestHotelPulseCacheKey(orgId: string | null): string {
  return orgId ?? '__default__';
}

export function getGuestHotelPulseCached(orgId: string | null, allowStale = false): GuestHotelPulseData | null {
  const key = guestHotelPulseCacheKey(orgId);
  if (!cache || cache.key !== key) return null;
  if (!allowStale && Date.now() - cache.at > CACHE_TTL_MS) return null;
  return normalizeGuestPulseData(cache.data);
}

export function setGuestHotelPulseCached(orgId: string | null, data: GuestHotelPulseData): void {
  cache = { key: guestHotelPulseCacheKey(orgId), at: Date.now(), data: normalizeGuestPulseData(data) };
}

export function clearGuestHotelPulseCache(): void {
  cache = null;
}

const EMPTY_DATA: GuestHotelPulseData = {
  enabled: true,
  brandName: 'Valoria',
  stats: {
    guestsInHouse: 0,
    staffActive: 0,
    totalOnSite: 0,
    occupiedRooms: 0,
    vacantRooms: 0,
    totalRooms: 0,
    checkInsToday: 0,
    checkOutsToday: 0,
  },
  ops: {
    staffOnline: 0,
    occupancyPercent: 0,
    roomsReady: 0,
    breakfastServed: 0,
    activeContracts: 0,
  },
  lifetime: {
    totalGuestsHosted: 0,
    completedStays: 0,
    contractApprovals: 0,
  },
  todayCheckIns: [],
  todayCheckOuts: [],
  upcomingCheckOuts: [],
  lateCheckoutRooms: [],
  activities: [],
  manager: {
    staffId: null,
    staffName: '—',
    roleLabel: 'Otel Sorumlusu',
    profileImage: null,
    department: null,
    shiftLabel: '',
    note: '',
    isOnline: false,
  },
  reception: {
    staffId: null,
    staffName: 'Resepsiyon',
    roleLabel: 'Resepsiyon',
    profileImage: null,
    department: null,
    shiftLabel: '',
    note: '',
    isOnline: false,
  },
  facilities: {
    boilerLabel: 'Sıcak su hazır',
    boilerActive: true,
    breakfastHours: '',
    spaLabel: '',
    wifiStatus: '',
    wifiNetwork: 'Valoria',
    wifiPassword: 'valoria!',
    parkingLabel: '',
    elevatorLabel: '',
    restaurantLabel: '',
    announcementLabel: '',
    weatherLabel: '',
  },
  configUpdatedAt: null,
};

export function normalizeGuestPulseData(data: Partial<GuestHotelPulseData> | null | undefined): GuestHotelPulseData {
  if (!data) return { ...EMPTY_DATA };
  return {
    enabled: data.enabled !== false,
    brandName: typeof data.brandName === 'string' && data.brandName.trim() ? data.brandName : EMPTY_DATA.brandName,
    stats: finalizePulseStats(data.stats),
    ops: { ...EMPTY_DATA.ops, ...(data.ops ?? {}) },
    lifetime: { ...EMPTY_DATA.lifetime, ...(data.lifetime ?? {}) },
    manager: { ...EMPTY_DATA.manager, ...(data.manager ?? {}) },
    reception: { ...EMPTY_DATA.reception, ...(data.reception ?? {}) },
    facilities: { ...EMPTY_DATA.facilities, ...(data.facilities ?? {}) },
    todayCheckIns: data.todayCheckIns ?? EMPTY_DATA.todayCheckIns,
    todayCheckOuts: data.todayCheckOuts ?? EMPTY_DATA.todayCheckOuts,
    upcomingCheckOuts: data.upcomingCheckOuts ?? EMPTY_DATA.upcomingCheckOuts,
    lateCheckoutRooms: data.lateCheckoutRooms ?? EMPTY_DATA.lateCheckoutRooms,
    activities: filterGuestPulseActivitiesForGuest(data.activities ?? EMPTY_DATA.activities),
    configUpdatedAt:
      typeof data.configUpdatedAt === 'string' && data.configUpdatedAt.trim() ? data.configUpdatedAt : null,
  };
}

function startOfTodayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function endOfTodayIso(): string {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

function roomNum(g: { rooms: { room_number: string } | { room_number: string }[] | null }): string | null {
  const r = g.rooms;
  if (!r) return null;
  return Array.isArray(r) ? r[0]?.room_number ?? null : r.room_number ?? null;
}

function mapFlowRow(g: Record<string, unknown>): GuestPulseFlowRow {
  return {
    id: String(g.id),
    room_number: roomNum(g as never),
    check_in_at: (g.check_in_at as string | null) ?? null,
    check_out_at: (g.check_out_at as string | null) ?? null,
    status: String(g.status ?? ''),
  };
}

export function parseGuestPulseStaffContact(
  raw: unknown,
  fallbackName: string,
  fallbackRole: string
): GuestPulseStaffContact {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    staffId: typeof r.staffId === 'string' && r.staffId.trim() ? r.staffId : null,
    staffName: typeof r.staffName === 'string' && r.staffName.trim() ? r.staffName : fallbackName,
    roleLabel: typeof r.roleLabel === 'string' && r.roleLabel.trim() ? r.roleLabel : fallbackRole,
    profileImage: typeof r.profileImage === 'string' && r.profileImage.trim() ? r.profileImage : null,
    department: typeof r.department === 'string' && r.department.trim() ? r.department : null,
    shiftLabel: typeof r.shiftLabel === 'string' ? r.shiftLabel : '',
    note: typeof r.note === 'string' ? r.note : '',
    isOnline: r.isOnline === true,
  };
}

export function parseGuestPulseReception(raw: unknown): GuestPulseReception {
  return parseGuestPulseStaffContact(raw, 'Resepsiyon', 'Resepsiyon');
}

export function parseGuestPulseManager(raw: unknown): GuestPulseManager {
  return parseGuestPulseStaffContact(raw, '—', 'Otel Sorumlusu');
}

export function parseGuestPulseFacilities(raw: unknown): GuestPulseFacilities {
  const f = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    boilerLabel: typeof f.boilerLabel === 'string' && f.boilerLabel.trim() ? f.boilerLabel : 'Sıcak su hazır',
    boilerActive: f.boilerActive !== false,
    breakfastHours: typeof f.breakfastHours === 'string' ? f.breakfastHours : '',
    spaLabel: typeof f.spaLabel === 'string' ? f.spaLabel : '',
    wifiStatus: typeof f.wifiStatus === 'string' ? f.wifiStatus : '',
    wifiNetwork: typeof f.wifiNetwork === 'string' && f.wifiNetwork.trim() ? f.wifiNetwork : 'Valoria',
    wifiPassword: typeof f.wifiPassword === 'string' && f.wifiPassword.trim() ? f.wifiPassword : 'valoria!',
    parkingLabel: typeof f.parkingLabel === 'string' ? f.parkingLabel : '',
    elevatorLabel: typeof f.elevatorLabel === 'string' ? f.elevatorLabel : '',
    restaurantLabel: typeof f.restaurantLabel === 'string' ? f.restaurantLabel : '',
    announcementLabel: typeof f.announcementLabel === 'string' ? f.announcementLabel : '',
    weatherLabel: typeof f.weatherLabel === 'string' ? f.weatherLabel : '',
  };
}

function parseRpcPayload(raw: unknown): GuestHotelPulseData {
  if (!raw || typeof raw !== 'object') return EMPTY_DATA;
  const p = raw as Record<string, unknown>;
  const stats = (p.stats as Record<string, number>) ?? {};
  const ops = (p.ops as Record<string, number>) ?? {};
  const lifetime = (p.lifetime as Record<string, number>) ?? {};
  const mapFlow = (rows: unknown): GuestPulseFlowRow[] =>
    Array.isArray(rows)
      ? rows.map((r) => {
          const row = r as Record<string, unknown>;
          return {
            id: String(row.id ?? ''),
            room_number: row.room_number != null ? String(row.room_number) : null,
            check_in_at: (row.check_in_at as string | null) ?? null,
            check_out_at: (row.check_out_at as string | null) ?? null,
            status: String(row.status ?? ''),
          };
        })
      : [];
  const mapActivities = (rows: unknown): GuestPulseActivity[] =>
    Array.isArray(rows)
      ? rows.map((r) => {
          const row = r as Record<string, unknown>;
          return {
            id: String(row.id ?? ''),
            kind: (row.kind as GuestPulseActivityKind) ?? 'info',
            label: String(row.label ?? ''),
            created_at: String(row.created_at ?? ''),
          };
        })
      : [];

  return {
    enabled: p.enabled !== false,
    brandName: typeof p.brandName === 'string' ? p.brandName : 'Valoria',
    stats: finalizePulseStats(stats),
    ops: {
      staffOnline: Number(ops.staffOnline) || 0,
      occupancyPercent: Number(ops.occupancyPercent) || 0,
      roomsReady: Number(ops.roomsReady) || 0,
      breakfastServed: Number(ops.breakfastServed) || 0,
      activeContracts: Number(ops.activeContracts) || 0,
    },
    lifetime: {
      totalGuestsHosted: Number(lifetime.totalGuestsHosted) || 0,
      completedStays: Number(lifetime.completedStays) || 0,
      contractApprovals: Number(lifetime.contractApprovals) || 0,
    },
    todayCheckIns: mapFlow(p.todayCheckIns),
    todayCheckOuts: mapFlow(p.todayCheckOuts),
    upcomingCheckOuts: mapFlow(p.upcomingCheckOuts),
    lateCheckoutRooms: mapFlow(p.lateCheckoutRooms),
    activities: mapActivities(p.activities),
    reception: parseGuestPulseReception(p.reception),
    facilities: parseGuestPulseFacilities(p.facilities),
  };
}

/** RPC yoksa veya hata verirse doğrudan sorgu — temel sayılar */
async function loadGuestHotelPulseDirect(orgScoped: string | null): Promise<GuestHotelPulseData> {
  const todayStart = startOfTodayIso();
  const todayEnd = endOfTodayIso();
  const nowIso = new Date().toISOString();

  const scope = <T extends { eq: (col: string, val: string) => T }>(q: T) =>
    orgScoped ? q.eq('organization_id', orgScoped) : q;

  let roomsTotalQ = supabase.from('rooms').select('id', { count: 'exact', head: true });
  let roomsOccupiedQ = supabase.from('rooms').select('id', { count: 'exact', head: true }).eq('status', 'occupied');
  let roomsReadyQ = supabase.from('rooms').select('id', { count: 'exact', head: true }).eq('status', 'available');
  let inHouseQ = supabase
    .from('guests')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'checked_in')
    .not('room_id', 'is', null);
  let checkInsQ = supabase
    .from('guests')
    .select('id', { count: 'exact', head: true })
    .gte('check_in_at', todayStart)
    .lte('check_in_at', todayEnd);
  let checkOutsQ = supabase
    .from('guests')
    .select('id', { count: 'exact', head: true })
    .gte('check_out_at', todayStart)
    .lte('check_out_at', todayEnd);
  let totalGuestsQ = supabase.from('guests').select('id', { count: 'exact', head: true });
  let completedQ = supabase.from('guests').select('id', { count: 'exact', head: true }).not('check_out_at', 'is', null);
  let staffActiveQ = supabase
    .from('staff')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true)
    .is('deleted_at', null);
  let staffOnlineQ = supabase
    .from('staff')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true)
    .eq('is_online', true)
    .is('deleted_at', null);

  let checkInsListQ = supabase
    .from('guests')
    .select('id, status, check_in_at, check_out_at, rooms(room_number)')
    .gte('check_in_at', todayStart)
    .lte('check_in_at', todayEnd)
    .order('check_in_at', { ascending: false })
    .limit(12);
  let checkOutsListQ = supabase
    .from('guests')
    .select('id, status, check_in_at, check_out_at, rooms(room_number)')
    .gte('check_out_at', todayStart)
    .lte('check_out_at', todayEnd)
    .order('check_out_at', { ascending: false })
    .limit(12);
  let upcomingQ = supabase
    .from('guests')
    .select('id, status, check_in_at, check_out_at, rooms(room_number)')
    .eq('status', 'checked_in')
    .not('check_out_at', 'is', null)
    .gte('check_out_at', todayStart)
    .lte('check_out_at', todayEnd)
    .order('check_out_at', { ascending: true })
    .limit(12);
  let lateQ = supabase
    .from('guests')
    .select('id, status, check_in_at, check_out_at, rooms(room_number)')
    .eq('status', 'checked_in')
    .not('check_out_at', 'is', null)
    .lt('check_out_at', nowIso)
    .order('check_out_at', { ascending: true })
    .limit(8);

  roomsTotalQ = scope(roomsTotalQ);
  roomsOccupiedQ = scope(roomsOccupiedQ);
  roomsReadyQ = scope(roomsReadyQ);
  inHouseQ = scope(inHouseQ);
  checkInsQ = scope(checkInsQ);
  checkOutsQ = scope(checkOutsQ);
  totalGuestsQ = scope(totalGuestsQ);
  completedQ = scope(completedQ);
  staffActiveQ = scope(staffActiveQ);
  staffOnlineQ = scope(staffOnlineQ);
  checkInsListQ = scope(checkInsListQ);
  checkOutsListQ = scope(checkOutsListQ);
  upcomingQ = scope(upcomingQ);
  lateQ = scope(lateQ);

  const [
    roomsTotalRes,
    roomsOccupiedRes,
    roomsReadyRes,
    inHouseRes,
    checkInsRes,
    checkOutsRes,
    totalGuestsRes,
    completedRes,
    staffActiveRes,
    staffOnlineRes,
    checkInsListRes,
    checkOutsListRes,
    upcomingRes,
    lateRes,
  ] = await Promise.all([
    roomsTotalQ,
    roomsOccupiedQ,
    roomsReadyQ,
    inHouseQ,
    checkInsQ,
    checkOutsQ,
    totalGuestsQ,
    completedQ,
    staffActiveQ,
    staffOnlineQ,
    checkInsListQ,
    checkOutsListQ,
    upcomingQ,
    lateQ,
  ]);

  const totalRooms = roomsTotalRes.count ?? 0;
  const occupied = roomsOccupiedRes.count ?? 0;

  const guestsInHouse = inHouseRes.count ?? 0;
  const staffActive = staffActiveRes.count ?? 0;

  const data: GuestHotelPulseData = {
    enabled: true,
    brandName: 'Valoria',
    stats: finalizePulseStats(
      {
        guestsInHouse,
        staffActive,
        occupiedRooms: occupied,
        vacantRooms: Math.max(0, totalRooms - occupied),
        totalRooms,
        checkInsToday: checkInsRes.count ?? 0,
        checkOutsToday: checkOutsRes.count ?? 0,
      },
    ),
    ops: {
      staffOnline: staffOnlineRes.count ?? 0,
      occupancyPercent: totalRooms > 0 ? Math.round((occupied / totalRooms) * 100) : 0,
      roomsReady: roomsReadyRes.count ?? 0,
      breakfastServed: 0,
      activeContracts: 0,
    },
    lifetime: {
      totalGuestsHosted: totalGuestsRes.count ?? 0,
      completedStays: completedRes.count ?? 0,
      contractApprovals: 0,
    },
    todayCheckIns: (checkInsListRes.data ?? []).map((g) => mapFlowRow(g as Record<string, unknown>)),
    todayCheckOuts: (checkOutsListRes.data ?? []).map((g) => mapFlowRow(g as Record<string, unknown>)),
    upcomingCheckOuts: (upcomingRes.data ?? []).map((g) => mapFlowRow(g as Record<string, unknown>)),
    lateCheckoutRooms: (lateRes.data ?? []).map((g) => mapFlowRow(g as Record<string, unknown>)),
    activities: [],
    manager: { ...EMPTY_DATA.manager },
    reception: { ...EMPTY_DATA.reception },
    facilities: { ...EMPTY_DATA.facilities },
  };

  return data;
}

function isReceptionStaff(row: { role?: string | null; department?: string | null }): boolean {
  const role = (row.role ?? '').toLowerCase();
  const dept = (row.department ?? '').toLowerCase().trim();
  return role === 'receptionist' || role === 'reception_chief' || dept === 'reception' || dept === 'resepsiyon';
}

async function loadGuestPulseExtras(
  orgScoped: string | null
): Promise<Pick<GuestHotelPulseData, 'manager' | 'reception' | 'facilities'>> {
  const { data, error } = await supabase.rpc('get_hotel_pulse_guest_extras', {
    p_organization_id: orgScoped,
  });
  if (!error && data) {
    const p = data as Record<string, unknown>;
    return {
      manager: parseGuestPulseManager(p.manager),
      reception: parseGuestPulseReception(p.reception),
      facilities: parseGuestPulseFacilities(p.facilities),
    };
  }

  let q = supabase
    .from('staff')
    .select('full_name, role, department')
    .eq('is_active', true)
    .eq('is_online', true)
    .is('deleted_at', null);
  if (orgScoped) q = q.eq('organization_id', orgScoped);
  const { data: staffRows } = await q;
  const names = (staffRows ?? [])
    .filter((s) => isReceptionStaff(s as { role?: string | null; department?: string | null }))
    .map((s) => (s as { full_name: string | null }).full_name?.trim())
    .filter((n): n is string => !!n)
    .join(', ');

  return {
    manager: { ...EMPTY_DATA.manager },
    reception: {
      staffId: null,
      staffName: names || 'Resepsiyon',
      roleLabel: 'Resepsiyon',
      profileImage: null,
      department: null,
      shiftLabel: '',
      note: '',
      isOnline: !!names,
    },
    facilities: { ...EMPTY_DATA.facilities },
  };
}

export async function loadGuestHotelPulse(
  orgScoped: string | null,
  options?: { force?: boolean }
): Promise<GuestHotelPulseData> {
  if (!options?.force) {
    const hit = getGuestHotelPulseCached(orgScoped, true);
    if (hit && cache && Date.now() - cache.at < CACHE_TTL_MS) return hit;
  }

  const configQ = orgScoped
    ? supabase.from('hotel_pulse_config').select('updated_at, brand_name').eq('organization_id', orgScoped).maybeSingle()
    : Promise.resolve({ data: null, error: null });

  const [{ data, error }, extras, configRes, staffCounts] = await Promise.all([
    supabase.rpc('get_guest_hotel_pulse', { p_organization_id: orgScoped }),
    loadGuestPulseExtras(orgScoped),
    configQ,
    fetchHotelPulseStaffCounts(orgScoped),
  ]);

  const cfgRow = configRes.data as { updated_at?: string | null; brand_name?: string | null } | null;

  let base: GuestHotelPulseData;
  if (!error && data) {
    base = parseRpcPayload(data);
  } else {
    base = await loadGuestHotelPulseDirect(orgScoped);
  }

  const rawStats =
    !error && data && typeof data === 'object' ? ((data as Record<string, unknown>).stats as Record<string, unknown> | undefined) : undefined;
  const rpcHasStaffActive = rawStats != null && 'staffActive' in rawStats;
  const staffActive = rpcHasStaffActive ? base.stats.staffActive : staffCounts.staffActive;

  const merged = normalizeGuestPulseData({
    ...base,
    brandName:
      cfgRow?.brand_name?.trim() ||
      (typeof base.brandName === 'string' && base.brandName.trim() ? base.brandName : undefined),
    stats: finalizePulseStats({
      ...base.stats,
      staffActive,
    }),
    ops: {
      ...base.ops,
      staffOnline: base.ops.staffOnline > 0 ? base.ops.staffOnline : staffCounts.staffOnline,
    },
    manager: extras.manager,
    reception: extras.reception,
    facilities: extras.facilities,
    configUpdatedAt: cfgRow?.updated_at ?? null,
  });
  setGuestHotelPulseCached(orgScoped, merged);
  return merged;
}
