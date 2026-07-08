import { supabase } from '@/lib/supabase';

export type SalaryEntryKind = 'regular' | 'bonus' | 'early_partial';

export const SALARY_ENTRY_KIND_LABELS: Record<SalaryEntryKind, string> = {
  regular: 'Maaş ödemesi',
  bonus: 'Ek ödeme / Prim',
  early_partial: 'Erken parçalı ödeme',
};

export const SALARY_ENTRY_KIND_HINTS: Record<SalaryEntryKind, string> = {
  regular: 'Dönem maaşının ana ödemesi',
  bonus: 'Maaşa ek prim, ikramiye veya ödül',
  early_partial: 'Ay bitmeden yapılan kısmi maaş avansı',
};

export type CreateSalaryPaymentInput = {
  staffId: string;
  periodMonth: number;
  periodYear: number;
  amount: number;
  paymentDate: string;
  paymentTime?: string | null;
  paymentType: 'transfer' | 'cash' | 'credit_card';
  bankOrReference?: string | null;
  description?: string | null;
  entryKind: SalaryEntryKind;
  createdByStaffId?: string | null;
};

function isMissingSalaryRpcError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === 'PGRST202') return true;
  const m = (error.message ?? '').toLowerCase();
  return m.includes('admin_create_salary_payment') || m.includes('could not find the function');
}

function friendlySalaryError(message: string): string {
  const m = message.toLowerCase();
  if (isMissingSalaryRpcError({ message })) {
    return 'Maaş sunucu güncellemesi henüz uygulanmadı. Yöneticiniz migration 514 dosyasını Supabase’e yüklemeli.';
  }
  if (m.includes('row-level security') || m.includes('policy')) {
    return 'Yetki hatası: maaş kaydı için admin veya maaş yönetimi yetkisi gerekir. Sunucuda migration 514 uygulanmalı.';
  }
  return message;
}

async function insertSalaryPaymentDirect(
  input: CreateSalaryPaymentInput
): Promise<{ id: string | null; error: string | null }> {
  const base = {
    staff_id: input.staffId,
    period_month: input.periodMonth,
    period_year: input.periodYear,
    amount: input.amount,
    payment_date: input.paymentDate,
    payment_time: input.paymentTime || null,
    payment_type: input.paymentType,
    bank_or_reference: input.bankOrReference?.trim() || null,
    description: input.description?.trim() || null,
    status: 'pending_approval' as const,
    created_by: input.createdByStaffId ?? null,
  };

  const withKind = { ...base, entry_kind: input.entryKind };
  let res = await supabase.from('salary_payments').insert(withKind).select('id').single();

  if (res.error && /entry_kind|column/i.test(res.error.message ?? '')) {
    res = await supabase.from('salary_payments').insert(base).select('id').single();
  }

  if (res.error) return { id: null, error: friendlySalaryError(res.error.message) };
  const id = (res.data as { id?: string } | null)?.id ?? null;
  return { id, error: id ? null : 'Kayıt oluşturulamadı' };
}

export async function createAdminSalaryPayment(
  input: CreateSalaryPaymentInput
): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('admin_create_salary_payment', {
    p_staff_id: input.staffId,
    p_period_month: input.periodMonth,
    p_period_year: input.periodYear,
    p_amount: input.amount,
    p_payment_date: input.paymentDate,
    p_payment_time: input.paymentTime || null,
    p_payment_type: input.paymentType,
    p_bank_or_reference: input.bankOrReference?.trim() || null,
    p_description: input.description?.trim() || null,
    p_entry_kind: input.entryKind,
  });

  if (!error) {
    return { id: typeof data === 'string' ? data : null, error: null };
  }

  if (isMissingSalaryRpcError(error)) {
    return insertSalaryPaymentDirect(input);
  }

  return { id: null, error: friendlySalaryError(error.message) };
}

export type StaffSalaryMonthSnapshot = {
  approvedTotal: number;
  pendingTotal: number;
  paymentCount: number;
};

export async function fetchStaffSalaryMonthSnapshot(
  staffId: string,
  periodYear: number,
  periodMonth: number
): Promise<StaffSalaryMonthSnapshot> {
  const { data } = await supabase
    .from('salary_payments')
    .select('amount, status')
    .eq('staff_id', staffId)
    .eq('period_year', periodYear)
    .eq('period_month', periodMonth);

  let approvedTotal = 0;
  let pendingTotal = 0;
  for (const row of data ?? []) {
    const amt = Number((row as { amount: number }).amount) || 0;
    const status = (row as { status: string }).status;
    if (status === 'approved') approvedTotal += amt;
    else if (status === 'pending_approval') pendingTotal += amt;
  }
  return { approvedTotal, pendingTotal, paymentCount: (data ?? []).length };
}
