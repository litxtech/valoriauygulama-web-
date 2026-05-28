/**
 * Yeni feed gönderisi sonrası tüm aktif personele (admin dahil) in-app + Expo push bildirimi.
 * Gönderi sahibi personel ise kendisi hariç tutulur.
 */
import { supabase, supabaseAnonKey } from '@/lib/supabase';
import { log } from '@/lib/logger';
import { postNotificationsReturnMinimal } from '@/lib/notificationService';
import { filterStaffIdsFeedNotMuted } from '@/lib/staffNotificationFilter';

export async function notifyStaffOfNewFeedPost(params: {
  postId: string;
  authorDisplayName: string;
  titlePreview?: string | null;
  excludeStaffId?: string | null;
  createdByStaffId?: string | null;
}): Promise<void> {
  const { postId, authorDisplayName, titlePreview, excludeStaffId, createdByStaffId } = params;
  const name = (authorDisplayName ?? '').trim() || 'Bir kullanıcı';
  const snippet = (titlePreview ?? '').trim();
  const bodyMain = `${name} yeni bir gönderi paylaştı`;
  const body =
    snippet.length > 0
      ? `${bodyMain}: ${snippet.slice(0, 80)}${snippet.length > 80 ? '…' : ''}`
      : bodyMain;
  const notifTitle = 'Yeni gönderi';
  const notifData = { screen: 'staff_feed', url: '/staff/feed', postId };

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const jwt = sessionData.session?.access_token ?? supabaseAnonKey;

    const { data: staffRows } = await supabase.from('staff').select('id').eq('is_active', true);
    const allStaffIds = (staffRows ?? []).map((r: { id: string }) => r.id);
    const staffIdsToNotify = excludeStaffId
      ? allStaffIds.filter((id) => id !== excludeStaffId)
      : allStaffIds;
    const afterFeedMute = await filterStaffIdsFeedNotMuted(staffIdsToNotify);
    if (afterFeedMute.length === 0) return;

    const ins = await postNotificationsReturnMinimal(
      afterFeedMute.map((staffId) => ({
        staff_id: staffId,
        title: notifTitle,
        body,
        category: 'staff',
        notification_type: 'feed_post',
        data: { postId, url: '/staff/feed' },
        created_by: createdByStaffId ?? null,
        sent_via: 'both',
        sent_at: new Date().toISOString(),
      }))
    );
    if (ins.error) log.warn('notifyNewFeedPost', 'notifications insert', ins.error.message);

    const { error: pushFnError } = await supabase.functions.invoke('send-expo-push', {
      body: {
        staffIds: afterFeedMute,
        title: notifTitle,
        body,
        data: notifData,
      },
      headers: { Authorization: `Bearer ${jwt}` },
    });
    if (pushFnError) log.warn('notifyNewFeedPost', 'send-expo-push', pushFnError);
  } catch (e) {
    log.warn('notifyNewFeedPost', e);
  }
}

/** Müşteri görünür feed gönderilerinde diğer misafirlere in-app + push (Edge Function, service role). */
export async function notifyGuestsOfNewFeedPost(postId: string): Promise<void> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      log.warn('notifyGuestsOfNewFeedPost', 'oturum yok');
      return;
    }
    const { data, error } = await supabase.functions.invoke('notify-guests-new-feed-post', {
      body: { postId },
      headers: { Authorization: `Bearer ${token}` },
    });
    if (error) log.warn('notifyGuestsOfNewFeedPost', 'invoke', error);
    else if (data && typeof data === 'object' && 'error' in data && (data as { error?: string }).error) {
      log.warn('notifyGuestsOfNewFeedPost', (data as { error: string }).error);
    }
  } catch (e) {
    log.warn('notifyGuestsOfNewFeedPost', e);
  }
}

export async function notifyStaffOfNewStory(params: {
  storyId: string;
  authorDisplayName: string;
  excludeStaffId?: string | null;
  createdByStaffId?: string | null;
}): Promise<void> {
  const { storyId, authorDisplayName, excludeStaffId, createdByStaffId } = params;
  const name = (authorDisplayName ?? '').trim() || 'Bir kullanıcı';
  const title = 'Yeni hikaye';
  const body = `${name} yeni bir hikaye paylaştı`;
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const jwt = sessionData.session?.access_token ?? supabaseAnonKey;
    const { data: staffRows } = await supabase.from('staff').select('id').eq('is_active', true);
    const allStaffIds = (staffRows ?? []).map((r: { id: string }) => r.id);
    const staffIdsToNotify = excludeStaffId ? allStaffIds.filter((id) => id !== excludeStaffId) : allStaffIds;
    const afterFeedMute = await filterStaffIdsFeedNotMuted(staffIdsToNotify);
    if (!afterFeedMute.length) return;
    const ins = await postNotificationsReturnMinimal(
      afterFeedMute.map((staffId) => ({
        staff_id: staffId,
        title,
        body,
        category: 'staff',
        notification_type: 'story_post',
        data: { storyId, url: '/staff/feed' },
        created_by: createdByStaffId ?? null,
        sent_via: 'both',
        sent_at: new Date().toISOString(),
      }))
    );
    if (ins.error) log.warn('notifyStaffOfNewStory', 'notifications insert', ins.error.message);
    await supabase.functions.invoke('send-expo-push', {
      body: { staffIds: afterFeedMute, title, body, data: { screen: 'staff_feed', url: '/staff/feed', storyId } },
      headers: { Authorization: `Bearer ${jwt}` },
    });
  } catch (e) {
    log.warn('notifyStaffOfNewStory', e);
  }
}

export async function notifyGuestsOfNewStory(storyId: string, authorDisplayName: string): Promise<void> {
  const name = (authorDisplayName ?? '').trim() || 'Bir personel';
  const title = 'Yeni hikaye';
  const body = `${name} yeni bir hikaye paylaştı`;
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const jwt = sessionData.session?.access_token ?? supabaseAnonKey;
    const { data: guests } = await supabase
      .from('guests')
      .select('id')
      .not('auth_user_id', 'is', null)
      .is('deleted_at', null)
      .in('status', ['pending', 'checked_in']);
    const guestIds = (guests ?? []).map((g: { id: string }) => g.id);
    if (!guestIds.length) return;
    const ins = await postNotificationsReturnMinimal(
      guestIds.map((guestId) => ({
        guest_id: guestId,
        title,
        body,
        category: 'guest',
        notification_type: 'story_post',
        data: { storyId, url: '/customer' },
        sent_via: 'both',
        sent_at: new Date().toISOString(),
      }))
    );
    if (ins.error) log.warn('notifyGuestsOfNewStory', 'notifications insert', ins.error.message);
    await supabase.functions.invoke('send-expo-push', {
      body: { guestIds, title, body, data: { screen: 'customer', url: '/customer', storyId } },
      headers: { Authorization: `Bearer ${jwt}` },
    });
  } catch (e) {
    log.warn('notifyGuestsOfNewStory', e);
  }
}
