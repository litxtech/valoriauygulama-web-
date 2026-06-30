import { getOrCreateGuestForCurrentSession } from '@/lib/getOrCreateGuestForCaller';
import { formatMenuPrice } from '@/lib/hotelKitchenMenu';
import type { HotelKitchenMenuItemWithImages } from '@/lib/hotelKitchenMenuTypes';
import { notifyAdmins } from '@/lib/notificationService';
import { supabase } from '@/lib/supabase';
import { createGuestServiceRequest } from '@/lib/guestServiceRequests';

export async function requestKitchenMenuItemOrder(item: HotelKitchenMenuItemWithImages): Promise<string> {
  const guest = await getOrCreateGuestForCurrentSession();
  if (!guest?.guest_id) throw new Error('Misafir kaydı bulunamadı');

  let guestName: string | null = null;
  let organizationId: string | null = null;
  let roomNumber: string | null = null;

  const { data: guestRow } = await supabase
    .from('guests')
    .select('full_name, organization_id, rooms(room_number)')
    .eq('id', guest.guest_id)
    .maybeSingle();

  if (guestRow) {
    const row = guestRow as {
      full_name?: string | null;
      organization_id?: string | null;
      rooms?: { room_number?: string | null } | null;
    };
    guestName = row.full_name ?? null;
    organizationId = row.organization_id ?? null;
    roomNumber = row.rooms?.room_number ? String(row.rooms.room_number) : null;
  }

  const price = formatMenuPrice(item.price);
  const description = `[Menü siparişi] ${item.name} — ${price}${item.category_title ? ` · ${item.category_title}` : ''}`;

  const id = await createGuestServiceRequest({
    guestId: guest.guest_id,
    organizationId,
    requestType: 'kitchen_order',
    description,
    roomNumber,
  });

  const who = guestName?.trim() || 'Misafir';
  const room = roomNumber?.trim() ? ` · Oda ${roomNumber}` : '';

  await notifyAdmins({
    title: 'Otel menüsü — Sipariş',
    body: `${who}${room}: ${item.name} (${price})`,
    data: {
      url: '/staff/kitchen-ops/menu-orders',
      screen: 'hotel_kitchen_menu',
      notificationType: 'hotel_kitchen_menu_order',
      feature_key: 'guest_service_request',
      itemId: item.id,
      requestId: id,
    },
  });

  return id;
}
