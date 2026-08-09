import { supabase } from '@/lib/supabase';
import { fmtMoneyTry, type FinanceCounterpartyType } from '@/lib/financeLedger';
import { deserializeLineItems, serializeLineItems } from '@/lib/financeInvoiceOcr/parseInvoiceText';
import type { InvoiceLineItem } from '@/lib/financeInvoiceOcr/types';

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
  line_items: InvoiceLineItem[];
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

/** Açık veya kısmi planların kalan tutar toplamı */
export function sumOpenAgreementRemaining(
  agreements: Pick<CounterpartyAgreementRow, 'status' | 'amount_remaining'>[]
): number {
  return agreements
    .filter((a) => a.status === 'open' || a.status === 'partial')
    .reduce((s, a) => s + (Number(a.amount_remaining) || 0), 0);
}

/** Açık cari özeti: açılan (hedef) · ödenen · kalan */
export function summarizeOpenAgreements(
  agreements: Pick<
    CounterpartyAgreementRow,
    'status' | 'amount_remaining' | 'amount_paid' | 'target_amount' | 'movement_kind'
  >[],
  movementKind?: AgreementMovementKind
): { opened: number; paid: number; remaining: number; count: number } {
  const open = agreements.filter(
    (a) =>
      (a.status === 'open' || a.status === 'partial') &&
      (movementKind == null || a.movement_kind === movementKind)
  );
  const opened = Math.round(open.reduce((s, a) => s + (Number(a.target_amount) || 0), 0) * 100) / 100;
  const remaining = Math.round(open.reduce((s, a) => s + (Number(a.amount_remaining) || 0), 0) * 100) / 100;
  const paidFromCol = Math.round(open.reduce((s, a) => s + (Number(a.amount_paid) || 0), 0) * 100) / 100;
  // amount_paid bazen 0 kalabiliyor; kalan düşmüşse açılan−kalan = ödenen
  const paidDerived = Math.round(Math.max(0, opened - remaining) * 100) / 100;
  const paid = paidFromCol >= 0.01 ? paidFromCol : paidDerived;
  return {
    opened,
    paid,
    remaining,
    count: open.length,
  };
}

export type CounterpartyOpenDebtTotals = {
  opened: number;
  paid: number;
  remaining: number;
};

export async function fetchCounterpartyAgreements(
  counterpartyId: string,
  activeOnly = true
): Promise<CounterpartyAgreementRow[]> {
  let q = supabase
    .from('finance_counterparty_agreements')
    .select(
      'id, organization_id, counterparty_id, title, target_amount, amount_paid, amount_remaining, status, started_on, notes, contract_urls, line_items, is_active, movement_kind'
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
    line_items: deserializeLineItems((r as { line_items?: unknown }).line_items),
    movement_kind: (r.movement_kind === 'income' ? 'income' : 'expense') as AgreementMovementKind,
  }));
}

export async function fetchAgreementById(id: string): Promise<CounterpartyAgreementRow | null> {
  const { data, error } = await supabase
    .from('finance_counterparty_agreements')
    .select(
      'id, organization_id, counterparty_id, title, target_amount, amount_paid, amount_remaining, status, started_on, notes, contract_urls, line_items, is_active, movement_kind'
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
    line_items: deserializeLineItems((r as { line_items?: unknown }).line_items),
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
  lineItems?: InvoiceLineItem[];
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
      line_items: input.lineItems?.length ? serializeLineItems(input.lineItems) : [],
      created_by_staff_id: input.createdByStaffId ?? null,
      movement_kind: input.movementKind ?? 'expense',
    })
    .select('id')
    .single();

  if (error) return { error: error.message };
  return { id: (data as { id: string }).id };
}

function roundMoney2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function cancelCounterpartyAgreement(id: string): Promise<string | null> {
  const { error } = await supabase
    .from('finance_counterparty_agreements')
    .update({ status: 'cancelled', is_active: false })
    .eq('id', id);
  return error?.message ?? null;
}

/**
 * Plan adı / not güncelle. Açılan (target_amount) değişmez — yalnızca ödeme ile
 * ödenen ve kalan güncellenir.
 */
