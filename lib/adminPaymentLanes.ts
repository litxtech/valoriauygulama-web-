import type { PaymentServiceKind } from '@/lib/paymentsI18n';
import type { AdminPaymentRequestRow } from '@/lib/payments';

/** Admin ödemeler ekranı — üç ana şerit */
export type AdminPaymentLane = 'tips' | 'kitchen' | 'hotel';

export const ADMIN_PAYMENT_LANES: AdminPaymentLane[] = ['tips', 'kitchen', 'hotel'];

export type AdminPaymentLaneMeta = {
  id: AdminPaymentLane;
  title: string;
  subtitle: string;
  icon: 'gift-outline' | 'restaurant-outline' | 'business-outline';
  accent: string;
  bg: string;
};

export const ADMIN_PAYMENT_LANE_META: Record<AdminPaymentLane, AdminPaymentLaneMeta> = {
  tips: {
    id: 'tips',
    title: 'Bahşişler',
    subtitle: 'Misafir → personel Stripe bahşişleri',
    icon: 'gift-outline',
    accent: '#b8860b',
    bg: '#fef9e7',
  },
  kitchen: {
    id: 'kitchen',
    title: 'Mutfak & yemek',
    subtitle: 'Yemek, restoran, mutfak QR ödemeleri',
    icon: 'restaurant-outline',
    accent: '#ea580c',
    bg: '#fff7ed',
  },
  hotel: {
    id: 'hotel',
    title: 'Otel ödemeleri',
    subtitle: 'Oda servisi, hizmet, transfer ve genel',
    icon: 'business-outline',
    accent: '#635bff',
    bg: '#eef2ff',
  },
};

export function adminPaymentLaneForKind(kind: PaymentServiceKind): AdminPaymentLane {
  if (kind === 'staff_tip') return 'tips';
  if (kind === 'food' || kind === 'dining') return 'kitchen';
  return 'hotel';
}

export function adminPaymentLaneForRow(row: Pick<AdminPaymentRequestRow, 'service_kind'>): AdminPaymentLane {
  return adminPaymentLaneForKind(row.service_kind);
}

export type AdminPaymentLaneSummary = {
  lane: AdminPaymentLane;
  totalPaid: number;
  paidCount: number;
  pendingCount: number;
  currency: string;
};

export function summarizeAdminPaymentsByLane(
  rows: AdminPaymentRequestRow[]
): Record<AdminPaymentLane, AdminPaymentLaneSummary> {
  const base = (): AdminPaymentLaneSummary => ({
    lane: 'hotel',
    totalPaid: 0,
    paidCount: 0,
    pendingCount: 0,
    currency: 'try',
  });

  const out: Record<AdminPaymentLane, AdminPaymentLaneSummary> = {
    tips: { ...base(), lane: 'tips' },
    kitchen: { ...base(), lane: 'kitchen' },
    hotel: { ...base(), lane: 'hotel' },
  };

  for (const row of rows) {
    const lane = adminPaymentLaneForRow(row);
    const s = out[lane];
    s.currency = row.currency || s.currency;
    if (row.status === 'paid') {
      s.paidCount += 1;
      s.totalPaid += Number(row.amount) || 0;
    } else if (row.status === 'pending') {
      s.pendingCount += 1;
    }
  }

  return out;
}

export function adminPaymentNotifyLaneLabel(lane: AdminPaymentLane): string {
  return ADMIN_PAYMENT_LANE_META[lane].title;
}
