import { supabase } from '@/lib/supabase';
import type { GuestHotelPulseData, GuestPulseActivityKind, GuestPulseFlowRow } from '@/lib/guestHotelPulseLoad';
import {
  clearGuestHotelPulseCache,
  loadGuestHotelPulse,
  parseGuestPulseFacilities,
  parseGuestPulseManager,
  parseGuestPulseReception,
} from '@/lib/guestHotelPulseLoad';

export type HotelPulseSource = 'live' | 'manual';
export type HotelPulseActivitiesSource = 'live' | 'manual' | 'both';
export type HotelPulseReceptionSource = 'live' | 'manual' | 'both';

export type HotelPulseConfigRow = {
  organization_id: string;
  is_enabled: boolean;
  brand_name: string;
  daily_source: HotelPulseSource;
  lifetime_source: HotelPulseSource;
  ops_source: HotelPulseSource;
  flow_source: HotelPulseSource;
  reception_source: HotelPulseReceptionSource;
  manager_source: HotelPulseReceptionSource;
  facilities_source: HotelPulseSource;
  activities_source: HotelPulseActivitiesSource;
  manual_guests_in_house: number | null;
  manual_occupied_rooms: number | null;
  manual_vacant_rooms: number | null;
  manual_total_rooms: number | null;
  manual_check_ins_today: number | null;
  manual_check_outs_today: number | null;
  manual_total_guests_hosted: number | null;
  manual_completed_stays: number | null;
  manual_contract_approvals: number | null;
  manual_staff_online: number | null;
  manual_occupancy_percent: number | null;
  manual_rooms_ready: number | null;
  manual_breakfast_served: number | null;
  manual_active_contracts: number | null;
  manual_flow_check_in_rooms: string | null;
  manual_flow_check_out_rooms: string | null;
  manual_flow_upcoming_rooms: string | null;
  manual_flow_late_checkout_rooms: string | null;
  manual_reception_staff_name: string | null;
  manual_reception_staff_id: string | null;
  manual_reception_shift_label: string | null;
  manual_reception_note: string | null;
  manual_manager_staff_id: string | null;
  manual_manager_title: string | null;
  manual_manager_note: string | null;
  manual_boiler_label: string | null;
  manual_boiler_active: boolean | null;
  manual_breakfast_hours: string | null;
  manual_spa_label: string | null;
  manual_wifi_status: string | null;
  manual_wifi_network: string | null;
  manual_wifi_password: string | null;
  manual_parking_label: string | null;
  manual_elevator_label: string | null;
  manual_restaurant_label: string | null;
  manual_announcement_label: string | null;
  manual_weather_label: string | null;
  updated_at?: string;
};

export type HotelPulseManualActivity = {
  id: string;
  organization_id: string;
  kind: GuestPulseActivityKind | 'info';
  label: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
};

export const DEFAULT_HOTEL_PULSE_CONFIG = (orgId: string): HotelPulseConfigRow => ({
  organization_id: orgId,
  is_enabled: true,
  brand_name: 'Valoria',
  daily_source: 'live',
  lifetime_source: 'live',
  ops_source: 'live',
  flow_source: 'live',
  reception_source: 'live',
  manager_source: 'manual',
  facilities_source: 'manual',
  activities_source: 'live',
  manual_guests_in_house: null,
  manual_occupied_rooms: null,
  manual_vacant_rooms: null,
  manual_total_rooms: null,
  manual_check_ins_today: null,
  manual_check_outs_today: null,
  manual_total_guests_hosted: null,
  manual_completed_stays: null,
  manual_contract_approvals: null,
  manual_staff_online: null,
  manual_occupancy_percent: null,
  manual_rooms_ready: null,
  manual_breakfast_served: null,
  manual_active_contracts: null,
  manual_flow_check_in_rooms: null,
  manual_flow_check_out_rooms: null,
  manual_flow_upcoming_rooms: null,
  manual_flow_late_checkout_rooms: null,
  manual_reception_staff_name: null,
  manual_reception_staff_id: null,
  manual_reception_shift_label: null,
  manual_reception_note: null,
  manual_manager_staff_id: null,
  manual_manager_title: null,
  manual_manager_note: null,
  manual_boiler_label: null,
  manual_boiler_active: true,
  manual_breakfast_hours: null,
  manual_spa_label: null,
  manual_wifi_status: null,
  manual_wifi_network: 'Valoria',
  manual_wifi_password: 'valoria!',
  manual_parking_label: null,
  manual_elevator_label: null,
  manual_restaurant_label: null,
  manual_announcement_label: null,
  manual_weather_label: null,
});

