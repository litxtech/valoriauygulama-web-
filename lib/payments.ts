import { supabase } from '@/lib/supabase';
import { paymentRequestOpenUrl } from '@/lib/paymentOpenUrl';
import { invokeEdgeWithAuth } from '@/lib/invokeEdgeWithAuth';
import type { PaymentRequestStatus, PaymentServiceKind } from '@/lib/paymentsI18n';

import type { AdminGuestAccountSummary } from '@/lib/adminGuestAccountSummary';

export type AdminPaymentTipDetail = {
  id: string;
  note: string | null;
  room_number: string | null;
  payment_method: string;
  status: string;
  staff?: { full_name: string | null } | null;
};

export type AdminPaymentRequestRow = PaymentRequestRow & {
  guest_detail?: AdminGuestAccountSummary | null;
  tip_detail?: AdminPaymentTipDetail | null;
  creator_staff?: { full_name: string | null } | null;
};

export type PaymentRequestRow = {
  id: string;
  public_token: string;
  organization_id: string;
  amount: number;
  currency: string;
  title: string;
  description: string | null;
  service_kind: PaymentServiceKind;
  reference_type: string | null;
  reference_id: string | null;
  status: PaymentRequestStatus;
  provider: string;
  provider_session_id: string | null;
  pay_url: string | null;
  receipt_url: string | null;
  guest_id: string | null;
  created_by_staff_id: string | null;
  metadata: Record<string, unknown>;
  paid_at: string | null;
  refunded_at?: string | null;
  archived_at?: string | null;
  cancelled_at?: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CreatePaymentRequestInput = {
  amount: number;
  currency?: string;
  title: string;
  description?: string | null;
  serviceKind?: PaymentServiceKind;
  referenceType?: string | null;
  referenceId?: string | null;
  guestId?: string | null;
  metadata?: Record<string, unknown>;
  expiresInMinutes?: number;
};

export type CreatePaymentRequestResult = {
  id: string;
  public_token: string;
  /** Misafir paylaşım / QR (Valoria önizleme) */
  open_url: string;
  pay_url: string;
  amount: number;
  currency: string;
  title: string;
  description: string | null;
  service_kind: PaymentServiceKind;
  expires_at: string;
  status: PaymentRequestStatus;
};

export async function createPaymentRequest(input: CreatePaymentRequestInput): Promise<CreatePaymentRequestResult> {
  const { data, error } = await invokeEdgeWithAuth('create-payment-request', {
    amount: input.amount,
    currency: input.currency ?? 'try',
    title: input.title.trim(),
    description: input.description?.trim() || null,
    service_kind: input.serviceKind ?? 'generic',
    reference_type: input.referenceType ?? null,
    reference_id: input.referenceId ?? null,
    guest_id: input.guestId ?? null,
    metadata: input.metadata ?? {},
    expires_in_minutes: input.expiresInMinutes ?? 120,
  });

  if (error) {
    throw new Error(error.message || 'Ödeme talebi oluşturulamadı');
  }
  const payload = data as CreatePaymentRequestResult & { error?: string };
  if (payload?.error) throw new Error(payload.error);
  if (!payload?.id || !payload?.pay_url) {
    throw new Error('Ödeme oturumu alınamadı');
  }
  const open_url =
    typeof payload.open_url === 'string' && payload.open_url.trim()
      ? payload.open_url.trim()
      : paymentRequestOpenUrl(payload.public_token);
  return { ...payload, open_url };
}

export async function fetchPaymentRequests(orgId: string | null, limit = 200): Promise<PaymentRequestRow[]> {
  let q = supabase
    .from('payment_requests')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (orgId) q = q.eq('organization_id', orgId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as PaymentRequestRow[];
}

export function isPaymentArchived(row: Pick<PaymentRequestRow, 'archived_at'>): boolean {
  return Boolean(row.archived_at);
}

/** Ana ödemeler listesi: açık / güncel kayıtlar (bekleyen + ödenmiş, kapatılmamış). */
export function isPaymentActiveForList(
  row: Pick<PaymentRequestRow, 'archived_at' | 'status'>
): boolean {
  if (isPaymentArchived(row)) return false;
  if (row.status === 'cancelled' || row.status === 'expired' || row.status === 'failed' || row.status === 'refunded') {
    return false;
  }
  return row.status === 'pending' || row.status === 'paid';
}

/** Geçmiş: link kapatılan, iptal, süresi dolan, iade vb. */
export function isPaymentHistoryForList(
  row: Pick<PaymentRequestRow, 'archived_at' | 'status'>
): boolean {
  return !isPaymentActiveForList(row);
}

export async function cancelPaymentRequest(paymentRequestId: string): Promise<void> {
  const { data, error } = await invokeEdgeWithAuth('close-payment-request', {
    payment_request_id: paymentRequestId,
    action: 'cancel',
  });
  if (error) throw new Error(error.message || 'Link iptal edilemedi');
  const payload = data as { error?: string; ok?: boolean };
  if (payload?.error) throw new Error(payload.error);
  if (!payload?.ok) throw new Error('Link iptal edilemedi');
}

export async function archivePaymentRequest(paymentRequestId: string): Promise<void> {
  const { data, error } = await invokeEdgeWithAuth('close-payment-request', {
    payment_request_id: paymentRequestId,
    action: 'archive',
  });
  if (error) throw new Error(error.message || 'Link kapatılamadı');
  const payload = data as { error?: string; ok?: boolean };
  if (payload?.error) throw new Error(payload.error);
  if (!payload?.ok) throw new Error('Link kapatılamadı');
}

export async function fetchAdminPaymentRequests(limit = 500): Promise<AdminPaymentRequestRow[]> {
  const { data, error } = await supabase
    .from('payment_requests')
    .select(
      `*,
      guest_detail:guest_id(
        id, full_name, phone, email, status, id_number,
        check_in_at, check_out_at, created_at, auth_user_id, is_guest_app_account,
        rooms:room_id(room_number)
      ),
      creator_staff:created_by_staff_id(full_name)`
    )
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as AdminPaymentRequestRow[];
  const tipIds = rows
    .filter((r) => r.service_kind === 'staff_tip' && r.reference_id)
    .map((r) => r.reference_id as string);

  if (tipIds.length === 0) return rows;

  const { data: tips, error: tipErr } = await supabase
    .from('staff_tips')
    .select('id, note, room_number, payment_method, status, staff:staff_id(full_name)')
    .in('id', tipIds);

  if (tipErr) return rows;

  const tipMap = new Map((tips ?? []).map((t) => [t.id as string, t as AdminPaymentTipDetail]));
  return rows.map((row) => ({
    ...row,
    tip_detail: row.reference_id ? tipMap.get(row.reference_id) ?? null : null,
  }));
}

export async function fetchPaymentRequestById(id: string): Promise<PaymentRequestRow | null> {
  const { data, error } = await supabase.from('payment_requests').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as PaymentRequestRow | null) ?? null;
}

export function formatPaymentAmount(amount: number, currency: string): string {
  const c = currency.toLowerCase();
  const sym =
    c === 'try' ? '₺' : c === 'usd' ? '$' : c === 'eur' ? '€' : c === 'sar' ? 'SAR' : c.toUpperCase();
  return `${Number(amount).toFixed(2)} ${sym}`.trim();
}

export function subscribePaymentRequestStatus(
  id: string,
  onChange: (row: Pick<PaymentRequestRow, 'status' | 'paid_at' | 'pay_url'>) => void
): () => void {
  const channel = supabase
    .channel(`payment_request_${id}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'payment_requests', filter: `id=eq.${id}` },
      (payload) => {
        const row = payload.new as PaymentRequestRow;
        onChange({ status: row.status, paid_at: row.paid_at, pay_url: row.pay_url });
      }
    )
    .subscribe();

  const poll = setInterval(async () => {
    const row = await fetchPaymentRequestById(id);
    if (row) onChange({ status: row.status, paid_at: row.paid_at, pay_url: row.pay_url });
  }, 2500);

  return () => {
    clearInterval(poll);
    void supabase.removeChannel(channel);
  };
}

export function subscribeAdminPaymentRequests(onChange: () => void): () => void {
  const channel = supabase
    .channel('admin_payment_requests')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'payment_requests' }, () => onChange())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'staff_tips' }, () => onChange())
    .subscribe();

  const poll = setInterval(() => onChange(), 5000);

  return () => {
    clearInterval(poll);
    void supabase.removeChannel(channel);
  };
}
