import { Linking, Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import i18n from '@/i18n';
import { formatMenuPrice } from '@/lib/hotelKitchenMenu';
import type { KitchenMenuOrderRecord } from '@/lib/publicKitchenMenuOrderHistory';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatOrderDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(i18n.language === 'ar' ? 'ar' : i18n.language === 'en' ? 'en-GB' : 'tr-TR');
  } catch {
    return iso;
  }
}

export function buildKitchenMenuReceiptText(order: KitchenMenuOrderRecord, orgName: string): string {
  const lines = [
    `${orgName}`,
    `${i18n.t('publicKitchenMenuReceiptTitle')} #${order.id.slice(0, 8).toUpperCase()}`,
    formatOrderDate(order.paid_at || order.created_at),
    '',
  ];
  for (const item of order.items) {
    lines.push(`${item.item_name} x${item.quantity} — ${formatMenuPrice(item.line_total)}`);
  }
  lines.push('', `${i18n.t('publicKitchenMenuCartTotal')}: ${formatMenuPrice(order.total_amount)}`);
  if (order.room_number) lines.push(`${i18n.t('publicKitchenMenuRoomNumber')}: ${order.room_number}`);
  if (order.table_number) lines.push(`${i18n.t('publicKitchenMenuTableNumber')}: ${order.table_number}`);
  if (order.delivery_address) lines.push(`${i18n.t('publicKitchenMenuDeliveryAddress')}: ${order.delivery_address}`);
  return lines.join('\n');
}

export function buildKitchenMenuReceiptHtml(order: KitchenMenuOrderRecord, orgName: string): string {
  const rows = order.items
    .map(
      (item) =>
        `<tr><td>${esc(item.item_name)}</td><td class="qty">${item.quantity}</td><td class="money">${esc(formatMenuPrice(item.line_total))}</td></tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #0f172a; padding: 28px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sub { color: #64748b; font-size: 12px; margin-bottom: 18px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { border-bottom: 1px solid #e2e8f0; padding: 8px 4px; text-align: left; }
  th { font-size: 11px; text-transform: uppercase; color: #64748b; }
  .qty { width: 48px; text-align: center; }
  .money { text-align: right; white-space: nowrap; }
  .total { margin-top: 14px; font-size: 16px; font-weight: 700; text-align: right; }
  .meta { margin-top: 16px; font-size: 12px; color: #475569; line-height: 1.5; }
</style></head><body>
  <h1>${esc(orgName)}</h1>
  <div class="sub">${esc(i18n.t('publicKitchenMenuReceiptTitle'))} · ${esc(formatOrderDate(order.paid_at || order.created_at))}</div>
  <table>
    <thead><tr><th>${esc(i18n.t('publicKitchenMenuReceiptItem'))}</th><th>${esc(i18n.t('publicKitchenMenuReceiptQty'))}</th><th>${esc(i18n.t('publicKitchenMenuReceiptAmount'))}</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="total">${esc(i18n.t('publicKitchenMenuCartTotal'))}: ${esc(formatMenuPrice(order.total_amount))}</div>
  <div class="meta">
    ${order.room_number ? `<div>${esc(i18n.t('publicKitchenMenuRoomNumber'))}: ${esc(order.room_number)}</div>` : ''}
    ${order.table_number ? `<div>${esc(i18n.t('publicKitchenMenuTableNumber'))}: ${esc(order.table_number)}</div>` : ''}
    ${order.delivery_address ? `<div>${esc(i18n.t('publicKitchenMenuDeliveryAddress'))}: ${esc(order.delivery_address)}</div>` : ''}
  </div>
</body></html>`;
}

export async function exportKitchenMenuOrderPdf(
  order: KitchenMenuOrderRecord,
  orgName: string
): Promise<{ uri: string }> {
  const html = buildKitchenMenuReceiptHtml(order, orgName);
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  return { uri };
}

export async function shareKitchenMenuOrderPdf(order: KitchenMenuOrderRecord, orgName: string): Promise<void> {
  const { uri } = await exportKitchenMenuOrderPdf(order, orgName);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
      dialogTitle: i18n.t('publicKitchenMenuReceiptShare'),
    });
    return;
  }
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const a = document.createElement('a');
    a.href = uri;
    a.download = `siparis-${order.id.slice(0, 8)}.pdf`;
    a.click();
  }
}

export function sendKitchenMenuReceiptEmail(order: KitchenMenuOrderRecord, orgName: string, email?: string | null): void {
  const to = (email || order.customer_email || '').trim();
  if (!to) return;
  const subject = encodeURIComponent(`${orgName} — ${i18n.t('publicKitchenMenuReceiptTitle')}`);
  const body = encodeURIComponent(buildKitchenMenuReceiptText(order, orgName));
  void Linking.openURL(`mailto:${to}?subject=${subject}&body=${body}`);
}
