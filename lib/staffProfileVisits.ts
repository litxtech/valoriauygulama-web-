import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Router } from 'expo-router';
import { supabase } from '@/lib/supabase';

const VISITS_LIST_CACHE_KEY = 'staff_profile_visits_list_v2';
const VISIT_RECORD_DEDUP_MS = 30 * 60 * 1000;
let visitsListMemory: StaffProfileVisitRow[] | null = null;
/** Aynı profil için kısa sürede tekrar RPC (navigasyon yarışı); sunucu hesap başına tek sayım yapar. */
const recentVisitRecordedAt = new Map<string, number>();

export type StaffProfileVisitRow = {
  id: string;
  visited_at: string;
  visitor_kind: 'staff' | 'guest';
  visitor_name: string | null;
  visitor_photo: string | null;
  /** Personel ziyaretçi için "Hakkında" (bio); misafir için genelde yok. */
  visitor_about?: string | null;
  visitor_staff_id?: string | null;
  visitor_guest_id?: string | null;
};

export async function recordStaffProfileVisit(viewedStaffId: string): Promise<void> {
  if (!viewedStaffId) return;
  const now = Date.now();
  const last = recentVisitRecordedAt.get(viewedStaffId);
  if (last != null && now - last < VISIT_RECORD_DEDUP_MS) return;
  recentVisitRecordedAt.set(viewedStaffId, now);

  const { error } = await supabase.rpc('record_staff_profile_visit', {
    p_viewed_staff_id: viewedStaffId,
  });
  if (error) {
    recentVisitRecordedAt.delete(viewedStaffId);
    console.warn('[recordStaffProfileVisit]', error.message);
  }
}

type StaffProfileRouteMode = 'staff' | 'customer';

/** Profil ziyaretçi satırından ilgili profile git. */
export function openStaffProfileVisitor(
  router: Pick<Router, 'push'>,
  item: Pick<StaffProfileVisitRow, 'visitor_kind' | 'visitor_staff_id' | 'visitor_guest_id'>,
  routeMode: StaffProfileRouteMode = 'staff'
): void {
  if (item.visitor_kind === 'staff' && item.visitor_staff_id) {
    openStaffProfileWithVisit(router, item.visitor_staff_id, routeMode);
    return;
  }
  if (item.visitor_guest_id) {
    const href =
      routeMode === 'staff'
        ? (`/staff/guests/${item.visitor_guest_id}` as const)
        : (`/customer/guest/${item.visitor_guest_id}` as const);
    router.push(href as never);
  }
}

/** Profil sayfasına git; ziyaret kaydı yalnızca profil ekranında tek sefer yapılır. */
export function openStaffProfileWithVisit(
  router: Pick<Router, 'push'>,
  viewedStaffId: string,
  mode: StaffProfileRouteMode,
  _viewerStaffId?: string | null
): void {
  if (!viewedStaffId) return;
  const href =
    mode === 'staff' ? (`/staff/profile/${viewedStaffId}` as const) : (`/customer/staff/${viewedStaffId}` as const);
  router.push(href as never);
}

export function peekMyStaffProfileVisitsCache(): StaffProfileVisitRow[] | null {
  return visitsListMemory;
}

export async function readMyStaffProfileVisitsCache(): Promise<StaffProfileVisitRow[] | null> {
  if (visitsListMemory?.length) return visitsListMemory;
  try {
    const raw = await AsyncStorage.getItem(VISITS_LIST_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StaffProfileVisitRow[];
    if (!Array.isArray(parsed)) return null;
    visitsListMemory = parsed;
    return parsed;
  } catch {
    return null;
  }
}

async function writeMyStaffProfileVisitsCache(rows: StaffProfileVisitRow[]): Promise<void> {
  visitsListMemory = rows;
  try {
    await AsyncStorage.setItem(VISITS_LIST_CACHE_KEY, JSON.stringify(rows));
  } catch {
    // bellek yeter
  }
}

export async function fetchMyStaffProfileVisits(limit = 100): Promise<{
  rows: StaffProfileVisitRow[];
  error: Error | null;
}> {
  const { data, error } = await supabase.rpc('list_my_staff_profile_visits', {
    p_limit: limit,
  });
  if (error) {
    return { rows: [], error: new Error(error.message) };
  }
  const rows = (Array.isArray(data) ? data : []) as StaffProfileVisitRow[];
  if (rows.length > 0) {
    void writeMyStaffProfileVisitsCache(rows);
  }
  return { rows, error: null };
}
