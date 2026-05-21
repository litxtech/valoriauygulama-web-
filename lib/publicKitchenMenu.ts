import { supabase } from '@/lib/supabase';
import type { HotelKitchenMenuItemWithImages } from '@/lib/hotelKitchenMenu';

export type PublicKitchenMenuOrg = {
  id: string;
  name: string;
  slug: string;
};

const LIST_SELECT = `
  id,
  organization_id,
  category_title,
  name,
  description,
  price,
  served_in_hotel_restaurant,
  is_available,
  sort_order,
  cover_image_url,
  image_count,
  created_at,
  updated_at
`;

function mapListRow(raw: Record<string, unknown>): HotelKitchenMenuItemWithImages {
  const cover = (raw.cover_image_url as string | null) ?? null;
  const id = raw.id as string;
  return {
    id,
    organization_id: raw.organization_id as string,
    category_title: raw.category_title as string,
    name: raw.name as string,
    description: (raw.description as string | null) ?? null,
    price: Number(raw.price),
    served_in_hotel_restaurant: !!raw.served_in_hotel_restaurant,
    is_available: !!raw.is_available,
    sort_order: Number(raw.sort_order ?? 0),
    cover_image_url: cover,
    image_count: Number(raw.image_count ?? 0),
    created_at: raw.created_at as string | undefined,
    updated_at: raw.updated_at as string | undefined,
    images: cover
      ? [{ id: `${id}-cover`, item_id: id, image_url: cover, sort_order: 0 }]
      : [],
  };
}

/** Sabit dış menü URL: https://…/menu/{slug} */
export function buildPublicKitchenMenuUrl(orgSlug: string): string {
  const slug = orgSlug.trim().toLowerCase();
  const defaultBase = 'https://valoriahotel-el4r.vercel.app';
  const base = (process.env.EXPO_PUBLIC_APP_URL ?? defaultBase).replace(/\/$/, '');
  return `${base}/menu/${encodeURIComponent(slug)}`;
}

export async function fetchPublicKitchenMenuOrg(slug: string): Promise<PublicKitchenMenuOrg | null> {
  const normalized = slug.trim().toLowerCase();
  if (!normalized) return null;

  const { data, error } = await supabase
    .from('organizations')
    .select('id, name, slug')
    .eq('slug', normalized)
    .eq('public_kitchen_menu_enabled', true)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as { id: string; name: string; slug: string };
  return { id: row.id, name: row.name, slug: row.slug };
}

export async function fetchOrganizationSlugById(organizationId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('organizations')
    .select('slug')
    .eq('id', organizationId)
    .maybeSingle();
  if (error || !data) return null;
  const slug = (data as { slug?: string }).slug;
  return slug?.trim() ? slug.trim().toLowerCase() : null;
}

export async function fetchPublicKitchenMenuItems(
  organizationId: string
): Promise<HotelKitchenMenuItemWithImages[]> {
  const { data, error } = await supabase
    .from('hotel_kitchen_menu_items')
    .select(LIST_SELECT)
    .eq('organization_id', organizationId)
    .eq('is_available', true)
    .order('sort_order', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((row) => mapListRow(row));
}

export async function fetchPublicKitchenMenuImageUrls(itemId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('hotel_kitchen_menu_images')
    .select('image_url')
    .eq('item_id', itemId)
    .order('sort_order', { ascending: true });
  if (error) return [];
  return (data ?? []).map((r) => (r as { image_url: string }).image_url).filter(Boolean);
}
