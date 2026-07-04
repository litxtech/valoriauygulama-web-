import { Platform } from 'react-native';

/** Admin listelerinde ortak FlatList pencere ayarları */
export const ADMIN_LIST_PERF = {
  initialNumToRender: 12,
  maxToRenderPerBatch: 8,
  windowSize: 7,
  updateCellsBatchingPeriod: 50,
  removeClippedSubviews: Platform.OS === 'android',
} as const;

/** Realtime / focus yenilemelerini tekilleştirir */
export function createDebouncedRunner(ms = 900) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending = false;

  return {
    schedule(fn: () => void) {
      pending = true;
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        if (!pending) return;
        pending = false;
        fn();
      }, ms);
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
      pending = false;
    },
  };
}

type CacheEntry<T> = { at: number; data: T };

const memoryCache = new Map<string, CacheEntry<unknown>>();

export function getAdminScreenCache<T>(key: string, maxAgeMs: number): T | null {
  const hit = memoryCache.get(key) as CacheEntry<T> | undefined;
  if (!hit) return null;
  if (Date.now() - hit.at > maxAgeMs) return null;
  return hit.data;
}

export function setAdminScreenCache<T>(key: string, data: T): void {
  memoryCache.set(key, { at: Date.now(), data });
}

export function invalidateAdminScreenCache(prefix?: string): void {
  if (!prefix) {
    memoryCache.clear();
    return;
  }
  for (const key of memoryCache.keys()) {
    if (key.startsWith(prefix)) memoryCache.delete(key);
  }
}

/** Focus’ta ağ atlama süresi (ekran oturum önbelleği) */
export const ADMIN_SCREEN_FOCUS_TTL_MS = 60_000;
