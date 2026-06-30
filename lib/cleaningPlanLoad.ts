import { supabase } from '@/lib/supabase';
import { localDateIso, localTomorrowIso } from '@/lib/localDateIso';

export type CleaningAssignmentRow = {
  id: string;
  plan_id: string;
  staff_note: string | null;
  viewed_at: string | null;
  completed_at: string | null;
  completion_checklist: Record<string, boolean> | null;
};

export type CleaningPlanRow = {
  id: string;
  target_date: string;
  note: string | null;
  created_at: string;
};

export type CleaningPlanRoomRow = {
  id: string;
  plan_id: string;
  room_id: string;
  note: string | null;
  is_done: boolean;
  done_at: string | null;
  done_by_staff_id?: string | null;
  sort_order?: number;
};

export type CleaningRoomMeta = {
  room_number: string;
  floor: number | null;
};

export type CleaningPlanBundle = {
  assignments: CleaningAssignmentRow[];
  plansById: Record<string, CleaningPlanRow>;
  planRoomsByPlanId: Record<string, CleaningPlanRoomRow[]>;
  roomMetaByRoomId: Record<string, CleaningRoomMeta>;
  /** Plana atanan TÜM temizlikçilerin adları (kendisi dahil) — "bu odaları kimler temizleyecek". */
  staffNamesByPlanId: Record<string, string[]>;
};

type PlanRoomDbRow = CleaningPlanRoomRow & {
  rooms?: { room_number: string; floor: number | null } | { room_number: string; floor: number | null }[] | null;
};

/** Görüldü işaretini arka planda günceller — UI bekletmez. */
export function markCleaningAssignmentsViewed(assignmentIds: string[]): void {
  if (assignmentIds.length === 0) return;
  void supabase
    .from('room_cleaning_plan_assignments')
    .update({ viewed_at: new Date().toISOString() })
    .in('id', assignmentIds);
}

export async function fetchStaffCleaningPlanBundle(staffId: string): Promise<CleaningPlanBundle | null> {
  let aRes = await supabase
    .from('room_cleaning_plan_assignments')
    .select('id, plan_id, staff_note, viewed_at, completed_at, completion_checklist')
    .eq('staff_id', staffId)
    .order('id', { ascending: false });

  if (aRes.error) {
    aRes = await supabase
      .from('room_cleaning_plan_assignments')
      .select('id, plan_id, staff_note, viewed_at, completed_at')
      .eq('staff_id', staffId)
      .order('id', { ascending: false });
  }

  if (aRes.error) return null;
  const aData = aRes.data;

  const assignmentRows = (aData as CleaningAssignmentRow[] | null) ?? [];
  const planIds = [...new Set(assignmentRows.map((a) => a.plan_id))];

  if (planIds.length === 0) {
    return {
      assignments: assignmentRows,
      plansById: {},
      planRoomsByPlanId: {},
      roomMetaByRoomId: {},
      staffNamesByPlanId: {},
    };
  }

  const staffNamesByPlanId = await fetchAssigneeNamesByPlanId(planIds);

  const plansRes = await supabase
    .from('room_cleaning_plans')
    .select('id, target_date, note, created_at')
    .in('id', planIds);

  let prRes = await supabase
    .from('room_cleaning_plan_rooms')
    .select('id, plan_id, room_id, note, is_done, done_at, done_by_staff_id, sort_order, rooms(room_number, floor)')
    .in('plan_id', planIds)
    .order('sort_order');

  if (prRes.error) {
    prRes = await supabase
      .from('room_cleaning_plan_rooms')
      .select('id, plan_id, room_id, note, is_done, done_at, done_by_staff_id, sort_order')
      .in('plan_id', planIds)
      .order('sort_order');
  }

  const pData = plansRes.data;
  const prData = prRes.data;

  const plans = (pData as CleaningPlanRow[] | null) ?? [];
  const planRoomsRaw = (prData as PlanRoomDbRow[] | null) ?? [];
  const roomMetaByRoomId: Record<string, CleaningRoomMeta> = {};

  const planRooms: CleaningPlanRoomRow[] = planRoomsRaw.map((row) => {
    const rel = row.rooms;
    const room = Array.isArray(rel) ? rel[0] : rel;
    if (room?.room_number) {
      roomMetaByRoomId[row.room_id] = {
        room_number: room.room_number,
        floor: room.floor ?? null,
      };
    }
    const { rooms: _r, ...rest } = row;
    return rest;
  });

  const missingRoomIds = [...new Set(planRooms.map((r) => r.room_id).filter((id) => !roomMetaByRoomId[id]))];
  if (missingRoomIds.length > 0) {
    const { data: roomsData } = await supabase
      .from('rooms')
      .select('id, room_number, floor')
      .in('id', missingRoomIds);
    ((roomsData as { id: string; room_number: string; floor: number | null }[] | null) ?? []).forEach((r) => {
      roomMetaByRoomId[r.id] = { room_number: r.room_number, floor: r.floor };
    });
  }

  const grouped: Record<string, CleaningPlanRoomRow[]> = {};
  planRooms.forEach((r) => {
    if (!grouped[r.plan_id]) grouped[r.plan_id] = [];
    grouped[r.plan_id].push(r);
  });

  const notViewedIds = assignmentRows.filter((a) => !a.viewed_at).map((a) => a.id);
  markCleaningAssignmentsViewed(notViewedIds);

  return {
    assignments: assignmentRows,
    plansById: Object.fromEntries(plans.map((p) => [p.id, p])),
    planRoomsByPlanId: grouped,
    roomMetaByRoomId,
    staffNamesByPlanId,
  };
}

