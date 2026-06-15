import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { sendNotificationToStaffIds } from '@/lib/notificationService';
import { isValidUuid } from '@/lib/organizationScope';
import type {
  CreateDepartmentRuleInput,
  DepartmentRuleDetail,
  DepartmentRuleReadRow,
  DepartmentRuleRow,
  RuleTrackingStats,
} from './types';
import type { DepartmentRuleStatus } from './constants';
import { departmentLabel } from './constants';

function deviceInfo(): string {
  return Platform.OS;
}

function scopedOrgId(orgId?: string | null): string | undefined {
  if (!orgId || !isValidUuid(orgId)) return undefined;
  return orgId.trim();
}

export async function generateRuleDocumentNumber(orgId: string): Promise<string> {
  const { data, error } = await supabase.rpc('next_department_rule_document_number', { p_org_id: orgId });
  if (error) throw error;
  return String(data);
}

export async function listDepartmentRules(opts: {
  organizationId?: string | null;
  status?: DepartmentRuleStatus | DepartmentRuleStatus[];
  department?: string;
  ruleType?: string;
  search?: string;
  requiresAcknowledgement?: boolean;
  limit?: number;
  staffView?: boolean;
}): Promise<{ data: DepartmentRuleRow[]; error: Error | null }> {
  let q = supabase
    .from('department_rules')
    .select('*, creator:staff!department_rules_created_by_fkey(full_name)')
    .is('deleted_at', null)
    .order('updated_at', { ascending: false });

  if (opts.organizationId) {
    const org = scopedOrgId(opts.organizationId);
    if (org) q = q.eq('organization_id', org);
  }
  if (opts.status) {
    const statuses = Array.isArray(opts.status) ? opts.status : [opts.status];
    q = q.in('status', statuses);
  } else if (opts.staffView) {
    q = q.in('status', ['published', 'expired', 'archived']);
  }
  if (opts.department) q = q.eq('department', opts.department);
  if (opts.ruleType) q = q.eq('rule_type', opts.ruleType);
  if (opts.requiresAcknowledgement != null) {
    q = q.eq('requires_acknowledgement', opts.requiresAcknowledgement);
  }
  if (opts.search?.trim()) {
    const s = opts.search.trim();
    q = q.or(`title.ilike.%${s}%,content.ilike.%${s}%,document_number.ilike.%${s}%`);
  }
  if (opts.limit) q = q.limit(opts.limit);

  const { data, error } = await q;
  return { data: (data ?? []) as DepartmentRuleRow[], error: error ? new Error(error.message) : null };
}

export async function getDepartmentRuleDetail(ruleId: string): Promise<{ data: DepartmentRuleDetail | null; error: Error | null }> {
  const [ruleRes, attRes, readsRes] = await Promise.all([
    supabase
      .from('department_rules')
      .select('*, creator:staff!department_rules_created_by_fkey(full_name)')
      .eq('id', ruleId)
      .is('deleted_at', null)
      .maybeSingle(),
    supabase.from('department_rule_attachments').select('*').eq('rule_id', ruleId).order('created_at'),
    supabase
      .from('department_rule_reads')
      .select('*, staff:staff!department_rule_reads_user_id_fkey(full_name, department)')
      .eq('rule_id', ruleId)
      .order('updated_at', { ascending: false }),
  ]);

  if (ruleRes.error) return { data: null, error: new Error(ruleRes.error.message) };
  if (!ruleRes.data) return { data: null, error: new Error('Kural bulunamadı') };

  const rule = ruleRes.data as DepartmentRuleRow;
  const rootId = rule.parent_rule_id ?? rule.id;

  const { data: versions } = await supabase
    .from('department_rules')
    .select('*, creator:staff!department_rules_created_by_fkey(full_name)')
    .or(`id.eq.${rootId},parent_rule_id.eq.${rootId}`)
    .is('deleted_at', null)
    .order('version', { ascending: false });

  return {
    data: {
      rule,
      attachments: (attRes.data ?? []) as DepartmentRuleDetail['attachments'],
      reads: (readsRes.data ?? []) as DepartmentRuleReadRow[],
      versions: (versions ?? []) as DepartmentRuleRow[],
    },
    error: null,
  };
}

