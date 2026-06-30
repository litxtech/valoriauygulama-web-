import { supabase } from '@/lib/supabase';
import type { KitchenMenuOrderRecord } from '@/lib/publicKitchenMenuOrderHistory';

const ORDER_SELECT = `
  id,
  org_slug,
  status,
  total_amount,
  currency,
  customer_name,
  customer_email,
  room_number,
  table_number,
  guest_hotel_name,
  delivery_address,
  paid_at,
  created_at,
  kitchen_menu_order_items (
    item_name,
    quantity,
    unit_price,
    line_total
  )
`;

function mapRow(raw: Record<string, unknown>): KitchenMenuOrderRecord {
  const itemsRaw = raw.items ?? raw.kitchen_menu_order_items;
  const items = (itemsRaw as KitchenMenuOrderRecord['items'] | undefined) ?? [];
  return {
    id: raw.id as string,
    org_slug: (raw.org_slug as string | undefined) ?? undefined,
    status: (raw.status as string) ?? 'unknown',
    total_amount: Number(raw.total_amount),
    currency: (raw.currency as string) ?? 'try',
    customer_name: (raw.customer_name as string) ?? '',
    customer_email: (raw.customer_email as string | null) ?? null,
    room_number: (raw.room_number as string | null) ?? null,
    table_number: (raw.table_number as string | null) ?? null,
    guest_hotel_name: (raw.guest_hotel_name as string | null) ?? null,
    delivery_address: (raw.delivery_address as string | null) ?? null,
    paid_at: (raw.paid_at as string | null) ?? null,
    created_at: (raw.created_at as string) ?? new Date().toISOString(),
    items: items.map((line) => ({
      item_name: line.item_name,
      quantity: Number(line.quantity),
      unit_price: Number(line.unit_price),
      line_total: Number(line.line_total),
    })),
  };
}

export type StaffKitchenMenuOrdersBundle = {
  pending: KitchenMenuOrderRecord[];
  paid: KitchenMenuOrderRecord[];
};

function parseBundle(raw: unknown): StaffKitchenMenuOrdersBundle {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { pending: [], paid: [] };
  }
  const o = raw as { pending?: unknown; paid?: unknown };
  const pending = Array.isArray(o.pending)
    ? o.pending.map((row) => mapRow(row as Record<string, unknown>))
    : [];
  const paid = Array.isArray(o.paid) ? o.paid.map((row) => mapRow(row as Record<string, unknown>)) : [];
  return { pending, paid };
}

async function fetchStaffKitchenMenuOrdersDirect(
  organizationId: string,
  opts?: { paidLimit?: number; pendingHours?: number }
): Promise<StaffKitchenMenuOrdersBundle> {
  const paidLimit = opts?.paidLimit ?? 40;
  const pendingHours = opts?.pendingHours ?? 24;
  const pendingSince = new Date(Date.now() - pendingHours * 60 * 60 * 1000).toISOString();

  const [pendingRes, paidRes] = await Promise.all([
    supabase
      .from('kitchen_menu_orders')
      .select(ORDER_SELECT)
      .eq('organization_id', organizationId)
      .eq('status', 'pending_payment')
      .gte('created_at', pendingSince)
      .order('created_at', { ascending: false })
      .limit(30),
    supabase
      .from('kitchen_menu_orders')
      .select(ORDER_SELECT)
      .eq('organization_id', organizationId)
      .eq('status', 'paid')
      .order('created_at', { ascending: false })
      .limit(paidLimit),
  ]);

  if (pendingRes.error) throw new Error(pendingRes.error.message);
  if (paidRes.error) throw new Error(paidRes.error.message);

  return {
    pending: ((pendingRes.data ?? []) as Record<string, unknown>[]).map(mapRow),
    paid: ((paidRes.data ?? []) as Record<string, unknown>[]).map(mapRow),
  };
}

/** Mutfak paneli — ödeme bekleyen (sepet/checkout) ve ödenen dijital menü siparişleri. */
export async function fetchStaffKitchenMenuOrders(
  organizationId: string,
  opts?: { paidLimit?: number; pendingHours?: number }
): Promise<StaffKitchenMenuOrdersBundle> {
  const { data, error } = await supabase.rpc('get_staff_kitchen_menu_orders', {
    p_organization_id: organizationId,
    p_paid_limit: opts?.paidLimit ?? 40,
    p_pending_hours: opts?.pendingHours ?? 24,
  });

  if (!error && data) {
    return parseBundle(data);
  }

  try {
    return await fetchStaffKitchenMenuOrdersDirect(organizationId, opts);
  } catch (directErr) {
    const rpcMsg = error?.message ?? '';
    const directMsg = (directErr as Error)?.message ?? '';
    throw new Error(rpcMsg || directMsg || 'Siparişler yüklenemedi');
  }
}

export function kitchenMenuOrderLocation(order: KitchenMenuOrderRecord): string | null {
  const parts = [
    order.guest_hotel_name?.trim(),
    order.room_number?.trim() ? `Oda ${order.room_number.trim()}` : null,
    order.table_number?.trim() ? `Masa ${order.table_number.trim()}` : null,
    order.delivery_address?.trim(),
  ].filter(Boolean) as string[];
  return parts.length ? parts.join(' · ') : null;
}
