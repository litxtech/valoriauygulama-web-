import { supabase } from '@/lib/supabase';
import type { HotelKitchenMenuItemWithImages } from '@/lib/hotelKitchenMenuTypes';
import {
  getPublicMenuCache,
  invalidatePublicMenuCache,
  setPublicMenuCache,
  type PublicMenuBundle,
} from '@/lib/publicKitchenMenuCache';

export { invalidatePublicMenuCache };

export type { HotelKitchenMenuItemWithImages };
export type { PublicMenuBundle };

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

export { buildPublicKitchenMenuUrl, buildPublicMenuUrl } from '@/lib/appPublicUrl';

export async function fetchPublicKitchenMenuOrg(slug: string): Promise<PublicKitchenMenuOrg | null> {
  const normalized = slug.trim().toLowerCase();
  if (!normalized) return null;

  let { data, error } = await supabase
    .from('organizations')
    .select('id, name, slug, public_kitchen_menu_enabled')
    .eq('slug', normalized)
    .maybeSingle();

  if (error?.message?.includes('public_kitchen_menu_enabled')) {
    const fallback = await supabase
      .from('organizations')
      .select('id, name, slug')
      .eq('slug', normalized)
      .maybeSingle();
    data = fallback.data;
    error = fallback.error;
  }

  if (error || !data) return null;
  const row = data as {
    id: string;
    name: string;
    slug: string;
    public_kitchen_menu_enabled?: boolean;
  };
  if (row.public_kitchen_menu_enabled === false) return null;
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

/** Tek istek: slug → otel + menü (dış site hızı) */
export async function fetchPublicKitchenMenuBySlug(
  slug: string,
  opts?: { skipCache?: boolean }
): Promise<PublicMenuBundle | null> {
  const normalized = slug.trim().toLowerCase();
  if (!normalized) return null;

  if (!opts?.skipCache) {
    const cached = getPublicMenuCache(normalized);
    if (cached) return cached;
  }

  const { data, error } = await supabase
    .from('hotel_kitchen_menu_items')
    .select(
      `
      ${LIST_SELECT},
      organizations!inner (
        id,
        name,
        slug
      )
    `
    )
    .eq('organizations.slug', normalized)
    .eq('is_available', true)
    .order('sort_order', { ascending: false })
    .order('created_at', { ascending: false });

  if (!error && data?.length) {
    const first = data[0] as Record<string, unknown>;
    const orgRaw = first.organizations as { id: string; name: string; slug: string } | { id: string; name: string; slug: string }[];
    const orgRow = Array.isArray(orgRaw) ? orgRaw[0] : orgRaw;
    if (!orgRow?.id) return fetchPublicKitchenMenuBySlugLegacy(normalized);
    const items = (data as Record<string, unknown>[]).map((row) => mapListRow(row));
    const bundle: PublicMenuBundle = {
      org: { id: orgRow.id, name: orgRow.name, slug: orgRow.slug },
      items,
    };
    setPublicMenuCache(normalized, bundle);
    return bundle;
  }

  return fetchPublicKitchenMenuBySlugLegacy(normalized);
}

async function fetchPublicKitchenMenuBySlugLegacy(slug: string): Promise<PublicMenuBundle | null> {
  const org = await fetchPublicKitchenMenuOrg(slug);
  if (!org) return null;
  const items = await fetchPublicKitchenMenuItems(org.id);
  const bundle: PublicMenuBundle = { org, items };
  setPublicMenuCache(slug, bundle);
  return bundle;
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

  if (error) {
    if (error.message.includes('cover_image_url')) {
      const legacy = await supabase
        .from('hotel_kitchen_menu_items')
        .select(
          'id, organization_id, category_title, name, description, price, served_in_hotel_restaurant, is_available, sort_order, created_at, updated_at'
        )
        .eq('organization_id', organizationId)
        .eq('is_available', true)
        .order('sort_order', { ascending: false })
        .order('created_at', { ascending: false });
      if (legacy.error) throw new Error(legacy.error.message);
      return ((legacy.data ?? []) as Record<string, unknown>[]).map((row) => mapListRow(row));
    }
    throw new Error(error.message);
  }
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
