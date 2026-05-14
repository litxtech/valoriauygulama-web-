import { supabase } from '@/lib/supabase';
import { maskStaffDisplayNameForPrivacy } from '@/lib/staffProfilePrivacy';

export type StaffStoryRow = {
  id: string;
  staff_id: string;
  media_type: 'image' | 'video';
  media_url: string;
  thumbnail_url: string | null;
  caption: string | null;
  expires_at: string;
  created_at: string;
  duration_seconds: number;
  staff: {
    full_name: string | null;
    profile_image: string | null;
    verification_badge?: 'blue' | 'yellow' | null;
    profile_hidden_by_admin?: boolean | null;
  } | null;
};

export type StaffStoryGroup = {
  staff_id: string;
  author_name: string;
  author_avatar: string | null;
  author_badge: 'blue' | 'yellow' | null;
  stories: StaffStoryRow[];
  latest_created_at: string;
  has_unseen: boolean;
};

export async function loadActiveStaffStories(
  viewerStaffId?: string | null,
  viewerIsAdmin = false
): Promise<StaffStoryGroup[]> {
  const nowIso = new Date().toISOString();

  const storiesPromise = supabase
    .from('feed_stories')
    .select(
      'id, staff_id, media_type, media_url, thumbnail_url, caption, expires_at, created_at, duration_seconds, staff:staff_id(full_name, profile_image, verification_badge, profile_hidden_by_admin)'
    )
    .is('deleted_at', null)
    .gt('expires_at', nowIso)
    .order('created_at', { ascending: true });
  const viewsPromise = viewerStaffId
    ? supabase.from('feed_story_views').select('story_id').eq('staff_id', viewerStaffId)
    : Promise.resolve({ data: [], error: null } as { data: { story_id: string }[]; error: null });
  const [{ data: storiesData, error: storiesErr }, { data: myViews, error: viewsErr }] = await Promise.all([
    storiesPromise,
    viewsPromise,
  ]);

  if (storiesErr) throw storiesErr;
  if (viewsErr) throw viewsErr;

  const viewedSet = new Set((myViews ?? []).map((r) => String((r as { story_id: string }).story_id)));
  const groupsMap = new Map<string, StaffStoryGroup>();

  ((storiesData ?? []) as StaffStoryRow[]).forEach((story) => {
    const staffId = story.staff_id;
    const existing = groupsMap.get(staffId);
    const storySeen = viewedSet.has(story.id);
    if (existing) {
      existing.stories.push(story);
      if (story.created_at > existing.latest_created_at) {
        existing.latest_created_at = story.created_at;
      }
      if (!storySeen) existing.has_unseen = true;
      return;
    }
    groupsMap.set(staffId, {
      staff_id: staffId,
      author_name: (() => {
        const raw = story.staff?.full_name?.trim() || '';
        const hidden = !!story.staff?.profile_hidden_by_admin;
        if (hidden && !viewerIsAdmin) return maskStaffDisplayNameForPrivacy(raw || null) || 'Personel';
        return raw || 'Personel';
      })(),
      author_avatar: story.staff?.profile_image ?? null,
      author_badge: story.staff?.verification_badge ?? null,
      stories: [story],
      latest_created_at: story.created_at,
      has_unseen: !storySeen,
    });
  });

  return Array.from(groupsMap.values()).sort((a, b) => {
    if (a.has_unseen !== b.has_unseen) return a.has_unseen ? -1 : 1;
    return b.latest_created_at.localeCompare(a.latest_created_at);
  });
}

export async function markStoryAsViewed(storyId: string, staffId: string) {
  // Partial unique indexes (migration 192) are not valid PostgREST on_conflict targets (42P10).
  const { data: existing, error: selErr } = await supabase
    .from('feed_story_views')
    .select('id')
    .eq('story_id', storyId)
    .eq('staff_id', staffId)
    .maybeSingle();
  if (selErr) return { data: null, error: selErr };
  if (existing?.id) return { data: null, error: null };
  return supabase.from('feed_story_views').insert({
    story_id: storyId,
    staff_id: staffId,
    viewed_at: new Date().toISOString(),
  });
}

export async function markStoryAsViewedForGuest(storyId: string, guestId: string) {
  const viewedAt = new Date().toISOString();
  const { data: existing, error: selErr } = await supabase
    .from('feed_story_views')
    .select('id')
    .eq('story_id', storyId)
    .eq('guest_id', guestId)
    .maybeSingle();
  if (selErr) return { data: null, error: selErr };
  if (existing?.id) {
    return supabase.from('feed_story_views').update({ viewed_at: viewedAt }).eq('id', existing.id);
  }
  return supabase.from('feed_story_views').insert({
    story_id: storyId,
    guest_id: guestId,
    viewed_at: viewedAt,
  });
}

export async function getStoryReactionSummary(storyId: string, staffId: string) {
  const [{ data: all }, { data: mine }] = await Promise.all([
    supabase.from('feed_story_reactions').select('id, staff_id').eq('story_id', storyId),
    supabase.from('feed_story_reactions').select('id').eq('story_id', storyId).eq('staff_id', staffId).maybeSingle(),
  ]);
  return {
    likeCount: (all ?? []).length,
    likedByMe: !!mine?.id,
  };
}

export async function toggleStoryLike(storyId: string, staffId: string, liked: boolean) {
  if (liked) {
    return supabase.from('feed_story_reactions').delete().eq('story_id', storyId).eq('staff_id', staffId);
  }
  return supabase.from('feed_story_reactions').insert({
    story_id: storyId,
    staff_id: staffId,
    reaction: 'like',
  });
}

export type StoryReplyRow = {
  id: string;
  story_id: string;
  staff_id: string | null;
  guest_id?: string | null;
  content: string;
  created_at: string;
  staff: { full_name: string | null; profile_image: string | null; verification_badge?: 'blue' | 'yellow' | null } | null;
  guest?: { full_name: string | null; photo_url?: string | null } | null;
};

export async function loadStoryReplies(storyId: string) {
  const { data, error } = await supabase
    .from('feed_story_replies')
    .select('id, story_id, staff_id, guest_id, content, created_at, staff:staff_id(full_name, profile_image, verification_badge), guest:guest_id(full_name, photo_url)')
    .eq('story_id', storyId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data ?? []) as StoryReplyRow[];
}

export async function addStoryReply(storyId: string, staffId: string, content: string) {
  return supabase.from('feed_story_replies').insert({
    story_id: storyId,
    staff_id: staffId,
    content: content.trim(),
  });
}

export async function reportStory(storyId: string, reporterStaffId: string, reason: string, details?: string | null) {
  return supabase.from('feed_story_reports').insert({
    story_id: storyId,
    reporter_staff_id: reporterStaffId,
    reason: reason.trim(),
    details: (details ?? '').trim() || null,
  });
}

export async function softDeleteStory(storyId: string) {
  return supabase.from('feed_stories').delete().eq('id', storyId);
}

export async function loadStoryViewers(storyId: string) {
  const { data, error } = await supabase
    .from('feed_story_views')
    .select('id, staff_id, guest_id, viewed_at, staff:staff_id(full_name, profile_image, verification_badge), guest:guest_id(full_name, photo_url)')
    .eq('story_id', storyId)
    .order('viewed_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as {
    id: string;
    staff_id: string | null;
    guest_id: string | null;
    viewed_at: string;
    staff: { full_name: string | null; profile_image: string | null; verification_badge?: 'blue' | 'yellow' | null } | null;
    guest: { full_name: string | null; photo_url?: string | null } | null;
  }[];
}
