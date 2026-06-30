import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { supabase } from '@/lib/supabase';
import { getLiveOpsMapSession, runLiveOpsMapLoad } from '@/lib/liveOpsMapSession';
import { useAdminOrganizationQueryScope } from '@/hooks/useAdminOrganizationQueryScope';
import { ADMIN_HOME_LIVE_PEOPLE_POLL_MS } from '@/lib/adminHomePerf';

export type LivePersonRow = {
  id: string;
  full_name: string | null;
  profile_image: string | null;
  department: string | null;
  role: string | null;
  is_online: boolean | null;
  work_status: string | null;
  last_active: string | null;
};

function livePeopleSessionKey(orgScoped: string | null): string {
  return `live-people:${orgScoped ?? 'all-orgs'}`;
}

async function fetchLivePeople(orgScoped: string | null): Promise<LivePersonRow[]> {
  let q = supabase
    .from('staff')
    .select('id, full_name, profile_image, department, role, is_online, work_status, last_active')
    .eq('is_active', true)
    .eq('is_online', true)
    .order('last_active', { ascending: false, nullsFirst: false })
    .order('full_name')
    .limit(48);

  if (orgScoped) {
    q = q.eq('organization_id', orgScoped);
  }

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as LivePersonRow[];
}

/** Admin panel: şu an uygulamada çevrimiçi personel (harita yok). */
export function useLivePeople(refreshKey = 0): { people: LivePersonRow[]; loading: boolean } {
  const { orgScoped, canQuery } = useAdminOrganizationQueryScope();
  const sessionKey = canQuery ? livePeopleSessionKey(orgScoped) : '';
  const cached = sessionKey ? getLiveOpsMapSession<LivePersonRow[]>(sessionKey, true) : null;
  const safeCached = Array.isArray(cached) ? cached : null;

  const [people, setPeople] = useState<LivePersonRow[]>(safeCached ?? []);
  const [loading, setLoading] = useState(!safeCached);

  const load = useCallback(
    async (force = false) => {
      if (!canQuery) {
        setPeople([]);
        setLoading(false);
        return;
      }
      const key = livePeopleSessionKey(orgScoped);
      try {
        const rows = await runLiveOpsMapLoad(key, () => fetchLivePeople(orgScoped), force);
        setPeople(Array.isArray(rows) ? rows : []);
      } catch {
        setPeople([]);
      } finally {
        setLoading(false);
      }
    },
    [canQuery, orgScoped]
  );

  useEffect(() => {
    if (!canQuery) {
      setPeople([]);
      setLoading(false);
      return;
    }
    void load(refreshKey !== 0);
    let poll: ReturnType<typeof setInterval> | null = null;
    const startPolling = () => {
      if (poll) return;
      poll = setInterval(() => void load(false), ADMIN_HOME_LIVE_PEOPLE_POLL_MS);
    };
    const stopPolling = () => {
      if (poll) {
        clearInterval(poll);
        poll = null;
      }
    };
    if (AppState.currentState === 'active') startPolling();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        void load(false);
        startPolling();
      } else {
        stopPolling();
      }
    });
    return () => {
      stopPolling();
      sub.remove();
    };
  }, [canQuery, load, refreshKey]);

  return { people: Array.isArray(people) ? people : [], loading };
}