export async function getRuleCounts(orgId?: string | null): Promise<Record<DepartmentRuleStatus, number>> {
  const base: Record<DepartmentRuleStatus, number> = {
    draft: 0,
    published: 0,
    scheduled: 0,
    expired: 0,
    archived: 0,
    cancelled: 0,
  };
  const statuses = Object.keys(base) as DepartmentRuleStatus[];
  await Promise.all(
    statuses.map(async (status) => {
      let q = supabase.from('department_rules').select('id', { count: 'exact', head: true }).eq('status', status).is('deleted_at', null);
      const org = scopedOrgId(orgId);
      if (org) q = q.eq('organization_id', org);
      const { count } = await q;
      base[status] = count ?? 0;
    }),
  );
  return base;
}

export async function createDepartmentRule(
  input: CreateDepartmentRuleInput,
  staffId: string,
): Promise<{ data: DepartmentRuleRow | null; error: Error | null }> {
  const documentNumber = await generateRuleDocumentNumber(input.organizationId);

  const { data, error } = await supabase
    .from('department_rules')
    .insert({
      organization_id: input.organizationId,
      document_number: documentNumber,
      title: input.title.trim(),
      department: input.department,
      rule_type: input.ruleType,
      content: input.content,
      start_date: input.startDate || null,
      end_date: input.endDate || null,
      start_time: input.startTime || null,
      end_time: input.endTime || null,
      is_permanent: input.isPermanent ?? false,
      status: input.status ?? 'draft',
      requires_acknowledgement: input.requiresAcknowledgement ?? false,
      is_printable: input.isPrintable ?? true,
      generate_pdf: input.generatePdf ?? true,
      send_notification: input.sendNotification ?? true,
      visible_roles: input.visibleRoles ?? [],
      target_departments: input.targetDepartments ?? (input.department !== 'all_hotel' ? [input.department] : []),
      target_staff_ids: input.targetStaffIds ?? [],
      publish_scope: input.publishScope ?? 'departments',
      scheduled_publish_at: input.scheduledPublishAt || null,
      created_by: staffId,
      updated_by: staffId,
    })
    .select('*')
    .single();

  if (error || !data) return { data: null, error: new Error(error?.message ?? 'Oluşturulamadı') };
  return { data: data as DepartmentRuleRow, error: null };
}

