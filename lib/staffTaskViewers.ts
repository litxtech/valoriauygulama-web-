import { supabase } from '@/lib/supabase';

export type StaffTaskViewerRow = {
  id: string;
  full_name: string | null;
  role: string | null;
  department: string | null;
  is_active: boolean;
  canAssignTasks: boolean;
};

/** Aynı otelde görevleri görebilen aktif personel (RLS: org içi SELECT). */
export async function fetchStaffTaskViewers(organizationId: string | null | undefined): Promise<StaffTaskViewerRow[]> {
  if (!organizationId || organizationId === 'all') return [];

  const { data, error } = await supabase
    .from('staff')
    .select('id, full_name, role, department, is_active, app_permissions')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('full_name', { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const perms = (row.app_permissions ?? {}) as Record<string, boolean>;
    return {
      id: row.id as string,
      full_name: row.full_name as string | null,
      role: row.role as string | null,
      department: row.department as string | null,
      is_active: row.is_active !== false,
      canAssignTasks: row.role === 'admin' || perms.gorev_ata === true,
    };
  });
}
