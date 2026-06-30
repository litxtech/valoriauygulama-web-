import { Platform } from 'react-native';

export type KitchenMenuOrderLine = {
  item_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
};

export type KitchenMenuOrderRecord = {
  id: string;
  org_slug?: string;
  status: 'pending_payment' | 'paid' | 'cancelled' | 'expired' | string;
  total_amount: number;
  currency: string;
  customer_name: string;
  customer_email?: string | null;
  room_number?: string | null;
  table_number?: string | null;
  guest_hotel_name?: string | null;
  delivery_address?: string | null;
  paid_at?: string | null;
  created_at: string;
  items: KitchenMenuOrderLine[];
};

const STORAGE_PREFIX = 'vk-menu-orders:';
const MAX_IDS = 40;

function storageKey(orgSlug: string): string {
  return `${STORAGE_PREFIX}${orgSlug.trim().toLowerCase()}`;
}

function readIds(orgSlug: string): string[] {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(storageKey(orgSlug));
      if (!raw) return [];
      const parsed = JSON.parse(raw) as string[];
      return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [];
    } catch {
      return [];
    }
  }
  return [];
}

function writeIds(orgSlug: string, ids: string[]): void {
  if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(storageKey(orgSlug), JSON.stringify(ids.slice(0, MAX_IDS)));
  } catch {
    /* quota */
  }
}

export function rememberPublicKitchenMenuOrder(orgSlug: string, orderId: string): void {
  const id = orderId.trim();
  if (!id) return;
  const prev = readIds(orgSlug).filter((x) => x !== id);
  writeIds(orgSlug, [id, ...prev].slice(0, MAX_IDS));
}

export function getRememberedPublicKitchenMenuOrderIds(orgSlug: string): string[] {
  return readIds(orgSlug);
}

function parseOrders(raw: unknown): KitchenMenuOrderRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((row) => row && typeof row === 'object' && typeof (row as KitchenMenuOrderRecord).id === 'string') as KitchenMenuOrderRecord[];
}

export async function fetchPublicKitchenMenuOrdersByIds(
  orgSlug: string,
  orderIds: string[]
): Promise<KitchenMenuOrderRecord[]> {
  const ids = orderIds.filter(Boolean);
  if (!ids.length) return [];
  const { supabase } = await import('@/lib/supabase');
  const { data, error } = await supabase.rpc('get_public_kitchen_menu_orders', {
    p_org_slug: orgSlug,
    p_order_ids: ids,
  });
  if (error) throw new Error(error.message);
  return parseOrders(data);
}

export async function fetchPublicKitchenMenuOrderByPayment(
  orgSlug: string,
  paymentRequestId: string,
  publicToken: string
): Promise<KitchenMenuOrderRecord | null> {
  const { supabase } = await import('@/lib/supabase');
  const { data, error } = await supabase.rpc('get_public_kitchen_menu_order_by_payment', {
    p_org_slug: orgSlug,
    p_payment_request_id: paymentRequestId,
    p_public_token: publicToken,
  });
  if (error) throw new Error(error.message);
  if (!data || typeof data !== 'object') return null;
  return data as KitchenMenuOrderRecord;
}

export async function fetchGuestKitchenMenuOrders(limit = 40): Promise<KitchenMenuOrderRecord[]> {
  const { supabase } = await import('@/lib/supabase');
  const { data, error } = await supabase.rpc('get_guest_kitchen_menu_orders', { p_limit: limit });
  if (error) throw new Error(error.message);
  return parseOrders(data);
}

export async function loadWebPublicKitchenMenuOrderHistory(orgSlug: string): Promise<KitchenMenuOrderRecord[]> {
  const ids = getRememberedPublicKitchenMenuOrderIds(orgSlug);
  if (!ids.length) return [];
  try {
    return await fetchPublicKitchenMenuOrdersByIds(orgSlug, ids);
  } catch {
    return [];
  }
}

export function orderStatusLabelKey(status: string): string {
  switch (status) {
    case 'paid':
      return 'publicKitchenMenuOrderStatusPaid';
    case 'pending_payment':
      return 'publicKitchenMenuOrderStatusPending';
    case 'cancelled':
      return 'publicKitchenMenuOrderStatusCancelled';
    default:
      return 'publicKitchenMenuOrderStatusOther';
  }
}
