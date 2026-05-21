import AsyncStorage from '@react-native-async-storage/async-storage';
import type { FacilityJournalRecordRow } from '@/lib/facilityJournal';

const STORAGE_KEY = '@valoria/facility_journal_list_v1';

/** Bellek önbelleği — sekme / sayfa geçişlerinde anında liste */
let memoryCache: { items: FacilityJournalRecordRow[]; updatedAt: number } | null = null;

export const FACILITY_JOURNAL_LIST_CACHE_TTL_MS = 90_000;
export const FACILITY_JOURNAL_FOCUS_REFRESH_MS = 45_000;

export function getFacilityJournalListCache(): FacilityJournalRecordRow[] | null {
  if (!memoryCache) return null;
  if (Date.now() - memoryCache.updatedAt > FACILITY_JOURNAL_LIST_CACHE_TTL_MS) return null;
  return memoryCache.items;
}

export function getFacilityJournalListCacheAgeMs(): number | null {
  if (!memoryCache) return null;
  return Date.now() - memoryCache.updatedAt;
}

export function setFacilityJournalListCache(items: FacilityJournalRecordRow[]): void {
  memoryCache = { items, updatedAt: Date.now() };
  void AsyncStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ items, updatedAt: memoryCache.updatedAt })
  ).catch(() => {});
}

export async function hydrateFacilityJournalListCache(): Promise<FacilityJournalRecordRow[] | null> {
  if (memoryCache?.items?.length) return memoryCache.items;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { items?: FacilityJournalRecordRow[]; updatedAt?: number };
    if (!Array.isArray(parsed.items) || parsed.items.length === 0) return null;
    memoryCache = { items: parsed.items, updatedAt: parsed.updatedAt ?? 0 };
    return parsed.items;
  } catch {
    return null;
  }
}

export function invalidateFacilityJournalListCache(): void {
  memoryCache = null;
  void AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
}
