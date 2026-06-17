import { supabase } from '@/lib/supabase';
import { fetchKitchenRevenuesByDate, todayKitchenDateIso } from '@/lib/kitchenOps/revenueTables';

export type KitchenFinanceActivityTab = 'revenue' | 'expense' | 'payment';

export type KitchenFinanceRevenueItem = {
  id: string;
  amount: number;
  description: string;
  payment_type: string;
  entry_date: string;
  created_at: string;
};

export type KitchenFinanceExpenseItem = {
  id: string;
  amount: number;
  category: string;
  description: string | null;
  supplier_name: string | null;
  entry_date: string;
};

export type KitchenFinancePaymentItem = {
  id: string;
  amount: number;
  staff_name: string;
  payment_type: string;
  entry_date: string;
  description: string | null;
};

export async function fetchKitchenFinanceActivity(
  date: string = todayKitchenDateIso()
): Promise<{
  revenues: KitchenFinanceRevenueItem[];
  expenses: KitchenFinanceExpenseItem[];
  payments: KitchenFinancePaymentItem[];
}> {
  const [revenues, expensesRes, paymentsRes] = await Promise.all([
    fetchKitchenRevenuesByDate(date),
    supabase
      .from('kitchen_expenses')
      .select('id, amount, category, description, supplier_name, entry_date')
      .eq('entry_date', date)
      .order('created_at', { ascending: false })
      .limit(30),
    supabase
      .from('kitchen_personnel_payments')
      .select('id, amount, staff_name, payment_type, entry_date, description')
      .eq('entry_date', date)
      .order('created_at', { ascending: false })
      .limit(30),
  ]);

  if (expensesRes.error) throw expensesRes.error;
  if (paymentsRes.error) throw paymentsRes.error;

  return {
    revenues: revenues.map((r) => ({
      id: r.id,
      amount: Number(r.amount),
      description: r.description,
      payment_type: r.payment_type,
      entry_date: r.entry_date,
      created_at: r.created_at,
    })),
    expenses: (expensesRes.data ?? []) as KitchenFinanceExpenseItem[],
    payments: (paymentsRes.data ?? []) as KitchenFinancePaymentItem[],
  };
}
