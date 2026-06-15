import { supabase } from '@/lib/supabase';
import { paymentQrStandOpenUrl } from '@/lib/paymentOpenUrl';
import { invokeEdgeWithAuth } from '@/lib/invokeEdgeWithAuth';
import { getEdgeFunctionErrorMessage, parseEdgeFunctionErrorBody } from '@/lib/functionsError';
import { sanitizeSupabaseErrorMessage } from '@/lib/supabaseTransientErrors';
import type { PaymentServiceKind } from '@/lib/paymentsI18n';

function throwPaymentQrDbError(error: { message?: string }): never {
  throw new Error(sanitizeSupabaseErrorMessage(error.message));
}

export type PaymentQrStandRow = {
  id: string;
  public_token: string;
  organization_id: string;
  amount: number;
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

export type CreatePaymentQrStandResult = {
  id: string;
  public_token: string;
  open_url: string;
  amount: number;
  currency: string;
  title: string;
  description: string | null;
  service_kind: PaymentServiceKind;
  status: 'active';
  qr_mode: 'standing';
};

/** Sabit QR — WhatsApp/iMessage önizlemesinde işletme adı görünür */
export { paymentQrStandOpenUrl };

export async function createPaymentQrStand(input: {
  amount: number;
  currency?: string;
  title: string;
  description?: string | null;
  serviceKind?: PaymentServiceKind;
}): Promise<CreatePaymentQrStandResult> {
  const { data, error } = await invokeEdgeWithAuth('create-payment-qr-stand', {
    amount: input.amount,
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
  return payload;
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
  return (data as PaymentQrStandRow | null) ?? null;
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
  return (data ?? []) as PaymentQrStandRow[];
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
