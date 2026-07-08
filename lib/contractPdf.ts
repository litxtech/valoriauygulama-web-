/**
 * Sözleşme PDF oluşturma – misafir verisi ile HTML üretip expo-print ile PDF, paylaşım.
 * İmza yoksa da PDF üretilir (web onayı vb.). Web'de yazdır penceresi fallback.
 * Sayfa sayısı: admin Sözleşme tasarımı (kompakt + yazı boyutu) + dar PDF kenar boşlukları.
 */
import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type { SupabaseClient } from '@supabase/supabase-js';
import { formatDateTime } from '@/lib/date';
import { supabase } from '@/lib/supabase';

export type GuestForPdf = {
  full_name: string;
  phone: string | null;
  email: string | null;
  id_number: string | null;
  verified_at: string | null;
  created_at: string;
  signature_data?: string | null;
  rooms: { room_number: string } | null;
  contract_templates: { title: string; content: string } | null;
  total_amount_net?: number | null;
  nights_count?: number | null;
  vat_amount?: number | null;
  accommodation_tax_amount?: number | null;
  payment_method?: string | null;
  reservation_channel?: string | null;
  family_member_tcs?: { full_name?: string | null; tc?: string | null }[] | null;
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'Nakit',
  credit_card: 'Kredi Kartı',
  debit_card: 'Banka Kartı',
  transfer: 'Havale / EFT',
  online: 'Online Ödeme',
};

