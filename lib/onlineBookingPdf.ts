import { Platform } from 'react-native';
import * as Print from 'expo-print';
import { supabase } from '@/lib/supabase';
import type { OnlineBookingExtras } from '@/lib/onlineBooking';
import { uriToArrayBuffer } from '@/lib/uploadMedia';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export type BookingPdfInput = {
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

export function buildOnlineBookingPdfHtml(input: BookingPdfInput): string {
  const extras = input.extras
    ? Object.entries(input.extras)
        .filter(([, on]) => on)
        .map(([k]) => k)
        .join(', ')
    : '';
  const title = input.displayTitle?.trim()
    ? `${input.displayTitle.trim()} · ${input.capacityLabel}`
    : input.capacityLabel;
  const total =
    input.quotedTotal != null && Number.isFinite(input.quotedTotal)
      ? `${Math.round(input.quotedTotal).toLocaleString('tr-TR')} ₺`
      : '—';
  const perNight =
    input.quotedPerNight != null && Number.isFinite(input.quotedPerNight)
      ? `${Math.round(input.quotedPerNight).toLocaleString('tr-TR')} ₺`
      : '—';
  const ref = input.bookingId.slice(0, 8).toUpperCase();

  return `<!DOCTYPE html><html><head><meta charset="utf-8" />
<title>Valoria Rezervasyon</title>
<style>
  body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;padding:32px;line-height:1.45}
  h1{font-size:22px;margin:0 0 4px} .muted{color:#64748b;font-size:13px}
  .card{border:1px solid #e2e8f0;border-radius:14px;padding:18px;margin-top:18px}
  .row{display:flex;justify-content:space-between;gap:12px;margin:8px 0;font-size:14px}
  .label{color:#64748b} .val{font-weight:700}
  .foot{margin-top:28px;font-size:12px;color:#94a3b8}
</style></head><body>
  <h1>Valoria Hotel</h1>
  <div class="muted">Online rezervasyon onayı · Ref ${escapeHtml(ref)}</div>
  <div class="card">
    <div class="row"><span class="label">Oda tipi</span><span class="val">${escapeHtml(title)}</span></div>
    <div class="row"><span class="label">Giriş</span><span class="val">${escapeHtml(input.checkIn)}</span></div>
    <div class="row"><span class="label">Çıkış</span><span class="val">${escapeHtml(input.checkOut)}</span></div>
    <div class="row"><span class="label">Gece</span><span class="val">${input.nights}</span></div>
    <div class="row"><span class="label">Misafir</span><span class="val">${input.adults} yetişkin${input.children ? ` · ${input.children} çocuk` : ''}</span></div>
    <div class="row"><span class="label">Ad soyad</span><span class="val">${escapeHtml(input.guestFullName)}</span></div>
    <div class="row"><span class="label">Telefon</span><span class="val">${escapeHtml(input.guestPhone)}</span></div>
    ${input.guestEmail ? `<div class="row"><span class="label">E-posta</span><span class="val">${escapeHtml(input.guestEmail)}</span></div>` : ''}
    ${extras ? `<div class="row"><span class="label">Ekstra</span><span class="val">${escapeHtml(extras)}</span></div>` : ''}
    <div class="row"><span class="label">Gecelik</span><span class="val">${escapeHtml(perNight)}</span></div>
    <div class="row"><span class="label">Toplam</span><span class="val">${escapeHtml(total)}</span></div>
  </div>
  <p class="foot">Bu belge Valoria online rezervasyon kanalından oluşturulmuştur. Kesin onay otel ekibi tarafından yapılır.</p>
</body></html>`;
}

export async function generateAndUploadBookingPdf(
  input: BookingPdfInput
): Promise<{ publicUrl: string; path: string } | null> {
  try {
    const html = buildOnlineBookingPdfHtml(input);
    const file = await Print.printToFileAsync({ html });
    if (!file?.uri) return null;

    const path = `bookings/${input.bookingId}/rezervasyon-${Date.now()}.pdf`;
    const bytes = await uriToArrayBuffer(file.uri);
    const { error } = await supabase.storage.from('room-booking-media').upload(path, bytes, {
      contentType: 'application/pdf',
      upsert: true,
    });
    if (error) {
      if (Platform.OS !== 'web') return { publicUrl: file.uri, path: file.uri };
      throw error;
    }
    const { data } = supabase.storage.from('room-booking-media').getPublicUrl(path);
    return { publicUrl: data.publicUrl, path };
  } catch {
    return null;
  }
}

export async function saveBookingPdfUrls(
  bookingId: string,
  pdf: { publicUrl: string; path: string }
): Promise<void> {
  await supabase
    .from('online_bookings')
    .update({
      pdf_url: pdf.publicUrl,
      pdf_path: pdf.path,
      updated_at: new Date().toISOString(),
    })
    .eq('id', bookingId);
}
