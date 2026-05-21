import { supabase } from '@/lib/supabase';
import { fmtMoneyTry } from '@/lib/financeLedger';
import { resolveCategoryLabel } from '@/lib/financeCategoriesApi';
import { CHECK_DIRECTION_LABELS, CHECK_STATUS_LABELS, type FinanceCheckDirection } from '@/lib/finance';
import type { Href } from 'expo-router';

export type AccountingActivityItem = {
  id: string;
  source: 'movement' | 'staff_expense' | 'check' | 'debt_payment';
  sortAt: string;
  title: string;
  subtitle: string;
  amountLabel: string;
  direction: 'in' | 'out';
  href: Href;
};

export async function fetchAccountingActivityFeed(
  organizationId: string,
  limit = 40
): Promise<AccountingActivityItem[]> {
  const items: AccountingActivityItem[] = [];
  const cap = Math.min(Math.max(limit, 10), 80);
  const rowCap = Math.ceil(cap * 0.6);

  const [mov, exp, chk, pay] = await Promise.all([
    supabase
      .from('finance_movements')
      .select(
        'id, kind, amount, movement_date, category, counterparty_name, description, counterparty:counterparty_id(name)'
      )
      .eq('organization_id', organizationId)
      .order('movement_date', { ascending: false })
      .limit(rowCap),
    supabase
      .from('staff_expenses')
      .select('id, amount, expense_date, description, status, staff:staff_id(full_name), category:category_id(name)')
      .eq('organization_id', organizationId)
      .neq('status', 'rejected')
      .order('expense_date', { ascending: false })
      .limit(rowCap),
    supabase
      .from('finance_checks')
      .select('id, direction, amount, counterparty_name, status, created_at')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(Math.ceil(rowCap / 2)),
    supabase
      .from('staff_debt_payments')
      .select(
        'id, amount, paid_at, notes, debt:debt_entry_id(description, borrower:borrower_staff_id(full_name), lender:lender_staff_id(full_name))'
      )
      .eq('organization_id', organizationId)
      .order('paid_at', { ascending: false })
      .limit(Math.ceil(rowCap / 2)),
  ]);

  if (mov.data) {
    for (const r of mov.data as {
      id: string;
      kind: string;
      amount: number;
      movement_date: string;
      category: string;
      counterparty_name: string | null;
      description: string;
      created_at: string;
      counterparty?: { name: string } | null;
    }[]) {
      const who = r.counterparty?.name?.trim() || r.counterparty_name?.trim() || '—';
      const cat = resolveCategoryLabel(r.category);
      const isIn = r.kind === 'income';
      items.push({
        id: `mov-${r.id}`,
        source: 'movement',
        sortAt: `${r.movement_date}T12:00:00`,
        title: isIn ? `Gelir · ${who}` : `Gider · ${who}`,
        subtitle: [cat, r.description?.trim()].filter(Boolean).join(' · ') || '—',
        amountLabel: (isIn ? '+' : '−') + fmtMoneyTry(Number(r.amount)),
        direction: isIn ? 'in' : 'out',
        href: { pathname: '/admin/accounting/movements/[id]', params: { id: r.id } },
      });
    }
  }

  if (exp.data) {
    for (const r of exp.data as {
      id: string;
      amount: number;
      expense_date: string;
      description: string | null;
      status: string;
      created_at: string;
      staff?: { full_name: string | null } | null;
      category?: { name: string } | null;
    }[]) {
      const st = r.status === 'approved' ? 'Onaylı' : r.status === 'pending' ? 'Beklemede' : r.status;
      items.push({
        id: `exp-${r.id}`,
        source: 'staff_expense',
        sortAt: `${r.expense_date}T10:00:00`,
        title: `Personel harcaması · ${r.staff?.full_name?.trim() || 'Personel'}`,
        subtitle: [r.category?.name, r.description?.trim(), st].filter(Boolean).join(' · '),
        amountLabel: '−' + fmtMoneyTry(Number(r.amount)),
        direction: 'out',
        href: '/admin/expenses/all',
      });
    }
  }

  if (chk.data) {
    for (const r of chk.data as {
      id: string;
      direction: FinanceCheckDirection;
      amount: number;
      counterparty_name: string;
      status: string;
      due_date: string | null;
      created_at: string;
    }[]) {
      const dir = CHECK_DIRECTION_LABELS[r.direction];
      items.push({
        id: `chk-${r.id}`,
        source: 'check',
        sortAt: r.due_date ? `${r.due_date}T08:00:00` : r.created_at,
        title: `Çek · ${dir} · ${r.counterparty_name}`,
        subtitle: CHECK_STATUS_LABELS[r.status as keyof typeof CHECK_STATUS_LABELS] ?? r.status,
        amountLabel: fmtMoneyTry(Number(r.amount)),
        direction: r.direction === 'received' ? 'in' : 'out',
        href: { pathname: '/admin/finance-checks/[id]', params: { id: r.id } },
      });
    }
  }

  if (pay.data) {
    for (const r of pay.data as {
      id: string;
      amount: number;
      paid_at: string;
      notes: string | null;
      debt?: {
        description: string;
        borrower?: { full_name: string | null } | null;
        lender?: { full_name: string | null } | null;
      } | null;
    }[]) {
      const b = r.debt?.borrower?.full_name?.trim() || '—';
      const l = r.debt?.lender?.full_name?.trim() || '—';
      items.push({
        id: `pay-${r.id}`,
        source: 'debt_payment',
        sortAt: r.paid_at,
        title: `Borç ödemesi · ${b} → ${l}`,
        subtitle: r.notes?.trim() || r.debt?.description?.trim() || '—',
        amountLabel: '−' + fmtMoneyTry(Number(r.amount)),
        direction: 'out',
        href: '/admin/debts',
      });
    }
  }

  items.sort((a, b) => (a.sortAt < b.sortAt ? 1 : a.sortAt > b.sortAt ? -1 : 0));
  return items.slice(0, limit);
}

export async function fetchAccountingMonthTotals(
  organizationId: string,
  monthStart: string,
  monthEnd: string
): Promise<{
  income: number;
  expense: number;
  staffExpense: number;
}> {
  let income = 0;
  let expense = 0;
  let staffExpense = 0;

  const [movRes, expRes] = await Promise.all([
    supabase
      .from('finance_movements')
      .select('kind, amount')
      .eq('organization_id', organizationId)
      .gte('movement_date', monthStart)
      .lt('movement_date', monthEnd),
    supabase
      .from('staff_expenses')
      .select('amount, status')
      .eq('organization_id', organizationId)
      .gte('expense_date', monthStart)
      .lt('expense_date', monthEnd)
      .neq('status', 'rejected'),
  ]);

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

  return { income, expense, staffExpense };
}
