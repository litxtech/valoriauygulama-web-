export type StaffSalaryPayment = {
  id: string;
  period_month: number;
  period_year: number;
  amount: number;
  payment_date: string;
  payment_time: string | null;
  payment_type: string | null;
  bank_or_reference: string | null;
  description: string | null;
  entry_kind?: string | null;
  status: string;
  staff_approved_at: string | null;
  staff_rejected_at: string | null;
  rejection_reason: string | null;
  created_at: string;
};

export type SalaryEntryKind = 'regular' | 'extra';

export function salaryPeriodKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function formatSalaryMoney(n: number): string {
  return (
    new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n) + ' ₺'
  );
}

export function formatSalaryTime(t: string | null | undefined): string | null {
  if (!t) return null;
  const parts = String(t).split(':');
  return parts.length >= 2 ? `${parts[0]}:${parts[1]}` : t;
}

const EXTRA_HINT = /ek\s*maaş|ek\s*maas|extra\s*salary|extra\s*ödeme|extra\s*odeme|bonus|ekstra|prim/i;

export function classifySalaryPaymentKinds(rows: StaffSalaryPayment[]): Map<string, SalaryEntryKind> {
  const byPeriod = new Map<string, StaffSalaryPayment[]>();
  for (const row of rows) {
    const key = salaryPeriodKey(row.period_year, row.period_month);
    const list = byPeriod.get(key) ?? [];
    list.push(row);
    byPeriod.set(key, list);
  }

  const result = new Map<string, SalaryEntryKind>();
  for (const list of byPeriod.values()) {
    const sorted = [...list].sort((a, b) => {
      const ca = a.created_at || a.payment_date;
      const cb = b.created_at || b.payment_date;
      return ca.localeCompare(cb);
    });
    sorted.forEach((row, idx) => {
      const kind = row.entry_kind;
      if (kind === 'bonus' || kind === 'early_partial') {
        result.set(row.id, 'extra');
        return;
      }
      if (kind === 'regular') {
        result.set(row.id, 'regular');
        return;
      }
      const extraHint = EXTRA_HINT.test(row.description ?? '');
      result.set(row.id, idx > 0 || extraHint ? 'extra' : 'regular');
    });
  }
  return result;
}

export type StaffSalarySummary = {
  baseSalary: number | null;
  currentYear: number;
  currentMonth: number;
  monthApprovedPaid: number;
  monthPendingPaid: number;
  monthRemaining: number | null;
  yearApprovedPaid: number;
  yearExpected: number | null;
  yearRemaining: number | null;
  allTimeApprovedPaid: number;
  extraApprovedTotal: number;
  regularApprovedTotal: number;
  pendingTotal: number;
  pendingCount: number;
  approvedCount: number;
  monthProgressPct: number | null;
};

function sumAmount(list: StaffSalaryPayment[]): number {
  return list.reduce((s, r) => s + (Number(r.amount) || 0), 0);
}

export function buildStaffSalarySummary(
  rows: StaffSalaryPayment[],
  baseSalary: number | null,
  now = new Date()
): StaffSalarySummary {
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const kinds = classifySalaryPaymentKinds(rows);

  const approved = rows.filter((r) => r.status === 'approved');
  const pending = rows.filter((r) => r.status === 'pending_approval');

  const monthApproved = approved.filter((r) => r.period_year === currentYear && r.period_month === currentMonth);
  const monthPending = pending.filter((r) => r.period_year === currentYear && r.period_month === currentMonth);
  const yearApproved = approved.filter((r) => r.period_year === currentYear);

  const monthApprovedPaid = sumAmount(monthApproved);
  const monthPendingPaid = sumAmount(monthPending);
  const yearApprovedPaid = sumAmount(yearApproved);
  const allTimeApprovedPaid = sumAmount(approved);
  const pendingTotal = sumAmount(pending);

  let extraApprovedTotal = 0;
  let regularApprovedTotal = 0;
  for (const r of approved) {
    const amt = Number(r.amount) || 0;
    if (kinds.get(r.id) === 'extra') extraApprovedTotal += amt;
    else regularApprovedTotal += amt;
  }

  const monthRemaining =
    baseSalary != null && baseSalary > 0 ? Math.max(0, baseSalary - monthApprovedPaid) : null;
  const yearExpected = baseSalary != null && baseSalary > 0 ? baseSalary * currentMonth : null;
  const yearRemaining = yearExpected != null ? Math.max(0, yearExpected - yearApprovedPaid) : null;
  const monthProgressPct =
    baseSalary != null && baseSalary > 0 ? Math.min(100, Math.round((monthApprovedPaid / baseSalary) * 100)) : null;

  return {
    baseSalary,
    currentYear,
    currentMonth,
    monthApprovedPaid,
    monthPendingPaid,
    monthRemaining,
    yearApprovedPaid,
    yearExpected,
    yearRemaining,
    allTimeApprovedPaid,
    extraApprovedTotal,
    regularApprovedTotal,
    pendingTotal,
    pendingCount: pending.length,
    approvedCount: approved.length,
    monthProgressPct,
  };
}

export type SalaryPeriodGroup = {
  key: string;
  year: number;
  month: number;
  rows: StaffSalaryPayment[];
  approvedTotal: number;
  pendingTotal: number;
};

export function groupSalaryPaymentsByPeriod(rows: StaffSalaryPayment[]): SalaryPeriodGroup[] {
  const map = new Map<string, StaffSalaryPayment[]>();
  for (const row of rows) {
    const key = salaryPeriodKey(row.period_year, row.period_month);
    const list = map.get(key) ?? [];
    list.push(row);
    map.set(key, list);
  }

  return [...map.entries()]
    .map(([key, list]) => {
      const sorted = [...list].sort((a, b) => {
        const ca = a.created_at || a.payment_date;
        const cb = b.created_at || b.payment_date;
        return cb.localeCompare(ca);
      });
      const [yearStr, monthStr] = key.split('-');
      const approvedTotal = sumAmount(sorted.filter((r) => r.status === 'approved'));
      const pendingTotal = sumAmount(sorted.filter((r) => r.status === 'pending_approval'));
      return {
        key,
        year: Number(yearStr),
        month: Number(monthStr),
        rows: sorted,
        approvedTotal,
        pendingTotal,
      };
    })
    .sort((a, b) => b.key.localeCompare(a.key));
}

export function paymentTypeLabelKey(type: string | null | undefined): string {
  if (type === 'transfer') return 'staffSalaryPaymentTransfer';
  if (type === 'cash') return 'staffSalaryPaymentCash';
  if (type === 'credit_card') return 'staffSalaryPaymentCard';
  return 'staffSalaryPaymentOther';
}
