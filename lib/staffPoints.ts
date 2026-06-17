import { supabase } from '@/lib/supabase';
import { getDepartmentLabel } from '@/lib/departmentLabels';

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
  reward: 'trophy',
  penalty: 'warning',
  breakfast: 'cafe',
};

export const POINT_REFERENCE_LABELS: Record<string, string> = {
  staff_assignment: 'Görev tamamlama',
  breakfast_confirmation: 'Kahvaltı teyidi',
  smart_ops_task: 'Operasyon görevi',
  manual: 'Yönetici puanı',
};

export type StaffPointEntry = {
  id: string;
  staff_id: string;
  points: number;
  category: string;
  reason: string | null;
  department: string | null;
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

export type StaffPointsRankRow = StaffPointsSummary & {
  rank: number;
  full_name: string | null;
  department: string | null;
};

export type PointsBreakdownRow = {
  key: string;
  label: string;
  points: number;
  count: number;
};

export type StaffPointsLedger = {
  mySummary: StaffPointsSummary | null;
  myRank: number;
  rankedTotal: number;
  history: StaffPointEntry[];
  byCategory: PointsBreakdownRow[];
  byDepartment: PointsBreakdownRow[];
  leaderboard: StaffPointsRankRow[];
  giverNames: Record<string, string>;
};

const POINT_ENTRY_SELECT =
  'id, staff_id, points, category, reason, department, reference_type, reference_id, created_by_staff_id, created_at';

export async function awardStaffPoints(params: {
  organizationId: string;
  staffId: string;
  points: number;
  category: PointCategory;
  reason: string;
  department?: string | null;
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
    department: params.department?.trim() || null,
    reference_type: params.referenceType ?? null,
    reference_id: params.referenceId ?? null,
    created_by_staff_id: params.createdByStaffId,
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function fetchStaffPointsSummary(organizationId: string): Promise<StaffPointsSummary[]> {
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
    .select(POINT_ENTRY_SELECT)
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (staffId) q = q.eq('staff_id', staffId);
  const { data, error } = await q;
  if (error) return [];
  return (data ?? []) as StaffPointEntry[];
}

function aggregateBreakdown(
  entries: StaffPointEntry[],
  keyFn: (e: StaffPointEntry) => string,
  labelFn: (key: string) => string
): PointsBreakdownRow[] {
  const map = new Map<string, { points: number; count: number }>();
  for (const e of entries) {
    const key = keyFn(e);
    const prev = map.get(key) ?? { points: 0, count: 0 };
    map.set(key, { points: prev.points + e.points, count: prev.count + 1 });
  }
  return [...map.entries()]
    .map(([key, v]) => ({ key, label: labelFn(key), points: v.points, count: v.count }))
    .sort((a, b) => b.points - a.points);
}

/** Personel: kendi puan özeti, sıra, geçmiş ve bölüm/kategori dağılımı. */
export async function fetchStaffPointsLedger(params: {
  organizationId: string;
  staffId: string;
  historyLimit?: number;
}): Promise<StaffPointsLedger> {
  const { organizationId, staffId, historyLimit = 200 } = params;

  const [summaryRes, history, staffRes] = await Promise.all([
    fetchStaffPointsSummary(organizationId),
    fetchStaffPointsHistory(organizationId, staffId, historyLimit),
    supabase
      .from('staff')
      .select('id, full_name, department')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .is('deleted_at', null),
  ]);

  const staffRows = (staffRes.data ?? []) as { id: string; full_name: string | null; department: string | null }[];
  const nameById = Object.fromEntries(staffRows.map((s) => [s.id, s.full_name ?? '—']));
  const deptById = Object.fromEntries(staffRows.map((s) => [s.id, s.department]));

  const ranked = [...summaryRes]
    .sort((a, b) => b.total_points - a.total_points || a.staff_id.localeCompare(b.staff_id))
    .map((row, idx) => ({
      ...row,
      rank: idx + 1,
      full_name: nameById[row.staff_id] ?? null,
      department: deptById[row.staff_id] ?? null,
    }));

  const mySummary = summaryRes.find((s) => s.staff_id === staffId) ?? null;
  const myRankRow = ranked.find((r) => r.staff_id === staffId);
  const giverIds = [...new Set(history.map((h) => h.created_by_staff_id).filter(Boolean))] as string[];
  const giverNames: Record<string, string> = {};
  for (const id of giverIds) {
    giverNames[id] = nameById[id] ?? 'Yönetici';
  }

  return {
    mySummary,
    myRank: myRankRow?.rank ?? ranked.length + 1,
    rankedTotal: staffRows.length,
    history,
    byCategory: aggregateBreakdown(history, (e) => e.category, (k) => POINT_CATEGORY_LABELS[k] ?? k),
    byDepartment: aggregateBreakdown(
      history,
      (e) => e.department?.trim() || 'general',
      (k) => (k === 'general' ? 'Genel / tüm bölümler' : getDepartmentLabel(k))
    ),
    leaderboard: ranked,
    giverNames,
  };
}

export function describePointEntry(
  entry: StaffPointEntry,
  giverNames: Record<string, string>
): { source: string; giver: string | null } {
  const source =
    entry.reference_type && POINT_REFERENCE_LABELS[entry.reference_type]
      ? POINT_REFERENCE_LABELS[entry.reference_type]
      : POINT_CATEGORY_LABELS[entry.category] ?? entry.category;
  const giver = entry.created_by_staff_id ? giverNames[entry.created_by_staff_id] ?? 'Yönetici' : null;
  return { source, giver };
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