export async function updateDepartmentRule(
  ruleId: string,
  patch: Partial<CreateDepartmentRuleInput> & { status?: DepartmentRuleStatus },
  staffId: string,
  createNewVersion = false,
): Promise<{ data: DepartmentRuleRow | null; error: Error | null }> {
  const { data: existing, error: fetchErr } = await supabase
    .from('department_rules')
    .select('*')
    .eq('id', ruleId)
    .is('deleted_at', null)
    .maybeSingle();

  if (fetchErr || !existing) return { data: null, error: new Error(fetchErr?.message ?? 'Kural bulunamadı') };

  if (createNewVersion && existing.status === 'published') {
    const rootId = (existing.parent_rule_id as string | null) ?? existing.id;
    const newVersion = (existing.version as number) + 1;
    const docBase = String(existing.document_number).replace(/-v\d+$/, '');

    const { data: newRule, error: insertErr } = await supabase
      .from('department_rules')
      .insert({
        organization_id: existing.organization_id,
        document_number: `${docBase}-v${newVersion}`,
        title: patch.title?.trim() ?? existing.title,
        department: patch.department ?? existing.department,
        rule_type: patch.ruleType ?? existing.rule_type,
        content: patch.content ?? existing.content,
        start_date: patch.startDate !== undefined ? patch.startDate : existing.start_date,
        end_date: patch.endDate !== undefined ? patch.endDate : existing.end_date,
        start_time: patch.startTime !== undefined ? patch.startTime : existing.start_time,
        end_time: patch.endTime !== undefined ? patch.endTime : existing.end_time,
        is_permanent: patch.isPermanent ?? existing.is_permanent,
        status: patch.status ?? 'draft',
        requires_acknowledgement: patch.requiresAcknowledgement ?? existing.requires_acknowledgement,
        is_printable: patch.isPrintable ?? existing.is_printable,
        generate_pdf: patch.generatePdf ?? existing.generate_pdf,
        send_notification: patch.sendNotification ?? existing.send_notification,
        visible_roles: patch.visibleRoles ?? existing.visible_roles,
        target_departments: patch.targetDepartments ?? existing.target_departments,
        target_staff_ids: patch.targetStaffIds ?? existing.target_staff_ids,
        publish_scope: patch.publishScope ?? existing.publish_scope,
        scheduled_publish_at: patch.scheduledPublishAt !== undefined ? patch.scheduledPublishAt : existing.scheduled_publish_at,
        created_by: staffId,
        updated_by: staffId,
        version: newVersion,
        parent_rule_id: rootId,
      })
      .select('*')
      .single();

    if (insertErr || !newRule) return { data: null, error: new Error(insertErr?.message ?? 'Versiyon oluşturulamadı') };
    return { data: newRule as DepartmentRuleRow, error: null };
  }

  const updatePayload: Record<string, unknown> = { updated_by: staffId, updated_at: new Date().toISOString() };
  if (patch.title !== undefined) updatePayload.title = patch.title.trim();
  if (patch.department !== undefined) updatePayload.department = patch.department;
  if (patch.ruleType !== undefined) updatePayload.rule_type = patch.ruleType;
  if (patch.content !== undefined) updatePayload.content = patch.content;
  if (patch.startDate !== undefined) updatePayload.start_date = patch.startDate;
  if (patch.endDate !== undefined) updatePayload.end_date = patch.endDate;
  if (patch.startTime !== undefined) updatePayload.start_time = patch.startTime;
  if (patch.endTime !== undefined) updatePayload.end_time = patch.endTime;
  if (patch.isPermanent !== undefined) updatePayload.is_permanent = patch.isPermanent;
  if (patch.requiresAcknowledgement !== undefined) updatePayload.requires_acknowledgement = patch.requiresAcknowledgement;
  if (patch.isPrintable !== undefined) updatePayload.is_printable = patch.isPrintable;
  if (patch.generatePdf !== undefined) updatePayload.generate_pdf = patch.generatePdf;
  if (patch.sendNotification !== undefined) updatePayload.send_notification = patch.sendNotification;
  if (patch.visibleRoles !== undefined) updatePayload.visible_roles = patch.visibleRoles;
  if (patch.targetDepartments !== undefined) updatePayload.target_departments = patch.targetDepartments;
  if (patch.targetStaffIds !== undefined) updatePayload.target_staff_ids = patch.targetStaffIds;
  if (patch.publishScope !== undefined) updatePayload.publish_scope = patch.publishScope;
  if (patch.scheduledPublishAt !== undefined) updatePayload.scheduled_publish_at = patch.scheduledPublishAt;
  if (patch.status !== undefined) updatePayload.status = patch.status;

  const { data, error } = await supabase.from('department_rules').update(updatePayload).eq('id', ruleId).select('*').single();
  if (error || !data) return { data: null, error: new Error(error?.message ?? 'Güncellenemedi') };
  return { data: data as DepartmentRuleRow, error: null };
}

