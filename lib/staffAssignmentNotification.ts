import { supabase } from '@/lib/supabase';

export type StaffAssignmentBrief = {
  id: string;
  title: string;
  body: string | null;
  status: string;
  priority: string;
  created_by_staff_id: string | null;
};

export function assignmentIdFromNotificationData(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const raw = data as Record<string, unknown>;
  const id = raw.assignmentId ?? raw.openAssignmentId ?? raw.assignment_id;
  if (typeof id !== 'string') return null;
  const trimmed = id.trim();
  return trimmed || null;
}

export function isStaffAssignmentNotification(
  notificationType: string | null | undefined,
  data: unknown
): boolean {
  if (notificationType === 'staff_assignment' || notificationType === 'staff_new_task') {
    return true;
  }
  const url = data && typeof data === 'object' ? (data as Record<string, unknown>).url : null;
  if (typeof url === 'string' && url.includes('/staff/tasks')) {
    return !!assignmentIdFromNotificationData(data);
  }
  return !!assignmentIdFromNotificationData(data);
}

export function isAssignmentOpen(status: string | null | undefined): boolean {
  return status === 'pending' || status === 'in_progress';
}

export async function fetchMyStaffAssignmentBrief(
  assignmentId: string,
  staffId: string
): Promise<StaffAssignmentBrief | null> {
  const { data, error } = await supabase
    .from('staff_assignments')
    .select('id, title, body, status, priority, created_by_staff_id')
    .eq('id', assignmentId)
    .eq('assigned_staff_id', staffId)
    .maybeSingle();
  if (error || !data) return null;
  return data as StaffAssignmentBrief;
}

export async function fetchMyStaffAssignmentBriefByIdOnly(
  assignmentId: string
): Promise<StaffAssignmentBrief | null> {
  const { data, error } = await supabase
    .from('staff_assignments')
    .select('id, title, body, status, priority, created_by_staff_id, assigned_staff_id')
    .eq('id', assignmentId)
    .maybeSingle();
  if (error || !data) return null;
  return data as StaffAssignmentBrief;
}
