import { supabase } from '@/lib/supabase';
import type { MapUserMarker } from '@/lib/map/types';

/** Haritada gösterilecek son GPS penceresi (admin: daha geniş aralık). */
export const ADMIN_TRACKING_ACTIVE_MS = 24 * 60 * 60 * 1000;
/** Bu süreden yeni güncelleme = "canlı" rozeti. */
export const ADMIN_TRACKING_LIVE_MS = 2 * 60 * 1000;

const ACTIVE_WITHIN_MS = ADMIN_TRACKING_ACTIVE_MS;

export function isAdminTrackingLive(updatedAt: string): boolean {
  return Date.now() - new Date(updatedAt).getTime() < ADMIN_TRACKING_LIVE_MS;
}

export type AdminTrackedPerson = {
  id: string;
  userType: 'guest' | 'staff';
  lat: number;
  lng: number;
  displayName: string | null;
  avatarUrl: string | null;
  updatedAt: string;
  /** map_user_locations GPS — avatar hareket eder */
  isLiveGps: boolean;
  department: string | null;
  role: string | null;
  roomNumber: string | null;
  isOnline: boolean | null;
  workStatus: string | null;
  organizationId: string | null;
};

export type AdminOnlineStaffRow = {
  id: string;
  full_name: string | null;
  profile_image: string | null;
  department: string | null;
  role: string | null;
  is_online: boolean | null;
  work_status: string | null;
  last_active: string | null;
  organization_id: string | null;
};

export type AdminLiveTrackingSnapshot = {
  onMap: AdminTrackedPerson[];
  onlineStaff: AdminOnlineStaffRow[];
  counts: {
    staffOnMap: number;
    guestOnMap: number;
    staffOnline: number;
    totalOnMap: number;
  };
};

type MapLocationRow = {
  id: string;
  user_id: string;
  user_type: 'guest' | 'staff';
  lat: number;
  lng: number;
  display_name: string | null;
  avatar_url: string | null;
  updated_at: string;
};

function matchesOrg(orgScoped: string | null, organizationId: string | null | undefined): boolean {
  if (!orgScoped) return true;
  return organizationId === orgScoped;
}

export function adminTrackedPersonToMapMarker(person: AdminTrackedPerson): MapUserMarker {
  return {
    id: `${person.userType}-${person.id}`,
    userId: person.id,
    lat: person.lat,
    lng: person.lng,
    displayName: person.displayName,
    avatarUrl: person.avatarUrl,
    userType: person.userType,
    isLiveGps: person.isLiveGps,
    updatedAt: person.updatedAt,
  };
}

const DEFAULT_HOTEL_LAT =
  typeof process !== 'undefined' && process.env.EXPO_PUBLIC_HOTEL_LAT != null
    ? Number(process.env.EXPO_PUBLIC_HOTEL_LAT)
    : 40.6144;
const DEFAULT_HOTEL_LNG =
  typeof process !== 'undefined' && process.env.EXPO_PUBLIC_HOTEL_LON != null
    ? Number(process.env.EXPO_PUBLIC_HOTEL_LON)
    : 40.31188;

function hotelFallbackCoords(id: string, baseLat: number, baseLng: number): { lat: number; lng: number } {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  const angle = (Math.abs(hash) % 360) * (Math.PI / 180);
  const radius = 0.00025 + (Math.abs(hash >> 8) % 80) / 400000;
  return {
    lat: baseLat + radius * Math.cos(angle),
    lng: baseLng + radius * Math.sin(angle),
  };
}

