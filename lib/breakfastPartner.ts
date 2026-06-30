/**
 * Kahvaltı partner oteli modülü — ayrı B2B portal.
 */
import { getEdgeFunctionErrorMessage, parseEdgeFunctionErrorBody } from '@/lib/functionsError';
import { invokeEdgeWithAuth } from '@/lib/invokeEdgeWithAuth';
import { supabase, supabaseMessaging } from '@/lib/supabase';
import { fmtMoneyTry } from '@/lib/finance';
import { isSupabaseUnavailableError, sanitizeSupabaseErrorMessage, sleepMs } from '@/lib/supabaseTransientErrors';
import type { StaffPermissionSlice } from '@/lib/staffPermissions';

/** Partner portal RPC — resilient fetch 522 yanlış alarmını önler. */
const partnerPortalDb = supabaseMessaging;

export type BreakfastPartnerHotelStatus = 'pending' | 'active' | 'suspended';

export type BreakfastPartnerHotel = {
  id: string;
  organization_id: string;
  counterparty_id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  address: string | null;
  tax_id: string | null;
  tax_office: string | null;
  iban: string | null;
  logo_url: string | null;
  unit_price: number | null;
  status: BreakfastPartnerHotelStatus;
  self_registered: boolean;
  notes: string | null;
  created_at: string;
};

const PARTNER_HOTEL_SELECT =
  'id, organization_id, counterparty_id, name, contact_name, phone, email, city, address, tax_id, tax_office, iban, logo_url, unit_price, status, self_registered, notes, created_at';

function mapPartnerHotelRow(row: Record<string, unknown>): BreakfastPartnerHotel {
  return {
    ...(row as BreakfastPartnerHotel),
    city: (row.city as string | null) ?? null,
    tax_office: (row.tax_office as string | null) ?? null,
    iban: (row.iban as string | null) ?? null,
    logo_url: (row.logo_url as string | null) ?? null,
    self_registered: row.self_registered === true,
    unit_price: row.unit_price != null ? Number(row.unit_price) : null,
  };
}

export function partnerHotelInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

export function normalizePartnerIban(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase();
}

export type BreakfastPartnerDailyEntry = {
  id: string;
  partner_hotel_id: string;
  organization_id: string;
  record_date: string;
  guest_count: number;
  unit_price_snapshot: number;
  line_total: number;
  note: string | null;
  agreement_id: string | null;
  created_at: string;
  updated_at: string;
};

export type PartnerDailyEntryLedgerRow = BreakfastPartnerDailyEntry & {
  amount_remaining: number;
  agreement_status: string | null;
};

export function partnerEntryIsPayable(row: Pick<PartnerDailyEntryLedgerRow, 'guest_count' | 'amount_remaining'>): boolean {
  return row.guest_count > 0 && row.amount_remaining > 0.009;
}

export function partnerEntryPayLabel(row: Pick<PartnerDailyEntryLedgerRow, 'guest_count' | 'amount_remaining'>): string {
  if (row.guest_count <= 0) return 'Kahvaltı yok';
  if (partnerEntryIsPayable(row)) return fmtPartnerMoney(row.amount_remaining);
  return 'Ödendi';
}

export type BreakfastPartnerSettings = {
  organization_id: string;
  default_unit_price: number;
  feature_enabled: boolean;
  remind_enabled: boolean;
  remind_time: string;
  payment_notify_staff_ids: string[];
};

export type PartnerBreakfastBoardHotel = {
  hotelId: string;
  hotelName: string;
  city: string | null;
  guestCount: number;
  lineTotal: number;
  note: string | null;
  enteredAt: string | null;
  hasEntry: boolean;
  entryStatus: 'missing' | 'entered' | 'zero';
};

export type PartnerBreakfastBoard = {
  recordDate: string;
  organizationId: string;
  hotels: PartnerBreakfastBoardHotel[];
  summary: {
    totalHotels: number;
    enteredCount: number;
    missingCount: number;
    zeroCount: number;
    totalGuests: number;
    totalAmount: number;
  };
};

export type BreakfastPartnerProfile = {
  userId: string;
  partnerUserId: string;
  fullName: string;
  email: string;
  hotel: BreakfastPartnerHotel;
  effectiveUnitPrice: number;
  isPortalActive: boolean;
};

export const PARTNER_STATUS_LABELS: Record<BreakfastPartnerHotelStatus, string> = {
  pending: 'Onay bekliyor',
  active: 'Aktif',
  suspended: 'Askıda',
};

export function todayIstanbulDate(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });
}

const ISTANBUL_TZ = 'Europe/Istanbul';

export function addDaysIstanbul(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const utc = Date.UTC(y, m - 1, d + days, 12, 0, 0);
  return new Date(utc).toLocaleDateString('en-CA', { timeZone: ISTANBUL_TZ });
}

export function tomorrowIstanbulDate(): string {
  return addDaysIstanbul(todayIstanbulDate(), 1);
}

