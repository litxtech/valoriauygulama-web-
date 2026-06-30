import { supabase } from '@/lib/supabase';
import { invalidateCounterpartyBalanceCache } from '@/lib/financeCounterpartyBalances';
import { levenshteinSimilarity, normalizeCounterpartyName } from '@/lib/bankStatement/normalize';

export type CounterpartyMergeRow = {
  id: string;
  name: string;
  organization_id: string;
};

export type CounterpartyMergeSuggestion = {
  id: string;
  organizationId: string;
  names: string[];
  counterpartyIds: string[];
  canonicalName: string;
  keepId: string;
};

export function counterpartyNamesSimilar(a: string, b: string): boolean {
  const na = normalizeCounterpartyName(a);
  const nb = normalizeCounterpartyName(b);
  if (!na || !nb || na.length < 2 || nb.length < 2) return false;
  if (na === nb) return true;
  if (na.length >= 4 && nb.length >= 4 && (na.includes(nb) || nb.includes(na))) return true;
  return levenshteinSimilarity(na, nb) >= 0.88;
}

function pickKeepId(
  rows: CounterpartyMergeRow[],
  activity?: Map<string, { income: number; expense: number }>
): string {
  const sorted = [...rows].sort((a, b) => {
    const ba = activity?.get(a.id);
    const bb = activity?.get(b.id);
    const ta = (ba?.income ?? 0) + (ba?.expense ?? 0);
    const tb = (bb?.income ?? 0) + (bb?.expense ?? 0);
    if (tb !== ta) return tb - ta;
    return b.name.length - a.name.length;
  });
  return sorted[0]?.id ?? rows[0].id;
}

export function findCounterpartyMergeSuggestions(
  rows: CounterpartyMergeRow[],
  activity?: Map<string, { income: number; expense: number }>
): CounterpartyMergeSuggestion[] {
  const byOrg = new Map<string, CounterpartyMergeRow[]>();
  for (const row of rows) {
    const list = byOrg.get(row.organization_id) ?? [];
    list.push(row);
    byOrg.set(row.organization_id, list);
  }

  const suggestions: CounterpartyMergeSuggestion[] = [];

  for (const [organizationId, orgRows] of byOrg.entries()) {
    if (orgRows.length < 2) continue;

    const parent = orgRows.map((_, i) => i);
    function find(i: number): number {
      if (parent[i] !== i) parent[i] = find(parent[i]);
      return parent[i];
    }
    function unite(a: number, b: number) {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent[rb] = ra;
    }

    for (let i = 0; i < orgRows.length; i++) {
      for (let j = i + 1; j < orgRows.length; j++) {
        if (counterpartyNamesSimilar(orgRows[i].name, orgRows[j].name)) unite(i, j);
      }
    }

    const clusters = new Map<number, CounterpartyMergeRow[]>();
    for (let i = 0; i < orgRows.length; i++) {
      const root = find(i);
      const list = clusters.get(root) ?? [];
      list.push(orgRows[i]);
      clusters.set(root, list);
    }

    for (const cluster of clusters.values()) {
      if (cluster.length < 2) continue;
      const names = [...new Set(cluster.map((c) => c.name.trim()))];
      const counterpartyIds = cluster.map((c) => c.id);
      const canonicalName = cluster.reduce(
        (best, c) => (c.name.trim().length > best.length ? c.name.trim() : best),
        ''
      );
      const keepId = pickKeepId(cluster, activity);
      suggestions.push({
        id: counterpartyIds.sort().join('::'),
        organizationId,
        names,
        counterpartyIds,
        canonicalName,
        keepId,
      });
    }
  }

  return suggestions.sort((a, b) => b.counterpartyIds.length - a.counterpartyIds.length);
}

export async function mergeFinanceCounterparties(params: {
  keepId: string;
  mergeIds: string[];
  canonicalName: string;
  organizationId: string;
}): Promise<string | null> {
  const toMerge = params.mergeIds.filter((id) => id !== params.keepId);
  if (!toMerge.length) return null;

  const { error: movErr } = await supabase
    .from('finance_movements')
    .update({ counterparty_id: params.keepId })
    .in('counterparty_id', toMerge);
  if (movErr) return movErr.message;

  const { error: agrErr } = await supabase
    .from('finance_counterparty_agreements')
    .update({ counterparty_id: params.keepId })
    .in('counterparty_id', toMerge);
  if (agrErr) return agrErr.message;

  const { data: aliasRows } = await supabase
    .from('finance_counterparty_bank_aliases')
    .select('id')
    .in('counterparty_id', toMerge);

  for (const al of aliasRows ?? []) {
    const { error } = await supabase
      .from('finance_counterparty_bank_aliases')
      .update({ counterparty_id: params.keepId })
      .eq('id', al.id);
    if (error) {
      await supabase.from('finance_counterparty_bank_aliases').delete().eq('id', al.id);
    }
  }

  const { error: deactErr } = await supabase
    .from('finance_counterparties')
    .update({ is_active: false })
    .in('id', toMerge);
  if (deactErr) return deactErr.message;

  const trimmed = params.canonicalName.trim();
  if (trimmed) {
    const { error: nameErr } = await supabase
      .from('finance_counterparties')
      .update({ name: trimmed })
      .eq('id', params.keepId);
    if (nameErr) return nameErr.message;
  }

  invalidateCounterpartyBalanceCache(params.organizationId);
  return null;
}

export function findSimilarCounterparties(
  name: string,
  rows: CounterpartyMergeRow[],
  organizationId?: string
): CounterpartyMergeRow[] {
  const trimmed = name.trim();
  if (trimmed.length < 2) return [];
  const pool = organizationId ? rows.filter((r) => r.organization_id === organizationId) : rows;
  return pool.filter((r) => counterpartyNamesSimilar(trimmed, r.name));
}
