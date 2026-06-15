import { Alert, Platform, Share, TurboModuleRegistry } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { formatDateShort } from '@/lib/date';
import { log } from '@/lib/logger';

/** WhatsApp / yazıcı çıktısı için fiş boyutu (tam çözünürlük yerine) */
const WHATSAPP_RECEIPT_MAX_WIDTH = 640;
const WHATSAPP_RECEIPT_JPEG_QUALITY = 0.74;
const PDF_RECEIPT_DISPLAY_WIDTH_PX = 220;

export type StaffExpenseShareRecord = {
  id: string;
  amount: number;
  description: string | null;
  receipt_image_url: string | null;
  status: string;
  expense_date: string;
  expense_time: string | null;
  created_at?: string;
  staff: { full_name: string | null; department: string | null } | null;
  category: { name: string } | null;
};

function fmtMoney(n: number): string {
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' ₺';
}

function formatTimeOnly(t: string | null): string {
  if (!t) return '—';
  const parts = String(t).split(':');
  return parts.length >= 2 ? `${parts[0]}:${parts[1]}` : t;
}

function statusLabel(s: string): string {
  return s === 'approved' ? 'Onaylı' : s === 'rejected' ? 'Reddedilen' : 'Beklemede';
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function ensureFileUri(uri: string): string {
  return uri.startsWith('file://') ? uri : `file://${uri}`;
}

export function buildStaffExpenseShareCaption(expense: StaffExpenseShareRecord): string {
  const lines = [
    '💳 Personel Harcaması',
    `Tutar: ${fmtMoney(Number(expense.amount) || 0)}`,
    `Tarih: ${formatDateShort(expense.expense_date)} · ${formatTimeOnly(expense.expense_time)}`,
    expense.staff?.full_name ? `Personel: ${expense.staff.full_name}${expense.staff.department ? ` · ${expense.staff.department}` : ''}` : null,
    `Kategori: ${expense.category?.name ?? '—'}`,
    `Durum: ${statusLabel(expense.status)}`,
    expense.description?.trim() ? `Açıklama: ${expense.description.trim()}` : null,
  ].filter(Boolean);
  return lines.join('\n');
}

async function downloadReceiptLocal(url: string, cacheKey: string): Promise<string | null> {
  try {
    const ext = url.split('?')[0]?.split('.').pop()?.toLowerCase();
    const suffix = ext === 'png' ? 'png' : ext === 'webp' ? 'webp' : 'jpg';
    const local = `${FileSystem.cacheDirectory ?? ''}exp-share-${cacheKey}.${suffix}`;
    const dl = await FileSystem.downloadAsync(url, local);
    return dl.status === 200 ? dl.uri : null;
  } catch (e) {
    log.warn('staffExpenseShare', 'download receipt', e);
    return null;
  }
}

async function compressReceiptForShare(localUri: string): Promise<string> {
  try {
    const out = await ImageManipulator.manipulateAsync(
      localUri,
      [{ resize: { width: WHATSAPP_RECEIPT_MAX_WIDTH } }],
      { compress: WHATSAPP_RECEIPT_JPEG_QUALITY, format: ImageManipulator.SaveFormat.JPEG }
    );
    return out?.uri ?? localUri;
  } catch (e) {
    log.warn('staffExpenseShare', 'compress receipt', e);
    return localUri;
  }
}

/** İndir + küçült — WhatsApp ve PDF paylaşımı için tek kaynak */
async function prepareReceiptForShare(url: string, cacheKey: string): Promise<string | null> {
  const downloaded = await downloadReceiptLocal(url, cacheKey);
  if (!downloaded) return null;
  return compressReceiptForShare(downloaded);
}

async function receiptAsDataUri(localUri: string): Promise<string | null> {
  try {
    const base64 = await FileSystem.readAsStringAsync(localUri, { encoding: FileSystem.EncodingType.Base64 });
    return `data:image/jpeg;base64,${base64}`;
  } catch (e) {
    log.warn('staffExpenseShare', 'receipt base64', e);
    return null;
  }
}

async function buildReceiptHtml(expense: StaffExpenseShareRecord): Promise<string> {
  const url = expense.receipt_image_url?.trim();
  if (!url) return '';
  const local = await prepareReceiptForShare(url, `${expense.id}-pdf`);
  if (!local) return `<p class="muted">Fiş görseli PDF'e eklenemedi.</p>`;
  const dataUri = await receiptAsDataUri(local);
  if (dataUri) {
    return `<div class="receipt"><img src="${dataUri}" alt="fiş"/></div>`;
  }
  return `<p class="muted">Fiş görseli PDF'e eklenemedi.</p>`;
}

export async function buildStaffExpenseSharePdfHtml(expense: StaffExpenseShareRecord): Promise<string> {
  const caption = buildStaffExpenseShareCaption(expense);
  const receiptHtml = await buildReceiptHtml(expense);
  const personName = expense.staff?.full_name ?? '—';
  const personDept = expense.staff?.department ?? '';

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8"/>
  <title>Harcama — ${escapeHtml(personName)}</title>
  <style>
    @page { size: A4 portrait; margin: 14mm; }
    body { font-family: system-ui, -apple-system, sans-serif; font-size: 11pt; color: #0f172a; line-height: 1.5; }
    h1 { font-size: 18pt; margin: 0 0 8px; color: #0d9488; }
    .meta { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 14px; margin-bottom: 14px; }
    .meta p { margin: 0 0 4px; }
    .caption { white-space: pre-wrap; margin-bottom: 16px; background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 12px 14px; }
    .receipt { margin-top: 12px; page-break-inside: avoid; text-align: center; }
    .receipt img {
      width: ${PDF_RECEIPT_DISPLAY_WIDTH_PX}px;
      max-width: 48%;
      height: auto;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
    }
    .muted { color: #64748b; font-size: 9pt; }
    .footer { margin-top: 20px; padding-top: 8px; border-top: 1px solid #e2e8f0; font-size: 8pt; color: #94a3b8; text-align: center; }
  </style>
</head>
<body>
  <h1>Harcama Bildirimi</h1>
  <div class="meta">
    <p><strong>Personel:</strong> ${escapeHtml(personName)}${personDept ? ` · ${escapeHtml(personDept)}` : ''}</p>
    <p><strong>Tutar:</strong> ${escapeHtml(fmtMoney(Number(expense.amount) || 0))}</p>
    <p><strong>Tarih:</strong> ${escapeHtml(formatDateShort(expense.expense_date))} · ${escapeHtml(formatTimeOnly(expense.expense_time))}</p>
    <p><strong>Kategori:</strong> ${escapeHtml(expense.category?.name ?? '—')}</p>
    <p><strong>Durum:</strong> ${escapeHtml(statusLabel(expense.status))}</p>
    ${expense.description?.trim() ? `<p><strong>Açıklama:</strong> ${escapeHtml(expense.description.trim())}</p>` : ''}
  </div>
  <div class="caption">${escapeHtml(caption)}</div>
  ${receiptHtml}
  <div class="footer">VALORİA HOTEL · ${escapeHtml(new Date().toLocaleString('tr-TR'))}</div>
</body>
</html>`;
}

async function createStaffExpenseSharePdf(expense: StaffExpenseShareRecord): Promise<{ uri: string; fileName: string }> {
  const html = await buildStaffExpenseSharePdfHtml(expense);
  const file = await Print.printToFileAsync({ html, base64: false });
  const fileName = `harcama-${expense.id.slice(0, 8)}.pdf`;
  return { uri: file.uri, fileName };
}

async function tryShareWithRNShare(
  options: Record<string, unknown>,
  whatsappOnly: boolean
): Promise<boolean> {
  if (Platform.OS === 'web' || !TurboModuleRegistry.get('RNShare')) return false;
  try {
    const RNShare = require('react-native-share').default as {
      open: (opts: Record<string, unknown>) => Promise<unknown>;
      Social: { WHATSAPP: string };
    };
    const payload = { ...options, failOnCancel: false };
    if (whatsappOnly) payload.social = RNShare.Social.WHATSAPP;
    await RNShare.open(payload);
    return true;
  } catch (e) {
    const msg = String((e as Error)?.message ?? e ?? '');
    if (/cancel|did not share|User did not/i.test(msg)) return true;
    log.warn('staffExpenseShare', 'RNShare.open', e);
    return false;
  }
}

async function tryShareReceiptImageWhatsApp(
  localUri: string,
  caption: string,
  subject: string
): Promise<boolean> {
  return tryShareWithRNShare(
    {
      title: subject,
      subject,
      message: caption,
      url: ensureFileUri(localUri),
      type: 'image/jpeg',
    },
    true
  );
}

async function trySharePdfWhatsApp(uri: string, caption: string, fileName: string): Promise<boolean> {
  return tryShareWithRNShare(
    {
      title: 'Harcama Bildirimi',
      subject: fileName,
      message: caption,
      url: ensureFileUri(uri),
      type: 'application/pdf',
    },
    true
  );
}

export async function shareStaffExpenseWhatsApp(expense: StaffExpenseShareRecord): Promise<void> {
  const caption = buildStaffExpenseShareCaption(expense);
  const subject = `Harcama — ${expense.staff?.full_name ?? 'Personel'}`;

  const receiptUrl = expense.receipt_image_url?.trim();
  if (receiptUrl) {
    const localUri = await prepareReceiptForShare(receiptUrl, expense.id);
    if (localUri && (await tryShareReceiptImageWhatsApp(localUri, caption, subject))) {
      return;
    }
  }

  try {
    const { uri, fileName } = await createStaffExpenseSharePdf(expense);
    if (await trySharePdfWhatsApp(uri, caption, fileName)) return;

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: 'WhatsApp — Harcama',
        UTI: 'com.adobe.pdf',
      });
      return;
    }
  } catch (e) {
    log.warn('staffExpenseShare', 'pdf share', e);
  }

  if (caption.trim()) {
    await Share.share({ message: caption, title: subject });
    return;
  }

  Alert.alert('WhatsApp', 'Bu cihazda paylaşım desteklenmiyor.');
}
