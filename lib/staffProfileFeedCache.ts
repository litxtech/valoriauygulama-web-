import { getListCacheRaw, hydrateListCache, setListCache } from '@/lib/listCache';
import type { StaffProfileFeedFilter, StaffProfileFeedPreview } from '@/lib/staffProfileFeedThumbnails';

export function staffProfileFeedCacheKey(staffId: string, filter: StaffProfileFeedFilter): string {
  return `staff-profile-feed:${staffId}:${filter}`;
}

export function peekStaffProfileFeedCache(
  staffId: string,
  filter: StaffProfileFeedFilter
): StaffProfileFeedPreview[] | null {
  return getListCacheRaw<StaffProfileFeedPreview>(staffProfileFeedCacheKey(staffId, filter));
}

export async function hydrateStaffProfileFeedCache(
  staffId: string,
  filter: StaffProfileFeedFilter
): Promise<StaffProfileFeedPreview[] | null> {
  return hydrateListCache<StaffProfileFeedPreview>(staffProfileFeedCacheKey(staffId, filter));
}

export function writeStaffProfileFeedCache(
  staffId: string,
  filter: StaffProfileFeedFilter,
  items: StaffProfileFeedPreview[]
): void {
  setListCache(staffProfileFeedCacheKey(staffId, filter), items);
}
