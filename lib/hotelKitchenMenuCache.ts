import AsyncStorage from '@react-native-async-storage/async-storage';
import type { HotelKitchenMenuItemWithImages } from '@/lib/hotelKitchenMenuTypes';

type Entry = { at: number; rows: HotelKitchenMenuItemWithImages[] };

const memory = new Map<string, Entry>();
const TTL_MS = 300_000;
const STORAGE_PREFIX = 'valoria-kitchen-menu-v2:';

export function getHotelKitchenMenuCache(key: string): HotelKitchenMenuItemWithImages[] | null {
  const e = memory.get(key);
  if (!e) return null;
  if (Date.now() - e.at > TTL_MS) {
    memory.delete(key);
    return null;
  }
  return e.rows;
}

export function setHotelKitchenMenuCache(key: string, rows: HotelKitchenMenuItemWithImages[]): void {
  memory.set(key, { at: Date.now(), rows });
  void persistHotelKitchenMenuCache(key, rows);
}

export function invalidateHotelKitchenMenuCache(): void {
  memory.clear();
  void AsyncStorage.getAllKeys()
    .then((keys) => keys.filter((k) => k.startsWith(STORAGE_PREFIX)))
    .then((keys) => (keys.length ? AsyncStorage.multiRemove(keys) : undefined))
    .catch(() => {});
}

/** Uygulama açılışında bellek boşsa diskten menüyü ısıtır */
export async function hydrateHotelKitchenMenuCache(key: string): Promise<HotelKitchenMenuItemWithImages[] | null> {
  const hit = getHotelKitchenMenuCache(key);
  if (hit?.length) return hit;

  try {
    const raw = await AsyncStorage.getItem(`${STORAGE_PREFIX}${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; rows: HotelKitchenMenuItemWithImages[] };
    if (Date.now() - parsed.at > TTL_MS) {
      await AsyncStorage.removeItem(`${STORAGE_PREFIX}${key}`);
      return null;
    }
    memory.set(key, { at: parsed.at, rows: parsed.rows });
    return parsed.rows;
  } catch {
    return null;
  }
}

async function persistHotelKitchenMenuCache(key: string, rows: HotelKitchenMenuItemWithImages[]): Promise<void> {
  try {
    await AsyncStorage.setItem(
      `${STORAGE_PREFIX}${key}`,
      JSON.stringify({ at: Date.now(), rows })
    );
  } catch {
    /* quota */
  }
}
