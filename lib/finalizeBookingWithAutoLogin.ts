import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { completeSignIn } from '@/stores/authStore';
import { getOrCreateGuestForCaller } from '@/lib/getOrCreateGuestForCaller';
import { enterAppAfterSignIn } from '@/lib/enterAppAfterSignIn';
import {
  claimOnlineBookingForCaller,
  trackBookingEvent,
  type OnlineBookingExtras,
} from '@/lib/onlineBooking';
import { generateAndUploadBookingPdf } from '@/lib/onlineBookingPdf';
import type { Router } from 'expo-router';
import { log } from '@/lib/logger';

export type FinalizeBookingSessionInput = {
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
  router: Pick<Router, 'replace' | 'push'>;
};

/**
 * Rezervasyon sonrası: şifresiz anonim giriş → misafir hesabı → PDF → rezervasyonu hesaba bağla → uygulamaya gir.
 */
export async function finalizeBookingWithAutoLogin(
  input: FinalizeBookingSessionInput
): Promise<{ ok: boolean; error?: string }> {
  try {
    let user = (await supabase.auth.getSession()).data.session?.user ?? null;

    if (!user) {
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error) throw error;
      user = data.user;
    }
    if (!user) throw new Error('Oturum açılamadı');

    await completeSignIn(user);
    await getOrCreateGuestForCaller(user);

    const pdf = await generateAndUploadBookingPdf({
      bookingId: input.bookingId,
      capacityLabel: input.capacityLabel,
      displayTitle: input.displayTitle,
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      nights: input.nights,
      adults: input.adults,
      children: input.children,
      guestFullName: input.guestFullName,
      guestPhone: input.guestPhone,
      guestEmail: input.guestEmail,
      extras: input.extras,
      quotedTotal: input.quotedTotal,
      quotedPerNight: input.quotedPerNight,
    });

    await claimOnlineBookingForCaller(input.bookingId, {
      url: pdf?.publicUrl,
      path: pdf?.path,
    });

    void trackBookingEvent('login_auto', { bookingId: input.bookingId, capacityLabel: input.capacityLabel });
    if (pdf) {
      void trackBookingEvent('pdf_ready', { bookingId: input.bookingId, capacityLabel: input.capacityLabel });
    }

    if (Platform.OS === 'web') {
      input.router.replace({ pathname: '/booking/success', params: { id: input.bookingId, loggedIn: '1' } });
    } else {
      await enterAppAfterSignIn(input.router as Router, user.id);
      input.router.push({ pathname: '/customer/bookings', params: { highlight: input.bookingId } });
    }
    return { ok: true };
  } catch (e) {
    log.warn('finalizeBookingWithAutoLogin', (e as Error)?.message);
    return { ok: false, error: (e as Error)?.message || 'Otomatik giriş başarısız' };
  }
}
