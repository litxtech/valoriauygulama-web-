import { supabase } from '@/lib/supabase';
import { invalidatePublicAppOriginCache } from '@/lib/appPublicUrl';
import {
  extractErrorMessage,
  isSupabaseUnavailableError,
  isTransientSupabaseDbError,
  sleepMs,
} from '@/lib/supabaseTransientErrors';
import {
  getHotelKitchenMenuCache,
  invalidateHotelKitchenMenuCache,
  setHotelKitchenMenuCache,
} from '@/lib/hotelKitchenMenuCache';
import type {
  HotelKitchenMenuItemRow,
  HotelKitchenMenuImageRow,
  HotelKitchenMenuItemWithImages,
} from '@/lib/hotelKitchenMenuTypes';

export type { HotelKitchenMenuItemRow, HotelKitchenMenuImageRow, HotelKitchenMenuItemWithImages };

export { invalidateHotelKitchenMenuCache, getHotelKitchenMenuCache } from '@/lib/hotelKitchenMenuCache';

export const HOTEL_KITCHEN_MENU_BUCKET = 'hotel-kitchen-menu';
export const MAX_HOTEL_KITCHEN_MENU_IMAGES = 5;
const UPSERT_MAX_ATTEMPTS = 5;

export function newHotelKitchenMenuItemId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function formatMenuPrice(price: number, currency = '₺'): string {
  const n = Number(price);
  if (!Number.isFinite(n)) return `0 ${currency}`;
  return `${n.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${currency}`;
}

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

function mapDetailRow(raw: Record<string, unknown>): HotelKitchenMenuItemWithImages {
  const nested = (raw.hotel_kitchen_menu_images as HotelKitchenMenuImageRow[] | undefined) ?? [];
  const imgs = nested.slice().sort((a, b) => a.sort_order - b.sort_order);
  const cover = (raw.cover_image_url as string | null) ?? imgs[0]?.image_url ?? null;
  return {
    id: raw.id as string,
    organization_id: raw.organization_id as string,
    category_title: raw.category_title as string,
    name: raw.name as string,
    description: (raw.description as string | null) ?? null,
    price: Number(raw.price),
    served_in_hotel_restaurant: !!raw.served_in_hotel_restaurant,
    is_available: !!raw.is_available,
    sort_order: Number(raw.sort_order ?? 0),
    cover_image_url: cover,
    image_count: Number(raw.image_count ?? imgs.length),
    created_at: raw.created_at as string | undefined,
    updated_at: raw.updated_at as string | undefined,
    images: imgs,
  };
}

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

const DETAIL_SELECT = `
  ${LIST_SELECT},
  hotel_kitchen_menu_images (
    id,
    item_id,
    image_url,
    sort_order
  )
`;

function cacheKey(availableOnly: boolean): string {
  return availableOnly ? 'list:available' : 'list:all';
}

export async function fetchHotelKitchenMenuItems(params: {
  availableOnly?: boolean;
  skipCache?: boolean;
}): Promise<HotelKitchenMenuItemWithImages[]> {
  const key = cacheKey(!!params.availableOnly);
  if (!params.skipCache) {
    const hit = getHotelKitchenMenuCache(key);
    if (hit) return hit;
  }

  let q = supabase
    .from('hotel_kitchen_menu_items')
    .select(LIST_SELECT)
    .order('sort_order', { ascending: false })
    .order('created_at', { ascending: false });

  if (params.availableOnly) {
    q = q.eq('is_available', true);
  }

  const { data, error } = await q;
  if (error) {
    if (isSupabaseUnavailableError(error.message)) {
      const hit = getHotelKitchenMenuCache(key);
      if (hit) return hit;
    }
    return fetchHotelKitchenMenuItemsLegacy(params);
  }
  const rows = ((data ?? []) as Record<string, unknown>[]).map((row) => mapListRow(row));
  setHotelKitchenMenuCache(key, rows);
  return rows;
}