export async function publishDepartmentRule(
  ruleId: string,
  staffId: string,
  opts?: { scheduledAt?: string | null },
): Promise<{ data: DepartmentRuleRow | null; error: Error | null }> {
  const now = new Date().toISOString();
  const scheduledAt = opts?.scheduledAt?.trim();
  const status: DepartmentRuleStatus = scheduledAt && new Date(scheduledAt) > new Date() ? 'scheduled' : 'published';

  const { data, error } = await supabase
    .from('department_rules')
    .update({
      status,
      published_at: status === 'published' ? now : null,
      scheduled_publish_at: scheduledAt || null,
      approved_by: staffId,
      updated_by: staffId,
    })
    .eq('id', ruleId)
    .select('*')
    .single();

  if (error || !data) return { data: null, error: new Error(error?.message ?? 'Yayınlanamadı') };

  const rule = data as DepartmentRuleRow;
  if (status === 'published' && rule.send_notification) {
    await notifyRuleAudience(rule, staffId);
  }

  return { data: rule, error: null };
}

export async function softDeleteDepartmentRule(ruleId: string, staffId: string): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('department_rules')
    .update({ deleted_at: new Date().toISOString(), status: 'archived', updated_by: staffId })
    .eq('id', ruleId);
  return { error: error ? new Error(error.message) : null };
}

async function resolveTargetStaffIds(rule: DepartmentRuleRow): Promise<string[]> {
  if (rule.publish_scope === 'staff' && rule.target_staff_ids?.length) {
    return rule.target_staff_ids;
  }

  let q = supabase.from('staff').select('id, department, role').eq('organization_id', rule.organization_id).eq('is_active', true);
  const { data: staffList } = await q;
  if (!staffList?.length) return [];

  const depts =
    rule.publish_scope === 'all' || rule.department === 'all_hotel'
      ? null
      : rule.target_departments?.length
        ? rule.target_departments
        : [rule.department];

  return staffList
    .filter((s: { id: string; department: string | null; role: string | null }) => {
      if (rule.visible_roles?.length && s.role && !rule.visible_roles.includes(s.role)) return false;
      if (!depts) return true;
      const staffDept = (s.department ?? '').toLowerCase();
      return depts.some((d) => staffDepartmentMatchesRule(d, staffDept));
    })
    .map((s: { id: string }) => s.id);
}

function staffDepartmentMatchesRule(ruleDept: string, staffDept: string): boolean {
  const r = ruleDept.toLowerCase();
  const s = staffDept.toLowerCase();
  if (r === 'all_hotel') return true;
  if (r === s) return true;
  if (r === 'kitchen' && ['kitchen', 'mutfak', 'kitchen_staff', 'chef', 'head_chef', 'pastry'].includes(s)) return true;
  if (r === 'reception' && ['reception', 'resepsiyon', 'reception_chief', 'receptionist'].includes(s)) return true;
  if (r === 'housekeeping' && ['housekeeping', 'kat_hizmetleri'].includes(s)) return true;
  if (r === 'technical' && ['technical', 'teknik'].includes(s)) return true;
  if (r === 'security' && ['security', 'guvenlik'].includes(s)) return true;
  return false;
}

export async function notifyRuleAudience(rule: DepartmentRuleRow, createdByStaffId: string, isReminder = false): Promise<void> {
  const staffIds = await resolveTargetStaffIds(rule);
  if (staffIds.length === 0) return;

  const title = isReminder ? 'Bölüm Kuralı Hatırlatması' : 'Yeni Bölüm Kuralı Yayınlandı';
  const body = isReminder
    ? `${departmentLabel(rule.department)} — ${rule.title}. Lütfen okuyup onaylayın.`
    : `${rule.title} güncellendi. Lütfen okuyup onaylayın.`;

  await sendNotificationToStaffIds({
    staffIds,
    title,
    body,
    createdByStaffId,
    notificationType: 'department_rule',
    category: 'staff',
    data: {
      ruleId: rule.id,
      organizationId: rule.organization_id,
      href: `/staff/department-rules/${rule.id}`,
      screen: `/staff/department-rules/${rule.id}`,
      feature_key: 'department_rule',
    },
  });
}

