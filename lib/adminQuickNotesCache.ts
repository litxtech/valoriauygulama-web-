import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AdminQuickNoteRow } from '@/lib/adminQuickNotes';

const STORAGE_PREFIX = '@valoria/admin_notes_list_v2:';

type CacheEntry = { items: AdminQuickNoteRow[]; updatedAt: number };

const memoryCaches = new Map<string, CacheEntry>();

export const ADMIN_QUICK_NOTES_LIST_CACHE_TTL_MS = 90_000;
export const ADMIN_QUICK_NOTES_FOCUS_REFRESH_MS = 45_000;

function scopeKey(staffId: string | null | undefined, includeArchived: boolean): string {
  const who = staffId?.trim() || 'anon';
  return `${who}:${includeArchived ? 'archived' : 'active'}`;
}

function storageKey(staffId: string | null | undefined, includeArchived: boolean): string {
  return `${STORAGE_PREFIX}${scopeKey(staffId, includeArchived)}`;
}

export function getAdminQuickNotesListCache(
  includeArchived = false,
  staffId?: string | null
): AdminQuickNoteRow[] | null {
  const entry = memoryCaches.get(scopeKey(staffId, includeArchived));
  if (!entry) return null;
  if (Date.now() - entry.updatedAt > ADMIN_QUICK_NOTES_LIST_CACHE_TTL_MS) return null;
  return entry.items;
}

export function getAdminQuickNotesListCacheAgeMs(
  includeArchived = false,
  staffId?: string | null
): number | null {
  const entry = memoryCaches.get(scopeKey(staffId, includeArchived));
  if (!entry) return null;
  return Date.now() - entry.updatedAt;
}

export function setAdminQuickNotesListCache(
  items: AdminQuickNoteRow[],
  includeArchived = false,
  staffId?: string | null
): void {
  const key = scopeKey(staffId, includeArchived);
  const entry: CacheEntry = { items, updatedAt: Date.now() };
  memoryCaches.set(key, entry);
  void AsyncStorage.setItem(storageKey(staffId, includeArchived), JSON.stringify(entry)).catch(() => {});
}

export async function hydrateAdminQuickNotesListCache(
  includeArchived = false,
  staffId?: string | null
): Promise<AdminQuickNoteRow[] | null> {
  const key = scopeKey(staffId, includeArchived);
  const cached = memoryCaches.get(key);
  if (cached?.items?.length) return cached.items;
  try {
    const raw = await AsyncStorage.getItem(storageKey(staffId, includeArchived));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry;
    if (!Array.isArray(parsed.items) || parsed.items.length === 0) return null;
    memoryCaches.set(key, {
      items: parsed.items,
      updatedAt: parsed.updatedAt ?? 0,
    });
    return parsed.items;
  } catch {
    return null;
  }
}

export function invalidateAdminQuickNotesListCache(): void {
  memoryCaches.clear();
  void AsyncStorage.getAllKeys()
    .then((keys) => {
      const ours = keys.filter((k) => k.startsWith(STORAGE_PREFIX) || k.startsWith('@valoria/admin_notes_list_'));
      if (ours.length) return AsyncStorage.multiRemove(ours);
    })
    .catch(() => {});
}
