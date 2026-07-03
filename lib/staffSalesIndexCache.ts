export type SaleRow = {
  id: string;
  created_at: string;
  customer_full_name: string;
  customer_phone: string;
  check_in_date: string | null;
  check_out_date: string | null;
  reservation_status: string;
  net_amount: number;
  commission_amount: number;
  commission_status: string;
};

type SummaryRow = {
  sales_count: number;
  total_net_amount: number;
  total_commission_amount: number;
  pending_commission_amount: number;
  paid_commission_amount: number;
};

export type StaffSalesIndexCache = {
  summary: SummaryRow | null;
  sales: SaleRow[];
};

export const STAFF_SALES_INDEX_CACHE_KEY = 'staff-sales-index';

export function staffSalesIndexCacheKey(staffId: string | null | undefined): string {
  return staffId ? `${STAFF_SALES_INDEX_CACHE_KEY}:${staffId}` : `${STAFF_SALES_INDEX_CACHE_KEY}:none`;
}