export function istanbulMinutesNow(now = new Date()): number {
  const parts = now.toLocaleString('en-GB', {
    timeZone: ISTANBUL_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).split(':');
  return Number(parts[0]) * 60 + Number(parts[1]);
}

export type PartnerEntryTarget = 'today' | 'tomorrow';

export function partnerEntryDateForTarget(target: PartnerEntryTarget): string {
  return target === 'tomorrow' ? tomorrowIstanbulDate() : todayIstanbulDate();
}

/** Ana sayfa varsayılanı: sabah bugün, öğleden sonra yarın. */
export function partnerDefaultEntryTarget(now = new Date()): PartnerEntryTarget {
  return istanbulMinutesNow(now) < 14 * 60 ? 'today' : 'tomorrow';
}

/** Mutfak panosu: sabah bugün, öğleden sonra yarın hazırlığı. */
export function resolvePartnerKitchenBoardDate(now = new Date()): string {
  return istanbulMinutesNow(now) < 14 * 60 ? todayIstanbulDate() : tomorrowIstanbulDate();
}

export function canPartnerEditEntryDate(recordDate: string, now = new Date()): boolean {
  const today = todayIstanbulDate();
  const tomorrow = tomorrowIstanbulDate();
  const minDate = addDaysIstanbul(today, -30);
  if (recordDate < minDate || recordDate > tomorrow) return false;
  if (recordDate > today && istanbulMinutesNow(now) >= 23 * 60 + 59) return false;
  return true;
}

export function partnerEntryDeadlineHint(target: PartnerEntryTarget): string {
  if (target === 'tomorrow') {
    return 'Yarının kahvaltısı için bugün 23:59\'a kadar bildirin.';
  }
  return 'Kahvaltı günü sabahına kadar güncelleyebilirsiniz.';
}

export function partnerEntryTargetLabel(target: PartnerEntryTarget, recordDate: string): string {
  const rel = target === 'tomorrow' ? 'Yarın' : 'Bugün';
  return `${rel} · ${formatPartnerDateTurkish(recordDate, { weekday: true })}`;
}

function isoToPartnerDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 9, 0, 0));
}

function capitalizeTr(text: string): string {
  if (!text) return text;
  return text.charAt(0).toLocaleUpperCase('tr-TR') + text.slice(1);
}

