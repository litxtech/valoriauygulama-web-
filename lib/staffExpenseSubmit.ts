import { supabase } from '@/lib/supabase';
import { uploadExpenseReceiptDirect } from '@/lib/storagePublicUpload';
import { getDefaultExpenseCategoryId, prefetchDefaultExpenseCategoryId } from '@/lib/staffExpenseDefaultCategory';
import {
  extractErrorMessage,
  isTransientSupabaseDbError,
  isSupabaseUnavailableError,
  sleepMs,
} from '@/lib/supabaseTransientErrors';

const MAX_ATTEMPTS = 6;

export type InsertStaffExpenseInput = {
  staffId: string;
  expenseDate: string;
  expenseTime: string;
  amount: number;
  paymentType: 'cash' | 'credit_card' | 'company_card';
  description: string;
  receiptImageUrl: string | null;
  noReceipt: boolean;
  noReceiptReason: string | null;
};

export { prefetchDefaultExpenseCategoryId };

export async function uploadExpenseReceiptWithRetry(uri: string): Promise<string> {
  let lastMsg = '';
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const { publicUrl } = await uploadExpenseReceiptDirect(uri);
      return publicUrl;
    } catch (e) {
      lastMsg = extractErrorMessage(e);
      if (attempt < MAX_ATTEMPTS && isSupabaseUnavailableError(lastMsg)) {
        await sleepMs(500 + attempt * 450);
        continue;
      }
      throw e instanceof Error ? e : new Error(lastMsg || 'Fiş yüklenemedi');
    }
  }
  throw new Error(lastMsg || 'Fiş yüklenemedi');
}

function isMissingNoReceiptColumn(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes('no_receipt') && (m.includes('column') || m.includes('schema cache'));
}

async function insertStaffExpenseRow(
  input: InsertStaffExpenseInput,
  categoryId: string,
  includeNoReceiptCols: boolean
) {
  const base = {
    staff_id: input.staffId,
    category_id: categoryId,
    expense_date: input.expenseDate,
    expense_time: input.expenseTime,
    amount: input.amount,
    payment_type: input.paymentType,
    description: input.description,
    receipt_image_url: input.receiptImageUrl,
    tags: null,
    status: 'pending' as const,
  };

  if (includeNoReceiptCols) {
    return supabase.from('staff_expenses').insert({
      ...base,
      no_receipt: input.noReceipt,
      no_receipt_reason: input.noReceipt ? input.noReceiptReason : null,
    });
  }

  return supabase.from('staff_expenses').insert(base);
}

async function insertStaffExpenseRpc(input: InsertStaffExpenseInput, categoryId: string) {
  return supabase.rpc('insert_my_staff_expense', {
    p_category_id: categoryId,
    p_expense_date: input.expenseDate,
    p_expense_time: input.expenseTime,
    p_amount: input.amount,
    p_payment_type: input.paymentType,
    p_description: input.description,
    p_receipt_image_url: input.receiptImageUrl,
    p_tags: null,
    p_no_receipt: input.noReceipt,
    p_no_receipt_reason: input.noReceiptReason,
  });
}

export async function insertStaffExpenseWithRetry(input: InsertStaffExpenseInput): Promise<void> {
  let lastErr: { message?: string; code?: string } | null = null;
  let categoryId: string | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      categoryId = categoryId ?? (await getDefaultExpenseCategoryId());
    } catch (e) {
      lastErr = e as { message?: string; code?: string };
      if (attempt < MAX_ATTEMPTS && isTransientSupabaseDbError(lastErr)) {
        await sleepMs(450 + attempt * 400);
        continue;
      }
      throw e;
    }

    let { error } = await insertStaffExpenseRow(input, categoryId, true);
    if (error && isMissingNoReceiptColumn(error.message ?? '')) {
      ({ error } = await insertStaffExpenseRow(input, categoryId, false));
    }

    if (error) {
      const rpc = await insertStaffExpenseRpc(input, categoryId);
      if (!rpc.error) return;
      error = rpc.error;
    }

    if (!error) return;

    lastErr = error;
    if (attempt < MAX_ATTEMPTS && isTransientSupabaseDbError(error)) {
      await sleepMs(500 + attempt * 450);
      continue;
    }
    throw error;
  }

  throw lastErr ?? new Error('Kayıt yapılamadı');
}

/** Kullanıcıya gösterilecek kısa mesaj — Edge kelimesi yok. */
export function staffExpenseSaveUserMessage(reason: unknown): string {
  const raw = extractErrorMessage(reason).replace(/edge\s*/gi, '').trim();
  if (isSupabaseUnavailableError(raw)) {
    return 'Sunucu geçici yanıt vermiyor (522). Wi‑Fi ile birkaç saniye sonra tekrar kaydedin.';
  }
  if (/fiş|storage|yüklem/i.test(raw)) {
    return `Fiş yüklenemedi: ${raw.slice(0, 100)}`;
  }
  if (raw.length > 120) return `${raw.slice(0, 120)}…`;
  return raw || 'Kayıt yapılamadı';
}

export function isExpenseUploadError(reason: unknown): boolean {
  const raw = extractErrorMessage(reason).toLowerCase();
  return /fiş|storage|yüklem/i.test(raw) || (isSupabaseUnavailableError(raw) && !/rpc|insert|staff_expenses/i.test(raw));
}
