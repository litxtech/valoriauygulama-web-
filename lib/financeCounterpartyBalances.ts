import { supabase } from '@/lib/supabase';

export type CounterpartyBalance = { income: number; expense: number; net: number };

const balanceCache = new Map<string, { at: number; map: Map<string, CounterpartyBalance> }>();
const CACHE_MS = 60_000;

export async function fetchCounterpartyBalanceMap(
  organizationId: string
): Promise<Map<string, CounterpartyBalance>> {
  const hit = balanceCache.get(organizationId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.map;

  const map = new Map<string, CounterpartyBalance>();

  const { data, error } = await supabase.rpc('accounting_counterparty_balances', {
    p_organization_id: organizationId,
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
    balanceCache.set(organizationId, { at: Date.now(), map });
    return map;
  }

  const fallback = await fetchCounterpartyBalanceMapFallback(organizationId);
  balanceCache.set(organizationId, { at: Date.now(), map: fallback });
  return fallback;
}

async function fetchCounterpartyBalanceMapFallback(
  organizationId: string
): Promise<Map<string, CounterpartyBalance>> {
  const map = new Map<string, CounterpartyBalance>();
  const page = 1000;
  let from = 0;

  for (;;) {
    const { data, error } = await supabase
      .from('finance_movements')
      .select('counterparty_id, kind, amount')
      .eq('organization_id', organizationId)
      .not('counterparty_id', 'is', null)
      .range(from, from + page - 1);

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
  if (!organizationId) balanceCache.clear();
  else balanceCache.delete(organizationId);
}
