import { supabase } from '@/lib/supabase';
import { monthKey } from '@/lib/financeLedger';

export type PerformanceBoardStaffRow = {
  staff_id: string;
  full_name: string | null;
  department: string | null;
  profile_image: string | null;
  achievements: string[];
  average_rating: number | null;
  evaluation_management: number | null;
  evaluation_audit: number | null;
  evaluation_guest: number | null;
  evaluation_combined: number | null;
  evaluation_combined_updated_at: string | null;
  rank: number;
  audit_count_month: number;
  month_audit_avg: number | null;
  audit_delta_sum: number;
  weighted_management: number | null;
  weighted_audit: number | null;
  weighted_guest: number | null;
};

export type StaffPerformanceBoard = {
  month_key: string;
  organization_id: string;
  weights: { management: number; audit: number; guest: number };
  threshold_score: number;
  employee_of_month: PerformanceBoardStaffRow | null;
  staff: PerformanceBoardStaffRow[];
};

export async function fetchStaffPerformanceBoard(
  organizationId: string,
  ym?: string
): Promise<{ data: StaffPerformanceBoard | null; error?: string }> {
  const { data, error } = await supabase.rpc('get_organization_staff_performance_board', {
    p_organization_id: organizationId,
    p_month_key: ym ?? monthKey(),
  });
  if (error) return { data: null, error: error.message };
  const raw = data as StaffPerformanceBoard | null;
  if (!raw) return { data: null };
  return {
    data: {
      ...raw,
      employee_of_month: raw.employee_of_month ?? raw.staff?.[0] ?? null,
      staff: (raw.staff ?? []).map((s) => ({
        ...s,
        achievements: Array.isArray(s.achievements) ? s.achievements : [],
      })),
    },
  };
}

export type ScoreSourceKey = 'management' | 'audit' | 'guest';

export function performanceSourceRows(
  row: PerformanceBoardStaffRow,
  weights: StaffPerformanceBoard['weights']
): {
  key: ScoreSourceKey;
  label: string;
  score: number | null;
  weight: number;
  weighted: number | null;
  detail: string;
  icon: 'ribbon' | 'clipboard' | 'star';
  color: string;
}[] {
  return [
    {
      key: 'management',
      label: 'Yönetim değerlendirmesi',
      score: row.evaluation_management,
      weight: weights.management,
      weighted: row.weighted_management,
      detail: row.evaluation_management != null ? `${row.evaluation_management}/100` : 'Henüz değerlendirme yok',
      icon: 'ribbon',
      color: '#7c3aed',
    },
    {
      key: 'audit',
      label: 'Denetim puanı',
      score: row.evaluation_audit,
      weight: weights.audit,
      weighted: row.weighted_audit,
      detail:
        row.audit_count_month > 0
          ? `Bu ay ${row.audit_count_month} denetim · ort. ${row.month_audit_avg ?? '—'}${
              row.audit_delta_sum !== 0
                ? ` · ${row.audit_delta_sum > 0 ? '+' : ''}${row.audit_delta_sum} puan hareketi`
                : ''
            }`
          : 'Bu ay denetim kaydı yok',
      icon: 'clipboard',
      color: '#2563eb',
    },
    {
      key: 'guest',
      label: 'Misafir puanı',
      score: row.evaluation_guest,
      weight: weights.guest,
      weighted: row.weighted_guest,
      detail:
        row.average_rating != null && row.average_rating > 0
          ? `Ortalama ${row.average_rating.toFixed(1)}/5 yıldız`
          : 'Misafir yorumu henüz yok',
      icon: 'star',
      color: '#d97706',
    },
  ];
}
