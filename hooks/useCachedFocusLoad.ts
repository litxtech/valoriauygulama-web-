import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  DEFAULT_LIST_FOCUS_REFRESH_MS,
  getBlobCacheAgeMs,
  getBlobCacheRaw,
  hydrateBlobCache,
  setBlobCache,
} from '@/lib/listCache';

type Options<T> = {
  cacheKey: string;
  enabled?: boolean;
  focusRefreshMs?: number;
  fetchData: () => Promise<T | null>;
};

/** Detay / dashboard ekranları — tek kayıt önbelleği + odakta sessiz yenileme. */
export function useCachedFocusLoad<T>({
  cacheKey,
  enabled = true,
  focusRefreshMs = DEFAULT_LIST_FOCUS_REFRESH_MS,
  fetchData,
}: Options<T>) {
  const [data, setData] = useState<T | null>(() => getBlobCacheRaw<T>(cacheKey));
  const [loading, setLoading] = useState(() => getBlobCacheRaw<T>(cacheKey) == null);
  const [refreshing, setRefreshing] = useState(false);
  const loadInFlightRef = useRef(false);

  const reload = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!enabled || loadInFlightRef.current) return;
      loadInFlightRef.current = true;
      try {
        const next = await fetchData();
        if (next != null) {
          setData(next);
          setBlobCache(cacheKey, next);
        }
      } finally {
        loadInFlightRef.current = false;
        if (!opts?.silent) setLoading(false);
        setRefreshing(false);
      }
    },
    [cacheKey, enabled, fetchData]
  );

  useEffect(() => {
    let cancelled = false;
    void hydrateBlobCache<T>(cacheKey).then((cached) => {
      if (cancelled || cached == null) return;
      setData(cached);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [cacheKey]);

  useFocusEffect(
    useCallback(() => {
      if (!enabled) {
        setLoading(false);
        return;
      }
      const mem = getBlobCacheRaw<T>(cacheKey);
      const age = getBlobCacheAgeMs(cacheKey);
      if (mem != null) {
        setData(mem);
        setLoading(false);
        if (age != null && age < focusRefreshMs) return;
        void reload({ silent: true });
        return;
      }
      setLoading(true);
      void reload();
    }, [cacheKey, enabled, focusRefreshMs, reload])
  );

  const refresh = useCallback(() => {
    setRefreshing(true);
    void reload();
  }, [reload]);

  const showContent = !loading || data != null;

  return { data, setData, loading, refreshing, refresh, reload, showContent };
}
