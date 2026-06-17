import { supabase } from '@/lib/supabase';
import { paymentQrStandOpenUrl } from '@/lib/paymentOpenUrl';
import { invokeEdgeWithAuth } from '@/lib/invokeEdgeWithAuth';
import { getEdgeFunctionErrorMessage, parseEdgeFunctionErrorBody } from '@/lib/functionsError';
import {
  extractErrorMessage,
  isSupabaseUnavailableError,
  sanitizeSupabaseErrorMessage,
  sleepMs,
} from '@/lib/supabaseTransientErrors';
import type { PaymentServiceKind } from '@/lib/paymentsI18n';

const CREATE_QR_MAX_ATTEMPTS = 4;

function throwPaymentQrDbError(error: { message?: string }): never {
  throw new Error(sanitizeSupabaseErrorMessage(error.message));
}

export type PaymentQrStandAmountMode = 'fixed' | 'variable';

export type PaymentQrStandRow = {
  id: string;
  public_token: string;
  organization_id: string;
  amount: number | null;
  amount_mode: PaymentQrStandAmountMode;
  currency: string;
  title: string;
  description: string | null;
  service_kind: PaymentServiceKind;
  status: 'active' | 'closed';
  created_by_staff_id: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PaymentQrStandStats = {
  paid_count: number;
  paid_total: number;
};

export type PaymentQrStandPaidRow = {
  id: string;
  amount: number;
  currency: string;
  title: string;
  description: string | null;
  paid_at: string | null;
  created_at: string;
};

export type CreatePaymentQrStandResult = {
  id: string;
  public_token: string;
  open_url: string;
  amount: number | null;
  amount_mode: PaymentQrStandAmountMode;
  currency: string;
  title: string;
  description: string | null;
  service_kind: PaymentServiceKind;
  status: 'active';
  qr_mode: 'standing' | 'standing_variable';
};

/** Sabit QR — WhatsApp/iMessage önizlemesinde işletme adı görünür */
export { paymentQrStandOpenUrl };

export function isVariablePaymentQrStand(row: Pick<PaymentQrStandRow, 'amount_mode'>): boolean {
  return row.amount_mode === 'variable';
}

export async function createPaymentQrStand(input: {
  amount?: number;
  amountMode?: PaymentQrStandAmountMode;
  currency?: string;
  title: string;
  description?: string | null;
  serviceKind?: PaymentServiceKind;
}): Promise<CreatePaymentQrStandResult> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= CREATE_QR_MAX_ATTEMPTS; attempt++) {
    try {
      return await createPaymentQrStandOnce(input);
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(extractErrorMessage(e));
      const msg = lastError.message;
      const retryable =
        isSupabaseUnavailableError(msg) ||
        /non-2xx|502|503|504|522|524|schema cache|pgrst204|amount_mode/i.test(msg);
      if (attempt < CREATE_QR_MAX_ATTEMPTS && retryable) {
        await sleepMs(500 + attempt * 450);
        continue;
      }
      throw lastError;
    }
  }

  throw lastError ?? new Error('QR oluşturulamadı');
}

/** Kullanıcıya gösterilecek kısa oluşturma hatası. */
export function paymentQrStandCreateUserMessage(reason: unknown): string {
  const raw = extractErrorMessage(reason).replace(/edge\s*/gi, '').trim();
  if (isSupabaseUnavailableError(raw)) {
    return 'Sunucu geçici yanıt vermiyor (522). Wi‑Fi ile birkaç saniye sonra tekrar deneyin.';
  }
  if (/amount_mode|schema cache|pgrst204/i.test(raw)) {
    return 'Ödeme servisi güncelleniyor. Bir dakika bekleyip tekrar deneyin.';
  }
  const cleaned = sanitizeSupabaseErrorMessage(raw);
  if (cleaned.length > 140) return `${cleaned.slice(0, 140)}…`;
  return cleaned || 'QR oluşturulamadı';
}

