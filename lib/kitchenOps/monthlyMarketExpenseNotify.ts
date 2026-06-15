import { supabase } from '@/lib/supabase';

/** İlk günü YYYY-MM-01 formatında ay başlangıcı. */
export function monthStartIso(year: number, month1to12: number): string {
  const m = String(month1to12).padStart(2, '0');
  return `${year}-${m}-01`;
}

/** Bir önceki takvim ayının ilk günü (İstanbul mantığıyla istemci tarafı). */
export function previousMonthStartIso(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

export async function sendKitchenMonthlyMarketExpenseSummaries(opts: {
  periodMonth: string;
  organizationId?: string | null;
  force?: boolean;
  sentByStaffId?: string | null;
}): Promise<{ orgCount: number; error: Error | null }> {
  const { data, error } = await supabase.rpc('send_kitchen_monthly_market_expense_summaries', {
    p_period_month: opts.periodMonth,
    p_organization_id: opts.organizationId ?? null,
    p_force: opts.force ?? false,
    p_sent_by_staff_id: opts.sentByStaffId ?? null,
  });

  if (error) return { orgCount: 0, error: new Error(error.message) };
  return { orgCount: typeof data === 'number' ? data : Number(data) || 0, error: null };
}
