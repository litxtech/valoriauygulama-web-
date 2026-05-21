import { supabase } from '@/lib/supabase';
import {
  MOVEMENT_CATEGORIES_EXPENSE,
  MOVEMENT_CATEGORIES_INCOME,
  MOVEMENT_CATEGORY_LABELS,
  type FinanceMovementKind,
} from '@/lib/financeLedger';

export type FinanceCategoryRow = {
  id: string;
  code: string;
  name: string;
  applies_to: 'income' | 'expense' | 'both';
  sort_order: number;
};

export async function loadMovementCategories(
  organizationId: string,
  kind: FinanceMovementKind
): Promise<{ code: string; label: string }[]> {
  const { data, error } = await supabase
    .from('finance_movement_categories')
    .select('id, code, name, applies_to, sort_order')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .order('sort_order')
    .order('name');

  if (!error && data && data.length > 0) {
    const rows = data as FinanceCategoryRow[];
    return rows
      .filter((r) => r.applies_to === 'both' || r.applies_to === kind)
      .map((r) => ({ code: r.code, label: r.name }));
  }

  const fallback = kind === 'income' ? MOVEMENT_CATEGORIES_INCOME : MOVEMENT_CATEGORIES_EXPENSE;
  return fallback.map((code) => ({
    code,
    label: MOVEMENT_CATEGORY_LABELS[code] ?? code,
  }));
}

export function resolveCategoryLabel(code: string, customName?: string | null): string {
  if (customName?.trim()) return customName.trim();
  return MOVEMENT_CATEGORY_LABELS[code] ?? code;
}
