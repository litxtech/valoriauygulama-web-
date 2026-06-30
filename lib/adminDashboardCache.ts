import AsyncStorage from '@react-native-async-storage/async-storage';
import { isSupabaseInCooldown } from '@/lib/supabaseHealthGate';

/** Admin kök paneli istatistikleri — bellek + disk önbellek (stale-while-revalidate). */
export type AdminDashboardStats = {
  roomsTotal: number;
  roomsOccupied: number;
  guestsActive: number;
  staffActive: number;
  stockPending: number;
  staffPending: number;
  expensesPending: number;
  unreadNotifs: number;
  messagesUnread: number;
  feedTotal: number;
  reportsPending: number;
  complaintsPending: number;
  acceptancesUnassigned: number;
};

type CacheEntry = {
  key: string;
  stats: AdminDashboardStats;
  /** Rozet sayıları son tam yenileme */
  at: number;
  /** Sohbet okunmamış sayısı son güncelleme */
  messagesAt: number;
};

const STORAGE_PREFIX = 'admin_dashboard_stats_v3:';

/** Bu süre içinde panele girince ağ isteği atlanır (önbellek yeterli). */
export const ADMIN_DASHBOARD_FOCUS_REFRESH_MS = 5 * 60_000;

/** Sohbet unread rozeti — ana sayfa yenilense bile bu süre dolmadan tekrar çekilmez. */
export const ADMIN_DASHBOARD_MESSAGES_REFRESH_MS = 10 * 60_000;

/** Disk önbelleği en fazla bu kadar eski kalabilir (anında gösterim için). */
export const ADMIN_DASHBOARD_PERSIST_MAX_AGE_MS = 7 * 24 * 60 * 60_000;

let entry: CacheEntry | null = null;
const hydrateInflight = new Map<string, Promise<AdminDashboardStats | null>>();

export function dashboardStatsToLiveMetricsPartial(stats: AdminDashboardStats): {
  activeStaff: number;
  occupancyPercent: number;
  vacantRooms: number;
} {
  const total = stats.roomsTotal;
  const occupied = stats.roomsOccupied;
  return {
    activeStaff: stats.staffActive,
    occupancyPercent: total > 0 ? Math.round((occupied / total) * 100) : 0,
    vacantRooms: Math.max(0, total - occupied),
  };
}

export function adminDashboardCacheKey(
  staffId: string,
  canUseAll: boolean,
  orgScoped: string | null
): string {
  return `${staffId}:${canUseAll ? 'all' : 'scoped'}:${orgScoped ?? '_'}`;
}

function isEntryFresh(e: CacheEntry, maxAgeMs: number): boolean {
  return Date.now() - e.at < maxAgeMs;
}

function isMessagesFresh(e: CacheEntry): boolean {
  return Date.now() - e.messagesAt < ADMIN_DASHBOARD_MESSAGES_REFRESH_MS;
}

export function getAdminDashboardCache(key: string, allowStale = false): AdminDashboardStats | null {
  if (!entry || entry.key !== key) return null;
  if (!allowStale && !isEntryFresh(entry, ADMIN_DASHBOARD_FOCUS_REFRESH_MS)) return null;
  return entry.stats;
}

export function setAdminDashboardCache(key: string, stats: AdminDashboardStats, opts?: { touchMessages?: boolean }): void {
  const now = Date.now();
  const prev = entry?.key === key ? entry : null;
  entry = {
    key,
    stats,
    at: now,
    messagesAt: opts?.touchMessages ? now : (prev?.messagesAt ?? now),
  };
  void persistEntry(entry);
}

export function patchAdminDashboardMessagesUnread(key: string, messagesUnread: number): void {
  if (!entry || entry.key !== key) return;
  const now = Date.now();
  entry = {
    ...entry,
    stats: { ...entry.stats, messagesUnread },
    messagesAt: now,
  };
  void persistEntry(entry);
}

export function getAdminDashboardCacheAgeMs(key: string): number | null {
  if (!entry || entry.key !== key) return null;
  return Date.now() - entry.at;
}

export function shouldSkipAdminDashboardNetwork(key: string, force?: boolean): boolean {
  if (force) return false;
  const hasCache = !!entry && entry.key === key;
  // Cooldown yalnızca gösterilecek önbellek varsa ağı atlasın; ilk yüklemede panel boş kalıp
  // 12 sn boyunca veri çekmemesini önler.
  if (isSupabaseInCooldown() && hasCache) return true;
  if (!hasCache) return false;
  return isEntryFresh(entry, ADMIN_DASHBOARD_FOCUS_REFRESH_MS);
}

export function shouldRefreshAdminMessagesUnread(key: string, force?: boolean): boolean {
  if (force) return true;
  if (!entry || entry.key !== key) return true;
  return !isMessagesFresh(entry);
}

/** Uygulama / panel açılışında diskten anında gösterim (tekilleştirilmiş). */
export async function hydrateAdminDashboardCache(key: string): Promise<AdminDashboardStats | null> {
  if (entry?.key === key) return entry.stats;

  const inflight = hydrateInflight.get(key);
  if (inflight) return inflight;

  const promise = (async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_PREFIX + key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as {
        stats: AdminDashboardStats;
        at: number;
        messagesAt?: number;
      };
      if (!parsed?.stats || typeof parsed.at !== 'number') return null;
      if (Date.now() - parsed.at > ADMIN_DASHBOARD_PERSIST_MAX_AGE_MS) {
        await AsyncStorage.removeItem(STORAGE_PREFIX + key);
        return null;
      }
      entry = {
        key,
        stats: parsed.stats,
        at: parsed.at,
        messagesAt: typeof parsed.messagesAt === 'number' ? parsed.messagesAt : parsed.at,
      };
      return entry.stats;
    } catch {
      return null;
    } finally {
      hydrateInflight.delete(key);
    }
  })();

  hydrateInflight.set(key, promise);
  return promise;
}

async function persistEntry(e: CacheEntry): Promise<void> {
  try {
    await AsyncStorage.setItem(
      STORAGE_PREFIX + e.key,
      JSON.stringify({ stats: e.stats, at: e.at, messagesAt: e.messagesAt })
    );
  } catch {
    // ignore
  }
}

export function invalidateAdminDashboardCache(key?: string): void {
  if (key) {
    if (entry?.key === key) entry = null;
    void AsyncStorage.removeItem(STORAGE_PREFIX + key);
    return;
  }
  entry = null;
}
