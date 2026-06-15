import { supabase } from '@/lib/supabase';

export type StaffEngagementStats = {
  posts: number;
  likes: number;
  comments: number;
  visits: number;
};

export async function loadStaffEngagementStats(staffId: string): Promise<StaffEngagementStats> {
  const empty: StaffEngagementStats = { posts: 0, likes: 0, comments: 0, visits: 0 };
  if (!staffId) return empty;

  const { count: postsCount } = await supabase
    .from('feed_posts')
    .select('id', { count: 'exact', head: true })
    .eq('staff_id', staffId);

  const { data: postRows } = await supabase
    .from('feed_posts')
    .select('id')
    .eq('staff_id', staffId)
    .order('created_at', { ascending: false })
    .limit(400);
  const postIds = (postRows ?? []).map((r: { id: string }) => r.id);

  let likes = 0;
  let comments = 0;
  if (postIds.length > 0) {
    const [likesRes, commentsRes] = await Promise.all([
      supabase.from('feed_post_likes').select('id', { count: 'exact', head: true }).in('post_id', postIds),
      supabase.from('feed_post_comments').select('id', { count: 'exact', head: true }).in('post_id', postIds),
    ]);
    likes = likesRes.count ?? 0;
    comments = commentsRes.count ?? 0;
  }

  let visits = 0;
  const { data: visitsRpc, error: visitsRpcErr } = await supabase.rpc(
    'count_staff_profile_unique_visits',
    { p_staff_id: staffId }
  );
  if (!visitsRpcErr && typeof visitsRpc === 'number') {
    visits = visitsRpc;
  } else {
    const { count: visitsCount } = await supabase
      .from('staff_profile_visits')
      .select('id', { count: 'exact', head: true })
      .eq('viewed_staff_id', staffId);
    visits = visitsCount ?? 0;
  }

  return {
    posts: postsCount ?? postIds.length ?? 0,
    likes,
    comments,
    visits,
  };
}
