import { supabase } from '@/lib/supabase';

export type AccountingHubSummary = {
  income: number;
  expense: number;
  staffExpense: number;
  movementCount: number;
  openReceivable: number;
  openPayable: number;
};

const summaryCache = new Map<string, { at: number; data: AccountingHubSummary }>();
const CACHE_MS = 45_000;

function cacheKey(orgId: string, monthStart: string, monthEnd: string) {
  return `${orgId}:${monthStart}:${monthEnd}`;
}

function parseRpcSummary(raw: unknown): AccountingHubSummary | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  return {
    income: Number(o.income) || 0,
    expense: Number(o.expense) || 0,
    staffExpense: Number(o.staff_expense) || 0,
    movementCount: Number(o.movement_count) || 0,
    openReceivable: Number(o.open_receivable) || 0,
    openPayable: Number(o.open_payable) || 0,
  };
}

/** Tek RPC ile özet; yoksa hafif yedek sorgular. */
export async function fetchAccountingHubSummary(
  organizationId: string,
  monthStart: string,
  monthEnd: string
): Promise<AccountingHubSummary> {
  const key = cacheKey(organizationId, monthStart, monthEnd);
  const hit = summaryCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;

  const { data, error } = await supabase.rpc('accounting_hub_summary', {
    p_organization_id: organizationId,
    p_month_start: monthStart,
    p_month_end: monthEnd,
  });

  const parsed = !error ? parseRpcSummary(data) : null;
  if (parsed) {
    summaryCache.set(key, { at: Date.now(), data: parsed });
    return parsed;
  }

  const fallback = await fetchAccountingHubSummaryFallback(organizationId, monthStart, monthEnd);
  summaryCache.set(key, { at: Date.now(), data: fallback });
  return fallback;
}

async function fetchAccountingHubSummaryFallback(
  organizationId: string,
  monthStart: string,
  monthEnd: string
): Promise<AccountingHubSummary> {
  let income = 0;
  let expense = 0;
  let staffExpense = 0;
  let movementCount = 0;
  let openReceivable = 0;
  let openPayable = 0;

  const [movRes, expRes, debtRes] = await Promise.all([
    supabase
      .from('finance_movements')
      .select('kind, amount', { count: 'exact' })
      .eq('organization_id', organizationId)
      .gte('movement_date', monthStart)
      .lt('movement_date', monthEnd)
      .limit(2000),
    supabase
      .from('staff_expenses')
      .select('amount', { count: 'exact' })
      .eq('organization_id', organizationId)
      .gte('expense_date', monthStart)
      .lt('expense_date', monthEnd)
      .neq('status', 'rejected')
      .limit(2000),
    supabase
      .from('staff_debt_entries')
      .select('borrower_is_organization, lender_is_organization, amount_remaining')
      .eq('organization_id', organizationId)
      .in('status', ['open', 'partial']),
  ]);

  movementCount = movRes.count ?? (movRes.data?.length ?? 0);
  if (movRes.data) {
    for (const r of movRes.data as { kind: string; amount: number }[]) {
      const a = Number(r.amount) || 0;
      if (r.kind === 'income') income += a;
      else expense += a;
    }
  }
  if (expRes.data) {
    for (const r of expRes.data as { amount: number }[]) {
      staffExpense += Number(r.amount) || 0;
    }
  }
  if (debtRes.data) {
    for (const d of debtRes.data as {
      borrower_is_organization: boolean;
      lender_is_organization: boolean;
      amount_remaining: number;
    }[]) {
      const rem = Number(d.amount_remaining) || 0;
      if (d.lender_is_organization && !d.borrower_is_organization) openReceivable += rem;
      if (d.borrower_is_organization && !d.lender_is_organization) openPayable += rem;
    }
  }

  return {
    income,
    expense,
    staffExpense,
    movementCount,
    openReceivable,
    openPayable,
  };
}

export function invalidateAccountingSummaryCache(organizationId?: string) {
  if (!organizationId) {
    summaryCache.clear();
    return;
  }
  for (const k of summaryCache.keys()) {
    if (k.startsWith(`${organizationId}:`)) summaryCache.delete(k);
  }
}
