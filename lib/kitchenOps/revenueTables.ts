import { supabase } from '@/lib/supabase';

export const KITCHEN_TABLE_COUNT = 14;

export function kitchenTableNumbers(): number[] {
  return Array.from({ length: KITCHEN_TABLE_COUNT }, (_, i) => i + 1);
}

export function kitchenTableLabel(tableNumber: number): string {
  return `Masa ${tableNumber}`;
}

export type KitchenRevenueRow = {
  id: string;
  entry_date: string;
  table_number: number | null;
  description: string | null;
  amount: number;
  payment_type: string | null;
  note: string | null;
  created_at: string;
};

export type KitchenRevenueDayStats = {
  total: number;
  count: number;
  byTable: Record<number, number>;
};

export function todayKitchenDateIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function summarizeKitchenRevenues(rows: KitchenRevenueRow[]): KitchenRevenueDayStats {
  const byTable: Record<number, number> = {};
  let total = 0;
  for (const row of rows) {
    const amt = Number(row.amount ?? 0);
    total += amt;
    if (row.table_number != null) {
      byTable[row.table_number] = (byTable[row.table_number] ?? 0) + amt;
    }
  }
  return { total, count: rows.length, byTable };
}

export async function fetchKitchenRevenuesByDate(date: string): Promise<KitchenRevenueRow[]> {
  const { data, error } = await supabase
    .from('kitchen_revenues')
    .select('id, entry_date, table_number, description, amount, payment_type, note, created_at')
    .eq('entry_date', date)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as KitchenRevenueRow[];
}

export type InsertKitchenRevenueInput = {
  organizationId: string;
  staffId: string | undefined;
  tableNumber: number;
  amount: number;
  paymentType?: string | null;
  note?: string | null;
  description?: string | null;
  entryDate?: string;
};

export async function insertKitchenRevenue(input: InsertKitchenRevenueInput): Promise<void> {
  const paymentType = input.paymentType?.trim() || 'nakit';
  const description = input.description?.trim() || kitchenTableLabel(input.tableNumber);
  const entryDate = input.entryDate ?? todayKitchenDateIso();

  const { error } = await supabase.from('kitchen_revenues').insert({
    organization_id: input.organizationId,
    entry_date: entryDate,
    table_number: input.tableNumber,
    description,
    amount: input.amount,
    payment_type: paymentType,
    note: input.note?.trim() || null,
    created_by: input.staffId ?? null,
  });
  if (error) throw error;

  if (paymentType === 'otel_pos') {
    await supabase.from('kitchen_pos_transactions').insert({
      organization_id: input.organizationId,
      amount: input.amount,
      net_amount: input.amount,
      description,
      created_by: input.staffId ?? null,
    });
  }
  if (paymentType === 'otel_hesabi') {
    await supabase.from('kitchen_cari_ledger').insert({
      organization_id: input.organizationId,
      direction: 'kitchen_owes_hotel',
      category: 'hasilat',
      amount: input.amount,
      description,
      created_by: input.staffId ?? null,
    });
  }
}
