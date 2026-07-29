import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { DEFAULT_PUBLIC_MENU_ORG_SLUG } from '@/lib/publicPortalNav';

const SESSION_KEY = '@valoria/booking_channel_session';

export type BookableRoom = {
  id: string;
  /** Misafire gösterilen kapasite: 2+1, 3 kişilik… — oda numarası yok */
  capacity_label: string;
  display_title: string | null;
  max_guests: number | null;
  floor: number | null;
  view_type: string | null;
  area_sqm: number | null;
  bed_type: string | null;
  price_per_night: number | null;
  status: string;
  description: string | null;
  video_url: string | null;
  amenities: string[];
  cover_image_url: string | null;
  image_urls?: string[];
};

export type OnlineBookingExtras = {
  transfer?: boolean;
  breakfast?: boolean;
  parking?: boolean;
};

export type OnlineBookingRow = {
  id: string;
  room_number: string | null;
  room_label: string | null;
  capacity_label: string | null;
  display_title: string | null;
  check_in_date: string;
  check_out_date: string;
  nights_count: number;
  adults: number;
  children: number;
  guest_full_name: string;
  guest_phone: string;
  guest_email: string | null;
  guest_note: string | null;
  extras: unknown;
  quoted_price_per_night: number | null;
  quoted_total: number | null;
  status: string;
  source: string;
  pdf_url: string | null;
  created_at: string;
};

export type BookingTrafficRow = {
  source: string;
  event_type: string;
  event_count: number;
};

export type CreateOnlineBookingInput = {
  orgSlug?: string;
  roomId: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  guestFullName: string;
  guestPhone: string;
  guestEmail?: string;
  guestNote?: string;
  extras?: OnlineBookingExtras;
  source?: 'web' | 'app' | 'lobby';
};

export type BookingChannelEvent =
  | 'page_view'
  | 'room_view'
  | 'form_start'
  | 'form_submit'
  | 'login_auto'
  | 'pdf_ready';

function bookingSource(): 'web' | 'app' | 'lobby' {
  return Platform.OS === 'web' ? 'web' : 'app';
}

function parseAmenities(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  return [];
}

/** Misafire gösterilecek başlık — asla oda numarası değil */
export function roomPublicTitle(room: Pick<BookableRoom, 'capacity_label' | 'display_title'>): string {
  const title = room.display_title?.trim();
  const cap = room.capacity_label?.trim() || 'Standart';
  if (title && title !== cap) return `${title} · ${cap}`;
  return cap;
}

function mapBookableRoom(row: Record<string, unknown>): BookableRoom {
  return {
    id: String(row.id),
    capacity_label: String(row.capacity_label ?? 'Standart'),
    display_title: (row.display_title as string | null) ?? null,
    max_guests: row.max_guests == null ? null : Number(row.max_guests),
    floor: row.floor == null ? null : Number(row.floor),
    view_type: (row.view_type as string | null) ?? null,
    area_sqm: row.area_sqm == null ? null : Number(row.area_sqm),
    bed_type: (row.bed_type as string | null) ?? null,
    price_per_night: row.price_per_night == null ? null : Number(row.price_per_night),
    status: String(row.status ?? 'available'),
    description: (row.description as string | null) ?? null,
    video_url: (row.video_url as string | null) ?? null,
    amenities: parseAmenities(row.amenities),
    cover_image_url: (row.cover_image_url as string | null) ?? null,
    image_urls: Array.isArray(row.image_urls) ? row.image_urls.map(String) : undefined,
  };
}

export function nightsBetween(checkIn: string, checkOut: string): number {
  const a = new Date(`${checkIn}T12:00:00`);
  const b = new Date(`${checkOut}T12:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || b <= a) return 0;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function getBookingSessionKey(): Promise<string> {
  try {
    const existing = await AsyncStorage.getItem(SESSION_KEY);
    if (existing?.trim()) return existing.trim();
    const next = `bk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    await AsyncStorage.setItem(SESSION_KEY, next);
    return next;
  } catch {
    return `bk_${Date.now().toString(36)}`;
  }
}

