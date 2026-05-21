import type { HotelKitchenMenuItemWithImages } from '@/lib/hotelKitchenMenu';

type Entry = { at: number; rows: HotelKitchenMenuItemWithImages[] };

const cache = new Map<string, Entry>();
const TTL_MS = 90_000;

export function getHotelKitchenMenuCache(key: string): HotelKitchenMenuItemWithImages[] | null {
  const e = cache.get(key);
  if (!e) return null;
  if (Date.now() - e.at > TTL_MS) {
    cache.delete(key);
    return null;
  }
  return e.rows;
}

export function setHotelKitchenMenuCache(key: string, rows: HotelKitchenMenuItemWithImages[]): void {
  cache.set(key, { at: Date.now(), rows });
}

export function invalidateHotelKitchenMenuCache(): void {
  cache.clear();
}
