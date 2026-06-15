import { supabase } from '@/lib/supabase';
import type { FinanceLedgerScope } from '@/lib/financeLedger';

export type CounterpartyBalance = { income: number; expense: number; net: number };

const balanceCache = new Map<string, { at: number; map: Map<string, CounterpartyBalance> }>();
const CACHE_MS = 60_000;

function cacheKey(organizationId: string, ledgerScope?: FinanceLedgerScope | null) {
  return `${organizationId}:${ledgerScope ?? 'all'}`;
}

export async function fetchCounterpartyBalanceMap(
  organizationId: string,
  ledgerScope?: FinanceLedgerScope | null
): Promise<Map<string, CounterpartyBalance>> {
  const key = cacheKey(organizationId, ledgerScope);
  const hit = balanceCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.map;

  const map = new Map<string, CounterpartyBalance>();

  const { data, error } = await supabase.rpc('accounting_counterparty_balances', {
    p_organization_id: organizationId,
    p_ledger_scope: ledgerScope ?? null,
  });

  if (!error && data) {
    for (const r of data as { counterparty_id: string; income: number; expense: number; net: number }[]) {
      if (!r.counterparty_id) continue;
      map.set(r.counterparty_id, {
        income: Number(r.income) || 0,
        expense: Number(r.expense) || 0,
        net: Number(r.net) || 0,
      });
    }
    balanceCache.set(key, { at: Date.now(), map });
    return map;
  }

  const fallback = await fetchCounterpartyBalanceMapFallback(organizationId, ledgerScope);
  balanceCache.set(key, { at: Date.now(), map: fallback });
  return fallback;
}

async function fetchCounterpartyBalanceMapFallback(
  organizationId: string,
  ledgerScope?: FinanceLedgerScope | null
): Promise<Map<string, CounterpartyBalance>> {
  const map = new Map<string, CounterpartyBalance>();
  const page = 1000;
  let from = 0;

  for (;;) {
    let q = supabase
      .from('finance_movements')
      .select('counterparty_id, kind, amount')
      .eq('organization_id', organizationId)
      .not('counterparty_id', 'is', null);
    if (ledgerScope) q = q.eq('ledger_scope', ledgerScope);
    const { data, error } = await q.range(from, from + page - 1);

    if (error || !data?.length) break;

    for (const r of data as { counterparty_id: string; kind: string; amount: number }[]) {
      const id = r.counterparty_id;
      if (!id) continue;
      if (!map.has(id)) map.set(id, { income: 0, expense: 0, net: 0 });
      const b = map.get(id)!;
      const a = Number(r.amount) || 0;
      if (r.kind === 'income') b.income += a;
      else b.expense += a;
      b.net = b.income - b.expense;
    }

    if (data.length < page) break;
    from += page;
    if (from > 10_000) break;
  }

  return map;
}

export function invalidateCounterpartyBalanceCache(organizationId?: string) {
  if (!organizationId) {
    balanceCache.clear();
    return;
  }
  for (const k of balanceCache.keys()) {
    if (k.startsWith(`${organizationId}:`)) balanceCache.delete(k);
  }
}
