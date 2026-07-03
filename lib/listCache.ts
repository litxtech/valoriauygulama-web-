import AsyncStorage from '@react-native-async-storage/async-storage';

type CacheEntry<T> = { items: T[]; updatedAt: number };

const memoryCaches = new Map<string, CacheEntry<unknown>>();

export const DEFAULT_LIST_CACHE_TTL_MS = 90_000;
export const DEFAULT_LIST_FOCUS_REFRESH_MS = 45_000;

function storageKey(key: string): string {
  return `@valoria/list/${key}`;
}

export function getListCacheRaw<T>(key: string): T[] | null {
  const entry = memoryCaches.get(key) as CacheEntry<T> | undefined;
  return entry?.items ?? null;
}

export function getListCache<T>(key: string, ttlMs = DEFAULT_LIST_CACHE_TTL_MS): T[] | null {
  const entry = memoryCaches.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (Date.now() - entry.updatedAt > ttlMs) return null;
  return entry.items;
}

export function getListCacheAgeMs(key: string): number | null {
  const entry = memoryCaches.get(key);
  if (!entry) return null;
  return Date.now() - entry.updatedAt;
}

export function setListCache<T>(key: string, items: T[]): void {
  const entry: CacheEntry<T> = { items, updatedAt: Date.now() };
  memoryCaches.set(key, entry);
  void AsyncStorage.setItem(storageKey(key), JSON.stringify(entry)).catch(() => {});
}

export async function hydrateListCache<T>(key: string): Promise<T[] | null> {
  const mem = getListCacheRaw<T>(key);
  if (mem?.length) return mem;
  try {
    const raw = await AsyncStorage.getItem(storageKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry<T>;
    if (!Array.isArray(parsed.items) || parsed.items.length === 0) return null;
    memoryCaches.set(key, parsed);
    return parsed.items;
  } catch {
    return null;
  }
}

export function invalidateListCache(key: string): void {
  memoryCaches.delete(key);
  void AsyncStorage.removeItem(storageKey(key)).catch(() => {});
}

/** Tek kayıt / blob önbelleği (liste dışı ekranlar). */
type BlobEntry<T> = { data: T; updatedAt: number };

const blobCaches = new Map<string, BlobEntry<unknown>>();

export function getBlobCacheRaw<T>(key: string): T | null {
  const entry = blobCaches.get(key) as BlobEntry<T> | undefined;
  return entry?.data ?? null;
}

export function getBlobCacheAgeMs(key: string): number | null {
  const entry = blobCaches.get(key);
  if (!entry) return null;
  return Date.now() - entry.updatedAt;
}

export function setBlobCache<T>(key: string, data: T): void {
  blobCaches.set(key, { data, updatedAt: Date.now() });
  void AsyncStorage.setItem(storageKey(`blob:${key}`), JSON.stringify({ data, updatedAt: Date.now() })).catch(() => {});
}

export async function hydrateBlobCache<T>(key: string): Promise<T | null> {
  const mem = getBlobCacheRaw<T>(key);
  if (mem != null) return mem;
  try {
    const raw = await AsyncStorage.getItem(storageKey(`blob:${key}`));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BlobEntry<T>;
    if (parsed.data == null) return null;
    blobCaches.set(key, parsed);
    return parsed.data;
  } catch {
    return null;
  }
}

export function invalidateBlobCache(key: string): void {
  blobCaches.delete(key);
  void AsyncStorage.removeItem(storageKey(`blob:${key}`)).catch(() => {});
}
