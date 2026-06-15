import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  type HotelLiveMetrics,
  hotelLiveMetricsCacheKey,
  getHotelLiveMetricsCache,
  setHotelLiveMetricsCache,
  getHotelLiveMetricsCacheAgeMs,
  HOTEL_LIVE_METRICS_FOCUS_REFRESH_MS,
} from '@/lib/hotelLiveMetricsCache';
import { ADMIN_HOME_METRICS_POLL_MS } from '@/lib/adminHomePerf';
import { useAdminOrganizationQueryScope } from '@/hooks/useAdminOrganizationQueryScope';
import {
  adminDashboardCacheKey,
  getAdminDashboardCache,
  shouldSkipAdminDashboardNetwork,
} from '@/lib/adminDashboardCache';

export type { HotelLiveMetrics } from '@/lib/hotelLiveMetricsCache';

const EMPTY: HotelLiveMetrics = {
  activeStaff: 0,
  occupancyPercent: 0,
  pendingTasks: 0,
  checkInsToday: 0,
  checkOutsToday: 0,
  vacantRooms: 0,
  emergencyActive: 0,
  weatherLabel: '—',
  loading: true,
};

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

export function useHotelLiveMetrics(refreshKey = 0): HotelLiveMetrics {
  const { staff, orgScoped, canUseAll } = useAdminOrganizationQueryScope();
  const orgId = orgScoped ?? staff?.organization_id ?? null;
  const cacheKey = orgId ? hotelLiveMetricsCacheKey(orgId) : '';
  const cached = orgId ? getHotelLiveMetricsCache(cacheKey, true) : null;

  const [metrics, setMetrics] = useState<HotelLiveMetrics>(cached ?? EMPTY);
  const inFlight = useRef(false);

  const load = useCallback(
    async (force = false) => {
      if (!orgId || inFlight.current) return;
      const key = hotelLiveMetricsCacheKey(orgId);
      if (!force) {
        const hit = getHotelLiveMetricsCache(key, true);
        const age = getHotelLiveMetricsCacheAgeMs(key);
        if (hit && age != null && age < HOTEL_LIVE_METRICS_FOCUS_REFRESH_MS) {
          setMetrics(hit);
          return;
        }
      }

      const dashKey =
        staff?.id != null
          ? adminDashboardCacheKey(staff.id, canUseAll, orgScoped)
          : '';
      const dashStats = dashKey ? getAdminDashboardCache(dashKey, true) : null;
      const reuseDashCounts = !force && dashKey && shouldSkipAdminDashboardNetwork(dashKey) && !!dashStats;

      inFlight.current = true;
      const todayStart = startOfTodayIso();
      const todayEnd = endOfTodayIso();

      try {
        const { data: orgStaffRows } = await supabase
          .from('staff')
          .select('id')
          .eq('organization_id', orgId)
          .eq('is_active', true);
        const orgStaffIds = (orgStaffRows ?? []).map((r: { id: string }) => r.id);

        let tasksQuery = supabase
          .from('staff_assignments')
          .select('id', { count: 'exact', head: true })
          .in('status', ['pending', 'in_progress']);
        if (orgStaffIds.length > 0) {
          tasksQuery = tasksQuery.in('assigned_staff_id', orgStaffIds);
        }

        const checkInQuery = supabase
          .from('guests')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .gte('check_in_at', todayStart)
          .lte('check_in_at', todayEnd);
        const checkOutQuery = supabase
          .from('guests')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .gte('check_out_at', todayStart)
          .lte('check_out_at', todayEnd);

        let pendingTasks = 0;
        let checkInsToday = 0;
        let checkOutsToday = 0;
        let roomsTotal = dashStats?.roomsTotal ?? 0;
        let roomsOccupied = dashStats?.roomsOccupied ?? 0;
        let staffOnline = dashStats?.staffActive ?? 0;

        if (reuseDashCounts && dashStats) {
          const [tasksResult, checkInResult, checkOutResult] = await Promise.all([
            tasksQuery,
            checkInQuery,
            checkOutQuery,
          ]);
          pendingTasks = tasksResult.count ?? 0;
          checkInsToday = checkInResult.count ?? 0;
          checkOutsToday = checkOutResult.count ?? 0;
        } else {
          const [
            roomsTotalRes,
            roomsOccupiedRes,
            staffOnlineRes,
            tasksResult,
            checkInResult,
            checkOutResult,
          ] = await Promise.all([
            supabase.from('rooms').select('id', { count: 'exact', head: true }).eq('organization_id', orgId),
            supabase
              .from('rooms')
              .select('id', { count: 'exact', head: true })
              .eq('organization_id', orgId)
              .eq('status', 'occupied'),
            supabase
              .from('staff')
              .select('id', { count: 'exact', head: true })
              .eq('organization_id', orgId)
              .eq('is_active', true)
              .eq('is_online', true),
            tasksQuery,
            checkInQuery,
            checkOutQuery,
          ]);
          roomsTotal = roomsTotalRes.count ?? 0;
          roomsOccupied = roomsOccupiedRes.count ?? 0;
          staffOnline = staffOnlineRes.count ?? 0;
          tasksRes = tasksResult;
          checkInRes = checkInResult;
          checkOutRes = checkOutResult;
        }

        const pct = roomsTotal > 0 ? Math.round((roomsOccupied / roomsTotal) * 100) : 0;

        const next: HotelLiveMetrics = {
          activeStaff: staffOnline,
          occupancyPercent: pct,
          pendingTasks,
          checkInsToday,
          checkOutsToday,
          vacantRooms: Math.max(0, roomsTotal - roomsOccupied),
          emergencyActive: 0,
          weatherLabel: 'Trabzon 18°',
          loading: false,
        };
        setHotelLiveMetricsCache(key, next);
        setMetrics((prev) => {
          if (
            prev.loading === next.loading &&
            prev.activeStaff === next.activeStaff &&
            prev.occupancyPercent === next.occupancyPercent &&
            prev.pendingTasks === next.pendingTasks &&
            prev.checkInsToday === next.checkInsToday &&
            prev.checkOutsToday === next.checkOutsToday &&
            prev.vacantRooms === next.vacantRooms &&
            prev.emergencyActive === next.emergencyActive &&
            prev.weatherLabel === next.weatherLabel
          ) {
            return prev;
          }
          return next;
        });
      } catch {
        setMetrics((m) => ({ ...m, loading: false }));
      } finally {
        inFlight.current = false;
      }
    },
    [canUseAll, orgId, orgScoped, staff?.id]
  );

  useEffect(() => {
    if (!orgId) return;
    void load(refreshKey !== 0);
    const id = setInterval(() => void load(false), ADMIN_HOME_METRICS_POLL_MS);
    return () => clearInterval(id);
  }, [load, orgId, refreshKey]);

  return metrics;
}