export async function markRuleRead(ruleId: string, staffId: string, orgId: string): Promise<{ error: Error | null }> {
  const now = new Date().toISOString();
  const { error } = await supabase.from('department_rule_reads').upsert(
    {
      rule_id: ruleId,
      organization_id: orgId,
      user_id: staffId,
      read_at: now,
      status: 'read',
      device_info: deviceInfo(),
      updated_at: now,
    },
    { onConflict: 'rule_id,user_id' },
  );
  return { error: error ? new Error(error.message) : null };
}

export async function acknowledgeRule(
  ruleId: string,
  staffId: string,
  orgId: string,
  version: number,
): Promise<{ error: Error | null }> {
  const now = new Date().toISOString();
  const { error } = await supabase.from('department_rule_reads').upsert(
    {
      rule_id: ruleId,
      organization_id: orgId,
      user_id: staffId,
      read_at: now,
      acknowledged_at: now,
      acknowledged_version: version,
      status: 'acknowledged',
      device_info: deviceInfo(),
      updated_at: now,
    },
    { onConflict: 'rule_id,user_id' },
  );
  return { error: error ? new Error(error.message) : null };
}

export async function getStaffRuleReadStatus(
  ruleId: string,
  staffId: string,
): Promise<DepartmentRuleReadRow | null> {
  const { data } = await supabase
    .from('department_rule_reads')
    .select('*')
    .eq('rule_id', ruleId)
    .eq('user_id', staffId)
    .maybeSingle();
  return (data as DepartmentRuleReadRow) ?? null;
}

export async function getRuleTrackingStats(rule: DepartmentRuleRow): Promise<RuleTrackingStats> {
  const staffIds = await resolveTargetStaffIds(rule);
  const { data: reads } = await supabase
    .from('department_rule_reads')
    .select('*, staff:staff!department_rule_reads_user_id_fkey(full_name)')
    .eq('rule_id', rule.id);

  const readRows = (reads ?? []) as DepartmentRuleReadRow[];
  const readSet = new Set(readRows.filter((r) => r.read_at).map((r) => r.user_id));
  const ackSet = new Set(readRows.filter((r) => r.acknowledged_at).map((r) => r.user_id));

  let unreadStaff: { id: string; full_name: string | null }[] = [];
  let unacknowledgedStaff: { id: string; full_name: string | null }[] = [];

  if (staffIds.length) {
    const { data: staffList } = await supabase.from('staff').select('id, full_name').in('id', staffIds);
    const list = (staffList ?? []) as { id: string; full_name: string | null }[];
    unreadStaff = list.filter((s) => !readSet.has(s.id));
    if (rule.requires_acknowledgement) {
      unacknowledgedStaff = list.filter((s) => !ackSet.has(s.id));
    }
  }

  return {
    sentCount: staffIds.length,
    readCount: readSet.size,
    acknowledgedCount: ackSet.size,
    unreadStaff,
    unacknowledgedStaff,
  };
}

export async function verifyDepartmentRuleToken(token: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase.rpc('verify_department_rule_token', { p_token: token });
  if (error) return null;
  return data as Record<string, unknown>;
}

export async function listStaffDepartmentRules(
  staffId: string,
  orgId: string,
  department: string | null,
): Promise<{ data: (DepartmentRuleRow & { readStatus?: string })[]; error: Error | null }> {
  const { data, error } = await listDepartmentRules({
    organizationId: orgId,
    staffView: true,
    limit: 200,
  });
  if (error) return { data: [], error };

  const { data: reads } = await supabase.from('department_rule_reads').select('rule_id, status').eq('user_id', staffId);
  const readMap = new Map((reads ?? []).map((r: { rule_id: string; status: string }) => [r.rule_id, r.status]));

  const filtered = data.filter((rule) => {
    if (rule.publish_scope === 'staff') {
      return rule.target_staff_ids?.includes(staffId);
    }
    if (rule.publish_scope === 'all' || rule.department === 'all_hotel') return true;
    return staffDepartmentMatchesRule(rule.department, (department ?? '').toLowerCase());
  });

  return {
    data: filtered.map((r) => ({ ...r, readStatus: readMap.get(r.id) ?? 'unread' })),
    error: null,
  };
}
