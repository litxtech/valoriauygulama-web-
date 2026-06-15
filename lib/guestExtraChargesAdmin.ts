import { supabase } from '@/lib/supabase';
import type { HotelExtraCatalogItem, HotelExtraCategory } from '@/lib/guestExtraCharges';

export type GuestExtraOrderAdminRow = {
  id: string;
  guest_id: string;
  room_number: string | null;
  status: string;
  total_amount: number;
  currency: string;
  paid_at: string | null;
  created_at: string;
  guest?: { full_name: string | null; email: string | null } | null;
  items?: { item_name: string; quantity: number; line_total: number }[];
};

export async function resolveAdminOrganizationId(): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: staff } = await supabase
    .from('staff')
    .select('organization_id, role')
    .eq('auth_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();
  if (!staff) return null;
  return (staff as { organization_id: string | null }).organization_id;
}

export async function listHotelExtraCatalogAdmin(orgId: string | null): Promise<HotelExtraCatalogItem[]> {
  let q = supabase
    .from('hotel_extra_catalog')
    .select('id, organization_id, name, description, price, currency, category, sort_order, is_available')
    .order('sort_order')
    .order('name');
  if (orgId) q = q.eq('organization_id', orgId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as HotelExtraCatalogItem[];
}

export async function upsertHotelExtraCatalogItem(payload: {
  id?: string;
  organization_id: string;
  name: string;
  description?: string | null;
  price: number;
  currency?: string;
  category?: HotelExtraCategory;
  sort_order?: number;
  is_available?: boolean;
}) {
  const row = {
    organization_id: payload.organization_id,
    name: payload.name.trim(),
    description: payload.description?.trim() || null,
    price: Math.round(payload.price * 100) / 100,
    currency: (payload.currency ?? 'try').toLowerCase(),
    category: payload.category ?? 'amenity',
    sort_order: payload.sort_order ?? 0,
    is_available: payload.is_available ?? true,
  };

  if (payload.id) {
    return supabase.from('hotel_extra_catalog').update(row).eq('id', payload.id).select('id').single();
  }
  return supabase.from('hotel_extra_catalog').insert(row).select('id').single();
}

export async function deleteHotelExtraCatalogItem(id: string) {
  return supabase.from('hotel_extra_catalog').delete().eq('id', id);
}

export async function toggleHotelExtraCatalogAvailability(id: string, isAvailable: boolean) {
  return supabase.from('hotel_extra_catalog').update({ is_available: isAvailable }).eq('id', id);
}

export async function listGuestExtraOrdersAdmin(limit = 80): Promise<GuestExtraOrderAdminRow[]> {
  const { data, error } = await supabase
    .from('guest_extra_orders')
    .select(
      `id, guest_id, room_number, status, total_amount, currency, paid_at, created_at,
       guest:guest_id(full_name, email),
       items:guest_extra_order_items(item_name, quantity, line_total)`
    )
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []) as GuestExtraOrderAdminRow[];
}

export const EXTRA_CATEGORY_LABELS: Record<HotelExtraCategory, string> = {
  amenity: 'Eşya & konfor',
  beverage: 'İçecek',
  minibar: 'Minibar',
  laundry: 'Çamaşırhane',
  other: 'Diğer',
};