export async function fetchAdminLiveTracking(
  orgScoped: string | null,
  options?: { hotelLat?: number; hotelLng?: number },
): Promise<{ snapshot: AdminLiveTrackingSnapshot; error?: string }> {
  const hotelLat = Number.isFinite(options?.hotelLat) ? (options!.hotelLat as number) : DEFAULT_HOTEL_LAT;
  const hotelLng = Number.isFinite(options?.hotelLng) ? (options!.hotelLng as number) : DEFAULT_HOTEL_LNG;
  const cutoff = new Date(Date.now() - ACTIVE_WITHIN_MS).toISOString();

  let onlineQuery = supabase
    .from('staff')
    .select(
      'id, full_name, profile_image, department, role, is_online, work_status, last_active, organization_id'
    )
    .eq('is_active', true)
    .eq('is_online', true)
    .order('last_active', { ascending: false, nullsFirst: false })
    .order('full_name')
    .limit(200);

  if (orgScoped) {
    onlineQuery = onlineQuery.eq('organization_id', orgScoped);
  }

  const [locRes, onlineRes] = await Promise.all([
    supabase
      .from('map_user_locations')
      .select('id, user_id, user_type, lat, lng, display_name, avatar_url, updated_at')
      .gte('updated_at', cutoff)
      .order('updated_at', { ascending: false })
      .limit(500),
    onlineQuery,
  ]);

  if (locRes.error) {
    return {
      snapshot: { onMap: [], onlineStaff: [], counts: { staffOnMap: 0, guestOnMap: 0, staffOnline: 0, totalOnMap: 0 } },
      error: locRes.error.message,
    };
  }

  let locations = (locRes.data ?? []) as MapLocationRow[];
  const onlineStaff = ((onlineRes.data ?? []) as AdminOnlineStaffRow[]).filter((row) =>
    matchesOrg(orgScoped, row.organization_id)
  );

  const staffIds = [...new Set(locations.filter((l) => l.user_type === 'staff').map((l) => l.user_id))];
  const guestIds = [...new Set(locations.filter((l) => l.user_type === 'guest').map((l) => l.user_id))];

  let staffQuery = staffIds.length
    ? supabase
        .from('staff')
        .select(
          'id, full_name, profile_image, department, role, is_online, work_status, organization_id'
        )
        .in('id', staffIds)
    : null;
  let guestQuery = guestIds.length
    ? supabase
        .from('guests')
        .select('id, full_name, photo_url, organization_id, room_id, rooms(room_number)')
        .in('id', guestIds)
    : null;
  if (orgScoped && staffQuery) {
    staffQuery = staffQuery.eq('organization_id', orgScoped);
  }
  if (orgScoped && guestQuery) {
    guestQuery = guestQuery.eq('organization_id', orgScoped);
  }

  const [staffDetailsRes, guestDetailsRes] = await Promise.all([
    staffQuery ?? Promise.resolve({ data: [], error: null }),
    guestQuery ?? Promise.resolve({ data: [], error: null }),
  ]);

  const staffById = new Map(
    ((staffDetailsRes.data ?? []) as {
      id: string;
      full_name: string | null;
      profile_image: string | null;
      department: string | null;
      role: string | null;
      is_online: boolean | null;
      work_status: string | null;
      organization_id: string | null;
    }[]).map((row) => [row.id, row])
  );

  type GuestDetailRow = {
    id: string;
    full_name: string | null;
    photo_url: string | null;
    organization_id: string | null;
    room_id: string | null;
    rooms: { room_number: string | null } | { room_number: string | null }[] | null;
  };

  const guestById = new Map(
    ((guestDetailsRes.data ?? []) as GuestDetailRow[]).map((row) => [row.id, row]),
  );

  const guestRoomNumber = (guest: GuestDetailRow): string | null => {
    const rooms = guest.rooms;
    if (Array.isArray(rooms)) return rooms[0]?.room_number ?? null;
    return rooms?.room_number ?? null;
  };

  const onMap: AdminTrackedPerson[] = [];
  const onMapKeys = new Set<string>();

  for (const loc of locations) {
    if (loc.user_type === 'staff') {
      const staff = staffById.get(loc.user_id);
      if (!staff || !matchesOrg(orgScoped, staff.organization_id)) continue;
      onMap.push({
        id: loc.user_id,
        userType: 'staff',
        lat: Number(loc.lat),
        lng: Number(loc.lng),
        displayName: staff.full_name ?? loc.display_name,
        avatarUrl: staff.profile_image ?? loc.avatar_url,
        updatedAt: loc.updated_at,
        isLiveGps: true,
        department: staff.department,
        role: staff.role,
        roomNumber: null,
        isOnline: staff.is_online,
        workStatus: staff.work_status,
        organizationId: staff.organization_id,
      });
      onMapKeys.add(`staff:${loc.user_id}`);
      continue;
    }

    const guest = guestById.get(loc.user_id);
    if (!guest || !matchesOrg(orgScoped, guest.organization_id)) continue;
    onMap.push({
      id: loc.user_id,
      userType: 'guest',
      lat: Number(loc.lat),
      lng: Number(loc.lng),
      displayName: guest.full_name ?? loc.display_name,
      avatarUrl: guest.photo_url ?? loc.avatar_url,
      updatedAt: loc.updated_at,
      isLiveGps: true,
      department: null,
      role: null,
      roomNumber: guestRoomNumber(guest),
      isOnline: null,
      workStatus: null,
      organizationId: guest.organization_id,
    });
    onMapKeys.add(`guest:${loc.user_id}`);
  }

  let allStaffQuery = supabase
    .from('staff')
    .select('id, full_name, profile_image, department, role, is_online, work_status, organization_id')
    .eq('is_active', true)
    .is('deleted_at', null)
    .limit(500);
  let allGuestsQuery = supabase
    .from('guests')
    .select('id, full_name, photo_url, organization_id, room_id, status, rooms(room_number)')
    .eq('status', 'checked_in')
    .is('deleted_at', null)
    .limit(500);

  if (orgScoped) {
    allStaffQuery = allStaffQuery.eq('organization_id', orgScoped);
    allGuestsQuery = allGuestsQuery.eq('organization_id', orgScoped);
  }

  const [allStaffRes, allGuestsRes] = await Promise.all([allStaffQuery, allGuestsQuery]);
  const fallbackUpdatedAt = new Date().toISOString();

  for (const row of (allStaffRes.data ?? []) as {
    id: string;
    full_name: string | null;
    profile_image: string | null;
    department: string | null;
    role: string | null;
    is_online: boolean | null;
    work_status: string | null;
    organization_id: string | null;
  }[]) {
    if (!matchesOrg(orgScoped, row.organization_id)) continue;
    if (onMapKeys.has(`staff:${row.id}`)) continue;
    const coords = hotelFallbackCoords(row.id, hotelLat, hotelLng);
    onMap.push({
      id: row.id,
      userType: 'staff',
      lat: coords.lat,
      lng: coords.lng,
      displayName: row.full_name,
      avatarUrl: row.profile_image,
      updatedAt: fallbackUpdatedAt,
      isLiveGps: false,
      department: row.department,
      role: row.role,
      roomNumber: null,
      isOnline: row.is_online,
      workStatus: row.work_status,
      organizationId: row.organization_id,
    });
    onMapKeys.add(`staff:${row.id}`);
  }

  for (const row of (allGuestsRes.data ?? []) as GuestDetailRow[]) {
    if (!matchesOrg(orgScoped, row.organization_id)) continue;
    if (onMapKeys.has(`guest:${row.id}`)) continue;
    const coords = hotelFallbackCoords(row.id, hotelLat, hotelLng);
    onMap.push({
      id: row.id,
      userType: 'guest',
      lat: coords.lat,
      lng: coords.lng,
      displayName: row.full_name,
      avatarUrl: row.photo_url,
      updatedAt: fallbackUpdatedAt,
      isLiveGps: false,
      department: null,
      role: null,
      roomNumber: guestRoomNumber(row),
      isOnline: null,
      workStatus: null,
      organizationId: row.organization_id,
    });
    onMapKeys.add(`guest:${row.id}`);
  }

  onMap.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  const staffOnMap = onMap.filter((p) => p.userType === 'staff').length;
  const guestOnMap = onMap.filter((p) => p.userType === 'guest').length;

  return {
    snapshot: {
      onMap,
      onlineStaff,
      counts: {
        staffOnMap,
        guestOnMap,
        staffOnline: onlineStaff.length,
        totalOnMap: onMap.length,
      },
    },
  };
}

export function formatTrackingAge(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'Az önce';
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins} dk önce`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} sa önce`;
  return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}
