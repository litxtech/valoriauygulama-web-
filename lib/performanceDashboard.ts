import i18n from '@/i18n';
import { supabase } from '@/lib/supabase';
import type { DepartmentLeaderboardRow } from '@/lib/audit';
import type { StaffAuditRecentRow } from '@/lib/audit';

export type PerformanceNotice = {
  id: string;
  notice_type: 'warning' | 'termination_review';
  message: string;
  score_at_trigger: number;
  threshold_score: number;
  acknowledged_at: string | null;
  created_at: string;
};

export type PerformanceDashboard = {
  staff_id: string;
  full_name: string | null;
  evaluation_management: number | null;
  evaluation_audit: number | null;
  evaluation_guest: number | null;
  evaluation_combined: number | null;
  evaluation_combined_updated_at: string | null;
  threshold_score: number;
  weights: { management: number; audit: number; guest: number };
  below_threshold: boolean;
  notices: PerformanceNotice[];
  audit_summary: {
    evaluation_audit?: number | null;
    recent?: StaffAuditRecentRow[];
    below_threshold?: boolean;
  };
  department_leaderboard: {
    month_key?: string;
    departments?: DepartmentLeaderboardRow[];
  };
};

export type MonthlyReportData = {
  organization_name: string | null;
  month_key: string;
  leaderboard: { month_key?: string; departments?: DepartmentLeaderboardRow[] };
  sessions: {
    conducted_at: string;
    session_score: number;
    category_name: string;
    auditor_name: string | null;
  }[];
  below_threshold_staff: {
    full_name: string | null;
    evaluation_combined: number;
    evaluation_audit: number | null;
    evaluation_management: number | null;
  }[];
  generated_at: string;
};

export async function fetchPerformanceDashboard(staffId: string): Promise<{
  data: PerformanceDashboard | null;
  error?: string;
}> {
  const { data, error } = await supabase.rpc('get_staff_performance_dashboard', {
    p_staff_id: staffId,
  });
  if (error) return { data: null, error: error.message };
  return { data: data as PerformanceDashboard };
}

export async function acknowledgePerformanceNotice(noticeId: string): Promise<{ error?: string }> {
  const { error } = await supabase.rpc('acknowledge_staff_performance_notice', {
    p_notice_id: noticeId,
  });
  return error ? { error: error.message } : {};
}

export async function fetchMonthlyReportData(
  orgId: string,
  monthKey?: string
): Promise<{ data: MonthlyReportData | null; error?: string }> {
  const { data, error } = await supabase.rpc('get_audit_monthly_report_data', {
    p_organization_id: orgId,
    p_month_key: monthKey ?? null,
  });
  if (error) return { data: null, error: error.message };
  return { data: data as MonthlyReportData };
}

export function pillarLabel(key: 'management' | 'audit' | 'guest'): string {
  switch (key) {
    case 'management':
      return i18n.t('perfPillarManagement');
    case 'audit':
      return i18n.t('perfPillarAudit');
    case 'guest':
      return i18n.t('perfPillarGuest');
  }
}
