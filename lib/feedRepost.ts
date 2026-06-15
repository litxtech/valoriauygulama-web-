import { supabase } from '@/lib/supabase';
import { notifyGuestsOfNewFeedPost, notifyStaffOfNewFeedPost } from '@/lib/notifyNewFeedPost';
import { log } from '@/lib/logger';

export type FeedRepostMediaItem = {
  media_type: 'image' | 'video';
  media_url: string;
  thumbnail_url: string | null;
  sort_order: number;
};

export type FeedRepostSource = {
  postId: string;
  title: string | null;
  media_type: string;
  media_url: string | null;
  thumbnail_url: string | null;
  media_items: FeedRepostMediaItem[];
  authorName: string;
  post_tag?: string | null;
};

export function buildRepostTitle(authorName: string, originalTitle: string | null, extraCaption?: string): string {
  const author = authorName.trim() || 'Bir kullanıcı';
  const body = (originalTitle ?? '').trim();
  const extra = (extraCaption ?? '').trim();
  const quoted = body ? `“${body}”` : '';
  const lines = [`↗️ ${author} paylaştı:`, quoted, extra].filter(Boolean);
  return lines.join('\n\n').trim();
}

export async function loadFeedRepostSource(postId: string, authorName: string): Promise<FeedRepostSource | null> {
  const { data: post, error } = await supabase
    .from('feed_posts')
    .select('id, title, media_type, media_url, thumbnail_url, post_tag')
    .eq('id', postId)
    .maybeSingle();
  if (error || !post) {
    log.warn('loadFeedRepostSource', error?.message ?? 'not found');
    return null;
  }
  const { data: mediaRows } = await supabase
    .from('feed_post_media_items')
    .select('media_type, media_url, thumbnail_url, sort_order')
    .eq('post_id', postId)
    .order('sort_order', { ascending: true });

  let media_items: FeedRepostMediaItem[] = (mediaRows ?? []).map((r, i) => ({
    media_type: r.media_type as 'image' | 'video',
    media_url: r.media_url,
    thumbnail_url: r.thumbnail_url,
    sort_order: r.sort_order ?? i,
  }));

  if (media_items.length === 0 && post.media_type !== 'text' && (post.media_url || post.thumbnail_url)) {
    media_items = [
      {
        media_type: post.media_type === 'video' ? 'video' : 'image',
        media_url: post.media_url || post.thumbnail_url || '',
        thumbnail_url: post.thumbnail_url,
        sort_order: 0,
      },
    ];
  }

  return {
    postId,
    title: post.title,
    media_type: post.media_type,
    media_url: post.media_url,
    thumbnail_url: post.thumbnail_url,
    media_items,
    authorName,
    post_tag: post.post_tag,
  };
}

type RepostAuthor = { staffId: string; displayName: string } | { guestId: string; displayName: string };

async function insertRepostPost(
  author: RepostAuthor,
  source: FeedRepostSource,
  extraCaption?: string,
  visibility?: string
): Promise<{ postId: string | null; error: Error | null }> {
  const repostTitle = buildRepostTitle(source.authorName, source.title, extraCaption);
  const items = source.media_items;
  const hasMedia = items.length > 0;
  const finalMediaType = hasMedia ? items[0]!.media_type : 'text';
  const mediaUrl = hasMedia ? items[0]!.media_url : null;
  const thumbnailUrl = hasMedia ? items[0]!.thumbnail_url ?? items[0]!.media_url : null;

  const insertPayload: Record<string, unknown> = {
    media_type: finalMediaType,
    media_url: mediaUrl,
    thumbnail_url: thumbnailUrl,
    title: repostTitle || null,
    visibility: visibility ?? ('staffId' in author ? 'all_staff' : 'customers'),
    post_tag: source.post_tag ?? null,
  };

  if ('staffId' in author) {
    insertPayload.staff_id = author.staffId;
  } else {
    insertPayload.guest_id = author.guestId;
    insertPayload.staff_id = null;
  }

  const { data: inserted, error: insertErr } = await supabase
    .from('feed_posts')
    .insert(insertPayload)
    .select('id')
    .single();

  if (insertErr || !inserted?.id) {
    return { postId: null, error: insertErr ?? new Error('insert failed') };
  }

  const newPostId = inserted.id as string;

  if (items.length > 0) {
    await supabase.from('feed_post_media_items').insert(
      items.map((m) => ({
        post_id: newPostId,
        media_type: m.media_type,
        media_url: m.media_url,
        thumbnail_url: m.thumbnail_url,
        sort_order: m.sort_order,
      }))
    );
  }

  const titlePreview = repostTitle.slice(0, 120) + (repostTitle.length > 120 ? '…' : '');

  void (async () => {
    try {
      if ('staffId' in author) {
        await notifyStaffOfNewFeedPost({
          postId: newPostId,
          authorDisplayName: author.displayName,
          titlePreview,
          excludeStaffId: author.staffId,
          createdByStaffId: author.staffId,
        });
      }
      await notifyGuestsOfNewFeedPost(newPostId);
    } catch (e) {
      log.warn('feedRepost notify', e);
    }
  })();

  return { postId: newPostId, error: null };
}

export async function repostFeedPostAsStaff(
  staffId: string,
  staffDisplayName: string,
  source: FeedRepostSource,
  extraCaption?: string
): Promise<{ postId: string | null; error: Error | null }> {
  return insertRepostPost({ staffId, displayName: staffDisplayName }, source, extraCaption, 'all_staff');
}

export async function repostFeedPostAsGuest(
  guestId: string,
  guestDisplayName: string,
  source: FeedRepostSource,
  extraCaption?: string
): Promise<{ postId: string | null; error: Error | null }> {
  return insertRepostPost({ guestId, displayName: guestDisplayName }, source, extraCaption, 'customers');
}
