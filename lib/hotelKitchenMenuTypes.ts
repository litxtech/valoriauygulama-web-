/** Tipler ayrı dosyada — döngüsel import (before initialization) önlenir */

export type HotelKitchenMenuItemRow = {
  id: string;
  organization_id: string;
  category_title: string;
  name: string;
  description: string | null;
  price: number;
  served_in_hotel_restaurant: boolean;
  is_available: boolean;
  sort_order: number;
  cover_image_url?: string | null;
  image_count?: number;
  created_at?: string;
  updated_at?: string;
};

export type HotelKitchenMenuImageRow = {
  id: string;
  item_id: string;
  image_url: string;
  sort_order: number;
};

export type HotelKitchenMenuItemWithImages = HotelKitchenMenuItemRow & {
  images: HotelKitchenMenuImageRow[];
  is_favorited?: boolean;
};
