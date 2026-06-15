export type AdminRoomListRow = {
  id: string;
  room_number: string;
  floor: number | null;
  status: string;
  view_type: string | null;
  bed_type: string | null;
  price_per_night: number | null;
  previewSignerName?: string | null;
  liveGuests?: string[];
};

const TTL_MS = 90_000;
export const ADMIN_ROOMS_FOCUS_REFRESH_MS = 45_000;

let entry: { rooms: AdminRoomListRow[]; at: number } | null = null;

export function getAdminRoomsListCache(allowStale = false): AdminRoomListRow[] | null {
  if (!entry) return null;
  if (!allowStale && Date.now() - entry.at > TTL_MS) return null;
  return entry.rooms;
}

export function setAdminRoomsListCache(rooms: AdminRoomListRow[]): void {
  entry = { rooms, at: Date.now() };
}

export function getAdminRoomsListCacheAgeMs(): number | null {
  if (!entry) return null;
  return Date.now() - entry.at;
}

export function invalidateAdminRoomsListCache(): void {
  entry = null;
}