export async function trackBookingEvent(
  eventType: BookingChannelEvent,
  opts?: {
    roomId?: string;
    bookingId?: string;
    capacityLabel?: string;
    source?: 'web' | 'app' | 'lobby';
    meta?: Record<string, unknown>;
  }
): Promise<void> {
  try {
    const sessionKey = await getBookingSessionKey();
    await supabase.rpc('track_booking_channel_event', {
      p_event_type: eventType,
      p_source: opts?.source ?? bookingSource(),
      p_session_key: sessionKey,
      p_room_id: opts?.roomId ?? null,
      p_booking_id: opts?.bookingId ?? null,
      p_capacity_label: opts?.capacityLabel ?? null,
      p_org_slug: DEFAULT_PUBLIC_MENU_ORG_SLUG,
      p_meta: opts?.meta ?? {},
    });
  } catch {
    /* trafik ölçümü UX'i bozmasın */
  }
}

export async function listBookableRooms(
  orgSlug: string = DEFAULT_PUBLIC_MENU_ORG_SLUG
): Promise<BookableRoom[]> {
  const { data, error } = await supabase.rpc('list_bookable_rooms', {
    p_org_slug: orgSlug.trim().toLowerCase() || DEFAULT_PUBLIC_MENU_ORG_SLUG,
  });
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => mapBookableRoom(row));
}

export async function getBookableRoom(roomId: string): Promise<BookableRoom | null> {
  const { data, error } = await supabase.rpc('get_bookable_room', { p_room_id: roomId });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return mapBookableRoom(row as Record<string, unknown>);
}

export async function createOnlineBooking(input: CreateOnlineBookingInput): Promise<string> {
  const extras = input.extras
    ? Object.entries(input.extras)
        .filter(([, on]) => on)
        .map(([key]) => key)
    : [];

  const { data, error } = await supabase.rpc('create_online_booking', {
    p_org_slug: (input.orgSlug ?? DEFAULT_PUBLIC_MENU_ORG_SLUG).trim().toLowerCase(),
    p_room_id: input.roomId,
    p_check_in: input.checkIn,
    p_check_out: input.checkOut,
    p_adults: input.adults,
    p_children: input.children,
    p_guest_full_name: input.guestFullName.trim(),
    p_guest_phone: input.guestPhone.trim(),
    p_guest_email: input.guestEmail?.trim() || null,
    p_guest_note: input.guestNote?.trim() || null,
    p_extras: extras,
    p_source: input.source ?? bookingSource(),
  });
  if (error) throw error;
  return String(data);
}

export async function claimOnlineBookingForCaller(
  bookingId: string,
  pdf?: { url?: string; path?: string }
): Promise<string> {
  const { data, error } = await supabase.rpc('claim_online_booking_for_caller', {
    p_booking_id: bookingId,
    p_pdf_url: pdf?.url ?? null,
    p_pdf_path: pdf?.path ?? null,
  });
  if (error) throw error;
  return String(data);
}

export async function listOnlineBookingsForAdmin(limit = 80): Promise<OnlineBookingRow[]> {
  const { data, error } = await supabase
    .from('online_bookings')
    .select(
      'id, room_number, room_label, capacity_label, display_title, check_in_date, check_out_date, nights_count, adults, children, guest_full_name, guest_phone, guest_email, guest_note, extras, quoted_price_per_night, quoted_total, status, source, pdf_url, created_at'
    )
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as OnlineBookingRow[];
}

export async function listMyOnlineBookings(limit = 40): Promise<OnlineBookingRow[]> {
  const { data, error } = await supabase
    .from('online_bookings')
    .select(
      'id, room_number, room_label, capacity_label, display_title, check_in_date, check_out_date, nights_count, adults, children, guest_full_name, guest_phone, guest_email, guest_note, extras, quoted_price_per_night, quoted_total, status, source, pdf_url, created_at'
    )
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as OnlineBookingRow[];
}

export async function updateOnlineBookingStatus(
  id: string,
  status: 'pending' | 'confirmed' | 'cancelled' | 'expired' | 'converted'
): Promise<void> {
  const { error } = await supabase
    .from('online_bookings')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function fetchBookingTrafficSummary(hours = 24): Promise<BookingTrafficRow[]> {
  const { data, error } = await supabase.rpc('booking_channel_traffic_summary', {
    p_hours: hours,
  });
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    source: String(r.source ?? ''),
    event_type: String(r.event_type ?? ''),
    event_count: Number(r.event_count ?? 0),
  }));
}

export async function listRecentBookingEvents(limit = 60): Promise<
  {
    id: string;
    event_type: string;
    source: string;
    capacity_label: string | null;
    created_at: string;
  }[]
> {
  const { data, error } = await supabase
    .from('booking_channel_events')
    .select('id, event_type, source, capacity_label, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as {
    id: string;
    event_type: string;
    source: string;
    capacity_label: string | null;
    created_at: string;
  }[];
}