async function createPaymentQrStandOnce(input: {
  amount?: number;
  amountMode?: PaymentQrStandAmountMode;
  currency?: string;
  title: string;
  description?: string | null;
  serviceKind?: PaymentServiceKind;
}): Promise<CreatePaymentQrStandResult> {
  const amountMode = input.amountMode ?? 'fixed';
  const { data, error } = await invokeEdgeWithAuth('create-payment-qr-stand', {
    amount: amountMode === 'fixed' ? input.amount : null,
    amount_mode: amountMode,
    currency: input.currency ?? 'try',
    title: input.title.trim(),
    description: input.description?.trim() || null,
    service_kind: input.serviceKind ?? 'generic',
  });

  if (error) {
    const parsed = await parseEdgeFunctionErrorBody(error);
    const msg = parsed?.message ?? (await getEdgeFunctionErrorMessage(error));
    throw new Error(msg || 'Sabit QR oluşturulamadı');
  }

  const payload = data as CreatePaymentQrStandResult & { error?: string };
  if (payload?.error) throw new Error(payload.error);
  if (!payload?.id || !payload?.open_url) throw new Error('Sabit QR oluşturulamadı');
  return {
    ...payload,
    open_url: paymentQrStandOpenUrl(payload.public_token),
  };
}

export async function closePaymentQrStand(standId: string): Promise<void> {
  const { data, error } = await invokeEdgeWithAuth('close-payment-qr-stand', { stand_id: standId });
  if (error) {
    const parsed = await parseEdgeFunctionErrorBody(error);
    const msg = parsed?.message ?? (await getEdgeFunctionErrorMessage(error));
    throw new Error(msg || 'QR kapatılamadı');
  }
  const payload = data as { error?: string; ok?: boolean };
  if (payload?.error) throw new Error(payload.error);
  if (!payload?.ok) throw new Error('QR kapatılamadı');
}

export async function fetchPaymentQrStand(id: string): Promise<PaymentQrStandRow | null> {
  const { data, error } = await supabase.from('payment_qr_stands').select('*').eq('id', id).maybeSingle();
  if (error) throwPaymentQrDbError(error);
  if (!data) return null;
  const row = data as PaymentQrStandRow;
  return { ...row, amount_mode: row.amount_mode ?? 'fixed' };
}

export async function fetchPaymentQrStands(orgId: string | null, limit = 40): Promise<PaymentQrStandRow[]> {
  let q = supabase
    .from('payment_qr_stands')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (orgId) q = q.eq('organization_id', orgId);
  const { data, error } = await q;
  if (error) throwPaymentQrDbError(error);
  return (data ?? []).map((row) => ({
    ...(row as PaymentQrStandRow),
    amount_mode: (row as PaymentQrStandRow).amount_mode ?? 'fixed',
  }));
}

export async function fetchPaymentQrStandStats(standId: string): Promise<PaymentQrStandStats> {
  const { data, error } = await supabase
    .from('payment_requests')
    .select('amount')
    .eq('reference_type', 'qr_stand')
    .eq('reference_id', standId)
    .eq('status', 'paid');

  if (error) throwPaymentQrDbError(error);
  const rows = data ?? [];
  return {
    paid_count: rows.length,
    paid_total: rows.reduce((s, r) => s + Number(r.amount ?? 0), 0),
  };
}

export async function fetchPaymentQrStandPaidPayments(
  standId: string,
  limit = 50
): Promise<PaymentQrStandPaidRow[]> {
  const { data, error } = await supabase
    .from('payment_requests')
    .select('id, amount, currency, title, description, paid_at, created_at')
    .eq('reference_type', 'qr_stand')
    .eq('reference_id', standId)
    .eq('status', 'paid')
    .order('paid_at', { ascending: false })
    .limit(limit);

  if (error) throwPaymentQrDbError(error);
  return (data ?? []) as PaymentQrStandPaidRow[];
}

export function subscribePaymentQrStand(
  standId: string,
  onChange: () => void
): () => void {
  const channel = supabase
    .channel(`payment_qr_stand_${standId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'payment_qr_stands', filter: `id=eq.${standId}` },
      () => onChange()
    )
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'payment_requests', filter: `reference_id=eq.${standId}` },
      () => onChange()
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'payment_requests', filter: `reference_id=eq.${standId}` },
      () => onChange()
    )
    .subscribe();

  const poll = setInterval(() => onChange(), 5000);

  return () => {
    clearInterval(poll);
    void supabase.removeChannel(channel);
  };
}