/** Kısa: 21.06.2025 */
export function formatPartnerDate(iso: string): string {
  return isoToPartnerDate(iso).toLocaleDateString('tr-TR', {
    timeZone: ISTANBUL_TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** Orta: 21 Haziran 2025 */
export function formatPartnerDateMedium(iso: string): string {
  const raw = isoToPartnerDate(iso).toLocaleDateString('tr-TR', {
    timeZone: ISTANBUL_TZ,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return capitalizeTr(raw);
}

/** Uzun: 21 Haziran 2025, Cumartesi */
export function formatPartnerDateTurkish(
  iso: string,
  opts?: { weekday?: boolean; style?: 'numeric' | 'medium' | 'long' }
): string {
  if (opts?.style === 'numeric') return formatPartnerDate(iso);
  if (opts?.style === 'medium') return formatPartnerDateMedium(iso);

  const raw = isoToPartnerDate(iso).toLocaleDateString('tr-TR', {
    timeZone: ISTANBUL_TZ,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...(opts?.weekday ? { weekday: 'long' as const } : {}),
  });
  return capitalizeTr(raw);
}

/** Cumartesi */
export function formatPartnerWeekday(iso: string): string {
  const raw = isoToPartnerDate(iso).toLocaleDateString('tr-TR', {
    timeZone: ISTANBUL_TZ,
    weekday: 'long',
  });
  return capitalizeTr(raw);
}

/** 21 Haziran */
export function formatPartnerDayMonth(iso: string): string {
  const raw = isoToPartnerDate(iso).toLocaleDateString('tr-TR', {
    timeZone: ISTANBUL_TZ,
    day: 'numeric',
    month: 'long',
  });
  return capitalizeTr(raw);
}

/** Canlı saat: 21 Haziran 2025, 20:45 */
export function formatPartnerClockIstanbul(now = new Date()): string {
  const raw = now.toLocaleString('tr-TR', {
    timeZone: ISTANBUL_TZ,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  return capitalizeTr(raw);
}

export function partnerRelativeDayLabel(iso: string, now = new Date()): 'Bugün' | 'Yarın' | null {
  const today = todayIstanbulDate();
  const tomorrow = tomorrowIstanbulDate();
  if (iso === today) return 'Bugün';
  if (iso === tomorrow) return 'Yarın';
  return null;
}

export function fmtPartnerMoney(amount: number): string {
  return fmtMoneyTry(amount);
}

export async function fetchPartnerProfile(authId: string): Promise<BreakfastPartnerProfile | null> {
  const { data: userRow, error: userErr } = await supabase
    .from('breakfast_partner_users')
    .select('id, full_name, email, is_active, partner_hotel_id')
    .eq('auth_id', authId)
    .eq('is_active', true)
    .maybeSingle();

  if (userErr || !userRow) return null;

  const { data: hotel, error: hotelErr } = await supabase
    .from('breakfast_partner_hotels')
    .select(PARTNER_HOTEL_SELECT)
    .eq('id', userRow.partner_hotel_id)
    .maybeSingle();

  if (hotelErr || !hotel) return null;

  const effectiveUnitPrice =
    hotel.status === 'active' ? await resolveEffectiveUnitPrice(hotel as BreakfastPartnerHotel) : 0;

  return {
    userId: authId,
    partnerUserId: userRow.id,
    fullName: userRow.full_name,
    email: userRow.email,
    hotel: mapPartnerHotelRow(hotel as Record<string, unknown>),
    effectiveUnitPrice,
    isPortalActive: hotel.status === 'active',
  };
}

export async function resolveEffectiveUnitPrice(hotel: Pick<BreakfastPartnerHotel, 'organization_id' | 'unit_price'>): Promise<number> {
  if (hotel.unit_price != null && hotel.unit_price > 0) return hotel.unit_price;

  const { data } = await supabase
    .from('breakfast_partner_settings')
    .select('default_unit_price')
    .eq('organization_id', hotel.organization_id)
    .maybeSingle();

  return Number(data?.default_unit_price) || 0;
}

export async function listPartnerHotels(organizationId: string): Promise<BreakfastPartnerHotel[]> {
  const { data, error } = await supabase
    .from('breakfast_partner_hotels')
    .select(PARTNER_HOTEL_SELECT)
    .eq('organization_id', organizationId)
    .order('name');

  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapPartnerHotelRow(r as Record<string, unknown>));
}

export async function fetchPartnerHotel(id: string): Promise<BreakfastPartnerHotel | null> {
  const { data, error } = await supabase
    .from('breakfast_partner_hotels')
    .select(PARTNER_HOTEL_SELECT)
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  return mapPartnerHotelRow(data as Record<string, unknown>);
}

export async function updatePartnerHotel(
  id: string,
  patch: Partial<
    Pick<
      BreakfastPartnerHotel,
      | 'name'
      | 'contact_name'
      | 'phone'
      | 'city'
      | 'address'
      | 'tax_id'
      | 'tax_office'
      | 'iban'
      | 'logo_url'
      | 'unit_price'
      | 'status'
      | 'notes'
    >
  >
): Promise<string | null> {
  const { error } = await supabase.from('breakfast_partner_hotels').update(patch).eq('id', id);
  return error?.message ?? null;
}

/** Otel bazlı kişi başı kahvaltı fiyatı — null = varsayılan fiyat kullanılır. */
export async function updatePartnerHotelUnitPrice(
  hotelId: string,
  unitPrice: number | null
): Promise<string | null> {
  const normalized = unitPrice != null && unitPrice > 0 ? unitPrice : null;
  const { error } = await supabase
    .from('breakfast_partner_hotels')
    .update({ unit_price: normalized })
    .eq('id', hotelId);
  return error?.message ?? null;
}

export function resolvePartnerEffectiveUnitPriceSync(
  hotel: Pick<BreakfastPartnerHotel, 'unit_price'>,
  defaultUnitPrice: number
): number {
  if (hotel.unit_price != null && hotel.unit_price > 0) return hotel.unit_price;
  return defaultUnitPrice > 0 ? defaultUnitPrice : 0;
}

export async function fetchPartnerSettings(organizationId: string): Promise<BreakfastPartnerSettings | null> {
  const { data, error } = await supabase
    .from('breakfast_partner_settings')
    .select('organization_id, default_unit_price, feature_enabled, remind_enabled, remind_time, payment_notify_staff_ids')
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    organization_id: data.organization_id,
    default_unit_price: Number(data.default_unit_price) || 0,
    feature_enabled: data.feature_enabled !== false,
    remind_enabled: data.remind_enabled !== false,
    remind_time: String(data.remind_time ?? '09:30').slice(0, 5),
    payment_notify_staff_ids: ((data.payment_notify_staff_ids as string[] | null) ?? []).filter(Boolean),
  };
}

export async function upsertPartnerSettings(
  organizationId: string,
  defaultUnitPrice: number,
  featureEnabled: boolean,
  staffId: string | null,
  opts?: { remindEnabled?: boolean; remindTime?: string; paymentNotifyStaffIds?: string[] }
): Promise<string | null> {
  const remindTime = opts?.remindTime?.trim() || '09:30';
  const payload: Record<string, unknown> = {
    organization_id: organizationId,
    default_unit_price: defaultUnitPrice,
    feature_enabled: featureEnabled,
    remind_enabled: opts?.remindEnabled !== false,
    remind_time: `${remindTime}:00`,
    updated_by_staff_id: staffId,
    updated_at: new Date().toISOString(),
  };
  if (opts?.paymentNotifyStaffIds != null) {
    payload.payment_notify_staff_ids = [...new Set(opts.paymentNotifyStaffIds.filter(Boolean))];
  }
  const { error } = await supabase.from('breakfast_partner_settings').upsert(payload, { onConflict: 'organization_id' });
  return error?.message ?? null;
}

const KITCHEN_BOARD_DEPARTMENTS = new Set([
  'kitchen',
  'kitchen_staff',
  'mutfak',
  'chef',
  'head_chef',
  'pastry',
  'restaurant',
]);

export function canViewPartnerBreakfastBoard(staff: StaffPermissionSlice): boolean {
  if (!staff) return false;
  if (staff.role === 'admin') return true;
  const dept = ((staff as { department?: string | null }).department ?? '').toLowerCase();
  if (KITCHEN_BOARD_DEPARTMENTS.has(dept)) return true;
  const perms = staff.app_permissions ?? {};
  return perms.mutfak_operasyon === true || perms.yemek_listesi_mutfak_onay === true;
}

export async function fetchPartnerBreakfastBoard(recordDate?: string): Promise<PartnerBreakfastBoard | null> {
  const { data, error } = await supabase.rpc('breakfast_partner_today_board', {
    p_record_date: recordDate ?? null,
  });
  if (error) throw new Error(error.message);
  if (!data || typeof data !== 'object') return null;
  const raw = data as Record<string, unknown>;
  const hotels = Array.isArray(raw.hotels) ? raw.hotels : [];
  const summary = (raw.summary ?? {}) as Record<string, unknown>;
  return {
    recordDate: String(raw.recordDate ?? todayIstanbulDate()),
    organizationId: String(raw.organizationId ?? ''),
    hotels: hotels.map((h) => {
      const row = h as Record<string, unknown>;
      const status = String(row.entryStatus ?? 'missing');
      return {
        hotelId: String(row.hotelId ?? ''),
        hotelName: String(row.hotelName ?? ''),
        city: (row.city as string | null) ?? null,
        guestCount: Number(row.guestCount) || 0,
        lineTotal: Number(row.lineTotal) || 0,
        note: (row.note as string | null) ?? null,
        enteredAt: (row.enteredAt as string | null) ?? null,
        hasEntry: row.hasEntry === true,
        entryStatus:
          status === 'entered' || status === 'zero' || status === 'missing' ? status : 'missing',
      };
    }),
    summary: {
      totalHotels: Number(summary.totalHotels) || 0,
      enteredCount: Number(summary.enteredCount) || 0,
      missingCount: Number(summary.missingCount) || 0,
      zeroCount: Number(summary.zeroCount) || 0,
      totalGuests: Number(summary.totalGuests) || 0,
      totalAmount: Number(summary.totalAmount) || 0,
    },
  };
}

export async function listPartnerDailyEntries(
  partnerHotelId: string,
  opts?: { limit?: number; fromDate?: string }
): Promise<BreakfastPartnerDailyEntry[]> {
  let q = supabase
    .from('breakfast_partner_daily_entries')
    .select(
      'id, partner_hotel_id, organization_id, record_date, guest_count, unit_price_snapshot, line_total, note, agreement_id, created_at, updated_at'
    )
    .eq('partner_hotel_id', partnerHotelId)
    .order('record_date', { ascending: false });

  if (opts?.fromDate) q = q.gte('record_date', opts.fromDate);
  if (opts?.limit) q = q.limit(opts.limit);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapEntryRow);
}

export async function listPartnerDailyEntriesLedger(
  limit = 31,
  partnerHotelId?: string
): Promise<PartnerDailyEntryLedgerRow[]> {
  const { data, error } = await supabase.rpc('breakfast_partner_daily_entries_ledger', { p_limit: limit });
  if (!error) {
    const rows = Array.isArray(data) ? data : [];
    return rows.map((row) => mapLedgerRow(row as Record<string, unknown>));
  }

  // RPC henüz deploy edilmediyse veya geçici hata — düz kayıt listesine düş
  let hotelId = partnerHotelId;
  if (!hotelId) {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;
    if (!userId) return [];
    const profile = await fetchPartnerProfile(userId);
    hotelId = profile?.hotel.id;
  }
  if (!hotelId) return [];

  const entries = await listPartnerDailyEntries(hotelId, { limit });
  return entries.map((entry) => ({
    ...entry,
    amount_remaining: entry.guest_count > 0 && entry.agreement_id ? entry.line_total : 0,
    agreement_status: entry.guest_count > 0 && entry.agreement_id ? 'open' : null,
  }));
}

function mapLedgerRow(r: Record<string, unknown>): PartnerDailyEntryLedgerRow {
  return {
    ...mapEntryRow(r),
    amount_remaining: Number(r.amount_remaining) || 0,
    agreement_status: (r.agreement_status as string | null) ?? null,
  };
}

export async function listOrgPartnerDailyEntries(
  organizationId: string,
  opts?: { limit?: number; partnerHotelId?: string }
): Promise<(BreakfastPartnerDailyEntry & { hotel_name?: string })[]> {
  let q = supabase
    .from('breakfast_partner_daily_entries')
    .select(
      'id, partner_hotel_id, organization_id, record_date, guest_count, unit_price_snapshot, line_total, note, agreement_id, created_at, updated_at, breakfast_partner_hotels(name)'
    )
    .eq('organization_id', organizationId)
    .order('record_date', { ascending: false });

  if (opts?.partnerHotelId) q = q.eq('partner_hotel_id', opts.partnerHotelId);
  if (opts?.limit) q = q.limit(opts.limit);

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const hotelJoin = row.breakfast_partner_hotels as { name?: string } | { name?: string }[] | null;
    const hotelName = Array.isArray(hotelJoin) ? hotelJoin[0]?.name : hotelJoin?.name;
    const { breakfast_partner_hotels: _, ...rest } = row;
    return { ...mapEntryRow(rest), hotel_name: hotelName };
  });
}

function mapEntryRow(row: Record<string, unknown>): BreakfastPartnerDailyEntry {
  return {
    id: String(row.id),
    partner_hotel_id: String(row.partner_hotel_id),
    organization_id: String(row.organization_id),
    record_date: String(row.record_date),
    guest_count: Number(row.guest_count) || 0,
    unit_price_snapshot: Number(row.unit_price_snapshot) || 0,
    line_total: Number(row.line_total) || 0,
    note: (row.note as string | null) ?? null,
    agreement_id: (row.agreement_id as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function isTransientPartnerRpcError(error: { message?: string; status?: number; code?: string }): boolean {
  if (isSupabaseUnavailableError(error.message)) return true;
  if (error.code === 'SUPABASE_UNAVAILABLE' || error.code === 'PGRST002') return true;
  const status = error.status;
  return status != null && [502, 503, 504, 522, 523, 524].includes(status);
}

async function verifyPartnerDailyEntrySaved(
  recordDate: string,
  guestCount: number
): Promise<string | null> {
  const { data, error } = await supabase
    .from('breakfast_partner_daily_entries')
    .select('id, guest_count')
    .eq('record_date', recordDate)
    .maybeSingle();

  if (error || !data) return null;
  if (Number(data.guest_count) !== guestCount) return null;
  return String(data.id);
}

async function verifyPartnerDailyEntrySavedWithRetry(
  recordDate: string,
  guestCount: number
): Promise<string | null> {
  for (const delayMs of [0, 900, 2200]) {
    if (delayMs > 0) await sleepMs(delayMs);
    const id = await verifyPartnerDailyEntrySaved(recordDate, guestCount);
    if (id) return id;
  }
  return null;
}

export async function upsertPartnerDailyEntry(
  recordDate: string,
  guestCount: number,
  note?: string | null
): Promise<{ id: string } | { error: string }> {
  const { data: sessionData, error: sessionError } = await supabase.auth.refreshSession();
  if (sessionError || !sessionData.session?.user) {
    return { error: 'Oturum süresi doldu. Partner otel girişinden tekrar oturum açın.' };
  }

  const profile = await fetchPartnerProfile(sessionData.session.user.id);
  if (!profile?.isPortalActive) {
    return {
      error:
        'Partner otel hesabı bulunamadı veya aktif değil. Misafir girişi yerine ana sayfadaki Partner otel girişini kullanın.',
    };
  }

  const { data, error } = await supabase.rpc('breakfast_partner_upsert_daily_entry', {
    p_record_date: recordDate,
    p_guest_count: guestCount,
    p_note: note?.trim() || null,
  });

  if (!error) return { id: String(data) };

  if (isTransientPartnerRpcError(error)) {
    const verifiedId = await verifyPartnerDailyEntrySavedWithRetry(recordDate, guestCount);
    if (verifiedId) return { id: verifiedId };
  }

  return { error: sanitizeSupabaseErrorMessage(error.message) };
}

export type PartnerStripePaymentResult = {
  paymentRequestId: string;
  payUrl: string;
  amount: number;
  currency: string;
};

/** Partner cari — Stripe Checkout oturumu (açık bakiye, belirtilen tutar veya tek kahvaltı kaydı). */
export async function createPartnerStripePayment(params?: {
  amount?: number;
  agreementId?: string;
}): Promise<PartnerStripePaymentResult> {
  const body: Record<string, unknown> = {};
  if (params?.amount != null && params.amount > 0) body.amount = params.amount;
  if (params?.agreementId) body.agreement_id = params.agreementId;

  const { data, error } = await invokeEdgeWithAuth('create-breakfast-partner-payment', body);

  const payload = (data ?? null) as {
    payment_request_id?: string;
    pay_url?: string;
    amount?: number;
    currency?: string;
    error?: string;
    error_code?: string;
  } | null;

  if (error) {
    const parsed = await parseEdgeFunctionErrorBody(error);
    const msg =
      parsed?.message ??
      (typeof payload?.error === 'string' ? payload.error : null) ??
      (await getEdgeFunctionErrorMessage(error));
    throw new Error(msg || 'Ödeme başlatılamadı');
  }

  if (payload?.error) throw new Error(payload.error);
  if (!payload?.pay_url) throw new Error('Ödeme oturumu alınamadı');

  return {
    paymentRequestId: payload.payment_request_id ?? '',
    payUrl: payload.pay_url,
    amount: Number(payload.amount ?? 0),
    currency: payload.currency ?? 'try',
  };
}

/** Partner portal — cari bakiye (RLS bypass RPC). Geçici 522'de yeniden dener, hata fırlatmaz. */
export async function fetchPartnerPortalOpenBalance(): Promise<number> {
  for (const delayMs of [0, 700, 1800]) {
    if (delayMs > 0) await sleepMs(delayMs);
    const { data, error } = await partnerPortalDb.rpc('breakfast_partner_open_balance');
    if (!error) return Number(data) || 0;
    if (!isTransientPartnerRpcError(error)) break;
  }
  return 0;
}

function mapPartnerPaymentRows(raw: unknown): PartnerPaymentRow[] {
  const rows = Array.isArray(raw) ? raw : [];
  return rows.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: String(r.id),
      amount: Number(r.amount) || 0,
      movementDate: String(r.movementDate ?? r.movement_date ?? ''),
      description: (r.description as string | null) ?? null,
      paymentMethod: (r.paymentMethod as string | null) ?? (r.payment_method as string | null) ?? null,
      createdAt: String(r.createdAt ?? r.created_at ?? ''),
    };
  });
}

/** Partner cari ekranı — tek RPC ile bakiye, istatistikler ve tahsilat geçmişi. */
export async function fetchPartnerPortalAccountSnapshot(paymentLimit = 40): Promise<{
  openBalance: number;
  monthGuestTotal: number;
  monthAmountTotal: number;
  lifetimeTotal: number;
  payments: PartnerPaymentRow[];
}> {
  let lastError: string | null = null;
  for (const delayMs of [0, 700, 1800]) {
    if (delayMs > 0) await sleepMs(delayMs);
    const { data, error } = await partnerPortalDb.rpc('breakfast_partner_portal_account_snapshot', {
      p_payment_limit: paymentLimit,
    });
    if (!error) {
      const payload = (data ?? {}) as Record<string, unknown>;
      return {
        openBalance: Number(payload.openBalance ?? payload.open_balance) || 0,
        monthGuestTotal: Number(payload.monthGuestTotal ?? payload.month_guest_total) || 0,
        monthAmountTotal: Number(payload.monthAmountTotal ?? payload.month_amount_total) || 0,
        lifetimeTotal: Number(payload.lifetimeTotal ?? payload.lifetime_total) || 0,
        payments: mapPartnerPaymentRows(payload.payments),
      };
    }
    lastError = error.message;
    if (!isTransientPartnerRpcError(error)) break;
  }
  throw new Error(sanitizeSupabaseErrorMessage(lastError ?? undefined));
}

export async function fetchPartnerOpenBalance(counterpartyId: string): Promise<number> {
  const { data, error } = await supabase
    .from('finance_counterparty_agreements')
    .select('amount_remaining')
    .eq('counterparty_id', counterpartyId)
    .eq('movement_kind', 'income')
    .in('status', ['open', 'partial'])
    .eq('is_active', true);

  if (error) throw new Error(error.message);
  return (data ?? []).reduce((sum, r) => sum + (Number(r.amount_remaining) || 0), 0);
}

export async function fetchPartnerMonthStats(partnerHotelId: string): Promise<{
  monthGuestTotal: number;
  monthAmountTotal: number;
  entryCount: number;
}> {
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const entries = await listPartnerDailyEntries(partnerHotelId, { fromDate: monthStart });
  return {
    monthGuestTotal: entries.reduce((s, e) => s + e.guest_count, 0),
    monthAmountTotal: entries.reduce((s, e) => s + e.line_total, 0),
    entryCount: entries.length,
  };
}

/** Tüm zamanlar toplam tutar — yalnızca line_total sütunu (365 tam kayıt yerine hafif). */
export async function fetchPartnerLifetimeAmountTotal(partnerHotelId: string): Promise<number> {
  const { data, error } = await supabase
    .from('breakfast_partner_daily_entries')
    .select('line_total')
    .eq('partner_hotel_id', partnerHotelId);
  if (error) throw new Error(error.message);
  return (data ?? []).reduce((s, r) => s + (Number(r.line_total) || 0), 0);
}

export async function createBreakfastPartnerAccount(input: {
  organizationId: string;
  email: string;
  password: string;
  name: string;
  contactName?: string;
  phone?: string;
  city?: string;
  address?: string;
  taxId?: string;
  unitPrice?: number;
  notes?: string;
  accessToken: string;
}): Promise<{ hotelId: string; email: string } | { error: string }> {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl) return { error: 'Supabase URL yapılandırılmamış' };

  const res = await fetch(`${supabaseUrl}/functions/v1/create-breakfast-partner`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${input.accessToken}`,
      ...(anonKey ? { apikey: anonKey } : {}),
    },
    body: JSON.stringify({
      organization_id: input.organizationId,
      email: input.email.trim().toLowerCase(),
      password: input.password,
      name: input.name.trim(),
      contact_name: input.contactName?.trim() || null,
      phone: input.phone?.trim() || null,
      city: input.city?.trim() || null,
      address: input.address?.trim() || null,
      tax_id: input.taxId?.trim() || null,
      unit_price: input.unitPrice ?? null,
      notes: input.notes?.trim() || null,
      access_token: input.accessToken,
    }),
  });

  const data = (await res.json().catch(() => ({}))) as { error?: string; hotel_id?: string; email?: string };
  if (!res.ok || data.error) return { error: data.error ?? `HTTP ${res.status}` };
  if (!data.hotel_id) return { error: 'Partner otel oluşturulamadı' };
  return { hotelId: data.hotel_id, email: data.email ?? input.email };
}

export function randomPartnerPassword(length = 10): string {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < length; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

const PROVIDER_ORG_SLUG = 'valoria';
let cachedProviderOrgId: string | null = null;

/** Kahvaltı partner modülü — tek işletme (Valoria); admin’de işletme seçimi yok. */
export async function fetchBreakfastPartnerProviderOrgId(): Promise<string> {
  if (cachedProviderOrgId) return cachedProviderOrgId;

  const { data: rpcId, error: rpcErr } = await supabase.rpc('breakfast_partner_provider_org_id');
  if (!rpcErr && rpcId) {
    cachedProviderOrgId = String(rpcId);
    return cachedProviderOrgId;
  }

  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .select('id')
    .eq('slug', PROVIDER_ORG_SLUG)
    .maybeSingle();

  if (orgErr || !org?.id) {
    throw new Error('Kahvaltı partner işletmesi bulunamadı (valoria).');
  }

  cachedProviderOrgId = org.id;
  return cachedProviderOrgId;
}

export function invalidateBreakfastPartnerProviderOrgCache() {
  cachedProviderOrgId = null;
}

export async function registerBreakfastPartnerSelf(input: {
  email: string;
  password: string;
  name: string;
  contactName: string;
  phone?: string;
  city?: string;
  address?: string;
  taxId?: string;
  notes?: string;
}): Promise<
  | { hotelId: string; email: string; accessToken: string; refreshToken: string }
  | { error: string }
> {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl) return { error: 'Supabase URL yapılandırılmamış' };

  const res = await fetch(`${supabaseUrl}/functions/v1/register-breakfast-partner-self`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(anonKey ? { apikey: anonKey } : {}),
    },
    body: JSON.stringify({
      email: input.email.trim().toLowerCase(),
      password: input.password,
      name: input.name.trim(),
      contact_name: input.contactName.trim(),
      phone: input.phone?.trim() || null,
      city: input.city?.trim() || null,
      address: input.address?.trim() || null,
      tax_id: input.taxId?.trim() || null,
      notes: input.notes?.trim() || null,
    }),
  });

  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    hotel_id?: string;
    email?: string;
    access_token?: string;
    refresh_token?: string;
  };

  if (!res.ok || data.error) return { error: data.error ?? `HTTP ${res.status}` };
  if (!data.hotel_id || !data.access_token || !data.refresh_token) {
    return { error: 'Kayıt tamamlanamadı' };
  }

  return {
    hotelId: data.hotel_id,
    email: data.email ?? input.email,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
  };
}

export async function updatePartnerOwnProfile(input: {
  name: string;
  contactName: string;
  phone?: string;
  city?: string;
  address?: string;
  taxId?: string;
  taxOffice?: string;
  iban?: string;
}): Promise<{ id: string } | { error: string }> {
  const { data, error } = await supabase.rpc('breakfast_partner_update_profile', {
    p_name: input.name.trim(),
    p_contact_name: input.contactName.trim(),
    p_phone: input.phone?.trim() || null,
    p_city: input.city?.trim() || null,
    p_address: input.address?.trim() || null,
    p_tax_id: input.taxId?.trim() || null,
    p_tax_office: input.taxOffice?.trim() || null,
    p_iban: input.iban ? normalizePartnerIban(input.iban) : null,
  });
  if (error) return { error: error.message };
  return { id: String(data) };
}

export async function updatePartnerLogo(logoUrl: string | null): Promise<{ id: string } | { error: string }> {
  const { data, error } = await supabase.rpc('breakfast_partner_update_logo', {
    p_logo_url: logoUrl?.trim() || null,
  });
  if (error) return { error: error.message };
  return { id: String(data) };
}

export async function adminSetPartnerStatus(
  hotelId: string,
  status: BreakfastPartnerHotelStatus,
  unitPrice?: number | null
): Promise<string | null> {
  const { error } = await supabase.rpc('breakfast_partner_admin_set_status', {
    p_hotel_id: hotelId,
    p_status: status,
    p_unit_price: unitPrice ?? null,
  });
  return error?.message ?? null;
}

export type PartnerNotification = {
  id: string;
  notification_type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

export type PartnerPaymentRow = {
  id: string;
  amount: number;
  movementDate: string;
  description: string | null;
  paymentMethod: string | null;
  createdAt: string;
};

export type PartnerTodayEntryStatus = 'missing' | 'entered' | 'zero';

export function resolvePartnerTodayEntryStatus(entry: BreakfastPartnerDailyEntry | null): PartnerTodayEntryStatus {
  if (!entry) return 'missing';
  if (entry.guest_count <= 0) return 'zero';
  return 'entered';
}

export function formatPartnerTime(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' });
  } catch {
    return '';
  }
}

export type PartnerBreakfastConfirmationStatus = 'pending' | 'approved' | 'rejected';

export type PartnerBreakfastConfirmation = {
  id: string;
  record_date: string;
  guest_count: number;
  note: string | null;
  photo_urls: string[];
  submitted_at: string;
  approved_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  staff_name: string | null;
  approver_name: string | null;
};

export function resolvePartnerBreakfastConfirmStatus(
  row: Pick<PartnerBreakfastConfirmation, 'approved_at' | 'rejected_at'>
): PartnerBreakfastConfirmationStatus {
  if (row.rejected_at) return 'rejected';
  if (row.approved_at) return 'approved';
  return 'pending';
}

export const PARTNER_BREAKFAST_CONFIRM_STATUS_LABELS: Record<PartnerBreakfastConfirmationStatus, string> = {
  pending: 'Onay bekliyor',
  approved: 'Onaylandı',
  rejected: 'Reddedildi',
};

function mapPartnerBreakfastConfirmationRow(raw: Record<string, unknown>): PartnerBreakfastConfirmation {
  const photos = raw.photo_urls;
  return {
    id: String(raw.id),
    record_date: String(raw.record_date),
    guest_count: Number(raw.guest_count) || 0,
    note: (raw.note as string | null) ?? null,
    photo_urls: Array.isArray(photos) ? photos.map(String) : [],
    submitted_at: String(raw.submitted_at ?? ''),
    approved_at: (raw.approved_at as string | null) ?? null,
    rejected_at: (raw.rejected_at as string | null) ?? null,
    rejection_reason: (raw.rejection_reason as string | null) ?? null,
    staff_name: (raw.staff_name as string | null) ?? null,
    approver_name: (raw.approver_name as string | null) ?? null,
  };
}

/** Otel mutfağının yüklediği kahvaltı teyitleri — partner portal. */
export async function listPartnerBreakfastConfirmations(limit = 30): Promise<PartnerBreakfastConfirmation[]> {
  const { data, error } = await supabase.rpc('get_partner_breakfast_confirmations', { p_limit: limit });
  if (error) throw new Error(error.message);
  if (!data || !Array.isArray(data)) return [];
  return (data as Record<string, unknown>[]).map(mapPartnerBreakfastConfirmationRow);
}

export async function listPartnerNotifications(limit = 50): Promise<PartnerNotification[]> {
  const { data, error } = await supabase
    .from('breakfast_partner_notifications')
    .select('id, notification_type, title, body, data, read_at, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: String(row.id),
    notification_type: String(row.notification_type),
    title: String(row.title),
    body: (row.body as string | null) ?? null,
    data: (row.data as Record<string, unknown>) ?? {},
    read_at: (row.read_at as string | null) ?? null,
    created_at: String(row.created_at),
  }));
}

export async function fetchPartnerUnreadNotificationCount(): Promise<number> {
  const { data, error } = await supabase.rpc('breakfast_partner_unread_notification_count');
  if (error) return 0;
  return Number(data) || 0;
}

export async function markAllPartnerNotificationsRead(): Promise<void> {
  await supabase.rpc('breakfast_partner_mark_all_notifications_read');
}

export async function fetchPartnerPaymentHistory(limit = 50): Promise<PartnerPaymentRow[]> {
  const { data, error } = await partnerPortalDb.rpc('breakfast_partner_payment_history', { p_limit: limit });
  if (error) throw new Error(error.message);
  return mapPartnerPaymentRows(data);
}

export async function changePartnerPassword(newPassword: string): Promise<string | null> {
  if (newPassword.length < 8) return 'Şifre en az 8 karakter olmalı';
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  return error?.message ?? null;
}

export async function insertPartnerHotelNotification(
  partnerHotelId: string,
  notificationType: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<void> {
  await supabase.rpc('breakfast_partner_insert_notifications', {
    p_partner_hotel_id: partnerHotelId,
    p_notification_type: notificationType,
    p_title: title,
    p_body: body,
    p_data: data ?? {},
  });
}
