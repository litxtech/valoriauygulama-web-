import { Alert, Linking, Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { TurboModuleRegistry } from 'react-native';
import i18n from '@/i18n';
import { phoneDigits, whatsappUrlFromPhone } from '@/lib/contactLaunch';
import { formatMenuPrice } from '@/lib/hotelKitchenMenu';
import type { KitchenMenuOrderRecord } from '@/lib/publicKitchenMenuOrderHistory';

/** Restoran sipariş hattı — müşteri PDF fişini WhatsApp ile iletir */
export const KITCHEN_MENU_RESTAURANT_WHATSAPP = '905324494374';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function localeTag(): string {
  const lang = (i18n.language || 'tr').split('-')[0];
  if (lang === 'ar') return 'ar';
  if (lang === 'en') return 'en-GB';
  return 'tr-TR';
}

export function formatKitchenMenuOrderWhen(iso: string): { date: string; time: string; full: string } {
  try {
    const d = new Date(iso);
    const tag = localeTag();
    return {
      date: d.toLocaleDateString(tag, { day: '2-digit', month: 'long', year: 'numeric' }),
      time: d.toLocaleTimeString(tag, { hour: '2-digit', minute: '2-digit' }),
      full: d.toLocaleString(tag, { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    };
  } catch {
    return { date: iso, time: '', full: iso };
  }
}

export function kitchenMenuOrderShortRef(orderId: string): string {
  return orderId.slice(0, 8).toUpperCase();
}

export function kitchenMenuOrderPdfFileName(order: KitchenMenuOrderRecord): string {
  return `valoria-siparis-${kitchenMenuOrderShortRef(order.id)}.pdf`;
}

function metaLines(order: KitchenMenuOrderRecord): string[] {
  const lines: string[] = [];
  if (order.customer_name?.trim()) {
    lines.push(`${i18n.t('publicKitchenMenuReceiptCustomer')}: ${order.customer_name.trim()}`);
  }
  if (order.customer_email?.trim()) {
    lines.push(`${i18n.t('publicKitchenMenuYourEmail')}: ${order.customer_email.trim()}`);
  }
  if (order.room_number?.trim()) {
    lines.push(`${i18n.t('publicKitchenMenuRoomNumber')}: ${order.room_number.trim()}`);
  }
  if (order.table_number?.trim()) {
    lines.push(`${i18n.t('publicKitchenMenuTableNumber')}: ${order.table_number.trim()}`);
  }
  if (order.guest_hotel_name?.trim()) {
    lines.push(`${i18n.t('publicKitchenMenuHotelName')}: ${order.guest_hotel_name.trim()}`);
  }
  if (order.delivery_address?.trim()) {
    lines.push(`${i18n.t('publicKitchenMenuDeliveryAddress')}: ${order.delivery_address.trim()}`);
  }
  return lines;
}

export function buildKitchenMenuReceiptText(order: KitchenMenuOrderRecord, orgName: string): string {
  const when = formatKitchenMenuOrderWhen(order.paid_at || order.created_at);
  const lines = [
    orgName,
    `${i18n.t('publicKitchenMenuReceiptTitle')} #${kitchenMenuOrderShortRef(order.id)}`,
    `${i18n.t('publicKitchenMenuReceiptPaidAt')}: ${when.full}`,
    '',
    ...metaLines(order),
    '',
  ].filter((line, i, arr) => !(line === '' && arr[i - 1] === ''));

  for (const item of order.items) {
    lines.push(
      `• ${item.item_name} ×${item.quantity} (${formatMenuPrice(item.unit_price)} / ${i18n.t('publicKitchenMenuReceiptQty').toLowerCase()}) — ${formatMenuPrice(item.line_total)}`
    );
  }
  lines.push('', `${i18n.t('publicKitchenMenuCartTotal')}: ${formatMenuPrice(order.total_amount)}`);
  return lines.join('\n');
}

export function buildKitchenMenuReceiptWhatsAppText(order: KitchenMenuOrderRecord, orgName: string): string {
  const when = formatKitchenMenuOrderWhen(order.paid_at || order.created_at);
  const lines = [
    `🍽️ *${orgName}*`,
    `*${i18n.t('publicKitchenMenuReceiptTitle')}* #${kitchenMenuOrderShortRef(order.id)}`,
    `📅 ${when.date}  🕐 ${when.time}`,
    '',
  ];

  for (const row of metaLines(order)) {
    lines.push(row);
  }
  if (metaLines(order).length) lines.push('');

  lines.push(`*${i18n.t('publicKitchenMenuReceiptOrderContents')}:*`);
  for (const item of order.items) {
    lines.push(`• ${item.item_name} ×${item.quantity} — ${formatMenuPrice(item.line_total)}`);
  }
  lines.push('', `*${i18n.t('publicKitchenMenuCartTotal')}:* ${formatMenuPrice(order.total_amount)}`);
  lines.push('', i18n.t('publicKitchenMenuReceiptWhatsAppPdfNote'));
  return lines.join('\n');
}

export function buildKitchenMenuReceiptHtml(order: KitchenMenuOrderRecord, orgName: string): string {
  const when = formatKitchenMenuOrderWhen(order.paid_at || order.created_at);
  const ref = kitchenMenuOrderShortRef(order.id);
  const meta = metaLines(order);

  const rows = order.items
    .map(
      (item, idx) => `
    <tr class="${idx % 2 === 1 ? 'alt' : ''}">
      <td class="item">${esc(item.item_name)}</td>
      <td class="qty">${item.quantity}</td>
      <td class="money">${esc(formatMenuPrice(item.unit_price))}</td>
      <td class="money strong">${esc(formatMenuPrice(item.line_total))}</td>
    </tr>`
    )
    .join('');

  const metaHtml = meta.map((line) => `<div class="meta-line">${esc(line)}</div>`).join('');

  return `<!DOCTYPE html>
<html lang="tr"><head><meta charset="utf-8"/>
<style>
  @page { margin: 18mm 14mm; }
  * { box-sizing: border-box; }
  body {
    font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif;
    color: #0f172a;
    margin: 0;
    padding: 0;
    background: #fff;
  }
  .sheet {
    max-width: 520px;
    margin: 0 auto;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    overflow: hidden;
  }
  .head {
    background: linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%);
    color: #fff;
    padding: 22px 24px 18px;
  }
  .head h1 { margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.3px; }
  .head .tag { margin-top: 6px; font-size: 11px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; opacity: 0.85; }
  .badge {
    display: inline-block;
    margin-top: 12px;
    padding: 4px 10px;
    border-radius: 999px;
    background: rgba(34, 197, 94, 0.2);
    color: #bbf7d0;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.6px;
    text-transform: uppercase;
  }
  .info {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    padding: 16px 24px;
    background: #f8fafc;
    border-bottom: 1px solid #e2e8f0;
  }
  .info-block label {
    display: block;
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.8px;
    text-transform: uppercase;
    color: #64748b;
    margin-bottom: 4px;
  }
  .info-block span { font-size: 13px; font-weight: 700; color: #0f172a; }
  .body { padding: 18px 24px 22px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    color: #64748b;
    border-bottom: 2px solid #e2e8f0;
    padding: 8px 6px;
    text-align: left;
  }
  td { padding: 10px 6px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
  tr.alt td { background: #fafafa; }
  .item { font-weight: 600; color: #1e293b; }
  .qty { width: 42px; text-align: center; font-weight: 700; }
  .money { text-align: right; white-space: nowrap; color: #334155; }
  .strong { font-weight: 800; color: #0f172a; }
  .total-row {
    margin-top: 14px;
    padding: 14px 16px;
    border-radius: 10px;
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .total-label { font-size: 12px; font-weight: 800; color: #166534; text-transform: uppercase; letter-spacing: 0.5px; }
  .total-amt { font-size: 20px; font-weight: 900; color: #14532d; }
  .meta { margin-top: 16px; padding-top: 14px; border-top: 1px dashed #e2e8f0; }
  .meta-line { font-size: 11px; color: #475569; line-height: 1.55; margin-bottom: 4px; }
  .foot {
    padding: 12px 24px 16px;
    text-align: center;
    font-size: 9px;
    color: #94a3b8;
    border-top: 1px solid #f1f5f9;
  }
</style></head><body>
  <div class="sheet">
    <div class="head">
      <div class="tag">${esc(i18n.t('publicKitchenMenuReceiptTitle'))}</div>
      <h1>${esc(orgName)}</h1>
      <div class="badge">${esc(i18n.t('publicKitchenMenuOrderStatusPaid'))}</div>
    </div>
    <div class="info">
      <div class="info-block">
        <label>${esc(i18n.t('publicKitchenMenuReceiptOrderNo'))}</label>
        <span>#${esc(ref)}</span>
      </div>
      <div class="info-block">
        <label>${esc(i18n.t('publicKitchenMenuReceiptPaidAt'))}</label>
        <span>${esc(when.date)}</span>
      </div>
      <div class="info-block">
        <label>${esc(i18n.t('publicKitchenMenuReceiptTime'))}</label>
        <span>${esc(when.time)}</span>
      </div>
      <div class="info-block">
        <label>${esc(i18n.t('publicKitchenMenuReceiptItemCount'))}</label>
        <span>${order.items.reduce((s, i) => s + i.quantity, 0)}</span>
      </div>
    </div>
    <div class="body">
      <table>
        <thead>
          <tr>
            <th>${esc(i18n.t('publicKitchenMenuReceiptItem'))}</th>
            <th>${esc(i18n.t('publicKitchenMenuReceiptQty'))}</th>
            <th>${esc(i18n.t('publicKitchenMenuReceiptUnitPrice'))}</th>
            <th>${esc(i18n.t('publicKitchenMenuReceiptAmount'))}</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="total-row">
        <span class="total-label">${esc(i18n.t('publicKitchenMenuCartTotal'))}</span>
        <span class="total-amt">${esc(formatMenuPrice(order.total_amount))}</span>
      </div>
      ${metaHtml ? `<div class="meta">${metaHtml}</div>` : ''}
    </div>
    <div class="foot">Valoria Hotel · ${esc(when.full)}</div>
  </div>
</body></html>`;
}

export async function exportKitchenMenuOrderPdf(
  order: KitchenMenuOrderRecord,
  orgName: string
): Promise<{ uri: string; fileName: string }> {
  const html = buildKitchenMenuReceiptHtml(order, orgName);
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  return { uri, fileName: kitchenMenuOrderPdfFileName(order) };
}

function ensureFileUri(uri: string): string {
  return uri.startsWith('file://') ? uri : `file://${uri}`;
}

async function trySharePdfWhatsApp(uri: string, caption: string, fileName: string): Promise<boolean> {
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

async function downloadKitchenMenuOrderPdfWeb(uri: string, fileName: string): Promise<void> {
  if (typeof document === 'undefined') return;
  const a = document.createElement('a');
  a.href = uri;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
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

export async function downloadKitchenMenuOrderPdf(order: KitchenMenuOrderRecord, orgName: string): Promise<void> {
  const { uri, fileName } = await exportKitchenMenuOrderPdf(order, orgName);
  if (Platform.OS === 'web') {
    await downloadKitchenMenuOrderPdfWeb(uri, fileName);
    return;
  }
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
      dialogTitle: i18n.t('publicKitchenMenuReceiptPdf'),
    });
    return;
  }
  await downloadKitchenMenuOrderPdfWeb(uri, fileName);
}

export async function shareKitchenMenuOrderPdf(order: KitchenMenuOrderRecord, orgName: string): Promise<void> {
  const { uri, fileName } = await exportKitchenMenuOrderPdf(order, orgName);
  const text = buildKitchenMenuReceiptText(order, orgName);

  if (await tryWebSharePdf(uri, fileName, text)) return;

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
      dialogTitle: i18n.t('publicKitchenMenuReceiptShare'),
    });
    return;
  }

  if (Platform.OS === 'web') {
    await downloadKitchenMenuOrderPdfWeb(uri, fileName);
  }
}

