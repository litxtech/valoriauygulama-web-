import { supabase } from '@/lib/supabase';
import { formatTime } from '@/lib/date';
import { getOccupancyCached, occupancyCacheKey, setOccupancyCached } from '@/lib/occupancyCache';

export type DailyReportRow = {
  id: string;
  full_name: string;
  room_number: string;
  at: string;
};

export type DailyOccupancyReport = {
  date: string;
  totalRooms: number;
  occupiedRooms: number;
  availableRooms: number;
  occupancyPct: number;
  checkInCount: number;
  checkOutCount: number;
  checkIns: DailyReportRow[];
  checkOuts: DailyReportRow[];
};

const TTL_MS = 120_000;

export async function loadDailyOccupancyReport(
  date: string,
  orgScoped: string | null,
  options?: { force?: boolean }
): Promise<DailyOccupancyReport> {
  const cacheKey = occupancyCacheKey(['daily', orgScoped, date]);
  if (!options?.force) {
    const cached = getOccupancyCached<DailyOccupancyReport>(cacheKey, TTL_MS);
    if (cached) return cached;
  }

  const dayStart = `${date}T00:00:00.000Z`;
  const dayEnd = `${date}T23:59:59.999Z`;

  let roomsQuery = supabase.from('rooms').select('id', { count: 'exact', head: true });
  let occupiedQuery = supabase.from('rooms').select('id', { count: 'exact', head: true }).eq('status', 'occupied');
  let checkInsQuery = supabase
    .from('guests')
    .select('id, full_name, check_in_at, rooms(room_number)')
    .not('check_in_at', 'is', null)
    .gte('check_in_at', dayStart)
    .lte('check_in_at', dayEnd);
  let checkOutsQuery = supabase
    .from('guests')
    .select('id, full_name, check_out_at, rooms(room_number)')
    .not('check_out_at', 'is', null)
    .gte('check_out_at', dayStart)
    .lte('check_out_at', dayEnd);

  if (orgScoped) {
    roomsQuery = roomsQuery.eq('organization_id', orgScoped);
    occupiedQuery = occupiedQuery.eq('organization_id', orgScoped);
    checkInsQuery = checkInsQuery.eq('organization_id', orgScoped);
    checkOutsQuery = checkOutsQuery.eq('organization_id', orgScoped);
  }

  const [roomsRes, occupiedRes, checkInsRes, checkOutsRes] = await Promise.all([
    roomsQuery,
    occupiedQuery,
    checkInsQuery,
    checkOutsQuery,
  ]);

  const totalRooms = roomsRes.count ?? 0;
  const occupiedRooms = occupiedRes.count ?? 0;

  const mapRow = (
    g: { id: string; full_name: string; rooms: { room_number: string } | { room_number: string }[] | null },
    timeField: 'check_in_at' | 'check_out_at',
    raw: string
  ): DailyReportRow => ({
    id: g.id,
    full_name: g.full_name,
    room_number: (Array.isArray(g.rooms) ? g.rooms[0]?.room_number : g.rooms?.room_number) ?? '—',
    at: formatTime(raw),
  });

  const checkIns = (checkInsRes.data ?? []).map((g) =>
    mapRow(g as never, 'check_in_at', (g as { check_in_at: string }).check_in_at)
  );
  const checkOuts = (checkOutsRes.data ?? []).map((g) =>
    mapRow(g as never, 'check_out_at', (g as { check_out_at: string }).check_out_at)
  );

  const report: DailyOccupancyReport = {
    date,
    totalRooms,
    occupiedRooms,
    availableRooms: Math.max(0, totalRooms - occupiedRooms),
    occupancyPct: totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0,
    checkInCount: checkIns.length,
    checkOutCount: checkOuts.length,
    checkIns,
    checkOuts,
  };

  setOccupancyCached(cacheKey, report);
  return report;
}
