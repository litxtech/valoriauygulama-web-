import { shouldRunOptionalSupabaseWork } from '@/lib/supabaseHealthGate';
import type { Router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { log } from '@/lib/logger';
import { syncGuestMessagingAppToken } from '@/lib/getOrCreateGuestForCaller';
import { useGuestMessagingStore } from '@/stores/guestMessagingStore';

export type FeedPostViewerRow = {
  id: string;
  staff_id: string | null;
  guest_id: string | null;
  viewed_at: string;
  viewer_name: string | null;
  viewer_avatar: string | null;
  verification_badge: 'blue' | 'yellow' | null;
  is_guest: boolean;
};

function mapRpcViewerRows(data: unknown[]): FeedPostViewerRow[] {
  return data.map((r: Record<string, unknown>) => ({
    id: String(r.id),
    staff_id: (r.staff_id as string | null) ?? null,
    guest_id: (r.guest_id as string | null) ?? null,
    viewed_at: String(r.viewed_at),
    viewer_name: (r.viewer_name as string | null) ?? null,
    viewer_avatar: (r.viewer_avatar as string | null) ?? null,
    verification_badge:
      r.verification_badge === 'blue' || r.verification_badge === 'yellow'
        ? r.verification_badge
        : null,
    is_guest: !!r.is_guest,
  }));
}

async function loadFeedPostViewersDirect(postId: string): Promise<{
  rows: FeedPostViewerRow[];
  error: Error | null;
}> {
  const { data, error } = await supabase
    .from('feed_post_views')
    .select(
      'id, staff_id, guest_id, viewed_at, staff:staff_id(full_name, profile_image, verification_badge, deleted_at), guest:guest_id(full_name, photo_url, deleted_at)'
    )
    .eq('post_id', postId)
    .order('viewed_at', { ascending: false });
  if (error) {
    return { rows: [], error };
  }
  const rows: FeedPostViewerRow[] = [];
  for (const raw of data ?? []) {
    const v = raw as {
      id: string;
      staff_id: string | null;
      guest_id: string | null;
      viewed_at: string;
      staff: { full_name?: string | null; profile_image?: string | null; verification_badge?: string | null; deleted_at?: string | null } | null;
      guest: { full_name?: string | null; photo_url?: string | null; deleted_at?: string | null } | null;
    };
    if (v.staff_id && (v.staff as { deleted_at?: string | null } | null)?.deleted_at) continue;
    if (v.guest_id && (v.guest as { deleted_at?: string | null } | null)?.deleted_at) continue;
    const isGuest = !!v.guest_id;
    rows.push({
      id: v.id,
      staff_id: v.staff_id,
      guest_id: v.guest_id,
      viewed_at: v.viewed_at,
      viewer_name: isGuest
        ? (v.guest?.full_name?.trim() || 'Misafir')
        : (v.staff?.full_name?.trim() || 'Personel'),
      viewer_avatar: (isGuest ? v.guest?.photo_url : v.staff?.profile_image)?.trim() || null,
      verification_badge:
        v.staff?.verification_badge === 'blue' || v.staff?.verification_badge === 'yellow'
          ? v.staff.verification_badge
          : null,
      is_guest: isGuest,
    });
  }
  return { rows, error: null };
}

export async function loadFeedPostViewers(postId: string): Promise<{
  rows: FeedPostViewerRow[];
  error: Error | null;
}> {
  const { data, error } = await supabase.rpc('get_feed_post_viewers', { p_post_id: postId });
  if (!error) {
    return { rows: mapRpcViewerRows((data ?? []) as Record<string, unknown>[]), error: null };
  }
  // Eski RPC misafir yazarlı gönderiyi reddedebilir (P0002/P0003) — RLS güncel ise doğrudan okuma yedekler.
  log.warn('loadFeedPostViewers', 'RPC failed, falling back to direct select', error.code, error.message);
  const fallback = await loadFeedPostViewersDirect(postId);
  if (fallback.rows.length > 0 || !fallback.error) {
    return fallback;
  }
  return { rows: [], error };
}

/** Personel feed görüntülemesini kaydet (SECURITY DEFINER RPC; doğrudan upsert yok). */
export async function recordStaffFeedPostViews(postIds: string[], staffId: string): Promise<void> {
  if (!postIds.length || !staffId) return;
  if (!shouldRunOptionalSupabaseWork()) return;
  const { error } = await supabase.rpc('record_staff_feed_post_views', {
    p_post_ids: postIds,
    p_staff_id: staffId,
  });
  if (error) {
    log.warn('recordStaffFeedPostViews', error.message, error.code);
  }
}

async function guestFeedRpcAppToken(): Promise<string | null> {
  const synced = await syncGuestMessagingAppToken();
  return synced ?? useGuestMessagingStore.getState().appToken ?? null;
}

/** Misafir feed görüntülemesini kaydet (SECURITY DEFINER RPC; doğrudan upsert yok). */
export async function recordGuestFeedPostViews(postIds: string[], guestId: string): Promise<void> {
  if (!postIds.length || !guestId) return;
  if (!shouldRunOptionalSupabaseWork()) return;
  const appToken = await guestFeedRpcAppToken();
  const { error } = await supabase.rpc('record_guest_feed_post_views', {
    p_post_ids: postIds,
    p_guest_id: guestId,
    p_app_token: appToken,
  });
  if (error) {
    if (error.code === '42501' || error.code === 'PGRST301' || error.message?.includes('401')) {
      log.warn('recordGuestFeedPostViews', 'auth', error.message, error.code);
      return;
    }
    log.warn('recordGuestFeedPostViews', error.message, error.code);
  }
}

/** Misafir: kendi gönderilerinin görüntülenme sayıları */
export async function getMyGuestFeedPostViewCounts(
  postIds: string[]
): Promise<Record<string, number>> {
  if (!postIds.length) return {};
  const appToken = await guestFeedRpcAppToken();
  const { data, error } = await supabase.rpc('get_my_guest_feed_post_view_counts', {
    p_post_ids: postIds,
    p_app_token: appToken,
  });
  if (error) {
    log.warn('getMyGuestFeedPostViewCounts', error.message, error.code);
    return {};
  }
  const out: Record<string, number> = {};
  for (const row of (data ?? []) as { post_id: string; view_count: number }[]) {
    out[row.post_id] = Number(row.view_count) || 0;
  }
  return out;
}

/** Personel: gönderi görüntülenme sayıları (RPC; hata olursa doğrudan sayım). */
export async function getFeedPostViewCounts(postIds: string[]): Promise<Record<string, number>> {
  if (!postIds.length) return {};
  const out: Record<string, number> = {};
  const { data, error } = await supabase.rpc('get_feed_post_view_counts', { post_ids: postIds });
  if (!error) {
    for (const row of (data ?? []) as { post_id?: string; view_count?: number | string; viewCount?: number | string }[]) {
      const pid = row.post_id != null ? String(row.post_id) : '';
      if (!pid) continue;
      out[pid] = Number(row.view_count ?? row.viewCount ?? 0) || 0;
    }
    return out;
  }
  log.warn('getFeedPostViewCounts', 'RPC failed, falling back to select', error.code, error.message);
  const { data: rows, error: selErr } = await supabase
    .from('feed_post_views')
    .select('post_id')
    .in('post_id', postIds);
  if (selErr) {
    log.warn('getFeedPostViewCounts', 'fallback select failed', selErr.message, selErr.code);
    return {};
  }
  for (const r of rows ?? []) {
    const pid = r.post_id != null ? String(r.post_id) : '';
    if (!pid) continue;
    out[pid] = (out[pid] ?? 0) + 1;
  }
  return out;
}

type FeedViewerRouteMode = 'staff' | 'customer';

/** Gönderi görüntüleyen satırından profile git. */
export function openFeedPostViewerProfile(
  router: Pick<Router, 'push'>,
  viewer: Pick<FeedPostViewerRow, 'staff_id' | 'guest_id' | 'is_guest'>,
  routeMode: FeedViewerRouteMode = 'staff'
): void {
  if (viewer.staff_id && !viewer.is_guest) {
    const href =
      routeMode === 'staff'
        ? (`/staff/profile/${viewer.staff_id}` as const)
        : (`/customer/staff/${viewer.staff_id}` as const);
    router.push(href as never);
    return;
  }
  if (viewer.guest_id) {
    const href =
      routeMode === 'staff'
        ? (`/staff/guests/${viewer.guest_id}` as const)
        : (`/customer/guest/${viewer.guest_id}` as const);
    router.push(href as never);
  }
}
