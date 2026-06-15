import { supabase } from '@/lib/supabase';

function isDuplicateError(error: { code?: string } | null): boolean {
  return error?.code === '23505';
}

/** wantLiked=true → beğeni ekle; false → beğeniyi kaldır */
export async function persistStaffFeedLike(
  postId: string,
  staffId: string,
  wantLiked: boolean
): Promise<{ ok: boolean; error: Error | null }> {
  if (!wantLiked) {
    const { error } = await supabase
      .from('feed_post_reactions')
      .delete()
      .eq('post_id', postId)
      .eq('staff_id', staffId);
    return { ok: !error, error: error ?? null };
  }
  const { error } = await supabase.from('feed_post_reactions').insert({
    post_id: postId,
    staff_id: staffId,
    reaction: 'like',
  });
  if (isDuplicateError(error)) return { ok: true, error: null };
  return { ok: !error, error: error ?? null };
}

export async function persistGuestFeedLike(
  postId: string,
  guestId: string,
  wantLiked: boolean
): Promise<{ ok: boolean; error: Error | null }> {
  if (!wantLiked) {
    const { error } = await supabase
      .from('feed_post_reactions')
      .delete()
      .eq('post_id', postId)
      .eq('guest_id', guestId);
    return { ok: !error, error: error ?? null };
  }
  const { error } = await supabase.from('feed_post_reactions').insert({
    post_id: postId,
    guest_id: guestId,
    reaction: 'like',
  });
  if (isDuplicateError(error)) return { ok: true, error: null };
  return { ok: !error, error: error ?? null };
}

export function createOptimisticCommentId(): string {
  return `pending-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
