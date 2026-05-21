import AsyncStorage from '@react-native-async-storage/async-storage';
import type { HubReview } from '@/components/StaffEvaluationHub';
import type { StaffEngagementStats } from '@/lib/staffEngagementStats';

export type StaffProfileViewCacheMode = 'staff' | 'guest';

export type StaffProfileViewCacheEntry<TProfile = Record<string, unknown>> = {
  profile: TProfile;
  reviews?: HubReview[];
  engagement?: StaffEngagementStats;
  myReview?: HubReview | null;
  cachedAt: number;
};

const PREFIX = 'staff_profile_view_v1';
const memory = new Map<string, StaffProfileViewCacheEntry>();

function cacheKey(mode: StaffProfileViewCacheMode, staffId: string) {
  return `${PREFIX}:${mode}:${staffId}`;
}

export function peekStaffProfileViewCache<TProfile = Record<string, unknown>>(
  mode: StaffProfileViewCacheMode,
  staffId: string
): StaffProfileViewCacheEntry<TProfile> | null {
  const hit = memory.get(cacheKey(mode, staffId));
  return (hit as StaffProfileViewCacheEntry<TProfile> | undefined) ?? null;
}

export async function readStaffProfileViewCache<TProfile = Record<string, unknown>>(
  mode: StaffProfileViewCacheMode,
  staffId: string
): Promise<StaffProfileViewCacheEntry<TProfile> | null> {
  const mem = peekStaffProfileViewCache<TProfile>(mode, staffId);
  if (mem) return mem;
  try {
    const raw = await AsyncStorage.getItem(cacheKey(mode, staffId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StaffProfileViewCacheEntry<TProfile>;
    if (!parsed?.profile || typeof parsed.profile !== 'object') return null;
    memory.set(cacheKey(mode, staffId), parsed as StaffProfileViewCacheEntry);
    return parsed;
  } catch {
    return null;
  }
}

export async function writeStaffProfileViewCache<TProfile = Record<string, unknown>>(
  mode: StaffProfileViewCacheMode,
  staffId: string,
  entry: Omit<StaffProfileViewCacheEntry<TProfile>, 'cachedAt'> & { cachedAt?: number }
): Promise<void> {
  const full: StaffProfileViewCacheEntry<TProfile> = {
    ...entry,
    cachedAt: entry.cachedAt ?? Date.now(),
  };
  const key = cacheKey(mode, staffId);
  memory.set(key, full as StaffProfileViewCacheEntry);
  try {
    await AsyncStorage.setItem(key, JSON.stringify(full));
  } catch {
    // kalıcı önbellek yazılamasa da bellek yeter
  }
}

export function patchStaffProfileViewCache<TProfile = Record<string, unknown>>(
  mode: StaffProfileViewCacheMode,
  staffId: string,
  patch: Partial<Omit<StaffProfileViewCacheEntry<TProfile>, 'cachedAt'>>
): void {
  const prev = peekStaffProfileViewCache<TProfile>(mode, staffId);
  if (!prev) return;
  void writeStaffProfileViewCache(mode, staffId, { ...prev, ...patch, profile: (patch.profile ?? prev.profile) as TProfile });
}