async function fetchHotelKitchenMenuItemsLegacy(params: {
  availableOnly?: boolean;
}): Promise<HotelKitchenMenuItemWithImages[]> {
  let q = supabase
    .from('hotel_kitchen_menu_items')
    .select(DETAIL_SELECT)
    .order('sort_order', { ascending: false })
    .order('created_at', { ascending: false });

  if (params.availableOnly) {
    q = q.eq('is_available', true);
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((row) => mapDetailRow(row));
}

export async function fetchHotelKitchenMenuImageUrls(itemId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('hotel_kitchen_menu_images')
    .select('image_url')
    .eq('item_id', itemId)
    .order('sort_order', { ascending: true });
  if (error) return [];
  return (data ?? []).map((r) => (r as { image_url: string }).image_url).filter(Boolean);
}

export async function fetchGuestFavoriteItemIds(): Promise<Set<string>> {
  const { data, error } = await supabase.from('hotel_kitchen_menu_favorites').select('item_id');
  if (error) return new Set();
  return new Set((data ?? []).map((r) => (r as { item_id: string }).item_id));
}

export async function fetchHotelKitchenMenuForGuest(options?: {
  skipCache?: boolean;
  /** false = favori sorgusu atlanır (liste daha hızlı açılır) */
  withFavorites?: boolean;
}): Promise<HotelKitchenMenuItemWithImages[]> {
  const rows = await fetchHotelKitchenMenuItems({
    availableOnly: true,
    skipCache: options?.skipCache,
  });
  if (options?.withFavorites === false) return rows;
  const favIds = await fetchGuestFavoriteItemIds();
  return rows.map((r) => ({ ...r, is_favorited: favIds.has(r.id) }));
}

export async function toggleHotelKitchenMenuFavorite(itemId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('toggle_hotel_kitchen_menu_favorite', {
    p_item_id: itemId,
  });
  if (error) throw new Error(error.message);
  const row = data as { favorited?: boolean } | null;
  return row?.favorited === true;
}

export async function fetchHotelKitchenMenuItemById(
  itemId: string
): Promise<HotelKitchenMenuItemWithImages | null> {
  const { data, error } = await supabase
    .from('hotel_kitchen_menu_items')
    .select(DETAIL_SELECT)
    .eq('id', itemId)
    .maybeSingle();

  if (error || !data) {
    if (error && !error.message.includes('cover_image_url')) {
      const { data: row } = await supabase
        .from('hotel_kitchen_menu_items')
        .select(
          'id, organization_id, category_title, name, description, price, served_in_hotel_restaurant, is_available, sort_order'
        )
        .eq('id', itemId)
        .maybeSingle();
      if (!row) return null;
      const { data: imgs } = await supabase
        .from('hotel_kitchen_menu_images')
        .select('id, item_id, image_url, sort_order')
        .eq('item_id', itemId)
        .order('sort_order', { ascending: true });
      return {
        ...(row as HotelKitchenMenuItemRow),
        price: Number((row as HotelKitchenMenuItemRow).price),
        images: (imgs ?? []) as HotelKitchenMenuImageRow[],
        image_count: (imgs ?? []).length,
      };
    }
    return null;
  }
  return mapDetailRow(data as Record<string, unknown>);
}

export type UpsertHotelKitchenMenuInput = {
  id?: string;
  organizationId: string;
  categoryTitle: string;
  name: string;
  description?: string | null;
  price: number;
  servedInHotelRestaurant: boolean;
  isAvailable: boolean;
  sortOrder?: number;
  imageUrls: string[];
};

export async function upsertHotelKitchenMenuItem(input: UpsertHotelKitchenMenuInput): Promise<string> {
  const { data, error } = await supabase.rpc('upsert_hotel_kitchen_menu_item', {
    p_id: input.id ?? null,
    p_organization_id: input.organizationId,
    p_category_title: input.categoryTitle.trim(),
    p_name: input.name.trim(),
    p_description: input.description?.trim() || null,
    p_price: input.price,
    p_served_in_hotel_restaurant: input.servedInHotelRestaurant,
    p_is_available: input.isAvailable,
    p_sort_order: input.sortOrder ?? 0,
    p_image_urls: input.imageUrls.slice(0, MAX_HOTEL_KITCHEN_MENU_IMAGES),
  });
  if (error) {
    const msg = error.message ?? '';
    if (msg.includes('Could not find the function') || error.code === 'PGRST202') {
      throw new Error(
        'Veritabanı güncellemesi eksik: Supabase’de 289_hotel_kitchen_menu_write_rpc.sql migration çalıştırın.'
      );
    }
    throw new Error(msg);
  }
  if (!data || typeof data !== 'string') {
    throw new Error('Kayıt oluşturulamadı');
  }
  invalidateHotelKitchenMenuCache();
  return data;
}

async function verifyHotelKitchenMenuItemExists(itemId: string): Promise<boolean> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { data, error } = await supabase
        .from('hotel_kitchen_menu_items')
        .select('id')
        .eq('id', itemId)
        .maybeSingle();
      if (!error && data?.id) return true;
    } catch {
      /* ağ geçici */
    }
    if (attempt < 3) await sleepMs(500 + attempt * 400);
  }
  return false;
}

