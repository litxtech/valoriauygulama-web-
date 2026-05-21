import { HotelKitchenMenuBrowse } from '@/components/hotelKitchenMenu/HotelKitchenMenuBrowse';

export default function CustomerHotelMenuScreen() {
  return (
    <HotelKitchenMenuBrowse
      mode="guest"
      detailHref={(id) => `/customer/hotel-menu/${id}`}
    />
  );
}
