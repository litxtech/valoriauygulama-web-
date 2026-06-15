import { supabase } from '@/lib/supabase';
import type { StaffEngagementStats } from '@/lib/staffEngagementStats';
import { loadStaffEngagementStats } from '@/lib/staffEngagementStats';

export type StaffProfileExtendedStats = StaffEngagementStats & {
  tasksCompleted: number;
  thanksCount: number;
  workDays: number;
  tasksThisMonth: number;
  lastActive: string | null;
};

export async function loadStaffProfileExtendedStats(
  staffId: string,
  workDays: number | null
): Promise<StaffProfileExtendedStats> {
  const base = await loadStaffEngagementStats(staffId);
  if (!staffId) {
    return {
      ...base,
      tasksCompleted: 0,
      thanksCount: 0,
      workDays: workDays ?? 0,
      tasksThisMonth: 0,
      lastActive: null,
    };
  }

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthIso = monthStart.toISOString();

  const [tasksRes, monthTasksRes, tipsRes, staffRes] = await Promise.all([
    supabase
      .from('staff_assignments')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_staff_id', staffId)
      .eq('status', 'completed'),
    supabase
      .from('staff_assignments')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_staff_id', staffId)
      .eq('status', 'completed')
      .gte('completed_at', monthIso),
    supabase
      .from('staff_tips')
      .select('id', { count: 'exact', head: true })
      .eq('staff_id', staffId)
      .eq('status', 'confirmed'),
    supabase.from('staff').select('last_active').eq('id', staffId).maybeSingle(),
  ]);

  return {
    ...base,
    tasksCompleted: tasksRes.count ?? 0,
    thanksCount: tipsRes.count ?? 0,
    workDays: workDays ?? 0,
    tasksThisMonth: monthTasksRes.count ?? 0,
    lastActive: (staffRes.data as { last_active?: string | null } | null)?.last_active ?? null,
  };
}
