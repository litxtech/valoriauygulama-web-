/** Bellek içi önbellek — aynı org/tarih için tekrar tekrar Supabase çağrısını önler. */

const DEFAULT_TTL_MS = 90_000;

type Entry<T> = { data: T; at: number; key: string };

const store = new Map<string, Entry<unknown>>();

export function occupancyCacheKey(parts: (string | null | undefined)[]): string {
  return parts.map((p) => p ?? '_').join(':');
}

export function getOccupancyCached<T>(key: string, ttlMs = DEFAULT_TTL_MS): T | null {
  const hit = store.get(key) as Entry<T> | undefined;
  if (!hit) return null;
  if (Date.now() - hit.at > ttlMs) {
    store.delete(key);
    return null;
  }
  return hit.data;
}

export function setOccupancyCached<T>(key: string, data: T): void {
  store.set(key, { data, at: Date.now(), key });
}

export function invalidateOccupancyCache(prefix?: string): void {
  if (!prefix) {
    store.clear();
    return;
  }
  for (const k of store.keys()) {
    if (k.startsWith(prefix)) store.delete(k);
  }
}
