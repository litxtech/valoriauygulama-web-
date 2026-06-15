import { supabase } from '@/lib/supabase';
import type { AdminPaymentRequestRow } from '@/lib/payments';
import { fetchAdminPaymentRequests } from '@/lib/payments';
import { guestRoomNumber } from '@/lib/adminGuestAccountSummary';
import { paymentText, type PaymentServiceKind } from '@/lib/paymentsI18n';

const SERVICE_KIND_LABEL_KEY: Record<PaymentServiceKind, Parameters<typeof paymentText>[0]> = {
  food: 'kind_food',
  amenity: 'kind_amenity',
  room_service: 'kind_room_service',
  transfer: 'kind_transfer',
  dining: 'kind_dining',
  generic: 'kind_generic',
  other: 'kind_other',
  staff_tip: 'kind_staff_tip',
};

export type IncomeGuestOption = {
  id: string;
  full_name: string;
  room_number?: string | null;
  status?: string | null;
};

export function paymentServiceKindToLedgerCategory(kind: PaymentServiceKind | string): string {
  switch (kind) {
    case 'staff_tip':
      return 'bahsis';
    case 'food':
      return 'mutfak_yemek';
    case 'dining':
      return 'mutfak_restoran';
    case 'room_service':
      return 'oda_servisi';
    case 'amenity':
      return 'otel_hizmet';
    case 'transfer':
      return 'transfer_tur';
    case 'generic':
      return 'otel_genel';
    case 'other':
      return 'diger';
    default:
      return 'stripe_odeme';
  }
}

export function stripePaymentIncomeLabel(row: AdminPaymentRequestRow): string {
  const guest =
    row.guest_detail?.full_name?.trim() ||
    (typeof row.metadata?.guest_name === 'string' ? row.metadata.guest_name : '') ||
    '';
  const room = guestRoomNumber(row.guest_detail) || row.tip_detail?.room_number || '';
  const kind = paymentText(SERVICE_KIND_LABEL_KEY[row.service_kind] ?? 'kind_generic');
  const parts = [row.title?.trim() || 'Stripe', kind];
  if (guest) parts.push(guest);
  if (room) parts.push(`Oda ${room}`);
  return parts.filter(Boolean).join(' · ');
}

export async function fetchLinkedPaymentRequestIds(limit = 500): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('finance_movements')
    .select('source_payment_request_id')
    .not('source_payment_request_id', 'is', null)
    .limit(limit);
  if (error) return new Set();
  return new Set(
    (data ?? [])
      .map((r) => (r as { source_payment_request_id: string | null }).source_payment_request_id)
      .filter((id): id is string => Boolean(id))
  );
}

export async function fetchStripePaymentsForIncomeLink(
  organizationId: string,
  limit = 80
): Promise<AdminPaymentRequestRow[]> {
  const [rows, linked] = await Promise.all([
    fetchAdminPaymentRequests(limit),
    fetchLinkedPaymentRequestIds(),
  ]);
  return rows.filter(
    (r) =>
      r.organization_id === organizationId &&
      r.status === 'paid' &&
      !linked.has(r.id)
  );
}

export async function loadIncomeGuestOptions(): Promise<IncomeGuestOption[]> {
  const { data, error } = await supabase.rpc('admin_list_guests', { p_filter: 'all' });
  if (error) throw new Error(error.message);
  const list = (data ?? []) as {
    id: string;
    full_name: string | null;
    status?: string | null;
    rooms?: { room_number: string } | null;
    room_id?: string | null;
  }[];
  return list
    .map((g) => ({
      id: g.id,
      full_name: (g.full_name ?? '').trim() || 'Misafir',
      room_number: g.rooms?.room_number ?? null,
      status: g.status ?? null,
    }))
    .sort((a, b) => a.full_name.localeCompare(b.full_name, 'tr'));
}

export type StripeIncomePrefill = {
  amount: string;
  movementDate: string;
  paymentMethod: 'card';
  category: string;
  description: string;
  guestId: string | null;
  incomePayerMode: 'guest' | 'counterparty' | 'free';
  counterpartyFree: string;
  sourcePaymentRequestId: string;
  stripeLabel: string;
};

export function buildStripeIncomePrefill(row: AdminPaymentRequestRow): StripeIncomePrefill {
  const guestName =
    row.guest_detail?.full_name?.trim() ||
    (typeof row.metadata?.guest_name === 'string' ? row.metadata.guest_name.trim() : '') ||
    '';
  const paidDate = row.paid_at ? row.paid_at.slice(0, 10) : new Date().toISOString().slice(0, 10);
  const hasGuest = Boolean(row.guest_id && guestName);

  return {
    amount: String(Number(row.amount)),
    movementDate: paidDate,
    paymentMethod: 'card',
    category: paymentServiceKindToLedgerCategory(row.service_kind),
    description: [row.title?.trim(), row.description?.trim()].filter(Boolean).join(' — ') || 'Stripe POS ödemesi',
    guestId: row.guest_id,
    incomePayerMode: hasGuest ? 'guest' : guestName ? 'free' : 'free',
    counterpartyFree: hasGuest ? '' : guestName,
    sourcePaymentRequestId: row.id,
    stripeLabel: stripePaymentIncomeLabel(row),
  };
}
