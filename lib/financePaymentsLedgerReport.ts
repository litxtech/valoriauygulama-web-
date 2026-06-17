import { supabase } from '@/lib/supabase';
import { formatDateShort } from '@/lib/date';
import {
  fmtMoneyTry,
  LEDGER_SCOPE_LABELS,
  MOVEMENT_KIND_LABELS,
  PAYMENT_METHOD_LABELS,
  type FinanceMovementKind,
  type FinanceLedgerScope,
} from '@/lib/financeLedger';
import { resolveCategoryLabel } from '@/lib/financeCategoriesApi';
import {
  type FinanceReportFooter,
  type FinanceReportKindFilter,
  FINANCE_REPORT_KIND_LABELS,
} from '@/lib/financeCounterpartyReport';

export type PaymentLedgerRow = {
  id: string;
  kind: FinanceMovementKind;
  amount: number;
  movement_date: string;
  category: string;
  description: string;
  ledger_scope: FinanceLedgerScope;
  payment_method: string;
  counterparty_name: string | null;
  counterparty?: { name: string } | null;
  guest?: { full_name: string | null } | null;
  agreement?: { title: string } | null;
};

function esc(s: string | null | undefined): string {
  if (s == null || s === '') return '—';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function partyLabel(r: PaymentLedgerRow): string {
  return (
    r.counterparty?.name?.trim() ||
    r.counterparty_name?.trim() ||
    r.guest?.full_name?.trim() ||
    '—'
  );
}

function paymentLabel(method: string | null | undefined): string {
  if (!method?.trim()) return '—';
  const key = method as keyof typeof PAYMENT_METHOD_LABELS;
  return PAYMENT_METHOD_LABELS[key] ?? method;
}

function matchesKindFilter(kind: FinanceMovementKind, filter: FinanceReportKindFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'paid') return kind === 'expense';
  return kind === 'income';
}

