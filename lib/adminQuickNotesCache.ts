import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AdminQuickNoteRow } from '@/lib/adminQuickNotes';

const STORAGE_ACTIVE = '@valoria/admin_notes_list_active_v1';
const STORAGE_ARCHIVED = '@valoria/admin_notes_list_archived_v1';

type CacheEntry = { items: AdminQuickNoteRow[]; updatedAt: number };

const memoryCaches = new Map<string, CacheEntry>();

export const ADMIN_QUICK_NOTES_LIST_CACHE_TTL_MS = 90_000;
export const ADMIN_QUICK_NOTES_FOCUS_REFRESH_MS = 45_000;

function memKey(includeArchived: boolean): string {
  return includeArchived ? 'archived' : 'active';
}

function storageKey(includeArchived: boolean): string {
  return includeArchived ? STORAGE_ARCHIVED : STORAGE_ACTIVE;
}

export function getAdminQuickNotesListCache(includeArchived = false): AdminQuickNoteRow[] | null {
  const entry = memoryCaches.get(memKey(includeArchived));
  if (!entry) return null;
  if (Date.now() - entry.updatedAt > ADMIN_QUICK_NOTES_LIST_CACHE_TTL_MS) return null;
  return entry.items;
}

export function getAdminQuickNotesListCacheAgeMs(includeArchived = false): number | null {
  const entry = memoryCaches.get(memKey(includeArchived));
  if (!entry) return null;
  return Date.now() - entry.updatedAt;
}

export function setAdminQuickNotesListCache(items: AdminQuickNoteRow[], includeArchived = false): void {
  const key = memKey(includeArchived);
  const entry: CacheEntry = { items, updatedAt: Date.now() };
  memoryCaches.set(key, entry);
  void AsyncStorage.setItem(storageKey(includeArchived), JSON.stringify(entry)).catch(() => {});
}

export async function hydrateAdminQuickNotesListCache(
  includeArchived = false
): Promise<AdminQuickNoteRow[] | null> {
  const cached = memoryCaches.get(memKey(includeArchived));
  if (cached?.items?.length) return cached.items;
  try {
    const raw = await AsyncStorage.getItem(storageKey(includeArchived));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry;
    if (!Array.isArray(parsed.items) || parsed.items.length === 0) return null;
    memoryCaches.set(memKey(includeArchived), {
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
  void AsyncStorage.multiRemove([STORAGE_ACTIVE, STORAGE_ARCHIVED]).catch(() => {});
}
