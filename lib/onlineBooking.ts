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
  /** Seçilen tarihlerde müsait mi (örtüşen rezervasyon yok) */
  is_available_for_stay?: boolean;
  /** Onaylı / dönüştürülmüş rezervasyon sayısı */
  sold_count?: number;
};

export type OnlineBookingExtras = {
  breakfast?: boolean;
  parking?: boolean;
  /** @deprecated Şimdilik kapalı — eski kayıtlarda görülebilir */
  transfer?: boolean;
};

export type OnlineBookingPartyGuest = {
  full_name?: string;
  id_number?: string;
  birth_date?: string;
  phone?: string;
  university?: string;
  is_student?: boolean;
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
  guest_id_number: string | null;
  guest_birth_date: string | null;
  party_guests: OnlineBookingPartyGuest[] | null;
  extras: unknown;
  quoted_price_per_night: number | null;
  quoted_total: number | null;
  list_total?: number | null;
  discount_amount?: number;
  paid_amount?: number | null;
  is_group?: boolean;
  is_student_party?: boolean;
  student_count?: number;
  campaign_code?: string | null;
  offer_amount?: number | null;
  offer_status?: 'pending' | 'approved' | 'rejected' | null;
  offer_note?: string | null;
  offer_admin_note?: string | null;
  offer_submitted_at?: string | null;
  guest_id?: string | null;
  status: string;
  source: string;
  pdf_url: string | null;
  pdf_path: string | null;
  paid_at: string | null;
  payment_request_id: string | null;
  created_at: string;
};

export type BookingCampaign = {
  id: string;
  code: string;
  name: string;
  discount_type: 'percent' | 'fixed';
  discount_value: number;
  audience: 'all' | 'student' | 'group';
  min_nights: number;
  min_members: number;
  student_extra_percent: number;
};

export type BookingMonthlyStat = {
  year_month: string;
  bookings_count: number;
  confirmed_count: number;
  group_bookings: number;
  student_bookings: number;
  nights_sum: number;
  list_total_sum: number;
  discount_given_sum: number;
  paid_sum: number;
  quoted_sum: number;
};

const ONLINE_BOOKING_SELECT =
  'id, room_number, room_label, capacity_label, display_title, check_in_date, check_out_date, nights_count, adults, children, guest_full_name, guest_phone, guest_email, guest_note, guest_id_number, guest_birth_date, party_guests, extras, quoted_price_per_night, quoted_total, list_total, discount_amount, paid_amount, is_group, is_student_party, student_count, campaign_code, offer_amount, offer_status, offer_note, offer_admin_note, offer_submitted_at, guest_id, status, source, pdf_url, pdf_path, paid_at, payment_request_id, created_at';

