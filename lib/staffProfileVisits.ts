import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Router } from 'expo-router';
import { supabase } from '@/lib/supabase';

const VISITS_LIST_CACHE_KEY = 'staff_profile_visits_list_v1';
let visitsListMemory: StaffProfileVisitRow[] | null = null;

export type StaffProfileVisitRow = {
  id: string;
  visited_at: string;
  visitor_kind: 'staff' | 'guest';
  visitor_name: string | null;
  visitor_photo: string | null;
  /** Personel ziyaretçi için "Hakkında" (bio); misafir için genelde yok. */
  visitor_about?: string | null;
};

export async function recordStaffProfileVisit(viewedStaffId: string): Promise<void> {
  if (!viewedStaffId) return;
  const { error } = await supabase.rpc('record_staff_profile_visit', {
    p_viewed_staff_id: viewedStaffId,
  });
  if (error) {
    console.warn('[recordStaffProfileVisit]', error.message);
  }
}

type StaffProfileRouteMode = 'staff' | 'customer';

/** Gönderi kartı / akıştan profile gidilirken ziyareti hemen kaydet (sayfa yüklenmesini bekleme). */
export function openStaffProfileWithVisit(
  router: Pick<Router, 'push'>,
  viewedStaffId: string,
  mode: StaffProfileRouteMode,
  viewerStaffId?: string | null
): void {
  if (!viewedStaffId) return;
  const href =
    mode === 'staff' ? (`/staff/profile/${viewedStaffId}` as const) : (`/customer/staff/${viewedStaffId}` as const);
  if (!viewerStaffId || viewerStaffId !== viewedStaffId) {
    void recordStaffProfileVisit(viewedStaffId);
  }
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
