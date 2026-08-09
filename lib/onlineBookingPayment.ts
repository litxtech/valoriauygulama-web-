import { supabaseUrl, supabaseAnonKey } from '@/lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { OnlineBookingExtras } from '@/lib/onlineBooking';

const DRAFT_KEY = '@valoria/booking_pay_finalize_draft';

export type BookingPayFinalizeDraft = {
  bookingId: string;
  capacityLabel: string;
  displayTitle?: string | null;
  checkIn: string;
  checkOut: string;
  nights: number;
  adults: number;
  children: number;
  guestFullName: string;
  guestPhone: string;
  guestEmail?: string | null;
  extras?: OnlineBookingExtras;
  quotedTotal?: number | null;
  quotedPerNight?: number | null;
};

export type OnlineBookingPaymentResult = {
  booking_id: string;
  payment_request_id: string;
  pay_url: string;
  amount: number;
  currency: string;
  status: string;
};

function edgeBaseUrl(): string {
  return (supabaseUrl || process.env.EXPO_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
}

function anonKey(): string {
  return supabaseAnonKey || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
}

/** GG.AA.YYYY girişi — sadece rakam, otomatik nokta */
export function formatTrBirthDateInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`;
}

export async function saveBookingPayFinalizeDraft(draft: BookingPayFinalizeDraft): Promise<void> {
  await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

export async function loadBookingPayFinalizeDraft(
  bookingId?: string
): Promise<BookingPayFinalizeDraft | null> {
  try {
    const raw = await AsyncStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as BookingPayFinalizeDraft;
    if (!draft?.bookingId) return null;
    if (bookingId && draft.bookingId !== bookingId) return null;
    return draft;
  } catch {
    return null;
  }
}

export async function clearBookingPayFinalizeDraft(): Promise<void> {
  try {
    await AsyncStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

export async function createOnlineBookingPayment(input: {
  bookingId: string;
  orgSlug?: string;
  lang?: string;
}): Promise<OnlineBookingPaymentResult> {
  const base = edgeBaseUrl();
  const key = anonKey();
  if (!base || !key) {
    throw new Error('Ödeme servisi yapılandırılmamış');
  }

  const res = await fetch(`${base}/functions/v1/create-online-booking-payment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
      apikey: key,
    },
    body: JSON.stringify({
      booking_id: input.bookingId,
      org_slug: input.orgSlug ?? 'valoria',
      lang: input.lang ?? 'tr',
    }),
  });

  const text = await res.text();
  let data: (OnlineBookingPaymentResult & { error?: string; error_code?: string }) | null = null;
  try {
    data = text ? (JSON.parse(text) as OnlineBookingPaymentResult & { error?: string }) : null;
  } catch {
    data = { error: text.slice(0, 200) } as OnlineBookingPaymentResult & { error: string };
  }

  if (!res.ok || data?.error || !data?.pay_url) {
    const code = data?.error_code;
    if (code === 'AMOUNT_MISSING') throw new Error('Bu oda için ödenecek tutar tanımlı değil');
    if (code === 'ROOM_UNAVAILABLE') {
      throw new Error('Bu oda seçtiğiniz tarihlerde artık müsait değil. Başka tarih deneyin.');
    }
    if (code === 'STRIPE_SESSION' || code === 'STRIPE_ERROR') {
      throw new Error(data?.error || 'Ödeme oturumu oluşturulamadı');
    }
    throw new Error(data?.error || 'Ödeme başlatılamadı');
  }

  return data;
}
