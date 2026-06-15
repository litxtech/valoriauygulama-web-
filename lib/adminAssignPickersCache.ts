import { supabase } from '@/lib/supabase';
import { sortStaffAdminFirst } from '@/lib/sortStaffAdminFirst';
import { getAdminRoomsListCache } from '@/lib/adminRoomsListCache';

export type AssignStaffRow = {
  id: string;
  full_name: string | null;
  role: string | null;
  department: string | null;
};

export type AssignRoomRow = { id: string; room_number: string; floor: number | null };

const TTL_MS = 120_000;

let staffEntry: { rows: AssignStaffRow[]; at: number } | null = null;
let roomsEntry: { rows: AssignRoomRow[]; at: number } | null = null;
let prefetchInFlight: Promise<void> | null = null;

function fresh(at: number): boolean {
  return Date.now() - at <= TTL_MS;
}

export function getCachedAssignStaff(allowStale = true): AssignStaffRow[] | null {
  if (!staffEntry) return null;
  if (!allowStale && !fresh(staffEntry.at)) return null;
  return staffEntry.rows;
}

export function getCachedAssignRooms(allowStale = true): AssignRoomRow[] | null {
  const fromAssign = roomsEntry && (allowStale || fresh(roomsEntry.at)) ? roomsEntry.rows : null;
  if (fromAssign?.length) return fromAssign;
  const fromAdminRooms = getAdminRoomsListCache(allowStale);
  if (!fromAdminRooms?.length) return null;
  return fromAdminRooms.map((r) => ({
    id: r.id,
    room_number: r.room_number,
    floor: r.floor,
  }));
}

function setStaffCache(rows: AssignStaffRow[]): void {
  staffEntry = { rows, at: Date.now() };
}

function setRoomsCache(rows: AssignRoomRow[]): void {
  roomsEntry = { rows, at: Date.now() };
}

async function fetchStaff(): Promise<AssignStaffRow[]> {
  const { data } = await supabase
    .from('staff')
    .select('id, full_name, role, department')
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('full_name');
  const rows = sortStaffAdminFirst((data as AssignStaffRow[]) ?? [], (a, b) =>
    (a.full_name || '').localeCompare(b.full_name || '', 'tr')
  );
  setStaffCache(rows);
  return rows;
}

async function fetchRooms(): Promise<AssignRoomRow[]> {
  const { data } = await supabase
    .from('rooms')
    .select('id, room_number, floor')
    .order('floor', { ascending: true })
    .order('room_number');
  const rows = (data as AssignRoomRow[]) ?? [];
  setRoomsCache(rows);
  return rows;
}

/** Warm assign pickers while user is on görev listesi (or before navigation). */
export function prefetchAdminAssignPickers(): void {
  if (prefetchInFlight) return;
  const staffStale = !staffEntry || !fresh(staffEntry.at);
  const roomsStale = !roomsEntry || !fresh(roomsEntry.at);
  if (!staffStale && !roomsStale) return;
  prefetchInFlight = (async () => {
    try {
      await Promise.all([
        staffStale ? fetchStaff() : Promise.resolve(),
        roomsStale ? fetchRooms() : Promise.resolve(),
      ]);
    } finally {
      prefetchInFlight = null;
    }
  })();
}

export async function loadAssignStaff(force = false): Promise<AssignStaffRow[]> {
  if (!force) {
    const hit = getCachedAssignStaff(true);
    if (hit?.length) return hit;
  }
  return fetchStaff();
}

export async function loadAssignRooms(force = false): Promise<AssignRoomRow[]> {
  if (!force) {
    const hit = getCachedAssignRooms(true);
    if (hit?.length) return hit;
  }
  return fetchRooms();
}
