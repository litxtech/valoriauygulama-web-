import { supabase } from '@/lib/supabase';

export type KitchenScoreSummary = {
  total_score: number;
  negative_count: number;
  positive_count: number;
  total_entries: number;
};

export type KitchenScoreEntry = {
  id: string;
  record_date: string;
  score_delta: number;
  reason: string | null;
  created_at: string;
  breakfast_confirmation_id: string | null;
};

export async function fetchKitchenScoreSummary(
  organizationId: string
): Promise<KitchenScoreSummary | null> {
  const { data, error } = await supabase
    .from('kitchen_score_summary')
    .select('*')
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (error || !data) return null;
  return data as KitchenScoreSummary;
}

export async function fetchKitchenScoreHistory(
  organizationId: string,
  limit = 50
): Promise<KitchenScoreEntry[]> {
  const { data, error } = await supabase
    .from('kitchen_scores')
    .select('id, record_date, score_delta, reason, created_at, breakfast_confirmation_id')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data ?? []) as KitchenScoreEntry[];
}

export function getKitchenScoreLabel(score: number): { label: string; color: string } {
  if (score >= 80) return { label: 'Mükemmel', color: '#047857' };
  if (score >= 50) return { label: 'İyi', color: '#3b82f6' };
  if (score >= 20) return { label: 'Orta', color: '#d97706' };
  return { label: 'Düşük', color: '#dc2626' };
}

const BASE_KITCHEN_SCORE = 100;

export function computeKitchenOverallScore(totalDelta: number): number {
  return Math.max(0, Math.min(100, BASE_KITCHEN_SCORE + totalDelta));
}