export function flowRowsToCsv(rows: GuestPulseFlowRow[]): string {
  return rows
    .map((r) => r.room_number?.trim())
    .filter((r): r is string => !!r)
    .join(', ');
}

export async function fetchHotelPulseConfig(orgId: string): Promise<HotelPulseConfigRow> {
  const { data } = await supabase.from('hotel_pulse_config').select('*').eq('organization_id', orgId).maybeSingle();
  if (!data) return DEFAULT_HOTEL_PULSE_CONFIG(orgId);
  return data as HotelPulseConfigRow;
}

export async function saveHotelPulseConfig(
  config: HotelPulseConfigRow,
  staffId: string | null
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('hotel_pulse_config').upsert({
    ...config,
    updated_at: new Date().toISOString(),
    updated_by_staff_id: staffId,
  });
  return { error: error?.message ?? null };
}

export async function fetchHotelPulseManualActivities(orgId: string): Promise<HotelPulseManualActivity[]> {
  const { data } = await supabase
    .from('hotel_pulse_manual_activities')
    .select('*')
    .eq('organization_id', orgId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });
  return (data ?? []) as HotelPulseManualActivity[];
}

export async function addHotelPulseManualActivity(
  orgId: string,
  label: string,
  kind: HotelPulseManualActivity['kind'] = 'info'
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('hotel_pulse_manual_activities').insert({
    organization_id: orgId,
    label: label.trim(),
    kind,
    is_active: true,
    sort_order: 0,
  });
  return { error: error?.message ?? null };
}

export async function deleteHotelPulseManualActivity(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('hotel_pulse_manual_activities').delete().eq('id', id);
  return { error: error?.message ?? null };
}

export async function previewHotelPulseLive(orgId: string): Promise<GuestHotelPulseData | null> {
  const { data, error } = await supabase.rpc('preview_hotel_pulse_live', { p_organization_id: orgId });
  if (!error && data) return parsePreview(data);
  return loadGuestHotelPulse(orgId, { force: true });
}

function parsePreview(raw: unknown): GuestHotelPulseData | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  const stats = (p.stats as Record<string, number>) ?? {};
  const ops = (p.ops as Record<string, number>) ?? {};
  const lifetime = (p.lifetime as Record<string, number>) ?? {};
  return {
    stats: {
      guestsInHouse: Number(stats.guestsInHouse) || 0,
      staffActive: Number(stats.staffActive) || 0,
      totalOnSite: Number(stats.totalOnSite) || Number(stats.guestsInHouse) + Number(stats.staffActive) || 0,
      occupiedRooms: Number(stats.occupiedRooms) || 0,
      vacantRooms: Number(stats.vacantRooms) || 0,
      totalRooms: Number(stats.totalRooms) || 0,
      checkInsToday: Number(stats.checkInsToday) || 0,
      checkOutsToday: Number(stats.checkOutsToday) || 0,
    },
    ops: {
      staffOnline: Number(ops.staffOnline) || 0,
      occupancyPercent: Number(ops.occupancyPercent) || 0,
      roomsReady: Number(ops.roomsReady) || 0,
      breakfastServed: Number(ops.breakfastServed) || 0,
      activeContracts: Number(ops.activeContracts) || 0,
    },
    lifetime: {
      totalGuestsHosted: Number(lifetime.totalGuestsHosted) || 0,
      completedStays: Number(lifetime.completedStays) || 0,
      contractApprovals: Number(lifetime.contractApprovals) || 0,
    },
    todayCheckIns: [],
    todayCheckOuts: [],
    upcomingCheckOuts: [],
    lateCheckoutRooms: [],
    activities: [],
    reception: parseGuestPulseReception(p.reception),
    facilities: parseGuestPulseFacilities(p.facilities),
    manager: parseGuestPulseManager(p.manager),
    enabled: p.enabled !== false,
    brandName: typeof p.brandName === 'string' ? p.brandName : 'Valoria',
  };
}

export function invalidateGuestHotelPulseCache(): void {
  clearGuestHotelPulseCache();
}
