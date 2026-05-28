import { supabase } from '@/lib/supabase';

export type SmartOpsRole =
  | 'all_staff'
  | 'kitchen'
  | 'housekeeping'
  | 'reception'
  | 'technical'
  | 'night_supervisor'
  | 'manager'
  | 'operations';

export const SMART_OPS_ROLE_LABELS: Record<string, string> = {
  all_staff: 'Tüm personel',
  kitchen: 'Mutfak',
  housekeeping: 'Housekeeping',
  reception: 'Resepsiyon',
  technical: 'Teknik',
  night_supervisor: 'Gece sorumlusu',
  manager: 'Yönetici',
  operations: 'Operasyon',
};

export const SMART_OPS_CRITICAL_LABELS: Record<string, string> = {
  low: 'Düşük',
  normal: 'Normal',
  high: 'Yüksek',
  critical: 'Kritik',
};

export const SMART_OPS_STATUS_LABELS: Record<string, string> = {
  pending: 'Bekliyor',
  acknowledged: 'Görüldü',
  completed: 'Tamamlandı',
  partial: 'Eksik',
  issue_reported: 'Sorun',
  overdue_l1: 'Gecikme (5dk)',
  overdue_l2: 'Yönetici uyarısı',
  overdue_l3: 'Kritik gecikme',
  cancelled: 'İptal',
};

export type SmartOpsTemplateRow = {
  id: string;
  organization_id: string;
  code: string | null;
  title: string | null;
  body: string | null;
  target_role: string;
  active: boolean;
  send_time: string | null;
  repeat_type: string;
  critical_level: string;
  require_photo: string;
  sound_type: string;
  checklist: { label: string; required?: boolean }[] | null;
  last_sent_at: string | null;
  escalation_enabled: boolean;
};

export type SmartOpsTaskRow = {
  id: string;
  organization_id: string;
  notification_id: string;
  assigned_staff_id: string | null;
  assigned_role: string;
  title: string;
  body: string;
  status: string;
  critical_level: string;
  require_photo: string;
  scheduled_for: string;
  due_at: string | null;
  completed_at: string | null;
  note: string | null;
  photo_url: string | null;
  issue_text: string | null;
};

export type SmartOpsChecklistItem = {
  id: string;
  label: string;
  is_required: boolean;
  checked: boolean;
  note: string | null;
};

export async function seedSmartOpsTemplates(organizationId: string): Promise<{ error?: string; count?: number }> {
  const { data, error } = await supabase.rpc('seed_smart_ops_templates', { p_org_id: organizationId });
  if (error) return { error: error.message };
  return { count: typeof data === 'number' ? data : 0 };
}

