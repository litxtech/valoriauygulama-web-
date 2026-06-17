import { supabase } from '@/lib/supabase';
import { fmtMoneyTry, type FinanceCounterpartyType } from '@/lib/financeLedger';

export type AgreementMovementKind = 'expense' | 'income';
export type AgreementStatus = 'open' | 'partial' | 'paid' | 'cancelled';

export type CounterpartyAgreementRow = {
  id: string;
  organization_id: string;
  counterparty_id: string;
  title: string;
  target_amount: number;
  amount_paid: number;
  amount_remaining: number;
  status: AgreementStatus;
  started_on: string;
  notes: string | null;
  contract_urls: string[];
  is_active: boolean;
  movement_kind: AgreementMovementKind;
};

export const AGREEMENT_STATUS_LABELS: Record<AgreementStatus, string> = {
  open: 'Bekliyor',
  partial: 'Kısmi ödendi',
  paid: 'Tamamlandı',
  cancelled: 'İptal',
};

export const AGREEMENT_STATUS_COLORS: Record<AgreementStatus, { bg: string; fg: string }> = {
  open: { bg: '#e0f2fe', fg: '#0369a1' },
  partial: { bg: '#ffedd5', fg: '#c2410c' },
  paid: { bg: '#dcfce7', fg: '#15803d' },
  cancelled: { bg: '#f1f5f9', fg: '#64748b' },
};

export function agreementProgressPercent(paid: number, target: number): number {
  if (!target || target <= 0) return 0;
  return Math.min(100, Math.round((paid / target) * 100));
}

export function defaultAgreementMovementKind(partyType: FinanceCounterpartyType): AgreementMovementKind {
  return partyType === 'customer' ? 'income' : 'expense';
}

export function agreementKindLabels(kind: AgreementMovementKind): {
  debtNoun: string;
  debtOpen: string;
  debtHint: string;
  settleVerb: string;
  paidLabel: string;
} {
  if (kind === 'income') {
    return {
      debtNoun: 'Alacak',
      debtOpen: 'Alacak aç',
      debtHint: 'Bu kişinin size ne kadar borcu olduğunu kaydedin. Tahsil edince kapanır.',
      settleVerb: 'Tahsil al',
      paidLabel: 'Yapılan tahsilatlar',
    };
  }
  return {
    debtNoun: 'Borç',
    debtOpen: 'Borç aç',
    debtHint: 'Bu kişiye ne kadar borcunuz olduğunu kaydedin. Ödeyince kapanır.',
    settleVerb: 'Öde',
    paidLabel: 'Yapılan ödemeler',
  };
}

export function formatAgreementSummary(row: CounterpartyAgreementRow): string {
  return `${fmtMoneyTry(row.amount_paid)} / ${fmtMoneyTry(row.target_amount)} · Kalan ${fmtMoneyTry(row.amount_remaining)}`;
}

export async function fetchCounterpartyAgreements(
  counterpartyId: string,
  activeOnly = true
): Promise<CounterpartyAgreementRow[]> {
  let q = supabase
    .from('finance_counterparty_agreements')
    .select(
      'id, organization_id, counterparty_id, title, target_amount, amount_paid, amount_remaining, status, started_on, notes, contract_urls, is_active, movement_kind'
    )
    .eq('counterparty_id', counterpartyId)
    .order('started_on', { ascending: false })
    .order('created_at', { ascending: false });
  if (activeOnly) q = q.eq('is_active', true).neq('status', 'cancelled');
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return ((data ?? []) as CounterpartyAgreementRow[]).map((r) => ({
    ...r,
    target_amount: Number(r.target_amount) || 0,
    amount_paid: Number(r.amount_paid) || 0,
    amount_remaining: Number(r.amount_remaining) || 0,
    contract_urls: Array.isArray(r.contract_urls) ? r.contract_urls : [],
    movement_kind: (r.movement_kind === 'income' ? 'income' : 'expense') as AgreementMovementKind,
  }));
}