/** Her plan için atanan tüm temizlikçi adlarını döner (UI'da "kimler temizleyecek"). */
async function fetchAssigneeNamesByPlanId(planIds: string[]): Promise<Record<string, string[]>> {
  const result: Record<string, string[]> = {};
  const { data: assigns, error } = await supabase
    .from('room_cleaning_plan_assignments')
    .select('plan_id, staff_id')
    .in('plan_id', planIds);
  if (error || !assigns) return result;

  const rows = assigns as { plan_id: string; staff_id: string }[];
  const staffIds = [...new Set(rows.map((r) => r.staff_id).filter(Boolean))];
  if (staffIds.length === 0) return result;

  const { data: staffRows } = await supabase
    .from('staff')
    .select('id, full_name')
    .in('id', staffIds);
  const nameById = new Map(
    ((staffRows as { id: string; full_name: string | null }[] | null) ?? []).map((s) => [
      s.id,
      (s.full_name || '').trim() || 'İsimsiz',
    ])
  );

  for (const r of rows) {
    const name = nameById.get(r.staff_id);
    if (!name) continue;
    if (!result[r.plan_id]) result[r.plan_id] = [];
    if (!result[r.plan_id].includes(name)) result[r.plan_id].push(name);
  }
  for (const id of Object.keys(result)) {
    result[id].sort((a, b) => a.localeCompare(b, 'tr'));
  }
  return result;
}

export function sortCleaningRoomsForDisplay(
  rooms: CleaningPlanRoomRow[],
  roomMetaByRoomId: Record<string, CleaningRoomMeta>
): CleaningPlanRoomRow[] {
  return [...rooms].sort((a, b) => {
    const fa = roomMetaByRoomId[a.room_id]?.floor;
    const fb = roomMetaByRoomId[b.room_id]?.floor;
    if (fa != null && fb != null && fa !== fb) return fa - fb;
    if (fa != null && fb == null) return -1;
    if (fa == null && fb != null) return 1;
    const na = roomMetaByRoomId[a.room_id]?.room_number ?? '';
    const nb = roomMetaByRoomId[b.room_id]?.room_number ?? '';
    return na.localeCompare(nb, undefined, { numeric: true });
  });
}

export function groupCleaningRoomsByFloor(
  rooms: CleaningPlanRoomRow[],
  roomMetaByRoomId: Record<string, CleaningRoomMeta>
): { floorLabel: string; floor: number | null; rooms: CleaningPlanRoomRow[] }[] {
  const sorted = sortCleaningRoomsForDisplay(rooms, roomMetaByRoomId);
  const groups: { floor: number | null; rooms: CleaningPlanRoomRow[] }[] = [];
  for (const room of sorted) {
    const floor = roomMetaByRoomId[room.room_id]?.floor ?? null;
    const last = groups[groups.length - 1];
    if (last && last.floor === floor) last.rooms.push(room);
    else groups.push({ floor, rooms: [room] });
  }
  return groups.map((g) => ({
    ...g,
    floorLabel: g.floor != null ? String(g.floor) : '?',
  }));
}

export type PlanDateHighlight = 'today' | 'tomorrow' | 'other';

export function getPlanDateHighlight(targetDateIso: string): PlanDateHighlight {
  const todayIso = localDateIso();
  const tomorrowIso = localTomorrowIso();
  if (targetDateIso === todayIso) return 'today';
  if (targetDateIso === tomorrowIso) return 'tomorrow';
  return 'other';
}
