import type { HotelPulseConfigRow } from '@/lib/hotelPulseAdmin';

export type HotelPulseTemplateId = 'normal' | 'maintenance' | 'wifi_update' | 'busy_checkout';

export type HotelPulseTemplate = {
  id: HotelPulseTemplateId;
  title: string;
  description: string;
  patch: Partial<HotelPulseConfigRow>;
};

export const HOTEL_PULSE_TEMPLATES: HotelPulseTemplate[] = [
  {
    id: 'normal',
    title: 'Normal işletme',
    description: 'Sıcak su ve tesisler normal',
    patch: {
      facilities_source: 'manual',
      manual_boiler_active: true,
      manual_boiler_label: 'Sıcak su hazır',
      manual_wifi_status: 'İnternet sorunsuz',
      manual_announcement_label: null,
    },
  },
  {
    id: 'maintenance',
    title: 'Bakım / sıcak su',
    description: 'Kazan bakımı — misafire uyarı',
    patch: {
      facilities_source: 'manual',
      manual_boiler_active: false,
      manual_boiler_label: 'Sıcak su kısa süre etkilenebilir (planlı bakım)',
      manual_announcement_label: 'Isıtma ve sıcak su hattında planlı bakım yapılmaktadır. Anlayışınız için teşekkürler.',
    },
  },
  {
    id: 'wifi_update',
    title: 'Wi‑Fi güncellendi',
    description: 'Ağ bilgisi + duyuru',
    patch: {
      facilities_source: 'manual',
      manual_wifi_status: 'Wi‑Fi güncellendi — yeni şifre geçerlidir',
      manual_announcement_label: 'Wi‑Fi ağ bilgileri güncellendi. Nabız kartından veya resepsiyondan kontrol edebilirsiniz.',
    },
  },
  {
    id: 'busy_checkout',
    title: 'Yoğun check-out',
    description: 'Çıkış saati hatırlatması',
    patch: {
      facilities_source: 'manual',
      manual_announcement_label: 'Bugün yoğun check-out günü. Çıkış saati 12:00 — resepsiyonu geciktirmeden uğrayın.',
      manual_elevator_label: 'Asansörler yoğun — lütfen sabırlı olun',
    },
  },
];

export function applyHotelPulseTemplate(
  config: HotelPulseConfigRow,
  templateId: HotelPulseTemplateId
): HotelPulseConfigRow {
  const tpl = HOTEL_PULSE_TEMPLATES.find((t) => t.id === templateId);
  if (!tpl) return config;
  return { ...config, ...tpl.patch };
}
