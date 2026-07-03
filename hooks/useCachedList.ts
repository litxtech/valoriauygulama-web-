import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  DEFAULT_LIST_FOCUS_REFRESH_MS,
  getListCacheAgeMs,
  getListCacheRaw,
  hydrateListCache,
  setListCache,
} from '@/lib/listCache';

type Options<T> = {
  cacheKey: string;
  enabled?: boolean;
  focusRefreshMs?: number;
  fetchItems: () => Promise<T[]>;
};

/** Liste ekranları — önbellekten anında göster, odakta sessiz yenile. */
export function useCachedList<T>({
  cacheKey,
  enabled = true,
  focusRefreshMs = DEFAULT_LIST_FOCUS_REFRESH_MS,
  fetchItems,
}: Options<T>) {
  const [items, setItems] = useState<T[]>(() => getListCacheRaw<T>(cacheKey) ?? []);
  const [loading, setLoading] = useState(() => !(getListCacheRaw<T>(cacheKey)?.length));
  const [refreshing, setRefreshing] = useState(false);
  const loadInFlightRef = useRef(false);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!enabled || loadInFlightRef.current) return;
      loadInFlightRef.current = true;
      try {
        const data = await fetchItems();
        setItems(data);
        setListCache(cacheKey, data);
      } catch {
        if (!getListCacheRaw<T>(cacheKey)?.length) setItems([]);
      } finally {
        loadInFlightRef.current = false;
        if (!opts?.silent) setLoading(false);
        setRefreshing(false);
      }
    },
    [cacheKey, enabled, fetchItems]
  );

  useEffect(() => {
    let cancelled = false;
    void hydrateListCache<T>(cacheKey).then((cached) => {
      if (cancelled || !cached?.length) return;
      setItems(cached);
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
      const mem = getListCacheRaw<T>(cacheKey);
      const age = getListCacheAgeMs(cacheKey);
      if (mem?.length) {
        setItems(mem);
        setLoading(false);
        if (age != null && age < focusRefreshMs) return;
        void load({ silent: true });
        return;
      }
      setLoading(true);
      void load();
    }, [cacheKey, enabled, focusRefreshMs, load])
  );

  const refresh = useCallback(() => {
    setRefreshing(true);
    void load();
  }, [load]);

  const showList = !loading || items.length > 0;

  return { items, setItems, loading, refreshing, refresh, load, showList };
}