export async function updateCounterpartyAgreement(input: {
  id: string;
  title?: string;
  notes?: string | null;
}): Promise<string | null> {
  const { data: agr, error: aErr } = await supabase
    .from('finance_counterparty_agreements')
    .select('id, title, notes')
    .eq('id', input.id)
    .maybeSingle();
  if (aErr) return aErr.message;
  if (!agr) return 'Plan bulunamadı';

  const title =
    input.title !== undefined ? input.title.trim() : String((agr as { title: string }).title);
  if (!title) return 'Plan adı gerekli';

  const patch: Record<string, unknown> = { title };
  if (input.notes !== undefined) {
    patch.notes = input.notes?.trim() || null;
  }

  const { error } = await supabase
    .from('finance_counterparty_agreements')
    .update(patch)
    .eq('id', input.id);
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

/** Kişi başına açık borç: açılan / ödenen / kalan */
export async function fetchOpenDebtTotalsByCounterparty(
  organizationId: string | 'all',
  counterpartyIds?: string[]
): Promise<Map<string, CounterpartyOpenDebtTotals>> {
  let q = supabase
    .from('finance_counterparty_agreements')
    .select('counterparty_id, target_amount, amount_paid, amount_remaining')
    .in('status', ['open', 'partial'])
    .eq('is_active', true)
    .eq('movement_kind', 'expense');
  if (organizationId !== 'all') q = q.eq('organization_id', organizationId);
  if (counterpartyIds?.length) q = q.in('counterparty_id', counterpartyIds);

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const map = new Map<string, CounterpartyOpenDebtTotals>();
  for (const row of data ?? []) {
    const id = String((row as { counterparty_id: string }).counterparty_id);
    const opened = Number((row as { target_amount: number }).target_amount) || 0;
    const paidCol = Number((row as { amount_paid: number }).amount_paid) || 0;
    const remaining = Number((row as { amount_remaining: number }).amount_remaining) || 0;
    const prev = map.get(id) ?? { opened: 0, paid: 0, remaining: 0 };
    map.set(id, {
      opened: prev.opened + opened,
      paid: prev.paid + paidCol,
      remaining: prev.remaining + remaining,
    });
  }
  // amount_paid 0 ama kalan düşmüşse ödenen = açılan − kalan
  for (const [id, t] of map) {
    const derived = Math.round(Math.max(0, t.opened - t.remaining) * 100) / 100;
    if (t.paid < 0.01 && derived >= 0.01) {
      map.set(id, { ...t, paid: derived });
    } else {
      map.set(id, {
        opened: Math.round(t.opened * 100) / 100,
        paid: Math.round(t.paid * 100) / 100,
        remaining: Math.round(t.remaining * 100) / 100,
      });
    }
  }
  return map;
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
  const { data: mov, error: mErr } = await supabase
    .from('finance_movements')
    .select('kind')
    .eq('id', movementId)
    .maybeSingle();
  if (mErr) return mErr.message;

  const { error } = await supabase
    .from('finance_movements')
    .update({ agreement_id: agreementId })
    .eq('id', movementId);
  if (error) return error.message;

  const kind = (mov as { kind?: string } | null)?.kind === 'income' ? 'income' : 'expense';
  return syncAgreementBalanceAfterPayment(agreementId, kind);
}

/** Plan bakiyesini hareketlere göre yeniden yaz (tetikleyici yedek) */
async function syncAgreementBalanceAfterPayment(
  agreementId: string,
  movementKind: AgreementMovementKind
): Promise<string | null> {
  const { data: agr, error: aErr } = await supabase
    .from('finance_counterparty_agreements')
    .select('id, target_amount, status')
    .eq('id', agreementId)
    .maybeSingle();
  if (aErr) return aErr.message;
  if (!agr) return 'Plan bulunamadı';

  const target = Number((agr as { target_amount: number }).target_amount) || 0;
  const { data: movs, error: mErr } = await supabase
    .from('finance_movements')
    .select('amount')
    .eq('agreement_id', agreementId)
    .eq('kind', movementKind);
  if (mErr) return mErr.message;

  const paid = roundMoney2(
    (movs ?? []).reduce((s, m) => s + (Number((m as { amount: number }).amount) || 0), 0)
  );
  const remaining = roundMoney2(Math.max(0, target - paid));
  const prevStatus = String((agr as { status: string }).status);
  const status =
    prevStatus === 'cancelled'
      ? 'cancelled'
      : paid <= 0.009
        ? 'open'
        : remaining <= 0.009
          ? 'paid'
          : 'partial';

  const { error: uErr } = await supabase
    .from('finance_counterparty_agreements')
    .update({
      amount_paid: paid,
      amount_remaining: remaining,
      status,
    })
    .eq('id', agreementId);
  if (uErr) return uErr.message;

  // RPC varsa ek doğrulama (yoksa sessiz geç)
  try {
    await supabase.rpc('finance_agreement_recalc', { p_agreement_id: agreementId });
  } catch {
    /* ignore */
  }
  return null;
}

export type RecordCounterpartyPaymentInput = {
  organizationId: string;
  counterpartyId: string;
  kind: AgreementMovementKind;
  amount: number;
  movementDate: string;
  category: string;
  description: string;
  ledgerScope: string;
  /** Belirli plan; null = genel / seçili liste */
  agreementId: string | null;
  /** Seçili kartlar — ödeme yalnızca bunlara (FIFO). Boş/undefined = tüm açık planlar */
  agreementIds?: string[] | null;
  createdByStaffId: string | null;
  paymentMethod?: string;
  currency?: string;
  /** Önceden yüklenmiş açık planlar (yoksa DB’den çekilir) */
  openAgreements?: Pick<
    CounterpartyAgreementRow,
    'id' | 'title' | 'amount_remaining' | 'started_on' | 'target_amount' | 'amount_paid'
  >[];
};

export type SuggestCloseResult = {
  ids: string[];
  sum: number;
  /** Hedef − seçili toplam (pozitif = hedefe biraz daha lazım) */
  gap: number;
};

/**
 * Ödeme tutarına en yakın (aşmadan) kapatılacak borç kartı kombinasyonunu bulur.
 * Küçük listelerde tam arama; büyükte eskiden yeniye paketler.
 */
export function suggestAgreementsToClose(
  targetAmount: number,
  plans: Pick<CounterpartyAgreementRow, 'id' | 'amount_remaining' | 'started_on'>[]
): SuggestCloseResult {
  const target = roundMoney2(targetAmount);
  const items = [...plans]
    .map((p) => ({
      id: p.id,
      rem: roundMoney2(Number(p.amount_remaining) || 0),
      started_on: p.started_on || '',
    }))
    .filter((p) => p.rem > 0.009)
    .sort((a, b) => {
      if (a.started_on !== b.started_on) return a.started_on.localeCompare(b.started_on);
      return a.id.localeCompare(b.id);
    });

  if (target <= 0 || items.length === 0) {
    return { ids: [], sum: 0, gap: target };
  }

  const n = items.length;
  if (n <= 18) {
    let bestSum = 0;
    let bestMask = 0;
    const walk = (i: number, sum: number, mask: number) => {
      if (sum > target + 0.001) return;
      const better =
        sum > bestSum + 0.001 ||
        (Math.abs(sum - bestSum) < 0.001 &&
          countBits(mask) > 0 &&
          (bestMask === 0 || countBits(mask) < countBits(bestMask)));
      if (better && sum > 0.009) {
        bestSum = sum;
        bestMask = mask;
      }
      if (i >= n) return;
      walk(i + 1, sum, mask);
      walk(i + 1, roundMoney2(sum + items[i].rem), mask | (1 << i));
    };
    walk(0, 0, 0);
    const ids = items.filter((_, i) => (bestMask & (1 << i)) !== 0).map((x) => x.id);
    const sum = roundMoney2(bestSum);
    return { ids, sum, gap: roundMoney2(target - sum) };
  }

  let sum = 0;
  const ids: string[] = [];
  for (const it of items) {
    if (sum + it.rem <= target + 0.009) {
      ids.push(it.id);
      sum = roundMoney2(sum + it.rem);
    }
  }
  return { ids, sum, gap: roundMoney2(target - sum) };
}

function countBits(mask: number): number {
  let c = 0;
  let m = mask;
  while (m) {
    c += m & 1;
    m >>= 1;
  }
  return c;
}

/**
 * Kişi ödemesi / tahsilatı kaydet.
 * - agreementId: tek kart
 * - agreementIds: seçili kartlara dağıt
 * - ikisi de yok: tüm açık planlara FIFO
 * Fazlası plansız hareket olarak kalır. Plan bakiyesi her parçadan sonra güncellenir.
 */
export async function recordCounterpartyPayment(
  input: RecordCounterpartyPaymentInput
): Promise<{ error: string | null; allocatedCount: number; leftover: number }> {
  const amount = roundMoney2(input.amount);
  if (!amount || amount <= 0) return { error: 'Geçerli tutar girin.', allocatedCount: 0, leftover: 0 };

  const base = {
    organization_id: input.organizationId,
    kind: input.kind,
    currency: input.currency ?? 'TRY',
    movement_date: input.movementDate,
    payment_method: input.paymentMethod ?? 'cash',
    category: input.category,
    counterparty_id: input.counterpartyId,
    ledger_scope: input.ledgerScope,
    created_by_staff_id: input.createdByStaffId,
  };
  const desc = input.description.trim() || (input.kind === 'income' ? 'Tahsilat' : 'Ödeme');

  const applyOne = async (
    agreementId: string,
    applyAmount: number,
    description: string
  ): Promise<string | null> => {
    const { error } = await supabase.from('finance_movements').insert({
      ...base,
      amount: applyAmount,
      description,
      agreement_id: agreementId,
    });
    if (error) return error.message;
    return syncAgreementBalanceAfterPayment(agreementId, input.kind);
  };

  // Tek plana bağla
  if (input.agreementId) {
    const err = await applyOne(input.agreementId, amount, desc);
    return {
      error: err,
      allocatedCount: err ? 0 : 1,
      leftover: 0,
    };
  }

  const freshPlans = await fetchOpenCounterpartyAgreements(input.counterpartyId, input.kind);
  const selectedSet =
    input.agreementIds && input.agreementIds.length > 0
      ? new Set(input.agreementIds)
      : null;

  const fifo = [...freshPlans]
    .map((p) => ({
      ...p,
      amount_remaining: Number(p.amount_remaining) || 0,
      amount_paid: Number(p.amount_paid) || 0,
      target_amount: Number(p.target_amount) || 0,
    }))
    .filter((p) => p.amount_remaining > 0.009)
    .filter((p) => (selectedSet ? selectedSet.has(p.id) : true))
    .sort((a, b) => {
      const da = a.started_on || '';
      const db = b.started_on || '';
      if (da !== db) return da.localeCompare(db);
      return a.id.localeCompare(b.id);
    });

  if (selectedSet && fifo.length === 0) {
    return { error: 'Seçili açık borç kartı bulunamadı.', allocatedCount: 0, leftover: amount };
  }

  let remaining = amount;
  let allocatedCount = 0;

  for (const plan of fifo) {
    if (remaining <= 0.009) break;
    const apply = roundMoney2(Math.min(remaining, plan.amount_remaining));
    if (apply <= 0) continue;
    const err = await applyOne(plan.id, apply, `${desc} · ${plan.title}`.slice(0, 240));
    if (err) {
      return { error: err, allocatedCount, leftover: remaining };
    }
    allocatedCount += 1;
    remaining = roundMoney2(remaining - apply);
  }

  if (remaining > 0.009) {
    const { error } = await supabase.from('finance_movements').insert({
      ...base,
      amount: remaining,
      description: fifo.length ? `${desc} (fazla)` : desc,
      agreement_id: null,
    });
    if (error) {
      return { error: error.message, allocatedCount, leftover: remaining };
    }
  }

  if (allocatedCount === 0 && fifo.length > 0) {
    return {
      error: 'Açık borca bağlanamadı. Tekrar deneyin veya borcu seçerek ödeyin.',
      allocatedCount: 0,
      leftover: amount,
    };
  }

  return {
    error: null,
    allocatedCount,
    leftover: remaining > 0.009 ? remaining : 0,
  };
}
