import { adminTheme } from '@/constants/adminTheme';

/** Denetim panosu görsel sabitleri */
export const auditDashboardTheme = {
  headerGrad: ['#0f172a', '#312e81'] as [string, string],
  heroAccent: 'rgba(255,255,255,0.14)',
  rankMedal: ['#f59e0b', '#94a3b8', '#b45309'] as const,
};

export function auditRankMedalColor(rank: number): string | null {
  if (rank >= 1 && rank <= 3) return auditDashboardTheme.rankMedal[rank - 1];
  return null;
}

export function auditTrendMeta(delta: number): {
  icon: 'trending-up' | 'trending-down' | 'remove';
  color: string;
  label: string;
} {
  if (delta > 0) {
    return { icon: 'trending-up', color: adminTheme.colors.success, label: `+${delta}` };
  }
  if (delta < 0) {
    return { icon: 'trending-down', color: adminTheme.colors.error, label: `${delta}` };
  }
  return { icon: 'remove', color: adminTheme.colors.textMuted, label: '0' };
}
