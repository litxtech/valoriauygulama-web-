import type { PaymentQrStandRow } from '@/lib/paymentQrStands';
import type { PaymentRequestRow } from '@/lib/payments';

export type StaffPaymentsIndexCache = {
  allRows: PaymentRequestRow[];
  activeRows: PaymentRequestRow[];
  stands: PaymentQrStandRow[];
  loadError: string | null;
};

export const STAFF_PAYMENTS_INDEX_CACHE_KEY = 'staff-payments-index';

export function staffPaymentsIndexCacheKey(orgId: string | null | undefined): string {
  return orgId ? `${STAFF_PAYMENTS_INDEX_CACHE_KEY}:${orgId}` : `${STAFF_PAYMENTS_INDEX_CACHE_KEY}:none`;
}
