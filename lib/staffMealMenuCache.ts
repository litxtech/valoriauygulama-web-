import type { MealKitchenConfirmation, MealMenuDayRow, MealMenuMonthMeta } from '@/lib/staffMealMenu';
import { periodMonthFromDate } from '@/lib/staffMealMenu';

export type StaffMealMenuBrowseCache = {
  menu: MealMenuMonthMeta | null;
  days: MealMenuDayRow[];
  confirmations: Record<string, MealKitchenConfirmation>;
};

type Entry = { at: number; data: StaffMealMenuBrowseCache };

const cache = new Map<string, Entry>();
const TTL_MS = 120_000;

export function staffMealMenuCacheKey(organizationId: string, viewMonth: Date): string {
  return `${organizationId}:${periodMonthFromDate(viewMonth)}`;
}

export function getStaffMealMenuCache(key: string): StaffMealMenuBrowseCache | null {
  const e = cache.get(key);
  if (!e) return null;
  if (Date.now() - e.at > TTL_MS) {
    cache.delete(key);
    return null;
  }
  return e.data;
}

export function setStaffMealMenuCache(key: string, data: StaffMealMenuBrowseCache): void {
  cache.set(key, { at: Date.now(), data });
}

export function invalidateStaffMealMenuCache(organizationId?: string): void {
  if (!organizationId) {
    cache.clear();
    return;
  }
  const prefix = `${organizationId}:`;
  for (const k of cache.keys()) {
    if (k.startsWith(prefix)) cache.delete(k);
  }
}

/** Menü ekranına girmeden önce arka planda ısıtma */
export function prefetchStaffMealMenuBrowse(
  organizationId: string,
  viewMonth: Date = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
): void {
  const key = staffMealMenuCacheKey(organizationId, viewMonth);
  if (getStaffMealMenuCache(key)) return;
  void import('@/lib/staffMealMenu')
    .then(({ fetchStaffMealMenuBrowse }) =>
      fetchStaffMealMenuBrowse(organizationId, viewMonth).then((data) => {
        setStaffMealMenuCache(key, data);
      })
    )
    .catch(() => {
      /* Ağ kesintisinde menü ön-ısıtma sohbeti etkilemesin */
    });
}