export async function fetchAgreementById(id: string): Promise<CounterpartyAgreementRow | null> {
  const { data, error } = await supabase
    .from('finance_counterparty_agreements')
    .select(
      'id, organization_id, counterparty_id, title, target_amount, amount_paid, amount_remaining, status, started_on, notes, contract_urls, is_active, movement_kind'
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const r = data as CounterpartyAgreementRow;
  return {
    ...r,
    target_amount: Number(r.target_amount) || 0,
    amount_paid: Number(r.amount_paid) || 0,
    amount_remaining: Number(r.amount_remaining) || 0,
    contract_urls: Array.isArray(r.contract_urls) ? r.contract_urls : [],
    movement_kind: (r.movement_kind === 'income' ? 'income' : 'expense') as AgreementMovementKind,
  };
}

export type AgreementMovementRow = {
  id: string;
  amount: number;
  movement_date: string;
  category: string;
  description: string;
  payment_method: string;
};

export async function fetchAgreementMovements(
  agreementId: string,
  movementKind?: AgreementMovementKind
): Promise<AgreementMovementRow[]> {
  let kind = movementKind;
  if (!kind) {
    const row = await fetchAgreementById(agreementId);
    kind = row?.movement_kind ?? 'expense';
  }
  const { data, error } = await supabase
    .from('finance_movements')
    .select('id, amount, movement_date, category, description, payment_method')
    .eq('agreement_id', agreementId)
    .eq('kind', kind)
    .order('movement_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as AgreementMovementRow[]).map((m) => ({
    ...m,
    amount: Number(m.amount) || 0,
  }));
}

export async function createCounterpartyAgreement(input: {
  organizationId: string;
  counterpartyId: string;
  title: string;
  targetAmount: number;
  startedOn?: string;
  notes?: string;
  contractUrls?: string[];
  createdByStaffId?: string | null;
  movementKind?: AgreementMovementKind;
}): Promise<{ id: string } | { error: string }> {
  const title = input.title.trim();
  if (!title) return { error: 'Plan adı gerekli' };
  const target = input.targetAmount;
  if (!target || target <= 0) return { error: 'Hedef tutar 0’dan büyük olmalı' };

  const { data, error } = await supabase
    .from('finance_counterparty_agreements')
    .insert({
      organization_id: input.organizationId,
      counterparty_id: input.counterpartyId,
      title,
      target_amount: target,
      started_on: input.startedOn ?? new Date().toISOString().slice(0, 10),
      notes: input.notes?.trim() || null,
      contract_urls: input.contractUrls?.length ? input.contractUrls : [],
      created_by_staff_id: input.createdByStaffId ?? null,
      movement_kind: input.movementKind ?? 'expense',
    })
    .select('id')
    .single();

  if (error) return { error: error.message };
  return { id: (data as { id: string }).id };
}

export async function cancelCounterpartyAgreement(id: string): Promise<string | null> {
  const { error } = await supabase
    .from('finance_counterparty_agreements')
    .update({ status: 'cancelled', is_active: false })
    .eq('id', id);
  return error?.message ?? null;
}

/** Açık veya kısmi ödenmiş planlar — hızlı ödeme / plana bağlama için */
export async function fetchOpenCounterpartyAgreements(
  counterpartyId: string,
  movementKind?: AgreementMovementKind
): Promise<CounterpartyAgreementRow[]> {
  const rows = await fetchCounterpartyAgreements(counterpartyId, true);
  return rows.filter(
    (r) =>
      (r.status === 'open' || r.status === 'partial') &&
      (movementKind == null || r.movement_kind === movementKind)
  );
}

export type UnlinkedExpenseMovementRow = {
  id: string;
  amount: number;
  movement_date: string;
  description: string;
};

export async function fetchUnlinkedCounterpartyMovements(
  counterpartyId: string,
  kind: AgreementMovementKind
): Promise<UnlinkedExpenseMovementRow[]> {
  const { data, error } = await supabase
    .from('finance_movements')
    .select('id, amount, movement_date, description')
    .eq('counterparty_id', counterpartyId)
    .eq('kind', kind)
    .is('agreement_id', null)
    .order('movement_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) throw new Error(error.message);
  return ((data ?? []) as UnlinkedExpenseMovementRow[]).map((m) => ({
    ...m,
    amount: Number(m.amount) || 0,
    description: m.description ?? '',
  }));
}

export async function fetchUnlinkedCounterpartyExpenses(
  counterpartyId: string
): Promise<UnlinkedExpenseMovementRow[]> {
  return fetchUnlinkedCounterpartyMovements(counterpartyId, 'expense');
}

export async function linkMovementToAgreement(
  movementId: string,
  agreementId: string
): Promise<string | null> {
  const { error } = await supabase
    .from('finance_movements')
    .update({ agreement_id: agreementId })
    .eq('id', movementId);
  return error?.message ?? null;
}
