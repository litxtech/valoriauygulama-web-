import { supabase } from '@/lib/supabase';

export type PostEngagementCounts = {
  likes: number;
  comments: number;
  views: number;
};

export async function loadFeedPostEngagementCounts(
  postIds: string[]
): Promise<Map<string, PostEngagementCounts>> {
  const map = new Map<string, PostEngagementCounts>();
  if (!postIds.length) return map;
  for (const id of postIds) {
    map.set(id, { likes: 0, comments: 0, views: 0 });
  }

  const [likesRows, commentRows, viewRows] = await Promise.all([
    supabase.from('feed_post_reactions').select('post_id').in('post_id', postIds),
    supabase.from('feed_post_comments').select('post_id').in('post_id', postIds),
    supabase.from('feed_post_views').select('post_id').in('post_id', postIds),
  ]);

  const bump = (table: 'likes' | 'comments' | 'views', rows: { post_id: string }[] | null) => {
    for (const r of rows ?? []) {
      const cur = map.get(r.post_id);
      if (!cur) continue;
      cur[table] += 1;
    }
  };

  bump('likes', likesRows.data as { post_id: string }[] | null);
  bump('comments', commentRows.data as { post_id: string }[] | null);
  bump('views', viewRows.data as { post_id: string }[] | null);

  return map;
}
