import { Alert, Platform, Share, TurboModuleRegistry } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { supabase } from '@/lib/supabase';
import type { StaffTipRow } from '@/lib/staffTips';
import { isPaidStaffTip } from '@/lib/staffTips';
import {
  formatTipAmount,
  staffTipLang,
  staffTipText,
  tipPaymentMethodLabel,
} from '@/lib/staffTipsI18n';

const FALLBACK_HOTEL_NAME = 'Valoria Hotel';
const TIP_GOLD = '#b8860b';
const STRIPE_PURPLE = '#635bff';

export type StaffTipReceiptInput = {
  id: string;
  amount: number;
  currency: string;
  payment_method: string;
  note?: string | null;
  room_number?: string | null;
  confirmed_at: string;
  staffName: string;
  staffRole?: string | null;
  guestName?: string | null;
  thank_you_message?: string | null;
  hotelName: string;
  hotelAddress?: string | null;
  hotelPhone?: string | null;
  transactionRef?: string | null;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function receiptLocale(): string {
  const lang = staffTipLang();
  const map: Record<string, string> = {
    tr: 'tr-TR',
    en: 'en-US',
    ar: 'ar-SA',
    de: 'de-DE',
    fr: 'fr-FR',
    ru: 'ru-RU',
    es: 'es-ES',
  };
  return map[lang] ?? 'tr-TR';
}

function formatReceiptDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat(receiptLocale(), {
      timeZone: 'Europe/Istanbul',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function shortReceiptNo(tipId: string): string {
  return tipId.replace(/-/g, '').slice(0, 8).toUpperCase();
}

function staffRoleLine(row: StaffTipRow): string | null {
  const parts = [row.staff?.department?.trim(), row.staff?.position?.trim()].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

function guestDisplayName(row: StaffTipRow): string | null {
  const name = row.guest?.full_name?.trim();
  return name || null;
}

function formatTransactionRef(intentId: string | null | undefined, publicToken: string | null | undefined): string | null {
  const pi = intentId?.trim();
  if (pi && pi.length >= 8) return `···${pi.slice(-8).toUpperCase()}`;
  const tok = publicToken?.trim();
  if (tok && tok.length >= 6) return tok.slice(0, 8).toUpperCase();
  return null;
}

async function fetchReceiptEnrichment(
  row: StaffTipRow
): Promise<Pick<StaffTipReceiptInput, 'hotelName' | 'hotelAddress' | 'hotelPhone' | 'transactionRef'>> {
  let hotelName = FALLBACK_HOTEL_NAME;
  let hotelAddress: string | null = null;
  let hotelPhone: string | null = null;
  let transactionRef: string | null = null;

  const orgId = row.organization_id;
  if (orgId) {
    const { data: org } = await supabase
      .from('organizations')
      .select('name, address, phone, city')
      .eq('id', orgId)
      .maybeSingle();
    if (org?.name?.trim()) hotelName = org.name.trim();
    const addr = [org?.address?.trim(), org?.city?.trim()].filter(Boolean).join(', ');
    if (addr) hotelAddress = addr;
    if (org?.phone?.trim()) hotelPhone = org.phone.trim();
  }

  if (row.payment_request_id) {
    const { data: pr } = await supabase
      .from('payment_requests')
      .select('provider_payment_intent_id, public_token')
      .eq('id', row.payment_request_id)
      .maybeSingle();
    transactionRef = formatTransactionRef(
      (pr as { provider_payment_intent_id?: string | null } | null)?.provider_payment_intent_id,
      (pr as { public_token?: string | null } | null)?.public_token
    );
  }

  return { hotelName, hotelAddress, hotelPhone, transactionRef };
}

export function staffTipReceiptFromRow(row: StaffTipRow): StaffTipReceiptInput | null {
  if (!isPaidStaffTip(row) || !row.confirmed_at) return null;
  const staffName =
    row.staff?.full_name?.trim() || staffTipText('tipStaffFallback');
  return {
    id: row.id,
    amount: Number(row.amount),
    currency: (row.currency ?? 'TRY').toLowerCase(),
    payment_method: row.payment_method,
    note: row.note,
    room_number: row.room_number,
    confirmed_at: row.confirmed_at,
    staffName,
    staffRole: staffRoleLine(row),
    guestName: guestDisplayName(row),
    thank_you_message: row.thank_you_message,
    hotelName: FALLBACK_HOTEL_NAME,
  };
}

/** Ödeme + org + Stripe referansı ile tam makbuz verisi */
export async function prepareStaffTipReceiptInput(row: StaffTipRow): Promise<StaffTipReceiptInput | null> {
  const base = staffTipReceiptFromRow(row);
  if (!base) return null;
  const extra = await fetchReceiptEnrichment(row);
  return { ...base, ...extra };
}

export function buildStaffTipReceiptCaption(input: StaffTipReceiptInput): string {
  const amount = formatTipAmount(input.amount, input.currency);
  return staffTipText('tipReceiptCaption', {
    amount,
    name: input.staffName,
    receiptNo: shortReceiptNo(input.id),
  });
}

function rowHtml(label: string, value: string, ref = false): string {
  return `<div class="row"><span class="lbl">${escapeHtml(label)}</span><span class="val${ref ? ' ref' : ''}">${escapeHtml(value)}</span></div>`;
}

export function buildStaffTipReceiptHtml(input: StaffTipReceiptInput): string {
  const amount = formatTipAmount(input.amount, input.currency);
  const paidAt = formatReceiptDateTime(input.confirmed_at);
  const receiptNo = shortReceiptNo(input.id);
  const paymentLabel = tipPaymentMethodLabel(input.payment_method);
  const lang = staffTipLang();
  const hotelName = input.hotelName?.trim() || FALLBACK_HOTEL_NAME;
  const isStripe = input.payment_method === 'stripe_card';

  const orgMeta: string[] = [];
  if (input.hotelAddress?.trim()) orgMeta.push(escapeHtml(input.hotelAddress.trim()));
  if (input.hotelPhone?.trim()) orgMeta.push(escapeHtml(input.hotelPhone.trim()));

  const rows: string[] = [
    rowHtml(staffTipText('tipReceiptNo'), receiptNo, true),
    rowHtml(staffTipText('tipReceiptPaidAt'), paidAt),
    rowHtml(staffTipText('tipReceiptServiceType'), staffTipText('tipReceiptServiceName')),
    rowHtml(staffTipText('tipReceiptStaff'), input.staffName),
  ];

  if (input.staffRole?.trim()) {
    rows.push(rowHtml(staffTipText('tipReceiptStaffRole'), input.staffRole.trim()));
  }
  if (input.guestName?.trim()) {
    rows.push(rowHtml(staffTipText('tipReceiptGuest'), input.guestName.trim()));
  }
  if (input.room_number?.trim()) {
    rows.push(rowHtml(staffTipText('tipReceiptRoom'), input.room_number.trim()));
  }
  rows.push(rowHtml(staffTipText('tipReceiptPayment'), paymentLabel));
  if (input.transactionRef?.trim()) {
    rows.push(rowHtml(staffTipText('tipReceiptTransactionRef'), input.transactionRef.trim(), true));
  }

  const noteBlock = input.note?.trim()
    ? `<div class="note"><strong>${escapeHtml(staffTipText('tipReceiptNote'))}</strong><br/>${escapeHtml(input.note.trim())}</div>`
    : '';

  const thankBlock = input.thank_you_message?.trim()
    ? `<div class="thank"><strong>${escapeHtml(staffTipText('tipReceiptThankYou'))}</strong><br/>${escapeHtml(input.thank_you_message.trim())}</div>`
    : '';

  const stripeBlock = isStripe
    ? `<div class="stripe-bar">${escapeHtml(staffTipText('tipReceiptStripeSecure'))}</div>`
    : '';

  const legalBlock = `<div class="legal">
    <p>${escapeHtml(staffTipText('tipReceiptLegalInvoice'))}</p>
    <p>${escapeHtml(staffTipText('tipReceiptLegalGratuity'))}</p>
  </div>`;

  const orgMetaHtml = orgMeta.length
    ? `<p class="org-meta">${orgMeta.join(' · ')}</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="utf-8"/>
  <title>${escapeHtml(staffTipText('tipReceiptTitle'))} · ${receiptNo}</title>
  <style>
    @page { size: A4 portrait; margin: 14mm; }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #0f172a;
      margin: 0;
      padding: 20px;
      background: #f1f5f9;
      font-size: 11pt;
      line-height: 1.45;
    }
    .receipt {
      max-width: 420px;
      margin: 0 auto;
      background: #ffffff;
      border-radius: 20px;
      border: 1px solid #e2e8f0;
      overflow: hidden;
      box-shadow: 0 12px 40px rgba(15, 23, 42, 0.12);
    }
    .head {
      background: linear-gradient(155deg, #1e293b 0%, #0f172a 55%, #1a1f35 100%);
      color: #fff;
      padding: 28px 22px 24px;
      text-align: center;
      position: relative;
    }
    .head::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 10%;
      right: 10%;
      height: 3px;
      background: linear-gradient(90deg, transparent, ${TIP_GOLD}, transparent);
      border-radius: 2px;
    }
    .head .hotel { margin: 0; font-size: 14pt; font-weight: 800; letter-spacing: 0.03em; }
    .org-meta { margin: 8px 0 0; font-size: 8.5pt; color: #94a3b8; line-height: 1.5; }
    .head h1 {
      margin: 14px 0 0;
      font-size: 18pt;
      font-weight: 800;
      letter-spacing: -0.02em;
    }
    .head .sub {
      margin-top: 6px;
      font-size: 9pt;
      color: #94a3b8;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.16em;
    }
    .badge {
      display: inline-block;
      margin-top: 14px;
      padding: 8px 18px;
      border-radius: 999px;
      background: rgba(34, 197, 94, 0.2);
      border: 1px solid rgba(134, 239, 172, 0.45);
      color: #86efac;
      font-size: 10pt;
      font-weight: 800;
    }
    .gift { color: ${TIP_GOLD}; font-size: 24pt; margin: 6px 0 2px; line-height: 1; }
    .body { padding: 22px 20px 10px; }
    .amount-box {
      text-align: center;
      padding: 24px 16px;
      margin-bottom: 20px;
      background: linear-gradient(180deg, #f0fdf4 0%, #ecfdf5 100%);
      border: 2px solid #22c55e;
      border-radius: 16px;
    }
    .amount-label {
      font-size: 9pt;
      color: #64748b;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.12em;
    }
    .amount-value {
      font-size: 36pt;
      font-weight: 900;
      color: #16a34a;
      margin-top: 8px;
      line-height: 1.05;
      letter-spacing: -0.02em;
    }
    .details-title {
      font-size: 9pt;
      font-weight: 800;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.14em;
      margin: 4px 0 10px;
      padding-bottom: 8px;
      border-bottom: 2px solid #f1f5f9;
    }
    .row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 14px;
      padding: 11px 0;
      border-bottom: 1px solid #f8fafc;
      font-size: 10.5pt;
    }
    .row:last-of-type { border-bottom: none; }
    .lbl { color: #64748b; font-weight: 600; max-width: 44%; }
    .val { color: #0f172a; font-weight: 700; text-align: right; flex: 1; word-break: break-word; }
    .ref { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 9.5pt; letter-spacing: 0.06em; color: #334155; }
    .stripe-bar {
      margin: 16px 0 4px;
      padding: 12px 14px;
      border-radius: 12px;
      background: linear-gradient(135deg, #eef2ff 0%, #f5f3ff 100%);
      border: 1px solid #c7d2fe;
      color: ${STRIPE_PURPLE};
      font-size: 9.5pt;
      font-weight: 700;
      text-align: center;
    }
    .note, .thank {
      margin-top: 14px;
      padding: 14px;
      border-radius: 12px;
      font-size: 10pt;
      line-height: 1.55;
    }
    .note { background: #fffbeb; color: #78350f; border: 1px solid #fde68a; }
    .thank { background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; }
    .legal {
      margin: 18px 0 6px;
      padding: 14px;
      border-radius: 12px;
      background: #f8fafc;
      border: 1px dashed #cbd5e1;
      font-size: 8.5pt;
      color: #64748b;
      line-height: 1.55;
    }
    .legal p { margin: 0 0 8px; }
    .legal p:last-child { margin-bottom: 0; }
    .foot {
      padding: 18px 20px 24px;
      text-align: center;
      font-size: 8.5pt;
      color: #94a3b8;
      border-top: 1px dashed #e2e8f0;
      line-height: 1.55;
      background: #fafbfc;
    }
    .foot-brand { font-weight: 800; color: #475569; font-size: 9.5pt; margin-bottom: 6px; }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="head">
      <p class="hotel">${escapeHtml(hotelName)}</p>
      ${orgMetaHtml}
      <div class="gift">&#9733;</div>
      <h1>${escapeHtml(staffTipText('tipReceiptTitle'))}</h1>
      <p class="sub">${escapeHtml(staffTipText('tipReceiptSubtitle'))}</p>
      <span class="badge">${escapeHtml(staffTipText('tipReceiptStatusPaid'))}</span>
    </div>
    <div class="body">
      <div class="amount-box">
        <div class="amount-label">${escapeHtml(staffTipText('tipReceiptAmount'))}</div>
        <div class="amount-value">${escapeHtml(amount.replace(/\s/g, '\u00a0'))}</div>
      </div>
      <div class="details-title">${escapeHtml(staffTipText('tipReceiptDetailsHeading'))}</div>
      ${rows.join('\n')}
      ${stripeBlock}
      ${noteBlock}
      ${thankBlock}
      ${legalBlock}
    </div>
    <div class="foot">
      <div class="foot-brand">${escapeHtml(staffTipText('tipReceiptFooterBrand', { hotelName }))}</div>
      ${escapeHtml(staffTipText('tipReceiptFooter'))}<br/>
      ${escapeHtml(paidAt)} · ${escapeHtml(receiptNo)}
    </div>
  </div>
</body>
</html>`;
}

async function createStaffTipReceiptPdfFile(input: StaffTipReceiptInput): Promise<{ uri: string; fileName: string }> {
  const html = buildStaffTipReceiptHtml(input);
  const file = await Print.printToFileAsync({
    html,
    width: 595,
    height: 842,
    margins: { top: 28, bottom: 28, left: 28, right: 28 },
  });
  const fileName = `bahsis-fis-${shortReceiptNo(input.id)}.pdf`;
  return { uri: file.uri, fileName };
}

function ensureFileUri(uri: string): string {
  return uri.startsWith('file://') ? uri : `file://${uri}`;
}

async function trySharePdfWithRNShare(uri: string, caption: string, fileName: string, whatsappOnly: boolean): Promise<boolean> {
  if (Platform.OS === 'web' || !TurboModuleRegistry.get('RNShare')) {
    return false;
  }

  try {
    const RNShare = require('react-native-share').default as {
      open: (options: Record<string, unknown>) => Promise<unknown>;
      Social: { WHATSAPP: string };
    };
    const options: Record<string, unknown> = {
      title: staffTipText('tipReceiptTitle'),
      subject: fileName,
      message: caption,
      url: ensureFileUri(uri),
      type: 'application/pdf',
      failOnCancel: false,
    };
    if (whatsappOnly) {
      options.social = RNShare.Social.WHATSAPP;
    }
    await RNShare.open(options);
    return true;
  } catch (e) {
    const msg = String((e as Error)?.message ?? e ?? '');
    if (/cancel|did not share|User did not/i.test(msg)) return true;
    return false;
  }
}

export async function shareStaffTipReceiptPdf(input: StaffTipReceiptInput): Promise<void> {
  try {
    const { uri, fileName } = await createStaffTipReceiptPdfFile(input);
    const caption = buildStaffTipReceiptCaption(input);

    if (await trySharePdfWithRNShare(uri, caption, fileName, false)) return;

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: staffTipText('tipReceiptTitle'),
        UTI: 'com.adobe.pdf',
      });
      return;
    }

    await Share.share({ message: `${caption}\n${uri}`, title: staffTipText('tipReceiptTitle') });
  } catch (e) {
    Alert.alert(staffTipText('tipAlertError'), (e as Error)?.message ?? staffTipText('tipReceiptError'));
  }
}

export async function shareStaffTipReceiptWhatsApp(input: StaffTipReceiptInput): Promise<void> {
  try {
    const { uri, fileName } = await createStaffTipReceiptPdfFile(input);
    const caption = buildStaffTipReceiptCaption(input);

    if (await trySharePdfWithRNShare(uri, caption, fileName, true)) return;

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: staffTipText('tipReceiptShareWhatsApp'),
        UTI: 'com.adobe.pdf',
      });
      return;
    }

    await Share.share({ message: caption, title: staffTipText('tipReceiptShareWhatsApp') });
  } catch (e) {
    Alert.alert(staffTipText('tipAlertError'), (e as Error)?.message ?? staffTipText('tipReceiptError'));
  }
}

export function promptStaffTipReceiptShare(row: StaffTipRow): void {
  void (async () => {
    const input = await prepareStaffTipReceiptInput(row);
    if (!input) {
      Alert.alert(staffTipText('tipAlertInfo'), staffTipText('tipReceiptNotReady'));
      return;
    }

    Alert.alert(staffTipText('tipReceiptShare'), staffTipText('tipReceiptPickAction'), [
      {
        text: staffTipText('tipReceiptShareWhatsApp'),
        onPress: () => void shareStaffTipReceiptWhatsApp(input),
      },
      {
        text: staffTipText('tipReceiptSharePdf'),
        onPress: () => void shareStaffTipReceiptPdf(input),
      },
      { text: staffTipText('tipAlertOk'), style: 'cancel' },
    ]);
  })();
}
