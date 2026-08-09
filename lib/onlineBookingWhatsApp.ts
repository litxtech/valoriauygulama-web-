import { Alert, Linking, Platform } from 'react-native';
import { printToLocalPdfFile } from '@/lib/persistExpoPrintPdf';
import * as Sharing from 'expo-sharing';
import { TurboModuleRegistry } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { HOTEL_MANAGER_WHATSAPP_E164 } from '@/components/hotelKitchenMenu/PublicKitchenMenuGuestMenuButton';
import { whatsappUrlFromPhone } from '@/lib/contactLaunch';
import {
  buildOnlineBookingPdfHtml,
  type BookingPdfInput,
} from '@/lib/onlineBookingPdf';
import type { OnlineBookingExtras } from '@/lib/onlineBooking';
import { formatBookingDate } from '@/lib/onlineBooking';
import i18n from '@/i18n';

const SHARE_DRAFT_KEY = '@valoria/booking_whatsapp_share_draft';

export type BookingWhatsAppShareDraft = {
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
  pdfUrl?: string | null;
};

function money(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${Math.round(n).toLocaleString('tr-TR')} ₺`;
}

function roomTitle(d: BookingWhatsAppShareDraft): string {
  const title = d.displayTitle?.trim();
  const cap = d.capacityLabel?.trim() || 'Standart';
  if (title && title !== cap) return `${title} · ${cap}`;
  return cap;
}

export function buildBookingWhatsAppText(d: BookingWhatsAppShareDraft): string {
  const ref = d.bookingId.slice(0, 8).toUpperCase();
  const extras = d.extras
    ? Object.entries(d.extras)
        .filter(([k, on]) => on && k !== 'transfer')
        .map(([k]) => k)
        .join(', ')
    : '';

  const lines = [
    '*Valoria Hotel — Online rezervasyon*',
    `Ref: ${ref}`,
    '',
    `Oda: ${roomTitle(d)}`,
    `Giriş: ${formatBookingDate(d.checkIn)}`,
    `Çıkış: ${formatBookingDate(d.checkOut)}`,
    `Gece: ${d.nights}`,
    `Misafir: ${d.guestFullName}`,
    `Telefon: ${d.guestPhone}`,
  ];
  if (d.guestEmail?.trim()) lines.push(`E-posta: ${d.guestEmail.trim()}`);
  lines.push(
    `Kişi: ${d.adults} yetişkin${d.children > 0 ? ` · ${d.children} çocuk` : ''}`
  );
  if (extras) lines.push(`Ekstra: ${extras}`);
  lines.push(`Gecelik: ${money(d.quotedPerNight)}`);
  lines.push(`Toplam: ${money(d.quotedTotal)}`);
  if (d.pdfUrl?.trim()) {
    lines.push('', `PDF rezervasyon belgesi:`, d.pdfUrl.trim());
  }
  return lines.join('\n');
}

export async function saveBookingWhatsAppShareDraft(
  draft: BookingWhatsAppShareDraft
): Promise<void> {
  await AsyncStorage.setItem(SHARE_DRAFT_KEY, JSON.stringify(draft));
}

export async function loadBookingWhatsAppShareDraft(
  bookingId?: string
): Promise<BookingWhatsAppShareDraft | null> {
  try {
    const raw = await AsyncStorage.getItem(SHARE_DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as BookingWhatsAppShareDraft;
    if (!draft?.bookingId) return null;
    if (bookingId && draft.bookingId !== bookingId) return null;
    return draft;
  } catch {
    return null;
  }
}

function ensureFileUri(uri: string): string {
  return uri.startsWith('file://') ? uri : `file://${uri}`;
}

async function trySharePdfWhatsApp(uri: string, caption: string): Promise<boolean> {
  if (Platform.OS === 'web' || !TurboModuleRegistry.get('RNShare')) return false;
  try {
    const RNShare = require('react-native-share').default as {
      open: (options: Record<string, unknown>) => Promise<unknown>;
      Social: { WHATSAPP: string };
    };
    await RNShare.open({
      title: caption,
      message: caption,
      url: ensureFileUri(uri),
      type: 'application/pdf',
      social: RNShare.Social.WHATSAPP,
      failOnCancel: false,
    });
    return true;
  } catch (e) {
    const msg = String((e as Error)?.message ?? e ?? '');
    if (/cancel|did not share|User did not/i.test(msg)) return true;
    return false;
  }
}

async function tryWebSharePdf(uri: string, fileName: string, text: string): Promise<boolean> {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined' || !navigator.share) return false;
  try {
    const res = await fetch(uri);
    const blob = await res.blob();
    const file = new File([blob], fileName, { type: 'application/pdf' });
    if (navigator.canShare?.({ files: [file], text })) {
      await navigator.share({ files: [file], text, title: fileName });
      return true;
    }
  } catch {
    /* fallback */
  }
  return false;
}

async function ensureLocalPdf(d: BookingWhatsAppShareDraft): Promise<string | null> {
  if (d.pdfUrl && (d.pdfUrl.startsWith('file://') || !/^https?:/i.test(d.pdfUrl))) {
    return d.pdfUrl;
  }
  try {
    const input: BookingPdfInput = {
      bookingId: d.bookingId,
      capacityLabel: d.capacityLabel,
      displayTitle: d.displayTitle,
      checkIn: d.checkIn,
      checkOut: d.checkOut,
      nights: d.nights,
      adults: d.adults,
      children: d.children,
      guestFullName: d.guestFullName,
      guestPhone: d.guestPhone,
      guestEmail: d.guestEmail,
      extras: d.extras,
      quotedTotal: d.quotedTotal,
      quotedPerNight: d.quotedPerNight,
    };
    const html = buildOnlineBookingPdfHtml(input);
    const file = await printToLocalPdfFile({ html });
    return file?.uri ?? null;
  } catch {
    return null;
  }
}

async function openWaWithText(message: string): Promise<void> {
  const waBase = whatsappUrlFromPhone(HOTEL_MANAGER_WHATSAPP_E164);
  if (!waBase) {
    Alert.alert(i18n.t('error'), i18n.t('bookingWhatsAppError'));
    return;
  }
  const url = `${waBase}?text=${encodeURIComponent(message)}`;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  await Linking.openURL(url);
}

/**
 * Otel sorumlusuna (0533 048 3061) WhatsApp: rezervasyon metni + PDF.
 * Web: metin + PDF linki; mümkünse Web Share ile dosya.
 * Native: WhatsApp’a PDF ekli paylaşım, yoksa metin + link.
 */
export async function sendBookingToHotelManagerWhatsApp(
  draft: BookingWhatsAppShareDraft
): Promise<void> {
  const message = buildBookingWhatsAppText(draft);
  const localPdf = await ensureLocalPdf(draft);
  const fileName = `valoria-rezervasyon-${draft.bookingId.slice(0, 8)}.pdf`;

  if (localPdf && (await trySharePdfWhatsApp(localPdf, message))) {
    return;
  }

  if (localPdf && (await tryWebSharePdf(localPdf, fileName, message))) {
    return;
  }

  // Metin + PDF URL her zaman WhatsApp’a gitsin
  await openWaWithText(message);

  if (Platform.OS === 'web' && draft.pdfUrl?.startsWith('http')) {
    Alert.alert(i18n.t('bookingWhatsAppPdfTitle'), i18n.t('bookingWhatsAppWebHint'));
    return;
  }

  if (localPdf && Platform.OS !== 'web' && (await Sharing.isAvailableAsync())) {
    await Sharing.shareAsync(localPdf, {
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
      dialogTitle: i18n.t('bookingWhatsAppPdfTitle'),
    });
  }
}
