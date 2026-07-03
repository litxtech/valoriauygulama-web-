import {
  DEFAULT_LIST_FOCUS_REFRESH_MS,
  getBlobCacheAgeMs,
  getBlobCacheRaw,
  hydrateBlobCache,
  invalidateBlobCache,
  setBlobCache,
} from '@/lib/listCache';
import type { StaffKitchenMenuOrdersBundle } from '@/lib/staffKitchenMenuOrders';

export const STAFF_KITCHEN_ORDERS_FOCUS_REFRESH_MS = DEFAULT_LIST_FOCUS_REFRESH_MS;

function cacheKey(orgId: string): string {
  return `kitchen-menu-orders:${orgId}`;
}

export function getStaffKitchenMenuOrdersCache(orgId: string): StaffKitchenMenuOrdersBundle | null {
  return getBlobCacheRaw<StaffKitchenMenuOrdersBundle>(cacheKey(orgId));
}

export function getStaffKitchenMenuOrdersCacheAgeMs(orgId: string): number | null {
  return getBlobCacheAgeMs(cacheKey(orgId));
}

export function setStaffKitchenMenuOrdersCache(orgId: string, bundle: StaffKitchenMenuOrdersBundle): void {
  setBlobCache(cacheKey(orgId), bundle);
}

export async function hydrateStaffKitchenMenuOrdersCache(
  orgId: string
): Promise<StaffKitchenMenuOrdersBundle | null> {
  return hydrateBlobCache<StaffKitchenMenuOrdersBundle>(cacheKey(orgId));
}

export function invalidateStaffKitchenMenuOrdersCache(orgId?: string): void {
  if (!orgId) return;
  invalidateBlobCache(cacheKey(orgId));
}