export async function sendKitchenMenuReceiptWhatsAppToRestaurant(
  order: KitchenMenuOrderRecord,
  orgName: string
): Promise<void> {
  const phone = phoneDigits(KITCHEN_MENU_RESTAURANT_WHATSAPP);
  const waBase = whatsappUrlFromPhone(phone);
  if (!waBase) {
    Alert.alert(i18n.t('error'), i18n.t('publicKitchenMenuReceiptWhatsAppError'));
    return;
  }

  const message = buildKitchenMenuReceiptWhatsAppText(order, orgName);
  const { uri, fileName } = await exportKitchenMenuOrderPdf(order, orgName);

  if (await trySharePdfWhatsApp(uri, message, fileName)) {
    return;
  }

  if (await tryWebSharePdf(uri, fileName, message)) {
    return;
  }

  if (Platform.OS === 'web') {
    await downloadKitchenMenuOrderPdfWeb(uri, fileName);
    const url = `${waBase}?text=${encodeURIComponent(message)}`;
    if (typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer');
    } else {
      await Linking.openURL(url);
    }
    Alert.alert(i18n.t('publicKitchenMenuReceiptPdf'), i18n.t('publicKitchenMenuReceiptWhatsAppWebHint'));
    return;
  }

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
      dialogTitle: i18n.t('publicKitchenMenuReceiptWhatsAppRestaurant'),
    });
  }

  const url = `${waBase}?text=${encodeURIComponent(message)}`;
  await Linking.openURL(url);
}

export function sendKitchenMenuReceiptEmail(order: KitchenMenuOrderRecord, orgName: string, email?: string | null): void {
  const to = (email || order.customer_email || '').trim();
  if (!to) return;
  const subject = encodeURIComponent(`${orgName} — ${i18n.t('publicKitchenMenuReceiptTitle')} #${kitchenMenuOrderShortRef(order.id)}`);
  const body = encodeURIComponent(buildKitchenMenuReceiptText(order, orgName));
  void Linking.openURL(`mailto:${to}?subject=${subject}&body=${body}`);
}
