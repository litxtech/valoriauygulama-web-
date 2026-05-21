import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { fetchGuestStays, rowToGuestStay } from '@/lib/kbsStays/guestStaysDb';
import type { GuestStayRow } from '@/lib/kbsStays/types';

export function useGuestStaysRealtime(initialStatuses?: GuestStayRow['stay_status'][]) {
  const [rows, setRows] = useState<GuestStayRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchGuestStays({ statuses: initialStatuses, limit: 300 });
      setRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Yüklenemedi');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [initialStatuses]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    void reload();
  }, [reload]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const channel = supabase
      .channel('ops-guest-stays-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'ops', table: 'guest_stays' },
        (payload) => {
          if (payload.eventType === 'INSERT' && payload.new) {
            const row = rowToGuestStay(payload.new as Record<string, unknown>);
            setRows((prev) => [row, ...prev.filter((r) => r.id !== row.id)]);
          } else if (payload.eventType === 'UPDATE' && payload.new) {
            const row = rowToGuestStay(payload.new as Record<string, unknown>);
            setRows((prev) => prev.map((r) => (r.id === row.id ? row : r)));
          } else if (payload.eventType === 'DELETE' && payload.old) {
            const id = (payload.old as { id?: string }).id;
            if (id) setRows((prev) => prev.filter((r) => r.id !== id));
          } else {
            void reload();
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [reload]);

  return { rows, loading, refreshing, error, reload, refresh };
}
