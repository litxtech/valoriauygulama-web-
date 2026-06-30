import { supabase } from '@/lib/supabase';
import { loadFeedPostEngagementCounts } from '@/lib/feedPostEngagementCounts';
import type { StaffProfileFeedFilter, StaffProfileFeedPreview } from '@/lib/staffProfileFeedThumbnails';

export type { StaffProfileFeedFilter as GuestProfileFeedFilter, StaffProfileFeedPreview as GuestProfileFeedPreview };

type PostRow = {
  id: string;
  media_type: string;
  media_url: string | null;
  thumbnail_url: string | null;
  title: string | null;
  post_tag?: string | null;
};

type MediaRow = {
  post_id: string;
  media_type: string;
  media_url: string;
  thumbnail_url: string | null;
  sort_order: number;
};

function buildPreview(post: PostRow, first: MediaRow | null): StaffProfileFeedPreview {
  if (post.media_type === 'text' || (!post.media_url?.trim() && !first)) {
    const t = (post.title ?? '').trim();
    return {
      id: post.id,
      kind: 'text',
      thumbUrl: null,
      textPreview: t.length > 0 ? t : '…',
    };
  }
  const mtype = (first?.media_type ?? post.media_type) as string;
  const isVideo = mtype === 'video';
  if (isVideo) {
    const url =
      (first?.thumbnail_url || post.thumbnail_url || first?.media_url || post.media_url || '').trim() || null;
    return { id: post.id, kind: 'video', thumbUrl: url, textPreview: null };
  }
  const url = (first?.media_url || post.media_url || first?.thumbnail_url || post.thumbnail_url || '').trim() || null;
  return { id: post.id, kind: 'image', thumbUrl: url, textPreview: null };
}

export type GuestFeedVisibility = 'own' | 'public';

export async function loadGuestProfileFeedPreviews(
  guestId: string,
  limit = 30,
  filter: StaffProfileFeedFilter = 'all',
  visibility: GuestFeedVisibility = 'own',
  withCounts = true
): Promise<{ items: StaffProfileFeedPreview[]; error: Error | null }> {
  let q = supabase
    .from('feed_posts')
    .select('id, media_type, media_url, thumbnail_url, title, post_tag')
    .eq('guest_id', guestId)
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 50));

  if (visibility === 'public') {
    q = q.in('visibility', ['customers', 'guests_only']);
  }

  const { data: posts, error } = await q;
  if (error) {
    return { items: [], error: new Error(error.message) };
  }

  const list = (posts ?? []) as PostRow[];
  const ids = list.map((p) => p.id);
  const firstByPost = new Map<string, MediaRow>();

  if (ids.length > 0) {
    const { data: mediaRows, error: mediaErr } = await supabase
      .from('feed_post_media_items')
      .select('post_id, media_type, media_url, thumbnail_url, sort_order')
      .in('post_id', ids)
      .order('sort_order', { ascending: true });
    if (!mediaErr && mediaRows) {
      for (const r of mediaRows as MediaRow[]) {
        if (!firstByPost.has(r.post_id)) firstByPost.set(r.post_id, r);
      }
    }
  }

  let items = list.map((p) => {
    const preview = buildPreview(p, firstByPost.get(p.id) ?? null);
    return { ...preview, postTag: p.post_tag ?? null };
  });

  if (filter === 'media') {
    items = items.filter((it) => it.kind === 'image' || it.kind === 'video');
  }

  if (!withCounts) {
    return { items, error: null };
  }

  const counts = await loadFeedPostEngagementCounts(items.map((it) => it.id));
  items = items.map((it) => {
    const c = counts.get(it.id);
    return {
      ...it,
      likesCount: c?.likes ?? 0,
      commentsCount: c?.comments ?? 0,
      viewsCount: c?.views ?? 0,
    };
  });

  return { items, error: null };
}
