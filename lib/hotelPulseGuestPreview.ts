import type { HotelPulseConfigRow } from '@/lib/hotelPulseAdmin';
import type { GuestPulseFacilities } from '@/lib/guestHotelPulseLoad';

/** Kaydedilmemiş config → misafir tesis önizlemesi */
export function facilitiesFromPulseConfig(config: HotelPulseConfigRow): GuestPulseFacilities {
  return {
    boilerLabel: (config.manual_boiler_label ?? 'Sıcak su hazır').trim() || 'Sıcak su hazır',
    boilerActive: config.manual_boiler_active !== false,
    breakfastHours: config.manual_breakfast_hours ?? '',
    spaLabel: config.manual_spa_label ?? '',
    wifiStatus: config.manual_wifi_status ?? '',
    wifiNetwork: (config.manual_wifi_network ?? 'Valoria').trim() || 'Valoria',
    wifiPassword: (config.manual_wifi_password ?? 'valoria!').trim() || 'valoria!',
    parkingLabel: config.manual_parking_label ?? '',
    elevatorLabel: config.manual_elevator_label ?? '',
    restaurantLabel: config.manual_restaurant_label ?? '',
    announcementLabel: config.manual_announcement_label ?? '',
    weatherLabel: config.manual_weather_label ?? '',
  };
}
