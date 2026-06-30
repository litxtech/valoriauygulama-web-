import type { HotelKitchenMenuItemWithImages } from '@/lib/hotelKitchenMenuTypes';
import type { PublicKitchenMenuOrg } from '@/lib/publicKitchenMenu';

export type PublicMenuBundle = {
  org: PublicKitchenMenuOrg;
  items: HotelKitchenMenuItemWithImages[];
};

type Entry = { at: number; bundle: PublicMenuBundle };

const memory = new Map<string, Entry>();
const TTL_MS = 120_000;
const STORAGE_PREFIX = 'valoria-public-menu-v2:';

function storageKey(slug: string): string {
  return `${STORAGE_PREFIX}${slug.trim().toLowerCase()}`;
}

export function getPublicMenuCache(slug: string): PublicMenuBundle | null {
  const key = slug.trim().toLowerCase();
  const mem = memory.get(key);
  if (mem && Date.now() - mem.at <= TTL_MS) return mem.bundle;

  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(storageKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; bundle: PublicMenuBundle };
    if (Date.now() - parsed.at > TTL_MS) {
      sessionStorage.removeItem(storageKey(key));
      return null;
    }
    memory.set(key, { at: parsed.at, bundle: parsed.bundle });
    return parsed.bundle;
  } catch {
    return null;
  }
}

export function setPublicMenuCache(slug: string, bundle: PublicMenuBundle): void {
  const key = slug.trim().toLowerCase();
  const entry = { at: Date.now(), bundle };
  memory.set(key, entry);
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(storageKey(key), JSON.stringify(entry));
  } catch {
    // quota / private mode
  }
}

export function invalidatePublicMenuCache(slug?: string): void {
  if (slug) {
    const key = slug.trim().toLowerCase();
    memory.delete(key);
    if (typeof sessionStorage !== 'undefined') {
      try {
        sessionStorage.removeItem(storageKey(key));
      } catch {
        // ignore
      }
    }
    return;
  }
  memory.clear();
}
