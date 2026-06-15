import { supabase } from '@/lib/supabase';
import { fetchHotelKitchenMenuForGuest, type HotelKitchenMenuItemWithImages } from '@/lib/hotelKitchenMenu';
import { venueRowFromDb, type DiningVenueRow } from '@/lib/diningVenues';

export type GuestHotelRestaurantVenue = {
  id: string;
  name: string;
  coverImage: string | null;
  openingHours: string | null;
  isOpenNow: boolean;
  description: string | null;
  reservationInfo: string | null;
  menuPeek: string[];
};

export type GuestHotelRestaurantData = {
  venues: GuestHotelRestaurantVenue[];
  menuItems: HotelKitchenMenuItemWithImages[];
};

function mapVenue(row: DiningVenueRow): GuestHotelRestaurantVenue {
  const menuPeek = (row.menu_items ?? [])
    .map((m) => m.name?.trim())
    .filter(Boolean)
    .slice(0, 4);
  return {
    id: row.id,
    name: row.name,
    coverImage: row.cover_image || row.images?.[0] || null,
    openingHours: row.opening_hours,
    isOpenNow: row.is_open_now,
    description: row.description,
    reservationInfo: row.reservation_info,
    menuPeek,
  };
}

export async function loadGuestHotelRestaurant(_orgId: string | null): Promise<GuestHotelRestaurantData> {
  const [venueRes, menuItems] = await Promise.all([
    supabase
      .from('dining_venues')
      .select('*')
      .eq('is_active', true)
      .eq('location_scope', 'on_premises')
      .order('sort_order', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(4),
    fetchHotelKitchenMenuForGuest({ withFavorites: false, skipCache: false }),
  ]);

  const venues = (venueRes.data ?? [])
    .map((r) => venueRowFromDb(r as Record<string, unknown>))
    .map(mapVenue);

  const restaurantMenu = menuItems
    .filter((item) => item.is_available && item.served_in_hotel_restaurant)
    .slice(0, 10);

  return { venues, menuItems: restaurantMenu };
}