const RESERVATION_CHANNEL_LABELS: Record<string, string> = {
  walk_in: 'Walk-in',
  phone: 'Telefon',
  whatsapp: 'WhatsApp',
  web: 'Web sitesi',
  booking_com: 'Booking.com',
  trivago: 'Trivago',
  airbnb: 'Airbnb',
  hotels_com: 'Hotels.com',
  expedia: 'Expedia',
  agoda: 'Agoda',
  tatilbudur: 'Tatilbudur',
  jolly: 'Jolly',
  etstur: 'ETS Tur',
  agency: 'Acente',
  corporate: 'Kurumsal / Firma',
  social_media: 'Sosyal Medya',
  other: 'Diğer',
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtMoney(n: number): string {
  return new Intl.NumberFormat('tr-TR', { style: 'decimal', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

export type ContractPdfAppearance = {
  fontSize: 'small' | 'normal' | 'large';
  compact: boolean;
};

/** PDF/önizleme: ayar okunamazsa biraz sıkı varsayılan (daha az sayfa). */
export const CONTRACT_PDF_FALLBACK_APPEARANCE: ContractPdfAppearance = {
  fontSize: 'normal',
  compact: true,
};

function appSettingToString(v: unknown): string {
  if (v == null || v === '') return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (typeof v === 'number') return String(v);
  return String(v);
}

export async function fetchContractPdfAppearance(client: SupabaseClient = supabase): Promise<ContractPdfAppearance> {
  try {
    const { data } = await client.from('app_settings').select('key, value').in('key', ['contract_font_size', 'contract_compact']);
    const map: Record<string, string> = {};
    (data ?? []).forEach((r: { key: string; value: unknown }) => {
      map[r.key] = appSettingToString(r.value);
    });
    const fs = map.contract_font_size;
    const fontSize: ContractPdfAppearance['fontSize'] =
      fs === 'small' || fs === 'large' ? fs : 'normal';
    return {
      fontSize,
      compact: map.contract_compact === '1',
    };
  } catch {
    return CONTRACT_PDF_FALLBACK_APPEARANCE;
  }
}

/** Ekran + tarayıcı yazdır: A4, düzgün sayfa kırılımı ve siyah metin. */
function contractPrintMediaCss(): string {
  return `
  @page {
    size: A4;
    margin: 12mm 14mm 14mm 14mm;
  }
  @media print {
    html, body {
      width: 100% !important;
      margin: 0 !important;
      background: #fff !important;
      color: #000 !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      padding: 0 !important;
      font-size: 11pt !important;
      line-height: 1.38 !important;
    }
    h1 {
      color: #0f172a !important;
      font-size: 13pt !important;
      margin: 0 0 8pt 0 !important;
      page-break-after: avoid;
    }
    .info {
      background: #f1f5f9 !important;
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      padding: 8pt 10pt !important;
      margin-bottom: 10pt !important;
      page-break-inside: avoid;
    }
    .info p { margin: 2pt 0 !important; }
    .contract {
      font-size: 10pt !important;
      line-height: 1.34 !important;
      page-break-inside: auto;
    }
    .signature {
      margin-top: 12pt !important;
      page-break-inside: avoid;
      page-break-before: auto;
    }
    .signature img {
      max-width: 100% !important;
      max-height: 42mm !important;
      width: auto !important;
      height: auto !important;
    }
    .approval-section {
      margin-top: 14pt !important;
      page-break-inside: avoid;
      page-break-before: auto;
    }
    .approval-notice {
      background: #f0fdf4 !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .approval-parties { display: flex; gap: 14pt; }
    .approval-party { flex: 1; }
    .digital-seal {
      background: #dcfce7 !important;
      color: #166534 !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
  }
  @media screen {
    body { max-width: 210mm; margin: 0 auto; box-sizing: border-box; }
  }
`;
}

function pdfAppearanceCss(a: ContractPdfAppearance): string {
  const scale = {
    small: { body: 11, contract: 10.25, h1: 14 },
    normal: { body: 12, contract: 11, h1: 15 },
    large: { body: 14, contract: 13, h1: 18 },
  }[a.fontSize];
  const pad = a.compact ? 11 : 17;
  const infoPad = a.compact ? '7px 9px' : '11px 13px';
  const lh = a.compact ? 1.32 : 1.4;
  const contractLh = a.compact ? 1.3 : 1.38;
  const gap = a.compact ? 6 : 10;
  return `
    * { box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; padding: ${pad}px; color: #1a202c; font-size: ${scale.body}px; line-height: ${lh}; }
    h1 { font-size: ${scale.h1}px; margin: 0 0 ${gap}px 0; color: #1a365d; line-height: 1.22; font-weight: 700; }
    .info { background: #f7fafc; padding: ${infoPad}; border-radius: 6px; margin-bottom: ${gap}px; border: 1px solid #e2e8f0; }
    .info p { margin: ${a.compact ? '1px' : '3px'} 0; }
    .contract { white-space: normal; margin: ${a.compact ? '6px' : '10px'} 0; font-size: ${scale.contract}px; line-height: ${contractLh}; word-wrap: break-word; overflow-wrap: break-word; }
    .signature { margin-top: ${a.compact ? 10 : 18}px; }
    .signature img { max-width: ${a.compact ? 200 : 260}px; height: auto; }
    .approval-section { margin-top: ${a.compact ? 16 : 24}px; border-top: 2px solid #e2e8f0; padding-top: ${a.compact ? 12 : 18}px; }
    .approval-notice { background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: ${a.compact ? '10px 12px' : '14px 16px'}; margin-bottom: ${a.compact ? 12 : 18}px; }
    .approval-notice p { margin: 3px 0; font-size: ${scale.contract}px; color: #166534; }
    .approval-parties { display: flex; gap: 20px; }
    .approval-party { flex: 1; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: ${a.compact ? '10px' : '14px'}; text-align: center; }
    .approval-role { font-size: 11px; font-weight: 600; color: #64748b; margin: 0 0 4px 0; text-transform: uppercase; letter-spacing: 0.5px; }
    .approval-name { font-size: ${scale.body}px; font-weight: 700; color: #0f172a; margin: 0 0 8px 0; }
    .digital-seal { display: inline-block; background: #dcfce7; color: #166534; font-weight: 700; font-size: 11px; padding: 4px 12px; border-radius: 4px; border: 1px solid #86efac; letter-spacing: 0.3px; }
    .approval-party img { max-width: 160px; height: auto; margin-top: 8px; }
  `;
}

function printMarginsForAppearance(a: ContractPdfAppearance): { top: number; bottom: number; left: number; right: number } {
  const m = a.compact ? 16 : 22;
  return { top: m, bottom: m, left: m, right: m };
}

export function buildContractHtml(guest: GuestForPdf, appearance?: ContractPdfAppearance | null): string {
  const a = appearance ?? CONTRACT_PDF_FALLBACK_APPEARANCE;
  const name = escapeHtml(guest.full_name);
  const phone = guest.phone ? escapeHtml(guest.phone) : '—';
  const email = guest.email ? escapeHtml(guest.email) : '—';
  const idNo = guest.id_number ? escapeHtml(guest.id_number) : '—';
  const room = guest.rooms?.room_number ? escapeHtml(String(guest.rooms.room_number)) : '—';
  const date = formatDateTime(guest.verified_at ?? guest.created_at);
  const title = guest.contract_templates?.title
    ? escapeHtml(guest.contract_templates.title)
    : 'Konaklama Sözleşmesi';
  const rawContent = guest.contract_templates?.content ?? '';
  const filteredContent = rawContent
    .split('\n')
    .filter(line => !/T\.?C\.?\s*Hazine\s*(ve|&)\s*Maliye\s*Bakanl/i.test(line) && !/kayıt altına alınmıştır/i.test(line))
    .join('\n');
  const content = filteredContent ? escapeHtml(filteredContent).replace(/\n/g, '<br/>') : '';
  const sigSrc = guest.signature_data?.trim()
    ? guest.signature_data!.trim().replace(/"/g, '&quot;')
    : '';
  const sigImg = sigSrc
    ? `<img src="${sigSrc}" alt="İmza" style="max-width:280px;height:auto;margin-top:12px;" />`
    : '';

  const nightsLine =
    guest.nights_count != null && guest.nights_count > 0
      ? `<p><strong>Konaklama süresi:</strong> ${guest.nights_count} gece</p>`
      : '';
  const totalNet = guest.total_amount_net != null ? Number(guest.total_amount_net) : null;
  const priceLine =
    totalNet != null && totalNet >= 0
      ? `<p><strong>Toplam konaklama bedeli (net):</strong> ${fmtMoney(totalNet)} ₺</p>`
      : '';
  const paymentLine = guest.payment_method
    ? `<p><strong>Ödeme Şekli:</strong> ${escapeHtml(PAYMENT_METHOD_LABELS[guest.payment_method] ?? guest.payment_method)}</p>`
    : '';
  const channelLine = guest.reservation_channel
    ? `<p><strong>Rezervasyon Kanalı:</strong> ${escapeHtml(RESERVATION_CHANNEL_LABELS[guest.reservation_channel] ?? guest.reservation_channel)}</p>`
    : '';
  const familyRows = Array.isArray(guest.family_member_tcs) ? guest.family_member_tcs : [];
  const familyLine =
    familyRows.length > 0
      ? `<p><strong>Aile fertleri T.C.:</strong> ${familyRows
          .map((r) => {
            const n = escapeHtml((r.full_name ?? '').trim() || '—');
            const tc = escapeHtml(String(r.tc ?? '').replace(/\D/g, '') || '—');
            return `${n} (${tc})`;
          })
          .join('; ')}</p>`
      : '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=3.0, user-scalable=yes" />
  <style>${pdfAppearanceCss(a)}${contractPrintMediaCss()}</style>
</head>
<body>
  <h1>Valoria Hotel – ${title}</h1>
  <div class="info">
    <p><strong>Misafir:</strong> ${name}</p>
    <p><strong>Telefon:</strong> ${phone}</p>
    <p><strong>E-posta:</strong> ${email}</p>
    <p><strong>Kimlik No:</strong> ${idNo}</p>
    ${familyLine}
    <p><strong>Oda:</strong> ${room}</p>
    <p><strong>Onay Tarihi:</strong> ${date}</p>
    ${nightsLine}
    ${priceLine}
    ${paymentLine}
    ${channelLine}
  </div>
  <div class="contract">${content}</div>
  <div class="approval-section">
    <div class="approval-notice">
      <p>Bu sözleşme <strong>Valoria Hotel</strong> tarafından geliştirilen sistem tarafından dijital olarak onaylanmıştır.</p>
      <p><strong>Onay tarihi:</strong> ${date}</p>
    </div>
    <div class="approval-parties">
      <div class="approval-party">
        <p class="approval-role">Otel Sorumlusu</p>
        <p class="approval-name">Soner Toprak</p>
        <div class="digital-seal">Dijital İmza</div>
      </div>
      <div class="approval-party">
        <p class="approval-role">Müşteri</p>
        <p class="approval-name">${name}</p>
        <div class="digital-seal">Dijital İmza</div>
        ${sigImg}
      </div>
    </div>
  </div>
</body>
</html>`;
}

/** Web'de HTML'i yeni pencerede açar; kullanıcı Ctrl+P ile PDF'e yazdırabilir. */
export async function openContractPrintWindow(guest: GuestForPdf): Promise<void> {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  const appearance = await fetchContractPdfAppearance();
  const html = buildContractHtml(guest, appearance);
  const w = window.open('', '_blank', 'noopener');
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}

/** Web'de önizleme — yazdırma tetiklenmez. */
export async function openContractPreviewWindow(guest: GuestForPdf): Promise<void> {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  const appearance = await fetchContractPdfAppearance();
  const html = buildContractHtml(guest, appearance);
  const w = window.open('', '_blank', 'noopener');
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
}

export async function loadGuestForPdf(client: SupabaseClient, guestId: string): Promise<GuestForPdf | null> {
  const { data: guest, error } = await client
    .from('guests')
    .select(
      'full_name, phone, email, id_number, verified_at, created_at, signature_data, rooms(room_number), contract_templates(title, content), total_amount_net, nights_count, vat_amount, accommodation_tax_amount, payment_method, reservation_channel'
    )
    .eq('id', guestId)
    .single();
  if (error || !guest) return null;
  return {
    ...guest,
    rooms: Array.isArray(guest.rooms) ? (guest.rooms[0] ?? null) : guest.rooms,
    contract_templates: Array.isArray(guest.contract_templates)
      ? (guest.contract_templates[0] ?? null)
      : guest.contract_templates,
  } as GuestForPdf;
}

/**
 * Mobil yazdır: önce A4 PDF üretilir, sistem yazdırıcısına PDF verilir — HTML doğrudan yazdırmaya göre
 * önizleme ve çıktı çok daha tutarlıdır (PDF indir / paylaş ile aynı görünüm).
 */
export async function printContractGuest(guest: GuestForPdf): Promise<void> {
  if (Platform.OS === 'web') {
    await openContractPrintWindow(guest);
    return;
  }
  const uri = await exportContractPdf(guest);
  await Print.printAsync({ uri });
}

export async function exportContractPdf(guest: GuestForPdf): Promise<string> {
  const appearance = await fetchContractPdfAppearance();
  const html = buildContractHtml(guest, appearance);
  const margins = printMarginsForAppearance(appearance);
  const { uri } = await Print.printToFileAsync({
    html,
    width: 595,
    height: 842,
    margins,
  });
  return uri;
}

export async function shareContractPdf(guest: GuestForPdf): Promise<void> {
  if (Platform.OS === 'web') {
    await openContractPrintWindow(guest);
    return;
  }
  try {
    const uri = await exportContractPdf(guest);
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Sözleşmeyi Kaydet' });
    } else {
      throw new Error(`PDF hazır: ${uri}`);
    }
  } catch (e) {
    const msg = (e as Error)?.message ?? '';
    if (msg.includes('PDF hazır')) {
      await openContractPrintWindow(guest);
      return;
    }
    throw e;
  }
}
