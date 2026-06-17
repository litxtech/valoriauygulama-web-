import { supabase } from '@/lib/supabase';

export async function recordStaffAssignmentView(assignmentId: string, staffId: string): Promise<void> {
  if (!assignmentId || !staffId) return;
  const { error } = await supabase.from('staff_assignment_views').upsert(
    {
      assignment_id: assignmentId,
      staff_id: staffId,
      viewed_at: new Date().toISOString(),
    },
    { onConflict: 'assignment_id,staff_id' }
  );
  if (error) console.warn('recordStaffAssignmentView', error.message);
}

export async function recordStaffTasksTabOpen(staffId: string, organizationId: string | null | undefined): Promise<void> {
  if (!staffId || !organizationId) return;
  const { error } = await supabase.from('staff_tasks_tab_views').upsert(
    {
      staff_id: staffId,
      organization_id: organizationId,
      last_opened_at: new Date().toISOString(),
    },
    { onConflict: 'staff_id' }
  );
  if (error) console.warn('recordStaffTasksTabOpen', error.message);
}

export type StaffAssignmentViewerRow = {
  staff_id: string;
  full_name: string | null;
  role: string | null;
  department: string | null;
  viewed_at: string;
};

export async function fetchStaffAssignmentViewers(assignmentId: string): Promise<StaffAssignmentViewerRow[]> {
  const { data, error } = await supabase
    .from('staff_assignment_views')
    .select('staff_id, viewed_at, staff:staff_id(full_name, role, department)')
    .eq('assignment_id', assignmentId)
    .order('viewed_at', { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const staff = row.staff as { full_name?: string | null; role?: string | null; department?: string | null } | null;
    return {
      staff_id: row.staff_id as string,
      full_name: staff?.full_name ?? null,
      role: staff?.role ?? null,
      department: staff?.department ?? null,
      viewed_at: row.viewed_at as string,
    };
  });
}

export type StaffTasksTabViewerRow = {
  staff_id: string;
  full_name: string | null;
  role: string | null;
  department: string | null;
  last_opened_at: string;
};

export async function fetchStaffTasksTabViewers(organizationId: string): Promise<StaffTasksTabViewerRow[]> {
  const { data, error } = await supabase
    .from('staff_tasks_tab_views')
    .select('staff_id, last_opened_at, staff:staff_id(full_name, role, department)')
    .eq('organization_id', organizationId)
    .order('last_opened_at', { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const staff = row.staff as { full_name?: string | null; role?: string | null; department?: string | null } | null;
    return {
      staff_id: row.staff_id as string,
      full_name: staff?.full_name ?? null,
      role: staff?.role ?? null,
      department: staff?.department ?? null,
      last_opened_at: row.last_opened_at as string,
    };
  });
}
