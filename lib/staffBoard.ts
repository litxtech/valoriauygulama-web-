import { supabase } from '@/lib/supabase';
import { notifyStaffBoardAnnouncementPush } from '@/lib/notificationService';
import i18n from '@/i18n';
import {
  announcementMediaLegacyFields,
  parseAnnouncementMediaPayload,
  type AnnouncementMediaPayload,
} from '@/lib/announcementMedia';

/** Okunduktan sonra header gözü bu süre boyunca kalır, sonra gizlenir. */
export const BOARD_EYE_HIDE_AFTER_MS = 24 * 60 * 60 * 1000;

export type StaffBoardEyeState = {
  visible: boolean;
  hasUnread: boolean;
  unreadCount: number;
};

export type StaffAnnouncementRow = {
  id: string;
  title: string;
  content: string;
  priority: 'low' | 'normal' | 'high' | 'urgent' | string;
  created_at: string;
  expires_at: string | null;
  read_at: string | null;
  action_url: string | null;
  action_text: string | null;
  image_url: string | null;
  media_payload: AnnouncementMediaPayload | null;
  staff_assignment_id: string | null;
};

function isActiveAnnouncement(row: { expires_at: string | null; is_active?: boolean | null }): boolean {
  if (row.is_active === false) return false;
  if (!row.expires_at) return true;
  return new Date(row.expires_at).getTime() > Date.now();
}

/** Yönetim duyuruları + kişiye özel görev bildirimleri — personel panosu */
export async function fetchStaffAnnouncements(staffId: string): Promise<StaffAnnouncementRow[]> {
  const { data: rows, error } = await supabase
    .from('announcements')
    .select(
      'id, title, content, priority, created_at, expires_at, is_active, target_type, target_staff_id, action_url, action_text, image_url, media_payload, staff_assignment_id'
    )
    .in('target_type', ['all', 'staff'])
    .or(`target_staff_id.is.null,target_staff_id.eq.${staffId}`)
    .order('created_at', { ascending: false })
    .limit(80);

  if (error || !rows?.length) return [];

  const active = rows.filter((r) => isActiveAnnouncement(r as { expires_at: string | null; is_active?: boolean }));
  if (active.length === 0) return [];

  const ids = active.map((r) => r.id);
  const { data: reads } = await supabase
    .from('announcement_reads')
    .select('announcement_id, read_at')
    .eq('user_id', staffId)
    .in('user_type', ['staff', 'admin'])
    .in('announcement_id', ids);

  const readMap = new Map((reads ?? []).map((r) => [r.announcement_id, r.read_at as string]));

  return active.map((r) => ({
    id: r.id,
    title: r.title,
    content: r.content,
    priority: r.priority ?? 'normal',
    created_at: r.created_at,
    expires_at: r.expires_at ?? null,
    read_at: readMap.get(r.id) ?? null,
    action_url: (r as { action_url?: string | null }).action_url ?? null,
    action_text: (r as { action_text?: string | null }).action_text ?? null,
    image_url: (r as { image_url?: string | null }).image_url ?? null,
    media_payload: parseAnnouncementMediaPayload((r as { media_payload?: unknown }).media_payload),
    staff_assignment_id: (r as { staff_assignment_id?: string | null }).staff_assignment_id ?? null,
  }));
}

export function computeStaffBoardEyeState(announcements: StaffAnnouncementRow[]): StaffBoardEyeState {
  if (announcements.length === 0) {
    return { visible: false, hasUnread: false, unreadCount: 0 };
  }

  const unread = announcements.filter((a) => !a.read_at);
  if (unread.length > 0) {
    return { visible: true, hasUnread: true, unreadCount: unread.length };
  }

  const readTimes = announcements
    .map((a) => a.read_at)
    .filter((t): t is string => !!t)
    .map((t) => new Date(t).getTime());
  if (readTimes.length === 0) {
    return { visible: true, hasUnread: true, unreadCount: announcements.length };
  }

  const latestRead = Math.max(...readTimes);
  const visible = Date.now() - latestRead < BOARD_EYE_HIDE_AFTER_MS;
  return { visible, hasUnread: false, unreadCount: 0 };
}

export async function countUnreadStaffAnnouncements(staffId: string): Promise<number> {
  const list = await fetchStaffAnnouncements(staffId);
  return list.filter((a) => !a.read_at).length;
}

