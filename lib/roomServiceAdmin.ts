import { supabase } from '@/lib/supabase';

export type RoomServiceOrderStatus = 'pending' | 'confirmed' | 'preparing' | 'delivered' | 'cancelled';

export type RoomServiceCategory = {
  id: string;
  name: string;
  sort_order: number;
};

export type RoomServiceMenuItem = {
  id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  is_available: boolean;
  sort_order: number;
};

export type RoomServiceOrderRow = {
  id: string;
  guest_id: string;
  room_id: string | null;
  status: RoomServiceOrderStatus;
  total_amount: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  guest?: { full_name: string | null; email: string | null } | null;
  room?: { room_number: string | null } | null;
  items?: RoomServiceOrderItemRow[];
};

export type RoomServiceOrderItemRow = {
  id: string;
  order_id: string;
  menu_item_id: string;
  quantity: number;
  unit_price: number;
  notes: string | null;
  menu_item?: { name: string } | null;
};

export const ROOM_SERVICE_STATUS_LABELS: Record<RoomServiceOrderStatus, string> = {
  pending: 'Bekliyor',
  confirmed: 'Onaylandı',
  preparing: 'Hazırlanıyor',
  delivered: 'Teslim edildi',
  cancelled: 'İptal',
};

export const ROOM_SERVICE_NEXT_STATUS: Partial<Record<RoomServiceOrderStatus, RoomServiceOrderStatus>> = {
  pending: 'confirmed',
  confirmed: 'preparing',
  preparing: 'delivered',
};

export async function listRoomServiceCategories() {
  return await supabase
    .from('room_service_categories')
    .select('id, name, sort_order')
    .order('sort_order', { ascending: true });
}

export async function upsertRoomServiceCategory(payload: { id?: string; name: string; sort_order: number }) {
  if (payload.id) {
    return await supabase
      .from('room_service_categories')
      .update({ name: payload.name.trim(), sort_order: payload.sort_order })
      .eq('id', payload.id)
      .select('id, name, sort_order')
      .single();
  }
  return await supabase
    .from('room_service_categories')
    .insert({ name: payload.name.trim(), sort_order: payload.sort_order })
    .select('id, name, sort_order')
    .single();
}

export async function deleteRoomServiceCategory(id: string) {
  return await supabase.from('room_service_categories').delete().eq('id', id);
}

export async function listRoomServiceMenuItems() {
  return await supabase
    .from('room_service_menu_items')
    .select('id, category_id, name, description, price, image_url, is_available, sort_order')
    .order('sort_order', { ascending: true });
}

export async function upsertRoomServiceMenuItem(payload: {
  id?: string;
  category_id: string | null;
  name: string;
  description?: string | null;
  price: number;
  image_url?: string | null;
  is_available: boolean;
  sort_order: number;
}) {
  const row = {
    category_id: payload.category_id,
    name: payload.name.trim(),
    description: payload.description?.trim() || null,
    price: payload.price,
    image_url: payload.image_url?.trim() || null,
    is_available: payload.is_available,
    sort_order: payload.sort_order,
  };
  if (payload.id) {
    return await supabase.from('room_service_menu_items').update(row).eq('id', payload.id).select('id').single();
  }
  return await supabase.from('room_service_menu_items').insert(row).select('id').single();
}

export async function deleteRoomServiceMenuItem(id: string) {
  return await supabase.from('room_service_menu_items').delete().eq('id', id);
}

export async function toggleRoomServiceMenuItemAvailability(id: string, isAvailable: boolean) {
  return await supabase.from('room_service_menu_items').update({ is_available: isAvailable }).eq('id', id);
}

export async function listRoomServiceOrders(limit = 100) {
  return await supabase
    .from('room_service_orders')
    .select(
      'id, guest_id, room_id, status, total_amount, notes, created_at, updated_at, guest:guest_id (full_name, email), room:room_id (room_number)'
    )
    .order('created_at', { ascending: false })
    .limit(limit);
}

export async function getRoomServiceOrderItems(orderId: string) {
  return await supabase
    .from('room_service_order_items')
    .select('id, order_id, menu_item_id, quantity, unit_price, notes, menu_item:menu_item_id (name)')
    .eq('order_id', orderId);
}

export async function updateRoomServiceOrderStatus(orderId: string, status: RoomServiceOrderStatus) {
  return await supabase
    .from('room_service_orders')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', orderId)
    .select('id, status')
    .single();
}

export async function countPendingRoomServiceOrders() {
  const { count, error } = await supabase
    .from('room_service_orders')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');
  if (error) return 0;
  return count ?? 0;
}