function mapOnlineBookingRow(row: Record<string, unknown>): OnlineBookingRow {
  const partyRaw = row.party_guests;
  let party: OnlineBookingPartyGuest[] | null = null;
  if (Array.isArray(partyRaw)) {
    party = partyRaw.map((p) => {
      const o = (p ?? {}) as Record<string, unknown>;
      return {
        full_name: o.full_name != null ? String(o.full_name) : undefined,
        id_number: o.id_number != null ? String(o.id_number) : undefined,
        birth_date: o.birth_date != null ? String(o.birth_date) : undefined,
        phone: o.phone != null ? String(o.phone) : undefined,
        is_student: o.is_student == null ? undefined : Boolean(o.is_student),
        university: typeof o.university === 'string' ? o.university : undefined,
      };
    });
  }
  return {
    id: String(row.id),
    room_number: (row.room_number as string | null) ?? null,
    room_label: (row.room_label as string | null) ?? null,
    capacity_label: (row.capacity_label as string | null) ?? null,
    display_title: (row.display_title as string | null) ?? null,
    check_in_date: String(row.check_in_date),
    check_out_date: String(row.check_out_date),
    nights_count: Number(row.nights_count ?? 0),
    adults: Number(row.adults ?? 1),
    children: Number(row.children ?? 0),
    guest_full_name: String(row.guest_full_name ?? ''),
    guest_phone: String(row.guest_phone ?? ''),
    guest_email: (row.guest_email as string | null) ?? null,
    guest_note: (row.guest_note as string | null) ?? null,
    guest_id_number: (row.guest_id_number as string | null) ?? null,
    guest_birth_date: (row.guest_birth_date as string | null) ?? null,
    party_guests: party,
    extras: row.extras,
    quoted_price_per_night: row.quoted_price_per_night == null ? null : Number(row.quoted_price_per_night),
    quoted_total: row.quoted_total == null ? null : Number(row.quoted_total),
    list_total: row.list_total == null ? null : Number(row.list_total),
    discount_amount: row.discount_amount == null ? 0 : Number(row.discount_amount),
    paid_amount: row.paid_amount == null ? null : Number(row.paid_amount),
    is_group: Boolean(row.is_group),
    is_student_party: Boolean(row.is_student_party),
    student_count: Number(row.student_count ?? 0),
    campaign_code: (row.campaign_code as string | null) ?? null,
    offer_amount: row.offer_amount == null ? null : Number(row.offer_amount),
    offer_status: (['pending', 'approved', 'rejected'].includes(String(row.offer_status ?? ''))
      ? String(row.offer_status)
      : null) as OnlineBookingRow['offer_status'],
    offer_note: (row.offer_note as string | null) ?? null,
    offer_admin_note: (row.offer_admin_note as string | null) ?? null,
    offer_submitted_at: (row.offer_submitted_at as string | null) ?? null,
    guest_id: (row.guest_id as string | null) ?? null,
    status: String(row.status ?? 'pending'),
    source: String(row.source ?? 'web'),
    pdf_url: (row.pdf_url as string | null) ?? null,
    pdf_path: (row.pdf_path as string | null) ?? null,
    paid_at: (row.paid_at as string | null) ?? null,
    payment_request_id: (row.payment_request_id as string | null) ?? null,
    created_at: String(row.created_at ?? ''),
  };
}

export function parseOnlineBookingExtras(raw: unknown): OnlineBookingExtras {
  if (!raw || typeof raw !== 'object') return {};
  if (Array.isArray(raw)) {
    const out: OnlineBookingExtras = {};
    for (const k of raw) {
      if (k === 'breakfast') out.breakfast = true;
      if (k === 'parking') out.parking = true;
      if (k === 'transfer') out.transfer = true;
    }
    return out;
  }
  const o = raw as Record<string, unknown>;
  return {
    breakfast: !!o.breakfast,
    parking: !!o.parking,
    transfer: !!o.transfer,
  };
}

