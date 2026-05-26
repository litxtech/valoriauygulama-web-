import { supabase } from '@/lib/supabase';

export type PointCategory = 'general' | 'task' | 'breakfast' | 'reward' | 'penalty';

export const POINT_CATEGORY_LABELS: Record<string, string> = {
  general: 'Genel',
  task: 'Görev',
  breakfast: 'Kahvaltı',
  reward: 'Ödül',
  penalty: 'Ceza',
};

export const POINT_CATEGORY_ICONS: Record<string, string> = {
  general: 'star',
  task: 'clipboard',
  breakfast: 'cafe',
  reward: 'trophy',
  penalty: 'warning',
};

export type StaffPointEntry = {
  id: string;
  staff_id: string;
  points: number;
  category: string;
  reason: string | null;
  reference_type: string | null;
  reference_id: string | null;
  created_by_staff_id: string | null;
  created_at: string;
};

export type StaffPointsSummary = {
  staff_id: string;
  total_points: number;
  positive_count: number;
  negative_count: number;
  total_entries: number;
};

export async function awardStaffPoints(params: {
  organizationId: string;
  staffId: string;
  points: number;
  category: PointCategory;
  reason: string;
  referenceType?: string;
  referenceId?: string;
  createdByStaffId: string;
}): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.from('staff_points').insert({
    organization_id: params.organizationId,
    staff_id: params.staffId,
    points: params.points,
    category: params.category,
    reason: params.reason,
    reference_type: params.referenceType ?? null,
    reference_id: params.referenceId ?? null,
    created_by_staff_id: params.createdByStaffId,
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function fetchStaffPointsSummary(
  organizationId: string
): Promise<StaffPointsSummary[]> {
  const { data, error } = await supabase
    .from('staff_points_summary')
    .select('*')
    .eq('organization_id', organizationId);
  if (error) return [];
  return (data ?? []) as StaffPointsSummary[];
}

export async function fetchStaffPointsHistory(
  organizationId: string,
  staffId?: string,
  limit = 100
): Promise<StaffPointEntry[]> {
  let q = supabase
    .from('staff_points')
    .select('id, staff_id, points, category, reason, reference_type, reference_id, created_by_staff_id, created_at')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (staffId) q = q.eq('staff_id', staffId);
  const { data, error } = await q;
  if (error) return [];
  return (data ?? []) as StaffPointEntry[];
}

export function getPointsColor(points: number): string {
  if (points > 0) return '#047857';
  if (points < 0) return '#DC2626';
  return '#6B7280';
}

export function formatPoints(points: number): string {
  if (points > 0) return `+${points}`;
  return String(points);
}
