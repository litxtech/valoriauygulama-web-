import type { TFunction } from 'i18next';
import { getDepartmentLabel } from '@/lib/departmentLabels';
import { sendBulkToStaff } from '@/lib/notificationService';
import type { StaffProfile } from '@/stores/authStore';

export type StaffAttendanceNotifyEvent = 'check_in' | 'check_out' | 'late_notice' | 'manual_request';

type StaffAttendanceNotifySlice =
  | (Pick<StaffProfile, 'id' | 'full_name' | 'department' | 'organization' | 'organization_id'> & {
      organization?: { id?: string; name?: string | null } | null;
    })
  | null
  | undefined;

function resolveAttendanceContext(staff: StaffAttendanceNotifySlice): string | null {
  const department = getDepartmentLabel(staff?.department);
  const hotel = staff?.organization?.name?.trim() || null;
  const parts = [
    department !== '—' ? department : null,
    hotel,
  ].filter((part): part is string => !!part && part.length > 0);
  return parts.length > 0 ? parts.join(' · ') : null;
}

const ACTION_KEYS: Record<StaffAttendanceNotifyEvent, string> = {
  check_in: 'staffAttNotifyCheckedIn',
  check_out: 'staffAttNotifyCheckedOut',
  late_notice: 'staffAttNotifyLate',
  manual_request: 'staffAttNotifyManual',
};

export function buildStaffAttendanceAdminNotification(
  staff: StaffAttendanceNotifySlice,
  event: StaffAttendanceNotifyEvent,
  t: TFunction,
  note?: string
): { title: string; body: string } {
  const name = staff?.full_name?.trim() || t('staffFeedSomeone');
  const context = resolveAttendanceContext(staff);
  const contextPart = context ? ` · ${context}` : '';

  const title = context
    ? t('staffAttNotifyTitleWithContext', { context })
    : t('staffAttNotifyTitle');

  let body = '';
  if (event === 'check_in') {
    body = `${name} ${t(ACTION_KEYS[event])}${contextPart} — ${t('staffAttNotifyActiveOnSite')}`;
  } else if (event === 'check_out') {
    body = `${name} ${t(ACTION_KEYS[event])}${contextPart}`;
  } else {
    body = `${name} ${t(ACTION_KEYS[event])}${contextPart}`;
  }

  if (note?.trim()) {
    body = `${body} — ${note.trim()}`;
  }

  return { title, body };
}

/** Giriş / çıkış / gecikme bildirimini organizasyondaki tüm personele gönderir (işlemi yapan hariç). */
export async function notifyAllStaffForAttendanceAction(
  staff: StaffAttendanceNotifySlice,
  event: StaffAttendanceNotifyEvent,
  t: TFunction,
  note?: string
): Promise<{ count?: number; error?: string }> {
  const actorId = staff?.id;
  if (!actorId) return { error: 'staff id missing' };

  const { title, body } = buildStaffAttendanceAdminNotification(staff, event, t, note);
  const organizationId = staff?.organization_id || staff?.organization?.id || null;

  return sendBulkToStaff({
    target: 'all_staff',
    organizationId,
    title,
    body,
    createdByStaffId: actorId,
    notificationType: 'staff_attendance_action',
    category: 'staff',
    excludeStaffIds: [actorId],
    data: {
      url: '/staff/attendance',
      screen: '/staff/attendance',
      notificationType: 'staff_attendance_action',
      event,
    },
  });
}
