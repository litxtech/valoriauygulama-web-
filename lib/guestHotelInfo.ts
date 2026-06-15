import { supabase } from '@/lib/supabase';
import {
  parseGuestPulseFacilities,
  parseGuestPulseManager,
  parseGuestPulseReception,
  type GuestPulseFacilities,
  type GuestPulseManager,
  type GuestPulseReception,
} from '@/lib/guestHotelPulseLoad';

export type GuestHotelInfo = {
  brandName: string;
  manager: GuestPulseManager;
  reception: GuestPulseReception;
  facilities: GuestPulseFacilities;
};

export async function loadGuestHotelInfo(organizationId: string | null): Promise<GuestHotelInfo> {
  const [extrasRes, pulseRes] = await Promise.all([
    supabase.rpc('get_hotel_pulse_guest_extras', { p_organization_id: organizationId }),
    supabase.rpc('get_guest_hotel_pulse', { p_organization_id: organizationId }),
  ]);

  const extras = (extrasRes.data ?? {}) as Record<string, unknown>;
  const pulse = (pulseRes.data ?? {}) as Record<string, unknown>;

  return {
    brandName:
      typeof pulse.brandName === 'string' && pulse.brandName.trim() ? pulse.brandName.trim() : 'Valoria',
    manager: parseGuestPulseManager(extras.manager),
    reception: parseGuestPulseReception(extras.reception),
    facilities: parseGuestPulseFacilities(extras.facilities),
  };
}
