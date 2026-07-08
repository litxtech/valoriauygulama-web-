import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { supabase } from '@/lib/supabase';
import { fetchHotelInHousePopulation } from '@/lib/hotelInHouse';

const POLL_MS = 90_000;

/**
 * Otel nüfusu (içeride konaklayan misafir sayısı) — canlı.
 * ops.stay_assignments realtime + yedek polling + uygulama öne gelince tazeler.
 */
export function useHotelInHousePopulation(enabled = true): {
  count: number;
  loading: boolean;
  refresh: () => void;
} {
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(enabled);
  const mountedRef = useRef(true);

  const refresh = useCallback(() => {
    if (!enabled) return;
    void fetchHotelInHousePopulation()
      .then((n) => {
        if (mountedRef.current) setCount(n);
      })
      .finally(() => {
        if (mountedRef.current) setLoading(false);
      });
  }, [enabled]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    refresh();

    const channel = supabase
      .channel('hotel-in-house-population')
      .on('postgres_changes', { event: '*', schema: 'ops', table: 'stay_assignments' }, () => refresh())
      .subscribe();

    const poll = setInterval(refresh, POLL_MS);

    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refresh();
    });

    return () => {
      void supabase.removeChannel(channel);
      clearInterval(poll);
      sub.remove();
    };
  }, [enabled, refresh]);

  return { count, loading, refresh };
}
