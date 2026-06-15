import { useCallback, useEffect, useState } from 'react';
import { getOrCreateGuestForCurrentSession } from '@/lib/getOrCreateGuestForCaller';
import { loadGuestHotelInfo, type GuestHotelInfo } from '@/lib/guestHotelInfo';
import { useGuestHotelPulseRealtime } from '@/hooks/useGuestHotelPulseRealtime';
import { supabase } from '@/lib/supabase';

export function useGuestHotelInfo(refreshKey = 0) {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [info, setInfo] = useState<GuestHotelInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const guestRow = await getOrCreateGuestForCurrentSession();
      if (!alive) return;
      if (!guestRow?.guest_id) {
        setOrgId(null);
        return;
      }
      const { data } = await supabase
        .from('guests')
        .select('organization_id')
        .eq('id', guestRow.guest_id)
        .maybeSingle();
      setOrgId((data as { organization_id?: string | null } | null)?.organization_id ?? null);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const row = await loadGuestHotelInfo(orgId);
      setInfo(row);
    } catch {
      setInfo(null);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useGuestHotelPulseRealtime(orgId, () => void load());

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  return { info, loading, reload: load };
}
