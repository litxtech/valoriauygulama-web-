import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { fetchNearbyMapUsers, type MapUserMarker } from '@/lib/map/userLocations';
import { subscribeMapUserLocations } from '@/lib/map/subscribeMapUserLocations';
import {
  liveOpsMapSessionKey,
  getLiveOpsMapSession,
  runLiveOpsMapLoad,
  liveOpsMapSubscribe,
} from '@/lib/liveOpsMapSession';

const HOTEL_LAT =
  typeof process.env.EXPO_PUBLIC_HOTEL_LAT !== 'undefined'
    ? Number(process.env.EXPO_PUBLIC_HOTEL_LAT)
    : 40.6144;
const HOTEL_LON =
  typeof process.env.EXPO_PUBLIC_HOTEL_LON !== 'undefined'
    ? Number(process.env.EXPO_PUBLIC_HOTEL_LON)
    : 40.31188;

export type LiveOpsStaffRow = {
  id: string;
  full_name: string | null;
  profile_image: string | null;
  department: string | null;
  role: string | null;
  is_online: boolean | null;
  work_status: string | null;
};

/** Çevrimiçi + haritada konum paylaşan birleşik canlı personel. */
export type LiveOpsLivePerson = LiveOpsStaffRow & {
  onMap: boolean;
  online: boolean;
};

function mergeLivePeople(online: LiveOpsStaffRow[], map: MapUserMarker[]): LiveOpsLivePerson[] {
  const mapStaff = map.filter((m) => m.userType === 'staff');
  const byId = new Map<string, LiveOpsLivePerson>();

  for (const s of online) {
    byId.set(s.id, {
      ...s,
      online: true,
      onMap: mapStaff.some((m) => m.userId === s.id),
    });
  }

  for (const m of mapStaff) {
    if (byId.has(m.userId)) continue;
    byId.set(m.userId, {
      id: m.userId,
      full_name: m.displayName,
      profile_image: m.avatarUrl,
      department: null,
      role: null,
      is_online: true,
      work_status: 'active',
      online: false,
      onMap: true,
    });
  }

  return [...byId.values()].sort((a, b) =>
    (a.full_name ?? '').localeCompare(b.full_name ?? '', 'tr')
  );
}

export type LiveOpsMapState = {
  onlineStaff: LiveOpsStaffRow[];
  mapStaff: MapUserMarker[];
  livePeople: LiveOpsLivePerson[];
  loading: boolean;
};

async function fetchLiveOpsMap(orgId: string): Promise<LiveOpsMapState> {
  const [staffRes, mapUsers] = await Promise.all([
    supabase
      .from('staff')
      .select('id, full_name, profile_image, department, role, is_online, work_status')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .eq('is_online', true)
      .order('full_name')
      .limit(24),
    fetchNearbyMapUsers(HOTEL_LAT, HOTEL_LON, 4),
  ]);
  const online = (staffRes.data ?? []) as LiveOpsStaffRow[];
  const onMap = mapUsers.filter((u) => u.userType === 'staff');
  return {
    onlineStaff: online,
    mapStaff: onMap,
    livePeople: mergeLivePeople(online, onMap),
    loading: false,
  };
}

export function useLiveOpsMap(refreshKey = 0): LiveOpsMapState {
  const staff = useAuthStore((s) => s.staff);
  const orgId = staff?.organization_id;
  const sessionKey = orgId ? liveOpsMapSessionKey(orgId) : '';
  const cached = orgId ? getLiveOpsMapSession<LiveOpsMapState>(sessionKey, true) : null;

  const [onlineStaff, setOnlineStaff] = useState<LiveOpsStaffRow[]>(cached?.onlineStaff ?? []);
  const [mapStaff, setMapStaff] = useState<MapUserMarker[]>(cached?.mapStaff ?? []);
  const [livePeople, setLivePeople] = useState<LiveOpsLivePerson[]>(cached?.livePeople ?? []);
  const [loading, setLoading] = useState(!cached);

  const applyState = useCallback((state: LiveOpsMapState) => {
    if (!state || !Array.isArray(state.livePeople)) return;
    setOnlineStaff(Array.isArray(state.onlineStaff) ? state.onlineStaff : []);
    setMapStaff(Array.isArray(state.mapStaff) ? state.mapStaff : []);
    setLivePeople(state.livePeople);
    setLoading(false);
  }, []);

  const load = useCallback(
    async (force = false) => {
      if (!orgId) return;
      const key = liveOpsMapSessionKey(orgId);
      const state = await runLiveOpsMapLoad(key, () => fetchLiveOpsMap(orgId), force);
      applyState(state);
    },
    [applyState, orgId]
  );

  useEffect(() => {
    if (!orgId) return;
    void load(refreshKey !== 0);
    const unsub = liveOpsMapSubscribe(
      () => void load(true),
      (onLocation) => subscribeMapUserLocations(onLocation)
    );
    return unsub;
  }, [load, orgId, refreshKey]);

  return { onlineStaff, mapStaff, livePeople, loading };
}