export async function fetchPaymentsLedger(params: {
  organizationId: string;
  dateStart?: string | null;
  dateEnd?: string | null;
  limit?: number;
}): Promise<PaymentLedgerRow[]> {
  const limit = params.limit ?? 500;
  let q = supabase
    .from('finance_movements')
    .select(
      `
      id,
      kind,
      amount,
      movement_date,
      category,
      description,
      ledger_scope,
      payment_method,
      counterparty_name,
      counterparty:counterparty_id(name),
      guest:guest_id(full_name),
      agreement:agreement_id(title)
    `
    )
    .eq('organization_id', params.organizationId)
    .order('movement_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (params.dateStart) q = q.gte('movement_date', params.dateStart);
  if (params.dateEnd) q = q.lte('movement_date', params.dateEnd);

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  return ((data ?? []) as PaymentLedgerRow[]).map((r) => ({
    ...r,
    amount: Number(r.amount) || 0,
    ledger_scope: r.ledger_scope === 'personal' ? 'personal' : 'hotel',
    description: r.description ?? '',
    payment_method: r.payment_method ?? 'cash',
  }));
}

export function summarizePaymentsLedger(rows: PaymentLedgerRow[]) {
  let expense = 0;
  let income = 0;
  for (const r of rows) {
    if (r.kind === 'expense') expense += r.amount;
    else income += r.amount;
  }
  return { expense, income, net: income - expense, count: rows.length };
}

export function buildPaymentsLedgerReportHtml(params: {
  rows: PaymentLedgerRow[];
  periodLabel: string;
  scopeLabel: string;
  footer: FinanceReportFooter;
  kindFilter: FinanceReportKindFilter;
}): string {
  const filtered = params.rows.filter((r) => matchesKindFilter(r.kind, params.kindFilter));
  const sorted = [...filtered].sort((a, b) => b.movement_date.localeCompare(a.movement_date));
  const sums = summarizePaymentsLedger(filtered);

  const tableRows = sorted
    .map((r) => {
      const isIn = r.kind === 'income';
      const sign = isIn ? '+' : '−';
      const rowClass = isIn ? 'rowIn' : 'rowOut';
      const plan = r.agreement?.title?.trim();
      return `<tr class="${rowClass}">
        <td>${esc(formatDateShort(r.movement_date))}</td>
        <td>${esc(isIn ? 'Alınan' : 'Ödenen')}</td>
        <td>${esc(partyLabel(r))}</td>
        <td>${esc(resolveCategoryLabel(r.category))}</td>
        <td class="colAmt">${sign}${esc(fmtMoneyTry(r.amount))}</td>
        <td>${esc(LEDGER_SCOPE_LABELS[r.ledger_scope])}</td>
        <td>${esc(paymentLabel(r.payment_method))}</td>
        <td>${esc(r.description?.trim() || (plan ? `Borç: ${plan}` : ''))}</td>
      </tr>`;
    })
    .join('');

  const brand = esc(params.footer.documentBrandTitle);
  const created = esc(formatDateShort(new Date()));

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 24px; color: #1e293b; font-size: 11px; }
  .header { display: flex; justify-content: space-between; border-bottom: 2px solid #0d9488; padding-bottom: 12px; margin-bottom: 16px; }
  .brand { font-size: 20px; font-weight: 800; color: #0f766e; }
  .brandSub { font-size: 11px; color: #64748b; margin-top: 2px; }
  .reportTitle { font-size: 18px; font-weight: 800; margin-top: 8px; }
  .reportSub { font-size: 12px; color: #64748b; margin-top: 4px; line-height: 1.5; }
  .summary { display: flex; gap: 12px; margin: 16px 0; flex-wrap: wrap; }
  .sumBox { flex: 1; min-width: 120px; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; background: #f8fafc; }
  .sumLbl { font-size: 10px; text-transform: uppercase; color: #64748b; font-weight: 700; }
  .sumVal { font-size: 16px; font-weight: 800; margin-top: 4px; }
  .sumIn { color: #16a34a; }
  .sumOut { color: #dc2626; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { border: 1px solid #e2e8f0; padding: 7px 8px; text-align: left; vertical-align: top; }
  th { background: #0d9488; color: #fff; font-size: 9px; text-transform: uppercase; }
  .colAmt { text-align: right; white-space: nowrap; font-weight: 700; }
  .rowIn { color: #15803d; }
  .rowOut { color: #b91c1c; }
  .footer { margin-top: 24px; font-size: 10px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 12px; line-height: 1.5; }
  </style></head><body>
  <div class="header">
    <div><div class="brand">${brand}</div><div class="brandSub">Tüm ödemeler — muhasebe defteri</div></div>
    <div style="text-align:right;font-size:10px;color:#64748b">Oluşturulma: ${created}</div>
  </div>
  <div class="reportTitle">Ödeme geçmişi raporu</div>
  <div class="reportSub">Dönem: ${esc(params.periodLabel)} · ${esc(params.scopeLabel)} · ${esc(FINANCE_REPORT_KIND_LABELS[params.kindFilter])}</div>
  <div class="summary">
    <div class="sumBox"><div class="sumLbl">Kayıt</div><div class="sumVal">${filtered.length}</div></div>
    <div class="sumBox"><div class="sumLbl">Toplam ödenen</div><div class="sumVal sumOut">${esc(fmtMoneyTry(sums.expense))}</div></div>
    <div class="sumBox"><div class="sumLbl">Toplam alınan</div><div class="sumVal sumIn">${esc(fmtMoneyTry(sums.income))}</div></div>
    <div class="sumBox"><div class="sumLbl">Net</div><div class="sumVal">${esc(fmtMoneyTry(sums.net))}</div></div>
  </div>
  <table>
    <tr><th>Tarih</th><th>Tür</th><th>Kişi / kaynak</th><th>Kategori</th><th>Tutar</th><th>Kapsam</th><th>Ödeme</th><th>Açıklama</th></tr>
    ${tableRows || '<tr><td colspan="8">Kayıt yok</td></tr>'}
  </table>
  <div class="footer">
    <div>${esc(params.footer.organizationLine)}</div>
    <div>Hazırlayan: ${esc(params.footer.preparedByName)}</div>
    <div>${esc(params.footer.disclaimer)}</div>
  </div>
  </body></html>`;
}