/** ISO tarih (YYYY-MM-DD) → gün.ay.yıl (30.07.2026) */
export function formatBookingDate(iso: string | null | undefined): string {
  if (!iso?.trim()) return '—';
  const m = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}.${m[2]}.${m[1]}`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
}

export function formatBookingDateRange(checkIn: string, checkOut: string): string {
  return `${formatBookingDate(checkIn)} → ${formatBookingDate(checkOut)}`;
}

/**
 * Ödeme yapılmadan “rezervasyon tamam” gibi gösterilmesin.
 * unpaid → Ödeme bekleniyor; paid+confirmed → Onaylı.
 */
export function bookingStatusLabel(
  booking: Pick<OnlineBookingRow, 'status' | 'paid_at' | 'offer_status'>
): string {
  const s = booking.status;
  if (s === 'cancelled') return 'İptal';
  if (s === 'expired') return 'Süresi doldu';
  if (s === 'converted') return 'Dönüştürüldü';
  if (booking.offer_status === 'pending') return 'Pazarlık bekliyor';
  if (booking.offer_status === 'approved' && !booking.paid_at) return 'Teklif onaylandı · ödeme bekleniyor';
  if (booking.offer_status === 'rejected' && !booking.paid_at) return 'Teklif reddedildi';
  if (!booking.paid_at) {
    if (s === 'confirmed') return 'Onaylı · ödeme yok';
    return 'Ödeme bekleniyor';
  }
  if (s === 'confirmed') return 'Onaylı · ödendi';
  if (s === 'pending') return 'Ödendi · onay bekliyor';
  return s;
}

export function bookingStatusTone(
  booking: Pick<OnlineBookingRow, 'status' | 'paid_at' | 'offer_status'>
): 'warn' | 'ok' | 'bad' | 'muted' {
  if (booking.status === 'cancelled' || booking.status === 'expired') return 'bad';
  if (booking.offer_status === 'pending') return 'warn';
  if (booking.offer_status === 'rejected' && !booking.paid_at) return 'bad';
  if (booking.offer_status === 'approved' && !booking.paid_at) return 'ok';
  if (!booking.paid_at) return 'warn';
  if (booking.status === 'confirmed') return 'ok';
  return 'muted';
}


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
  guestIdNumber: string;
  guestBirthDate: string;
  partyGuests?: OnlineBookingPartyGuest[];
  extras?: OnlineBookingExtras;
  source?: 'web' | 'app' | 'lobby';
  campaignCode?: string;
  isStudentParty?: boolean;
  isGroup?: boolean;
};

export type StayAgeVibe = {
  sample_count: number;
  avg_age: number | null;
  vibe_key: string;
  vibe_label: string;
  vibe_hint: string;
};

export type GuestBreakfastDay = {
  meal_date: string;
  title: string | null;
  items: string;
  image_url: string | null;
};

export type BookingWelcomeHost = {
  id: string;
  display_name: string;
  role_label: string | null;
  photo_url: string | null;
  vibe_tag: string | null;
  sort_order: number;
};

export type BookingHotelShowcaseItem = {
  id: string;
  media_kind: 'image' | 'video';
  media_url: string;
  thumbnail_url: string | null;
  title: string | null;
  category: string | null;
  sort_order: number;
};

export type BookingChannelEvent =
  | 'page_view'
  | 'room_view'
  | 'form_start'
  | 'form_submit'
  | 'login_auto'
  | 'pdf_ready'
  | 'hotel_showcase_open';

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
    is_available_for_stay:
      row.is_available_for_stay == null ? undefined : Boolean(row.is_available_for_stay),
    sold_count: row.sold_count == null ? 0 : Number(row.sold_count),
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

export type StayOccupancy = {
  total_rooms: number;
  reserved_rooms: number;
  available_rooms: number;
  is_full: boolean;
  fill_ratio: number;
};

export async function listBookableRooms(
  orgSlug: string = DEFAULT_PUBLIC_MENU_ORG_SLUG,
  stay?: { checkIn: string; checkOut: string }
): Promise<BookableRoom[]> {
  if (stay?.checkIn && stay?.checkOut) {
    const { data, error } = await supabase.rpc('list_bookable_rooms_for_stay', {
      p_check_in: stay.checkIn,
      p_check_out: stay.checkOut,
      p_org_slug: orgSlug.trim().toLowerCase() || DEFAULT_PUBLIC_MENU_ORG_SLUG,
    });
    if (error) throw error;
    return (data ?? []).map((row: Record<string, unknown>) => mapBookableRoom(row));
  }
  const { data, error } = await supabase.rpc('list_bookable_rooms', {
    p_org_slug: orgSlug.trim().toLowerCase() || DEFAULT_PUBLIC_MENU_ORG_SLUG,
  });
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => mapBookableRoom(row));
}

export async function fetchStayOccupancy(
  checkIn: string,
  checkOut: string,
  orgSlug: string = DEFAULT_PUBLIC_MENU_ORG_SLUG
): Promise<StayOccupancy | null> {
  const { data, error } = await supabase.rpc('get_booking_stay_occupancy', {
    p_check_in: checkIn,
    p_check_out: checkOut,
    p_org_slug: orgSlug.trim().toLowerCase() || DEFAULT_PUBLIC_MENU_ORG_SLUG,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    total_rooms: Number((row as Record<string, unknown>).total_rooms ?? 0),
    reserved_rooms: Number((row as Record<string, unknown>).reserved_rooms ?? 0),
    available_rooms: Number((row as Record<string, unknown>).available_rooms ?? 0),
    is_full: Boolean((row as Record<string, unknown>).is_full),
    fill_ratio: Number((row as Record<string, unknown>).fill_ratio ?? 0),
  };
}

export async function isRoomAvailableForStay(
  roomId: string,
  checkIn: string,
  checkOut: string
): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_room_available_for_stay', {
    p_room_id: roomId,
    p_check_in: checkIn,
    p_check_out: checkOut,
  });
  if (error) throw error;
  return Boolean(data);
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
        .filter(([key, on]) => on && key !== 'transfer')
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
    p_guest_id_number: input.guestIdNumber.trim(),
    p_guest_birth_date: input.guestBirthDate,
    p_party_guests: input.partyGuests ?? [],
    p_campaign_code: input.campaignCode?.trim() || null,
    p_is_student_party: !!input.isStudentParty,
    p_is_group: !!input.isGroup,
  });
  if (error) {
    const msg = error.message || '';
    if (/room_unavailable/i.test(msg)) {
      throw new Error(
        'Bu oda seçtiğiniz tarihlerde dolu. İleri bir tarih veya başka bir tarih aralığı seçebilirsiniz.'
      );
    }
    if (/could not find the function|schema cache|PGRST202/i.test(msg)) {
      throw new Error(
        'Rezervasyon sunucusu güncelleniyor. Lütfen biraz sonra tekrar deneyin (grup/kampanya migration).'
      );
    }
    throw error;
  }
  // Ödeme yapılmadan “rezervasyon yapıldı” bildirimi yok — bildirim ödeme sonrası.
  return String(data);
}

/** Misafir pazarlık teklifi — ödeme yok, admin onayı bekler */
export async function submitOnlineBookingOffer(input: {
  bookingId: string;
  offerAmount: number;
  offerNote?: string;
  guestFullName: string;
  guestPhone: string;
  checkIn: string;
  checkOut: string;
}): Promise<void> {
  const { error } = await supabase.rpc('submit_online_booking_offer', {
    p_booking_id: input.bookingId,
    p_offer_amount: input.offerAmount,
    p_offer_note: input.offerNote?.trim() || null,
  });
  if (error) {
    const msg = error.message || '';
    if (/offer_too_low/i.test(msg)) {
      throw new Error('Teklif çok düşük. Liste fiyatının en az %40’ını teklif edin.');
    }
    if (/offer_not_below_list/i.test(msg)) {
      throw new Error('Teklif liste fiyatının altında olmalıdır.');
    }
    if (/offer_already_pending/i.test(msg)) {
      throw new Error('Bu rezervasyon için zaten bir teklif bekliyor.');
    }
    if (/invalid_offer_amount/i.test(msg)) {
      throw new Error('Geçerli bir teklif tutarı girin.');
    }
    throw error;
  }

  void import('@/lib/notificationService')
    .then(({ notifyAdmins }) =>
      notifyAdmins({
        title: 'Yeni pazarlık teklifi',
        body: `${input.guestFullName} · ${Math.round(input.offerAmount).toLocaleString('tr-TR')} ₺ · ${input.checkIn} → ${input.checkOut}`,
        data: {
          url: `/admin/booking/${input.bookingId}`,
          bookingId: input.bookingId,
          notificationType: 'booking_offer',
          screen: 'admin',
        },
      })
    )
    .catch(() => undefined);
}

/** Admin: pazarlık onay / red + misafire bildirim */
export async function decideOnlineBookingOffer(input: {
  bookingId: string;
  approve: boolean;
  adminNote?: string;
}): Promise<void> {
  const { error } = await supabase.rpc('decide_online_booking_offer', {
    p_booking_id: input.bookingId,
    p_approve: input.approve,
    p_admin_note: input.adminNote?.trim() || null,
  });
  if (error) throw error;

  const booking = await getOnlineBookingById(input.bookingId);
  if (!booking?.guest_id) return;

  const amount =
    booking.offer_amount != null
      ? `${Math.round(booking.offer_amount).toLocaleString('tr-TR')} ₺`
      : '';
  void import('@/lib/notificationService')
    .then(({ sendNotification }) =>
      sendNotification({
        guestId: booking.guest_id!,
        title: input.approve ? 'Pazarlık teklifiniz onaylandı' : 'Pazarlık teklifiniz reddedildi',
        body: input.approve
          ? `${amount} teklifiniz kabul edildi. Uygulamadan ödemeyi tamamlayabilirsiniz.`
          : 'Maalesef teklifiniz kabul edilmedi. Liste fiyatıyla rezervasyona devam edebilirsiniz.',
        notificationType: 'booking_offer',
        category: 'guest',
        data: {
          url: '/customer/bookings',
          bookingId: input.bookingId,
          offerStatus: input.approve ? 'approved' : 'rejected',
        },
      })
    )
    .catch(() => undefined);
}

export async function fetchStayAgeVibe(
  checkIn: string,
  checkOut: string
): Promise<StayAgeVibe | null> {
  const { data, error } = await supabase.rpc('get_stay_age_vibe', {
    p_check_in: checkIn,
    p_check_out: checkOut,
    p_org_slug: DEFAULT_PUBLIC_MENU_ORG_SLUG,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    sample_count: Number((row as Record<string, unknown>).sample_count ?? 0),
    avg_age:
      (row as Record<string, unknown>).avg_age == null
        ? null
        : Number((row as Record<string, unknown>).avg_age),
    vibe_key: String((row as Record<string, unknown>).vibe_key ?? 'fresh'),
    vibe_label: String((row as Record<string, unknown>).vibe_label ?? ''),
    vibe_hint: String((row as Record<string, unknown>).vibe_hint ?? ''),
  };
}

export async function listGuestBreakfastForStay(
  checkIn: string,
  checkOut: string
): Promise<GuestBreakfastDay[]> {
  const { data, error } = await supabase.rpc('list_guest_breakfast_for_stay', {
    p_check_in: checkIn,
    p_check_out: checkOut,
    p_org_slug: DEFAULT_PUBLIC_MENU_ORG_SLUG,
  });
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    meal_date: String(r.meal_date),
    title: (r.title as string | null) ?? null,
    items: String(r.items ?? ''),
    image_url: (r.image_url as string | null) ?? null,
  }));
}

export async function listBookingWelcomeHosts(): Promise<BookingWelcomeHost[]> {
  const { data, error } = await supabase.rpc('list_booking_welcome_hosts', {
    p_org_slug: DEFAULT_PUBLIC_MENU_ORG_SLUG,
  });
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: String(r.id),
    display_name: String(r.display_name ?? ''),
    role_label: (r.role_label as string | null) ?? null,
    photo_url: (r.photo_url as string | null) ?? null,
    vibe_tag: (r.vibe_tag as string | null) ?? null,
    sort_order: Number(r.sort_order ?? 0),
  }));
}

/** Otel tanıtım galerisi — misafir "Oteli gezelim" (en fazla 100) */
export async function listBookingHotelShowcase(): Promise<BookingHotelShowcaseItem[]> {
  const { data, error } = await supabase.rpc('list_booking_hotel_showcase', {
    p_org_slug: DEFAULT_PUBLIC_MENU_ORG_SLUG,
  });
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => {
    const kind = String(r.media_kind ?? 'image') === 'video' ? 'video' : 'image';
    return {
      id: String(r.id),
      media_kind: kind as 'image' | 'video',
      media_url: String(r.media_url ?? ''),
      thumbnail_url: (r.thumbnail_url as string | null) ?? null,
      title: (r.title as string | null) ?? null,
      category: (r.category as string | null) ?? null,
      sort_order: Number(r.sort_order ?? 0),
    };
  }).filter((x) => !!x.media_url);
}

export async function listActiveBookingCampaigns(): Promise<BookingCampaign[]> {
  const { data, error } = await supabase.rpc('list_active_booking_campaigns', {
    p_org_slug: DEFAULT_PUBLIC_MENU_ORG_SLUG,
  });
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: String(r.id),
    code: String(r.code ?? ''),
    name: String(r.name ?? ''),
    discount_type: String(r.discount_type) === 'fixed' ? 'fixed' : 'percent',
    discount_value: Number(r.discount_value ?? 0),
    audience: (['all', 'student', 'group'].includes(String(r.audience))
      ? String(r.audience)
      : 'all') as BookingCampaign['audience'],
    min_nights: Number(r.min_nights ?? 1),
    min_members: Number(r.min_members ?? 1),
    student_extra_percent: Number(r.student_extra_percent ?? 0),
  }));
}

export async function getBookingMonthlyPriceStats(months = 12): Promise<BookingMonthlyStat[]> {
  const { data, error } = await supabase.rpc('get_booking_monthly_price_stats', {
    p_org_slug: DEFAULT_PUBLIC_MENU_ORG_SLUG,
    p_months: months,
  });
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    year_month: String(r.year_month),
    bookings_count: Number(r.bookings_count ?? 0),
    confirmed_count: Number(r.confirmed_count ?? 0),
    group_bookings: Number(r.group_bookings ?? 0),
    student_bookings: Number(r.student_bookings ?? 0),
    nights_sum: Number(r.nights_sum ?? 0),
    list_total_sum: Number(r.list_total_sum ?? 0),
    discount_given_sum: Number(r.discount_given_sum ?? 0),
    paid_sum: Number(r.paid_sum ?? 0),
    quoted_sum: Number(r.quoted_sum ?? 0),
  }));
}

export async function createBookableShowcaseRoom(input: {
  capacityLabel: string;
  displayTitle?: string;
  pricePerNight?: number | null;
  maxGuests?: number | null;
  description?: string;
  bedType?: string;
  viewType?: string;
  areaSqm?: number | null;
  amenities?: string[];
}): Promise<string> {
  const { data, error } = await supabase.rpc('create_bookable_showcase_room', {
    p_capacity_label: input.capacityLabel.trim(),
    p_display_title: input.displayTitle?.trim() || null,
    p_price_per_night: input.pricePerNight ?? null,
    p_max_guests: input.maxGuests ?? null,
    p_description: input.description?.trim() || null,
    p_bed_type: input.bedType?.trim() || null,
    p_view_type: input.viewType?.trim() || null,
    p_area_sqm: input.areaSqm ?? null,
    p_amenities: input.amenities ?? [],
    p_org_slug: DEFAULT_PUBLIC_MENU_ORG_SLUG,
  });
  if (error) throw error;
  return String(data);
}

/** Online rezervasyon vitrin odasını güncelle */
export async function updateBookableShowcaseRoom(
  roomId: string,
  input: {
    capacityLabel?: string;
    displayTitle?: string | null;
    pricePerNight?: number | null;
    maxGuests?: number | null;
    description?: string | null;
    bedType?: string | null;
    viewType?: string | null;
    areaSqm?: number | null;
    amenities?: string[];
    bookable?: boolean;
    videoUrl?: string | null;
  }
): Promise<void> {
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (input.capacityLabel !== undefined) patch.capacity_label = input.capacityLabel.trim() || 'Standart';
  if (input.displayTitle !== undefined) patch.display_title = input.displayTitle?.trim() || null;
  if (input.pricePerNight !== undefined) patch.price_per_night = input.pricePerNight;
  if (input.maxGuests !== undefined) patch.max_guests = input.maxGuests;
  if (input.description !== undefined) patch.description = input.description?.trim() || null;
  if (input.bedType !== undefined) patch.bed_type = input.bedType?.trim() || null;
  if (input.viewType !== undefined) patch.view_type = input.viewType?.trim() || null;
  if (input.areaSqm !== undefined) patch.area_sqm = input.areaSqm;
  if (input.amenities !== undefined) patch.amenities = input.amenities;
  if (input.bookable !== undefined) patch.bookable = input.bookable;
  if (input.videoUrl !== undefined) patch.video_url = input.videoUrl?.trim() || null;

  const { error } = await supabase.from('rooms').update(patch).eq('id', roomId);
  if (error) throw error;
}

/** Vitrin odasını sil (medya temizlenir; mümkünse kayıt da silinir) */
export async function deleteBookableShowcaseRoom(roomId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_bookable_showcase_room', {
    p_room_id: roomId,
  });
  if (error) throw error;
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
    .select(ONLINE_BOOKING_SELECT)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((row) => mapOnlineBookingRow(row as Record<string, unknown>));
}

export async function getOnlineBookingById(id: string): Promise<OnlineBookingRow | null> {
  const { data, error } = await supabase.from('online_bookings').select(ONLINE_BOOKING_SELECT).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return mapOnlineBookingRow(data as Record<string, unknown>);
}

export async function listMyOnlineBookings(limit = 40): Promise<OnlineBookingRow[]> {
  const { data, error } = await supabase
    .from('online_bookings')
    .select(ONLINE_BOOKING_SELECT)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((row) => mapOnlineBookingRow(row as Record<string, unknown>));
}

export async function ensureOnlineBookingPdf(booking: OnlineBookingRow): Promise<string | null> {
  const { generateAndUploadBookingPdf, saveBookingPdfUrls } = await import('@/lib/onlineBookingPdf');
  const pdf = await generateAndUploadBookingPdf({
    bookingId: booking.id,
    capacityLabel: booking.capacity_label || booking.room_label || 'Standart',
    displayTitle: booking.display_title,
    checkIn: booking.check_in_date,
    checkOut: booking.check_out_date,
    nights: booking.nights_count,
    adults: booking.adults,
    children: booking.children,
    guestFullName: booking.guest_full_name,
    guestPhone: booking.guest_phone,
    guestEmail: booking.guest_email,
    guestIdNumber: booking.guest_id_number,
    guestBirthDate: booking.guest_birth_date,
    guestNote: booking.guest_note,
    partyGuests: booking.party_guests ?? undefined,
    extras: parseOnlineBookingExtras(booking.extras),
    quotedTotal: booking.quoted_total,
    quotedPerNight: booking.quoted_price_per_night,
  });
  if (!pdf) return null;
  await saveBookingPdfUrls(booking.id, pdf);
  return pdf.publicUrl;
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

export type UpdateOnlineBookingFieldsInput = {
  guest_full_name?: string;
  guest_phone?: string;
  guest_email?: string | null;
  guest_note?: string | null;
  guest_id_number?: string | null;
  guest_birth_date?: string | null;
  check_in_date?: string;
  check_out_date?: string;
  adults?: number;
  children?: number;
  quoted_price_per_night?: number | null;
  quoted_total?: number | null;
  extras?: OnlineBookingExtras;
};

/** YYYY-MM-DD arası gece sayısı (çıkış − giriş). */
export function nightsBetweenBookingDates(checkIn: string, checkOut: string): number {
  const a = checkIn.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  const b = checkOut.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!a || !b) return 0;
  const t0 = Date.UTC(Number(a[1]), Number(a[2]) - 1, Number(a[3]));
  const t1 = Date.UTC(Number(b[1]), Number(b[2]) - 1, Number(b[3]));
  return Math.round((t1 - t0) / 86400000);
}

export async function updateOnlineBookingFields(
  id: string,
  patch: UpdateOnlineBookingFieldsInput
): Promise<void> {
  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (patch.guest_full_name != null) payload.guest_full_name = patch.guest_full_name.trim();
  if (patch.guest_phone != null) payload.guest_phone = patch.guest_phone.trim();
  if (patch.guest_email !== undefined) {
    const e = patch.guest_email?.trim() || null;
    payload.guest_email = e;
  }
  if (patch.guest_note !== undefined) {
    payload.guest_note = patch.guest_note?.trim() || null;
  }
  if (patch.guest_id_number !== undefined) {
    payload.guest_id_number = patch.guest_id_number?.trim() || null;
  }
  if (patch.guest_birth_date !== undefined) {
    payload.guest_birth_date = patch.guest_birth_date?.trim() || null;
  }
  if (patch.check_in_date != null) payload.check_in_date = patch.check_in_date.trim();
  if (patch.check_out_date != null) payload.check_out_date = patch.check_out_date.trim();
  if (patch.adults != null) payload.adults = Math.max(1, Math.min(12, Math.round(patch.adults)));
  if (patch.children != null) payload.children = Math.max(0, Math.min(12, Math.round(patch.children)));
  if (patch.quoted_price_per_night !== undefined) {
    payload.quoted_price_per_night = patch.quoted_price_per_night;
  }
  if (patch.quoted_total !== undefined) {
    payload.quoted_total = patch.quoted_total;
  }
  if (patch.extras !== undefined) {
    payload.extras = patch.extras;
  }

  const checkIn = (payload.check_in_date as string | undefined) ?? undefined;
  const checkOut = (payload.check_out_date as string | undefined) ?? undefined;
  if (checkIn && checkOut) {
    const nights = nightsBetweenBookingDates(checkIn, checkOut);
    if (nights < 1) throw new Error('Çıkış tarihi girişten sonra olmalı');
    payload.nights_count = nights;
  }

  const { error } = await supabase.from('online_bookings').update(payload).eq('id', id);
  if (error) throw error;
}

/** Admin → misafir WhatsApp ön metni */
export function buildAdminGuestWhatsAppText(booking: OnlineBookingRow): string {
  const ref = booking.id.slice(0, 8).toUpperCase();
  const room =
    booking.display_title && booking.capacity_label
      ? `${booking.display_title} · ${booking.capacity_label}`
      : booking.capacity_label || booking.room_label || 'Standart';
  return [
    `Merhaba ${booking.guest_full_name},`,
    '',
    `Valoria Hotel rezervasyonunuz (Ref ${ref}):`,
    `${room}`,
    `${formatBookingDateRange(booking.check_in_date, booking.check_out_date)} · ${booking.nights_count} gece`,
    '',
    'Size nasıl yardımcı olabiliriz?',
  ].join('\n');
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
