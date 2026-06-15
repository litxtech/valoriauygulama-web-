import { invokeEdgeWithAuth } from '@/lib/invokeEdgeWithAuth';
import { supabase } from '@/lib/supabase';

export type HotelExtraCategory = 'amenity' | 'beverage' | 'minibar' | 'laundry' | 'other';

export type HotelExtraCatalogItem = {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  category: HotelExtraCategory;
  sort_order: number;
  is_available: boolean;
};

export type GuestExtraOrderRow = {
  id: string;
  guest_id: string;
  room_number: string | null;
  status: string;
  total_amount: number;
  currency: string;
  paid_at: string | null;
  created_at: string;
  items?: GuestExtraOrderItemRow[];
};

export type GuestExtraOrderItemRow = {
  id: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
};

export type GuestExtraCartLine = { catalogId: string; quantity: number };

export type GuestExtraPaymentResult = {
  orderId: string;
  paymentRequestId: string;
  payUrl: string;
  amount: number;
  currency: string;
};

export async function fetchGuestExtraCatalog(): Promise<HotelExtraCatalogItem[]> {
  const { data, error } = await supabase
    .from('hotel_extra_catalog')
    .select('id, organization_id, name, description, price, currency, category, sort_order, is_available')
    .eq('is_available', true)
    .order('sort_order')
    .order('name');

  if (error) throw new Error(error.message);
  return (data ?? []) as HotelExtraCatalogItem[];
}

export function subscribeGuestExtraCatalog(onChange: () => void): () => void {
  const channel = supabase
    .channel('guest_hotel_extra_catalog')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'hotel_extra_catalog' }, () => onChange())
    .subscribe();

  const poll = setInterval(() => onChange(), 8000);

  return () => {
    clearInterval(poll);
    void supabase.removeChannel(channel);
  };
}

export async function fetchMyGuestExtraOrders(limit = 40): Promise<GuestExtraOrderRow[]> {
  const { data, error } = await supabase
    .from('guest_extra_orders')
    .select('id, guest_id, room_number, status, total_amount, currency, paid_at, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []) as GuestExtraOrderRow[];
}

export async function createGuestExtraStripePayment(
  items: GuestExtraCartLine[]
): Promise<GuestExtraPaymentResult> {
  const { data, error } = await invokeEdgeWithAuth('create-guest-extra-payment', {
    items: items.map((i) => ({ catalog_id: i.catalogId, quantity: i.quantity })),
    lang: 'tr',
  });

  if (error) {
    throw new Error(error.message || 'Ödeme başlatılamadı');
  }

  const payload = data as {
    order_id?: string;
    payment_request_id?: string;
    pay_url?: string;
    amount?: number;
    currency?: string;
    error?: string;
    error_code?: string;
  };

  if (payload?.error) throw new Error(payload.error);
  if (!payload?.order_id || !payload?.pay_url) {
    throw new Error('Ödeme oturumu alınamadı');
  }

  return {
    orderId: payload.order_id,
    paymentRequestId: payload.payment_request_id ?? '',
    payUrl: payload.pay_url,
    amount: Number(payload.amount ?? 0),
    currency: payload.currency ?? 'try',
  };
}

export function formatExtraPrice(amount: number, currency: string): string {
  const c = currency.toLowerCase();
  const sym = c === 'try' ? '₺' : c === 'usd' ? '$' : c === 'eur' ? '€' : c.toUpperCase();
  return `${Number(amount).toFixed(2)} ${sym}`;
}
