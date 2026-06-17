import { supabase } from '@/lib/supabase';

export type AnnouncementEngagementRow = {
  id: string;
  title: string;
  content: string;
  priority: string;
  created_at: string;
  target_staff_id: string | null;
  staff_assignment_id: string | null;
  created_by: string;
  read_count: number;
  target_count: number;
};

export type AnnouncementReaderRow = {
  staff_id: string;
  full_name: string | null;
  role: string | null;
  department: string | null;
  read_at: string;
};

async function fetchOrgStaffIds(organizationId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('staff')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .is('deleted_at', null);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.id as string);
}

export async function fetchAnnouncementEngagement(organizationId: string): Promise<AnnouncementEngagementRow[]> {
  const staffIds = await fetchOrgStaffIds(organizationId);
  if (staffIds.length === 0) return [];

  const staffIdSet = new Set(staffIds);

  const { data: announcements, error } = await supabase
    .from('announcements')
    .select(
      'id, title, content, priority, created_at, target_staff_id, staff_assignment_id, created_by, target_type, is_active'
    )
    .in('target_type', ['all', 'staff'])
    .order('created_at', { ascending: false })
    .limit(120);

  if (error) throw new Error(error.message);

  const filtered = (announcements ?? []).filter((a) => {
    const createdBy = a.created_by as string;
    const targetStaffId = (a.target_staff_id as string | null) ?? null;
    if (staffIdSet.has(createdBy)) return true;
    if (targetStaffId && staffIdSet.has(targetStaffId)) return true;
    return false;
  });

  if (filtered.length === 0) return [];

  const ids = filtered.map((a) => a.id as string);
  const { data: reads, error: readsErr } = await supabase
    .from('announcement_reads')
    .select('announcement_id, user_id')
    .in('announcement_id', ids)
    .in('user_id', staffIds)
    .in('user_type', ['staff', 'admin']);

  if (readsErr) throw new Error(readsErr.message);

  const readCountMap = new Map<string, number>();
  for (const r of reads ?? []) {
    const annId = r.announcement_id as string;
    readCountMap.set(annId, (readCountMap.get(annId) ?? 0) + 1);
  }

  return filtered
    .filter((a) => a.is_active !== false)
    .map((a) => {
      const targetStaffId = (a.target_staff_id as string | null) ?? null;
      return {
        id: a.id as string,
        title: a.title as string,
        content: a.content as string,
        priority: (a.priority as string) ?? 'normal',
        created_at: a.created_at as string,
        target_staff_id: targetStaffId,
        staff_assignment_id: (a.staff_assignment_id as string | null) ?? null,
        created_by: a.created_by as string,
        read_count: readCountMap.get(a.id as string) ?? 0,
        target_count: targetStaffId ? 1 : staffIds.length,
      };
    });
}

export async function fetchAnnouncementReaders(announcementId: string, organizationId: string): Promise<{
  readers: AnnouncementReaderRow[];
  unread: AnnouncementReaderRow[];
}> {
  const staffIds = await fetchOrgStaffIds(organizationId);
  if (staffIds.length === 0) return { readers: [], unread: [] };

  const { data: staffRows, error: staffErr } = await supabase
    .from('staff')
    .select('id, full_name, role, department')
    .in('id', staffIds)
    .order('full_name', { ascending: true });
  if (staffErr) throw new Error(staffErr.message);

  const { data: ann, error: annErr } = await supabase
    .from('announcements')
    .select('target_staff_id')
    .eq('id', announcementId)
    .maybeSingle();
  if (annErr) throw new Error(annErr.message);

  const targetStaffId = (ann?.target_staff_id as string | null) ?? null;
  const audience = targetStaffId
    ? (staffRows ?? []).filter((s) => s.id === targetStaffId)
    : staffRows ?? [];

  const { data: reads, error: readsErr } = await supabase
    .from('announcement_reads')
    .select('user_id, read_at')
    .eq('announcement_id', announcementId)
    .in('user_id', staffIds)
    .in('user_type', ['staff', 'admin']);
  if (readsErr) throw new Error(readsErr.message);

  const readMap = new Map((reads ?? []).map((r) => [r.user_id as string, r.read_at as string]));

  const readers: AnnouncementReaderRow[] = [];
  const unread: AnnouncementReaderRow[] = [];

  for (const s of audience) {
    const readAt = readMap.get(s.id as string);
    const row: AnnouncementReaderRow = {
      staff_id: s.id as string,
      full_name: s.full_name as string | null,
      role: s.role as string | null,
      department: s.department as string | null,
      read_at: readAt ?? '',
    };
    if (readAt) readers.push(row);
    else unread.push(row);
  }

  readers.sort((a, b) => new Date(b.read_at).getTime() - new Date(a.read_at).getTime());
  unread.sort((a, b) => (a.full_name ?? '').localeCompare(b.full_name ?? '', 'tr'));

  return { readers, unread };
}
