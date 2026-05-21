import { supabase } from '@/lib/supabase';
import { log } from '@/lib/logger';

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
  if (error.code === 'PGRST202' || error.message?.includes('get_feed_post_viewers')) {
    log.warn('loadFeedPostViewers', 'RPC missing, falling back to direct select', error.code);
    return loadFeedPostViewersDirect(postId);
  }
  log.warn('loadFeedPostViewers', error.message, error.code);
  return { rows: [], error };
}

/** Personel feed görüntülemesini kaydet (SECURITY DEFINER RPC; doğrudan upsert yok). */
export async function recordStaffFeedPostViews(postIds: string[], staffId: string): Promise<void> {
  if (!postIds.length || !staffId) return;
  const { error } = await supabase.rpc('record_staff_feed_post_views', {
    p_post_ids: postIds,
    p_staff_id: staffId,
  });
  if (error) {
    log.warn('recordStaffFeedPostViews', error.message, error.code);
  }
}

/** Misafir feed görüntülemesini kaydet (sessiz; hata loglanır). */
export async function recordGuestFeedPostViews(postIds: string[], guestId: string): Promise<void> {
  if (!postIds.length || !guestId) return;
  const viewRows = postIds.map((post_id) => ({ post_id, guest_id: guestId }));
  const { error } = await supabase
    .from('feed_post_views')
    .upsert(viewRows, { onConflict: 'post_id,guest_id', ignoreDuplicates: true });
  if (error) {
    log.warn('recordGuestFeedPostViews', error.message, error.code);
  }
}
