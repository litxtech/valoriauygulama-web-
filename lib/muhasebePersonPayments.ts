import { supabase } from '@/lib/supabase';
import {
  fetchCounterpartyBalanceMap,
  invalidateCounterpartyBalanceCache,
} from '@/lib/financeCounterpartyBalances';
import {
  fetchOpenDebtTotalsByCounterparty,
  recordCounterpartyPayment,
  suggestAgreementsToClose,
  type CounterpartyOpenDebtTotals,
} from '@/lib/financeCounterpartyAgreements';
import type { FinanceCounterpartyType, FinanceLedgerScope } from '@/lib/financeLedger';
import { mergeCounterpartyBalancesForOrgs } from '@/lib/accountingOrgScope';

export const MUHASEBE_QUICK_AMOUNTS = [100, 250, 500, 1000, 2000, 5000] as const;

export type MuhasebeCounterpartyRow = {
  id: string;
  organization_id: string;
  name: string;
  party_type: FinanceCounterpartyType;
  party_type_label: string | null;
  phone: string | null;
  profile_image: string | null;
};

export type MuhasebeBalance = { income: number; expense: number; net: number };

export type MuhasebePersonListBundle = {
  rows: MuhasebeCounterpartyRow[];
  balances: Map<string, MuhasebeBalance>;
  openDebtTotals: Map<string, CounterpartyOpenDebtTotals>;
};

export function parsePaymentAmount(raw: string): number {
  const a = parseFloat(String(raw ?? '').replace(',', '.'));
  return !a || a <= 0 ? 0 : Math.round(a * 100) / 100;
}

export function defaultLedgerScopeForParty(partyType: FinanceCounterpartyType): FinanceLedgerScope {
  return partyType === 'private_person' ? 'personal' : 'hotel';
}

export function suggestAgreementIdsForAmount(
  amountRaw: string,
  plans: { id: string; amount_remaining: number; started_on: string }[]
): string[] {
  const target = parsePaymentAmount(amountRaw);
  if (target <= 0 || plans.length === 0) return [];
  return suggestAgreementsToClose(target, plans).ids;
}

export async function loadMuhasebePersonList(params: {
  orgScope: string | 'all';
  ledgerScopeFilter?: FinanceLedgerScope | 'all' | null;
}): Promise<MuhasebePersonListBundle> {
  const { orgScope, ledgerScopeFilter = 'all' } = params;
  let q = supabase
    .from('finance_counterparties')
    .select('id, organization_id, name, party_type, party_type_label, phone, profile_image')
    .eq('is_active', true)
    .order('name');
  if (orgScope !== 'all') q = q.eq('organization_id', orgScope);
  const { data } = await q;
  const rows = ((data as MuhasebeCounterpartyRow[]) ?? []) as MuhasebeCounterpartyRow[];

  const scope = !ledgerScopeFilter || ledgerScopeFilter === 'all' ? null : ledgerScopeFilter;
  const debtOrgScope = orgScope === 'all' ? 'all' : orgScope;

  const [balances, openDebtTotals] = await Promise.all([
    orgScope === 'all'
      ? mergeCounterpartyBalancesForOrgs(
          rows.map((r) => r.organization_id),
          (oid) => fetchCounterpartyBalanceMap(oid, scope)
        )
      : fetchCounterpartyBalanceMap(orgScope, scope),
    fetchOpenDebtTotalsByCounterparty(
      debtOrgScope,
      rows.map((r) => r.id)
    ).catch(() => new Map<string, CounterpartyOpenDebtTotals>()),
  ]);

  return { rows, balances, openDebtTotals };
}

export async function refreshMuhasebeBalances(params: {
  orgScope: string | 'all';
  organizationIds: string[];
  ledgerScopeFilter?: FinanceLedgerScope | 'all' | null;
  counterpartyIds: string[];
}): Promise<{
  balances: Map<string, MuhasebeBalance>;
  openDebtTotals: Map<string, CounterpartyOpenDebtTotals>;
}> {
  const { orgScope, organizationIds, ledgerScopeFilter = 'all', counterpartyIds } = params;
  const scope = !ledgerScopeFilter || ledgerScopeFilter === 'all' ? null : ledgerScopeFilter;
  const debtOrgScope = orgScope === 'all' ? 'all' : orgScope;

  const balances =
    orgScope === 'all'
      ? await mergeCounterpartyBalancesForOrgs(organizationIds, (oid) =>
          fetchCounterpartyBalanceMap(oid, scope)
        )
      : await fetchCounterpartyBalanceMap(orgScope, scope);

  const openDebtTotals = await fetchOpenDebtTotalsByCounterparty(debtOrgScope, counterpartyIds).catch(
    () => new Map<string, CounterpartyOpenDebtTotals>()
  );

  return { balances, openDebtTotals };
}

export type SaveMuhasebePersonPaymentInput = {
  organizationId: string;
  counterpartyId: string;
  kind: 'expense' | 'income';
  amount: number;
  category: string;
  description: string;
  ledgerScope: FinanceLedgerScope;
  /** Gider (ödeme): birden fazla kart */
  agreementIds?: string[] | null;
  /** Gelir (tahsilat): tek kart */
  agreementId?: string | null;
  staffId: string;
};

export async function saveMuhasebePersonPayment(
  input: SaveMuhasebePersonPaymentInput
): Promise<{ error: string | null; allocatedCount: number; leftover: number }> {
  const today = new Date().toISOString().slice(0, 10);
  const result = await recordCounterpartyPayment({
    organizationId: input.organizationId,
    counterpartyId: input.counterpartyId,
    kind: input.kind,
    amount: input.amount,
    movementDate: today,
    category: input.category,
    description: input.description,
    ledgerScope: input.ledgerScope,
    agreementId: input.kind === 'income' ? input.agreementId ?? null : null,
    agreementIds:
      input.kind === 'expense' && input.agreementIds && input.agreementIds.length > 0
        ? input.agreementIds
        : null,
    createdByStaffId: input.staffId,
  });
  if (!result.error) {
    invalidateCounterpartyBalanceCache(input.organizationId);
  }
  return result;
}