/** 522 / timeout sonrası sunucuda kayıt oluşmuş olabilir — doğrulama ile yanlış hata göstermeyin. */
export async function upsertHotelKitchenMenuItemWithRetry(
  input: UpsertHotelKitchenMenuInput
): Promise<string> {
  const itemId = input.id ?? newHotelKitchenMenuItemId();
  const payload: UpsertHotelKitchenMenuInput = { ...input, id: itemId };
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= UPSERT_MAX_ATTEMPTS; attempt++) {
    try {
      return await upsertHotelKitchenMenuItem(payload);
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(extractErrorMessage(e));
      if (attempt < UPSERT_MAX_ATTEMPTS && isTransientSupabaseDbError({ message: lastError.message })) {
        await sleepMs(500 + attempt * 450);
        continue;
      }
      break;
    }
  }

  if (await verifyHotelKitchenMenuItemExists(itemId)) {
    invalidateHotelKitchenMenuCache();
    return itemId;
  }

  throw lastError ?? new Error('Kayıt yapılamadı');
}

/** Kullanıcıya gösterilecek kısa kayıt hatası. */
export function hotelKitchenMenuSaveUserMessage(reason: unknown): string {
  const raw = extractErrorMessage(reason).trim();
  if (isSupabaseUnavailableError(raw)) {
    return 'Sunucu geçici yanıt vermedi (522). Menü listesini yenileyin; kayıt oluşmuş olabilir.';
  }
  if (raw.length > 140) return `${raw.slice(0, 140)}…`;
  return raw || 'Kayıt yapılamadı';
}

export async function deleteHotelKitchenMenuItem(itemId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_hotel_kitchen_menu_item', {
    p_item_id: itemId,
  });
  if (error) throw new Error(error.message);
  invalidateHotelKitchenMenuCache();
  invalidatePublicAppOriginCache();
}

export function distinctCategoryTitles(items: HotelKitchenMenuItemRow[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const it of items) {
    const k = it.category_title.trim();
    if (!k || seen.has(k.toLowerCase())) continue;
    seen.add(k.toLowerCase());
    out.push(k);
  }
  return out;
}

export function isBreakfastCategory(title: string): boolean {
  const t = title.toLowerCase();
  return t.includes('kahvalt') || t.includes('breakfast') || t.includes('فطور');
}

export function coverImageUrl(item: HotelKitchenMenuItemWithImages): string | null {
  return item.cover_image_url ?? item.images[0]?.image_url ?? null;
}

/** Liste satırından anında lightbox (ağ beklemeden kapak). */
export function resolveLightboxUrlsSync(item: HotelKitchenMenuItemWithImages): string[] {
  const fromRow = item.images.map((im) => im.image_url).filter(Boolean);
  if (fromRow.length > 0) return fromRow;
  const c = coverImageUrl(item);
  return c ? [c] : [];
}

export async function resolveLightboxUrls(item: HotelKitchenMenuItemWithImages): Promise<string[]> {
  const immediate = resolveLightboxUrlsSync(item);
  const total = item.image_count ?? immediate.length;
  if (total <= 1 || immediate.length >= total) return immediate;
  const full = await fetchHotelKitchenMenuImageUrls(item.id);
  return full.length > 0 ? full : immediate;
}
