import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  adminTrackedPersonToMapMarker,
  fetchAdminLiveTracking,
  type AdminLiveTrackingSnapshot,
  type AdminTrackedPerson,
} from '@/lib/map/adminLiveTracking';
import { subscribeMapUserLocations } from '@/lib/map/subscribeMapUserLocations';
import { useAdminOrganizationQueryScope } from '@/hooks/useAdminOrganizationQueryScope';
import type { MapUserMarker } from '@/lib/map/types';

const EMPTY: AdminLiveTrackingSnapshot = {
  onMap: [],
  onlineStaff: [],
  counts: { staffOnMap: 0, guestOnMap: 0, staffOnline: 0, totalOnMap: 0 },
};

const POLL_FOCUSED_MS = 5_000;
const POLL_BACKGROUND_MS = 12_000;
const REALTIME_DEBOUNCE_MS = 120;

export type AdminLiveTrackingFilter = 'all' | 'staff' | 'guest';

export function useAdminLiveTrackingMap(
  refreshKey = 0,
  filter: AdminLiveTrackingFilter = 'all',
  enabled = true
) {
  const { orgScoped, canQuery } = useAdminOrganizationQueryScope();
  const [snapshot, setSnapshot] = useState<AdminLiveTrackingSnapshot>(EMPTY);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [screenFocused, setScreenFocused] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasLoadedRef = useRef(false);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!enabled) {
      setSnapshot(EMPTY);
      setLoading(false);
      return;
    }
    if (!canQuery) {
      setSnapshot(EMPTY);
      setLoading(false);
      hasLoadedRef.current = false;
      return;
    }
    if (!opts?.silent && !hasLoadedRef.current) {
      setLoading(true);
    }
    const { snapshot: next, error: err } = await fetchAdminLiveTracking(orgScoped);
    setSnapshot(next);
    setError(err ?? null);
    setLoading(false);
    hasLoadedRef.current = true;
  }, [canQuery, enabled, orgScoped]);

  const scheduleReload = useCallback(() => {
    if (!enabled) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void load({ silent: true });
    }, REALTIME_DEBOUNCE_MS);
  }, [enabled, load]);

  useEffect(() => {
    if (!enabled) {
      setSnapshot(EMPTY);
      setLoading(false);
      return;
    }
    hasLoadedRef.current = false;
    void load();
  }, [enabled, load, refreshKey]);

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return () => {};
      setScreenFocused(true);
      void load({ silent: hasLoadedRef.current });
      return () => {
        setScreenFocused(false);
        if (debounceRef.current) {
          clearTimeout(debounceRef.current);
          debounceRef.current = null;
        }
      };
    }, [enabled, load])
  );

  useEffect(() => {
    if (!enabled || !canQuery) return;
    const pollMs = screenFocused ? POLL_FOCUSED_MS : POLL_BACKGROUND_MS;
    const poll = setInterval(() => void load({ silent: true }), pollMs);
    const unsub = subscribeMapUserLocations(() => {
      scheduleReload();
    });
    return () => {
      clearInterval(poll);
      unsub();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [canQuery, enabled, load, scheduleReload, screenFocused]);

  const filteredOnMap = useMemo(() => {
    if (filter === 'all') return snapshot.onMap;
    return snapshot.onMap.filter((p) => p.userType === filter);
  }, [filter, snapshot.onMap]);

  const liveOnMapCount = useMemo(
    () => filteredOnMap.filter((p) => Date.now() - new Date(p.updatedAt).getTime() < 2 * 60 * 1000).length,
    [filteredOnMap]
  );

  const mapMarkers: MapUserMarker[] = useMemo(
    () => filteredOnMap.map(adminTrackedPersonToMapMarker),
    [filteredOnMap]
  );

  const staffOnMapIds = useMemo(
    () => new Set(snapshot.onMap.filter((p) => p.userType === 'staff').map((p) => p.id)),
    [snapshot.onMap]
  );

  const onlineStaffNotOnMap = useMemo(
    () => snapshot.onlineStaff.filter((s) => !staffOnMapIds.has(s.id)),
    [snapshot.onlineStaff, staffOnMapIds]
  );

  return {
    orgScoped,
    snapshot,
    filteredOnMap,
    mapMarkers,
    onlineStaffNotOnMap,
    liveOnMapCount,
    loading,
    error,
    screenFocused,
    reload: () => load({ silent: false }),
  };
}

export type { AdminTrackedPerson, AdminLiveTrackingSnapshot };