export async function markStaffAnnouncementRead(staffId: string, announcementId: string): Promise<{ error?: string }> {
  const { error } = await supabase.from('announcement_reads').upsert(
    {
      announcement_id: announcementId,
      user_id: staffId,
      user_type: 'staff',
      read_at: new Date().toISOString(),
    },
    { onConflict: 'announcement_id,user_id,user_type' }
  );
  return error ? { error: error.message } : {};
}

export async function markAllStaffAnnouncementsRead(staffId: string, announcementIds: string[]): Promise<void> {
  if (announcementIds.length === 0) return;
  const now = new Date().toISOString();
  const { error } = await supabase.from('announcement_reads').upsert(
    announcementIds.map((announcement_id) => ({
      announcement_id,
      user_id: staffId,
      user_type: 'staff',
      read_at: now,
    })),
    { onConflict: 'announcement_id,user_id,user_type' }
  );
  if (error) console.warn('markAllStaffAnnouncementsRead', error.message);
}

/** Admin toplu duyuru: pano + (isteğe bağlı) bildirim */
export async function publishStaffBoardAnnouncement(params: {
  title: string;
  content: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  createdByStaffId: string;
  createdByType?: 'admin' | 'staff';
  targetType?: 'all' | 'staff';
  targetStaffId?: string | null;
  organizationId?: string | null;
  /** Toplu bildirim ekranı zaten push gönderdiyse true */
  skipPush?: boolean;
  mediaPayload?: AnnouncementMediaPayload | null;
}): Promise<{ id?: string; error?: string }> {
  const legacy = announcementMediaLegacyFields(params.mediaPayload ?? null);
  const { data, error } = await supabase
    .from('announcements')
    .insert({
      title: params.title.trim(),
      content: params.content.trim(),
      priority: params.priority ?? 'normal',
      target_type: params.targetType ?? 'staff',
      target_staff_id: params.targetStaffId ?? null,
      created_by: params.createdByStaffId,
      created_by_type: params.createdByType ?? 'admin',
      is_active: true,
      image_url: legacy.image_url,
      action_url: legacy.action_url,
      action_text: legacy.action_text,
      media_payload: params.mediaPayload ?? null,
    })
    .select('id')
    .maybeSingle();

  if (error) return { error: error.message };

  const id = (data as { id?: string } | null)?.id;
  if (!params.skipPush && id) {
    notifyStaffBoardAnnouncementPush({
      title: params.title.trim(),
      body: params.content.trim(),
      targetStaffId: params.targetStaffId ?? null,
      organizationId: params.organizationId ?? null,
    }).catch(() => {});
  }

  return { id };
}

/** Görev atandığında — yalnızca atanan personelin duyuru panosunda */
export async function publishTaskAssignmentBoardNotice(params: {
  assigneeStaffId: string;
  createdByStaffId: string;
  assignmentId: string;
  title: string;
  content: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
}): Promise<{ id?: string; error?: string }> {
  const { data, error } = await supabase
    .from('announcements')
    .insert({
      title: params.title.trim(),
      content: params.content.trim(),
      priority: params.priority ?? 'normal',
      target_type: 'staff',
      target_staff_id: params.assigneeStaffId,
      staff_assignment_id: params.assignmentId,
      action_url: '/staff/tasks',
      created_by: params.createdByStaffId,
      created_by_type: 'staff',
      is_active: true,
    })
    .select('id')
    .maybeSingle();

  if (error) return { error: error.message };
  return { id: (data as { id?: string } | null)?.id };
}

export function isTaskAssignmentBoardRow(row: StaffAnnouncementRow): boolean {
  return !!row.staff_assignment_id;
}

export function priorityLabel(priority: string, row?: StaffAnnouncementRow): string {
  if (row && isTaskAssignmentBoardRow(row)) return i18n.t('staffBoardTypeTask');
  switch (priority) {
    case 'urgent':
      return i18n.t('assignPriority_urgent');
    case 'high':
      return i18n.t('staffBoardPriorityHigh');
    case 'low':
      return i18n.t('staffBoardPriorityLow');
    default:
      return i18n.t('staffBoardTitle');
  }
}

export function priorityAccent(priority: string, row?: StaffAnnouncementRow): string {
  if (row && isTaskAssignmentBoardRow(row)) return '#7c3aed';
  switch (priority) {
    case 'urgent':
      return '#dc2626';
    case 'high':
      return '#ea580c';
    case 'low':
      return '#64748b';
    default:
      return '#2563eb';
  }
}
