import type { AdminNoteTag } from '@/lib/adminQuickNotes';
import { ADMIN_NOTE_TAG_LABELS } from '@/lib/adminQuickNotes';
import { log } from '@/lib/logger';
import {
  notifyAdminPanel,
  postNotificationsReturnMinimal,
  sendExpoPushToRecipients,
} from '@/lib/notificationService';
import { filterStaffIdsByNotificationType } from '@/lib/staffNotificationFilter';
import { supabase } from '@/lib/supabase';

function isOrgAdminStaff(row: {
  id: string;
  role: string | null;
  app_permissions?: Record<string, unknown> | null;
}): boolean {
  if (row.role === 'admin') return true;
  return row.app_permissions?.super_admin === true;
}

/** Personel (admin olmayan) not oluşturduğunda org yöneticilerine in-app + push bildirim. */
export async function notifyAdminsStaffQuickNote(params: {
  organizationId: string;
  createdByStaffId: string;
  noteId: string;
  noteNumber: string;
  tag: AdminNoteTag;
  title?: string | null;
  bodyText: string;
  roomLabel?: string | null;
}): Promise<void> {
  try {
    const { data: creator } = await supabase
      .from('staff')
      .select('id, role, full_name')
      .eq('id', params.createdByStaffId)
      .maybeSingle();

    if (!creator || creator.role === 'admin') return;

    const creatorName = (creator.full_name ?? '').trim() || 'Personel';
    const tagLabel = ADMIN_NOTE_TAG_LABELS[params.tag] ?? 'Genel';

    let preview = params.title?.trim() || params.bodyText.trim().slice(0, 100) || 'Not';
    if (params.roomLabel?.trim()) {
      preview += ` · ${params.roomLabel.trim()}`;
    }

    const notifTitle =
      params.tag === 'urgent'
        ? `Acil personel notu — ${params.noteNumber}`
        : `Yeni personel notu — ${params.noteNumber}`;
    const notifBody = `${creatorName} (${tagLabel}): ${preview}`;
    const href = `/admin/notes/${params.noteId}`;
    const pushData = {
      kind: 'staff_quick_note',
      notificationType: 'staff_quick_note',
      notification_type: 'staff_quick_note',
      noteId: params.noteId,
      noteNumber: params.noteNumber,
      tag: params.tag,
      url: href,
      screen: href,
    };

    const { data: staffRows, error } = await supabase
      .from('staff')
      .select('id, role, app_permissions, auth_id')
      .eq('organization_id', params.organizationId)
      .eq('is_active', true)
      .is('deleted_at', null);

    if (error) {
      log.warn('adminQuickNotesNotify', 'staff fetch', error.message);
    }

    const list = (staffRows ?? []) as {
      id: string;
      role: string | null;
      app_permissions?: Record<string, unknown> | null;
      auth_id: string | null;
    }[];

    const adminIds = list
      .filter((s) => s.id !== params.createdByStaffId && isOrgAdminStaff(s))
      .map((s) => s.id);

    const filtered = await filterStaffIdsByNotificationType(adminIds, 'staff_quick_note');

    if (filtered.length > 0) {
      const rows = filtered.map((staff_id) => ({
        staff_id,
        guest_id: null,
        title: notifTitle,
        body: notifBody,
        category: 'admin' as const,
        notification_type: 'staff_quick_note',
        data: pushData,
        created_by: params.createdByStaffId,
        sent_via: 'both' as const,
        sent_at: new Date().toISOString(),
      }));
      await postNotificationsReturnMinimal(rows);
      sendExpoPushToRecipients({
        staffIds: filtered,
        title: notifTitle,
        body: notifBody,
        data: pushData,
        notificationType: 'staff_quick_note',
        category: 'admin',
      }).catch(() => {});
      return;
    }

    await notifyAdminPanel({
      title: notifTitle,
      body: notifBody,
      href,
      notificationType: 'staff_quick_note',
    });
  } catch (e) {
    log.warn('adminQuickNotesNotify', 'exception', e);
    await notifyAdminPanel({
      title: `Yeni personel notu — ${params.noteNumber}`,
      body: params.bodyText.slice(0, 120),
      href: `/admin/notes/${params.noteId}`,
      notificationType: 'staff_quick_note',
    }).catch(() => {});
  }
}