export async function fetchSmartOpsTemplates(organizationId: string): Promise<SmartOpsTemplateRow[]> {
  const { data, error } = await supabase
    .from('notification_templates')
    .select(
      'id, organization_id, code, title, body, target_role, active, send_time, repeat_type, critical_level, require_photo, sound_type, checklist, last_sent_at, escalation_enabled'
    )
    .eq('organization_id', organizationId)
    .eq('template_kind', 'smart_ops')
    .order('send_time', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as SmartOpsTemplateRow[];
}

export async function toggleSmartOpsTemplate(id: string, active: boolean): Promise<{ error?: string }> {
  const { error } = await supabase.from('notification_templates').update({ active, updated_at: new Date().toISOString() }).eq('id', id);
  return error ? { error: error.message } : {};
}

export function staffMatchesSmartOpsRoleLocal(
  staff: { role?: string | null; department?: string | null },
  role: string
): boolean {
  const r = role.toLowerCase();
  const dept = (staff.department ?? '').toLowerCase();
  const staffRole = (staff.role ?? '').toLowerCase();
  if (r === 'manager' || r === 'yonetici') return staffRole === 'admin' || staffRole === 'reception_chief';
  if (r === 'all_staff' || r === 'tum_personel' || r === 'all') return true;
  if (r === 'reception' || r === 'resepsiyon')
    return staffRole === 'receptionist' || staffRole === 'reception_chief' || dept.includes('reception') || dept.includes('resepsiyon');
  if (r === 'housekeeping' || r === 'temizlik') return staffRole === 'housekeeping' || dept.includes('housekeeping') || dept.includes('temizlik');
  if (r === 'kitchen' || r === 'mutfak') return dept.includes('kitchen') || dept.includes('restaurant') || dept.includes('mutfak');
  if (r === 'technical' || r === 'teknik') return staffRole === 'technical' || dept.includes('technical') || dept.includes('teknik');
  if (r === 'night_supervisor' || r === 'gece' || r === 'night')
    return staffRole === 'security' || dept.includes('night') || dept.includes('gece') || dept.includes('security');
  return dept === r || staffRole === r;
}

export async function fetchMySmartOpsTasks(
  staffId: string,
  organizationId: string,
  staffProfile?: { role?: string | null; department?: string | null }
): Promise<SmartOpsTaskRow[]> {
  const { data, error } = await supabase
    .from('task_instances')
    .select(
      'id, organization_id, notification_id, assigned_staff_id, assigned_role, title, body, status, critical_level, require_photo, scheduled_for, due_at, completed_at, note, photo_url, issue_text'
    )
    .eq('organization_id', organizationId)
    .in('status', ['pending', 'acknowledged', 'overdue_l1', 'overdue_l2', 'overdue_l3'])
    .or(`assigned_staff_id.eq.${staffId},assigned_staff_id.is.null`)
    .order('scheduled_for', { ascending: false })
    .limit(80);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as SmartOpsTaskRow[];
  return rows.filter(
    (row) =>
      row.assigned_staff_id === staffId ||
      (row.assigned_staff_id == null &&
        staffProfile &&
        staffMatchesSmartOpsRoleLocal(staffProfile, row.assigned_role))
  );
}

export async function fetchSmartOpsTaskDetail(taskId: string): Promise<{
  task: SmartOpsTaskRow | null;
  checklist: SmartOpsChecklistItem[];
}> {
  const [taskRes, checklistRes] = await Promise.all([
    supabase
      .from('task_instances')
      .select(
        'id, organization_id, notification_id, assigned_staff_id, assigned_role, title, body, status, critical_level, require_photo, scheduled_for, due_at, completed_at, note, photo_url, issue_text'
      )
      .eq('id', taskId)
      .maybeSingle(),
    supabase
      .from('task_checklist_items')
      .select('id, label, is_required, checked, note')
      .eq('task_instance_id', taskId)
      .order('item_order', { ascending: true }),
  ]);
  if (taskRes.error) throw new Error(taskRes.error.message);
  if (checklistRes.error) throw new Error(checklistRes.error.message);
  return {
    task: (taskRes.data as SmartOpsTaskRow | null) ?? null,
    checklist: (checklistRes.data ?? []) as SmartOpsChecklistItem[],
  };
}

export async function completeSmartOpsTask(params: {
  taskId: string;
  completionType: 'completed' | 'partial' | 'issue_reported';
  note?: string;
  photoUrl?: string;
  checklistUpdates?: { id: string; checked: boolean; note?: string }[];
}): Promise<{ error?: string; points?: number }> {
  const { data, error } = await supabase.rpc('complete_smart_ops_task', {
    p_task_id: params.taskId,
    p_completion_type: params.completionType,
    p_note: params.note ?? null,
    p_photo_url: params.photoUrl ?? null,
    p_checklist_updates: params.checklistUpdates ?? [],
  });
  if (error) return { error: error.message };
  const row = data as { points?: number } | null;
  return { points: row?.points };
}

export async function fetchSmartOpsLiveSummary(organizationId: string) {
  const { data, error } = await supabase
    .from('task_instances')
    .select('id, status, critical_level, assigned_role, title, due_at, completed_at')
    .eq('organization_id', organizationId)
    .gte('scheduled_for', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .order('scheduled_for', { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const open = rows.filter((r) =>
    ['pending', 'acknowledged', 'overdue_l1', 'overdue_l2', 'overdue_l3'].includes((r as { status: string }).status)
  );
  const overdue = rows.filter((r) => String((r as { status: string }).status).startsWith('overdue'));
  const done = rows.filter((r) => ['completed', 'partial', 'issue_reported'].includes((r as { status: string }).status));
  return { rows, open, overdue, done };
}

export function smartOpsTaskHref(taskId: string) {
  return `/staff/smart-ops/${taskId}` as const;
}

export function isSmartOpsNotificationType(type: string | null | undefined) {
  return (type ?? '').startsWith('smart_ops');
}
