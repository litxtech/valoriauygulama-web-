import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getOrCreateGuestForCurrentSession } from '@/lib/getOrCreateGuestForCaller';
import {
  getGuestHotelPulseCached,
  loadGuestHotelPulse,
  normalizeGuestPulseData,
  filterGuestPulseActivitiesForGuest,
  type GuestHotelPulseData,
  type GuestPulseActivity,
} from '@/lib/guestHotelPulseLoad';
import { useGuestHotelPulseRealtime } from '@/hooks/useGuestHotelPulseRealtime';

export type GuestHotelPulseState = GuestHotelPulseData & {
  loading: boolean;
  /** Sayaç değişiminde kısa süre gösterilen delta etiketleri */
  deltaHints: Partial<
    Record<'totalOnSite' | 'guestsInHouse' | 'staffActive' | 'checkInsToday' | 'checkOutsToday' | 'occupiedRooms', string>
  >;
  /** Yeni gelen canlı aktiviteler (en üstte) */
  liveActivities: GuestPulseActivity[];
  /** Realtime / admin kaydı sonrası kısa vurgu */
  justRefreshed: boolean;
};

const EMPTY: GuestHotelPulseState = {
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
    weatherLabel: '',
  },
  todayCheckIns: [],
  todayCheckOuts: [],
  upcomingCheckOuts: [],
  lateCheckoutRooms: [],
  activities: [],
  configUpdatedAt: null,
  loading: true,
  deltaHints: {},
  liveActivities: [],
  justRefreshed: false,
};

const REFRESH_MS = 180_000;
const JUST_REFRESHED_MS = 2200;

function diffHint(prev: number, next: number, label: string): string | undefined {
  const d = next - prev;
  if (d === 0) return undefined;
  return d > 0 ? `+${d} ${label}` : `${d} ${label}`;
}

export function useGuestHotelPulse(refreshKey = 0, enabled = true): GuestHotelPulseState {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [state, setState] = useState<GuestHotelPulseState>(() => {
    const cached = getGuestHotelPulseCached(null, true);
    return cached ? { ...cached, loading: false, deltaHints: {}, liveActivities: [], justRefreshed: false } : EMPTY;
  });
  const prevStats = useRef(EMPTY.stats);
  const prevActivityIds = useRef<Set<string>>(new Set());
  const inFlight = useRef(false);
  const orgResolved = useRef(false);
  const refreshFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const guestRow = await getOrCreateGuestForCurrentSession();
      if (!alive) return;
      if (guestRow?.guest_id) {
        const { data } = await supabase
          .from('guests')
          .select('organization_id')
          .eq('id', guestRow.guest_id)
          .maybeSingle();
        setOrgId((data as { organization_id?: string | null } | null)?.organization_id ?? null);
      } else {
        setOrgId(null);
      }
      orgResolved.current = true;
    })();
    return () => {
      alive = false;
    };
  }, []);

  const flashRefreshed = useCallback(() => {
    setState((s) => ({ ...s, justRefreshed: true }));
    if (refreshFlashTimer.current) clearTimeout(refreshFlashTimer.current);
    refreshFlashTimer.current = setTimeout(() => {
      setState((s) => ({ ...s, justRefreshed: false }));
    }, JUST_REFRESHED_MS);
  }, []);

  const applyPulse = useCallback(
    (raw: GuestHotelPulseData, isRefresh: boolean, fromRealtime = false) => {
      const data = normalizeGuestPulseData(raw);
      const hints: GuestHotelPulseState['deltaHints'] = {};
      if (isRefresh) {
        hints.totalOnSite = diffHint(prevStats.current.totalOnSite, data.stats.totalOnSite, 'kişi');
        hints.guestsInHouse = diffHint(prevStats.current.guestsInHouse, data.stats.guestsInHouse, 'misafir');
        hints.staffActive = diffHint(prevStats.current.staffActive, data.stats.staffActive, 'personel');
        hints.occupiedRooms = diffHint(prevStats.current.occupiedRooms, data.stats.occupiedRooms, 'oda');
      }

      const newActivities: GuestPulseActivity[] = [];
      if (isRefresh) {
        for (const act of data.activities) {
          if (!prevActivityIds.current.has(act.id)) {
            newActivities.push(act);
          }
        }
      }
      prevActivityIds.current = new Set(data.activities.map((a) => a.id));
      prevStats.current = data.stats;

      setState((prev) => ({
        ...data,
        loading: false,
        deltaHints: Object.keys(hints).length ? hints : prev.deltaHints,
        liveActivities: filterGuestPulseActivitiesForGuest(
          newActivities.length > 0 ? [...newActivities, ...prev.liveActivities] : prev.liveActivities
        ).slice(0, 12),
        justRefreshed: fromRealtime ? true : prev.justRefreshed,
      }));

      if (fromRealtime) flashRefreshed();

      if (Object.keys(hints).length > 0) {
        setTimeout(() => {
          setState((s) => ({ ...s, deltaHints: {} }));
        }, 2400);
      }
    },
    [flashRefreshed]
  );

  const load = useCallback(
    async (force = false, fromRealtime = false) => {
      if (!orgResolved.current && orgId === null) {
        const cached = getGuestHotelPulseCached(null, true);
        if (cached && !force) {
          applyPulse(cached, false, fromRealtime);
          return;
        }
      }
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        const data = await loadGuestHotelPulse(orgId, { force });
        applyPulse(data, force || !state.loading, fromRealtime);
      } catch {
        setState((s) => ({ ...s, loading: false }));
      } finally {
        inFlight.current = false;
      }
    },
    [orgId, applyPulse, state.loading]
  );

  useGuestHotelPulseRealtime(orgId, () => void load(true, true), enabled);

  useEffect(() => {
    if (!enabled) return;
    void load(refreshKey !== 0);
    const id = setInterval(() => void load(true), REFRESH_MS);
    return () => {
      clearInterval(id);
      if (refreshFlashTimer.current) clearTimeout(refreshFlashTimer.current);
    };
  }, [load, refreshKey, orgId, enabled]);

  return state;
}
