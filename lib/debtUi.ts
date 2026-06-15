import type { Ionicons } from '@expo/vector-icons';
import { fmtMoneyTry } from '@/lib/financeLedger';
import { debtOrgPerspectiveLine } from '@/lib/financeLedger';
import type { DebtCategory, DebtStatus } from '@/lib/finance';
import { DEBT_CATEGORY_LABELS, DEBT_STATUS_LABELS } from '@/lib/finance';

export type DebtListRow = {
  id: string;
  category: DebtCategory;
  borrower_staff_id: string | null;
  borrower_is_organization: boolean;
  lender_staff_id: string | null;
  lender_is_organization: boolean;
  description: string;
  amount_principal: number;
  amount_remaining: number;
  status: DebtStatus;
  due_date: string | null;
  created_at: string;
  borrower?: { full_name: string | null } | null;
  lender?: { full_name: string | null } | null;
};

export type DebtTone = 'receivable' | 'payable' | 'internal';

export type DebtCategoryMeta = {
  label: string;
  short: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  bg: string;
};

export const DEBT_CATEGORY_META: Record<DebtCategory, DebtCategoryMeta> = {
  personal: {
    label: DEBT_CATEGORY_LABELS.personal,
    short: 'Personel',
    icon: 'people-outline',
    color: '#7c3aed',
    bg: '#ede9fe',
  },
  hotel_expense: {
    label: DEBT_CATEGORY_LABELS.hotel_expense,
    short: 'Otel',
    icon: 'business-outline',
    color: '#0369a1',
    bg: '#e0f2fe',
  },
  company_flow: {
    label: DEBT_CATEGORY_LABELS.company_flow,
    short: 'Akış',
    icon: 'swap-horizontal-outline',
    color: '#0d9488',
    bg: '#ccfbf1',
  },
};

export type DebtStatusMeta = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  bg: string;
};

export const DEBT_STATUS_META: Record<DebtStatus, DebtStatusMeta> = {
  open: { label: DEBT_STATUS_LABELS.open, icon: 'time-outline', color: '#0369a1', bg: '#e0f2fe' },
  partial: { label: DEBT_STATUS_LABELS.partial, icon: 'pie-chart-outline', color: '#c2410c', bg: '#ffedd5' },
  closed: { label: DEBT_STATUS_LABELS.closed, icon: 'checkmark-circle-outline', color: '#15803d', bg: '#dcfce7' },
};

export const DEBT_TONE_STYLES: Record<
  DebtTone,
  { stripe: string; pillBg: string; pillFg: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  receivable: { stripe: '#16a34a', pillBg: '#dcfce7', pillFg: '#15803d', icon: 'arrow-down-circle' },
  payable: { stripe: '#d97706', pillBg: '#ffedd5', pillFg: '#c2410c', icon: 'arrow-up-circle' },
  internal: { stripe: '#64748b', pillBg: '#f1f5f9', pillFg: '#475569', icon: 'swap-horizontal' },
};

export function debtPartyBorrow(r: DebtListRow): string {
  if (r.borrower_is_organization) return 'Şirket / Otel';
  return r.borrower?.full_name?.trim() || 'Personel';
}

export function debtPartyLend(r: DebtListRow): string {
  if (r.lender_is_organization) return 'Şirket / Otel';
  return r.lender?.full_name?.trim() || 'Personel';
}

export function debtRowPerspective(r: DebtListRow) {
  return debtOrgPerspectiveLine({
    borrowerIsOrg: r.borrower_is_organization,
    lenderIsOrg: r.lender_is_organization,
    borrowerName: debtPartyBorrow(r),
    lenderName: debtPartyLend(r),
    amountRemaining: Number(r.amount_remaining),
  });
}

export function debtPaidPercent(principal: number, remaining: number): number {
  const p = Number(principal) || 0;
  if (p <= 0) return 0;
  const paid = Math.max(0, p - (Number(remaining) || 0));
  return Math.min(100, Math.round((paid / p) * 100));
}

export function isDebtOverdue(dueDate: string | null, status: DebtStatus): boolean {
  if (!dueDate || status === 'closed') return false;
  const today = new Date().toISOString().slice(0, 10);
  return dueDate < today;
}

export type DebtListSummary = {
  receivableTotal: number;
  payableTotal: number;
  openCount: number;
  partialCount: number;
  overdueCount: number;
};

export function summarizeDebtList(rows: DebtListRow[]): DebtListSummary {
  let receivableTotal = 0;
  let payableTotal = 0;
  let openCount = 0;
  let partialCount = 0;
  let overdueCount = 0;

  for (const r of rows) {
    if (r.status === 'open') openCount++;
    if (r.status === 'partial') partialCount++;
    if (isDebtOverdue(r.due_date, r.status)) overdueCount++;

    if (r.status === 'closed') continue;
    const rem = Number(r.amount_remaining) || 0;
    if (r.lender_is_organization && !r.borrower_is_organization) receivableTotal += rem;
    if (r.borrower_is_organization && !r.lender_is_organization) payableTotal += rem;
  }

  return { receivableTotal, payableTotal, openCount, partialCount, overdueCount };
}

export function formatDebtPaidLine(principal: number, remaining: number): string {
  const paid = Math.max(0, Number(principal) - Number(remaining));
  return `Ödenen ${fmtMoneyTry(paid)} · Kalan ${fmtMoneyTry(Number(remaining) || 0)}`;
}
