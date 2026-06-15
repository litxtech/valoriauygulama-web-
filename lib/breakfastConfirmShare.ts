import { Alert, Platform, Share, TurboModuleRegistry } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { supabase } from '@/lib/supabase';
import { sendPdfToPrinterEmail } from '@/lib/printerEmail';
import { notifyGuestsOfNewFeedPost, notifyStaffOfNewFeedPost } from '@/lib/notifyNewFeedPost';
import { log } from '@/lib/logger';

export type BreakfastShareRecord = {
  id: string;
  record_date: string;
  guest_count: number;
  note: string | null;
  photo_urls: string[];
  approved_at: string | null;
  rejected_at: string | null;
  rejection_reason?: string | null;
  staff?: { full_name: string | null; department?: string | null } | null;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatTrDate(value: string): string {
  try {
    return new Intl.DateTimeFormat('tr-TR', {
      timeZone: 'Europe/Istanbul',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(value.includes('T') ? value : `${value}T12:00:00`));
  } catch {
    return value;
  }
}

export function buildDefaultBreakfastShareCaption(record: BreakfastShareRecord): string {
  const lines = [
    `☕ Kahvaltı Teyidi — ${formatTrDate(record.record_date)}`,
    record.staff?.full_name ? `Personel: ${record.staff.full_name}` : null,
    `Misafir sayısı: ${record.guest_count}`,
    record.note?.trim() ? `Not: ${record.note.trim()}` : null,
  ].filter(Boolean);
  return lines.join('\n');
}

async function downloadImageAsDataUri(url: string, cacheKey: string): Promise<string | null> {
  try {
    const ext = url.split('?')[0]?.split('.').pop()?.toLowerCase();
    const suffix = ext === 'png' ? 'png' : ext === 'webp' ? 'webp' : 'jpg';
    const local = `${FileSystem.cacheDirectory ?? ''}bf-share-${cacheKey}.${suffix}`;
    const dl = await FileSystem.downloadAsync(url, local);
    if (dl.status !== 200) return null;
    const base64 = await FileSystem.readAsStringAsync(dl.uri, { encoding: FileSystem.EncodingType.Base64 });
    const mime = suffix === 'png' ? 'image/png' : suffix === 'webp' ? 'image/webp' : 'image/jpeg';
    return `data:${mime};base64,${base64}`;
  } catch (e) {
    log.warn('breakfastConfirmShare', 'image download', e);
    return null;
  }
}

async function buildPhotoHtml(photoUrls: string[], recordId: string): Promise<string> {
  const urls = (photoUrls ?? []).filter(Boolean).slice(0, 6);
  if (!urls.length) return '';
  const dataUris = await Promise.all(urls.map((u, i) => downloadImageAsDataUri(u, `${recordId}-${i}`)));
  const imgs = dataUris
    .filter(Boolean)
    .map(
      (src) =>
        `<div class="photo"><img src="${src}" alt="kahvaltı"/></div>`
    )
    .join('');
  if (!imgs) {
    return `<p class="muted">Fotoğraflar PDF'e eklenemedi; bağlantılar: ${urls.map((u) => escapeHtml(u)).join('<br/>')}</p>`;
  }
  return `<div class="photos">${imgs}</div>`;
}

export async function buildBreakfastConfirmPdfHtml(
  record: BreakfastShareRecord,
  caption?: string
): Promise<string> {
  const text = (caption ?? buildDefaultBreakfastShareCaption(record)).trim();
  const photosHtml = await buildPhotoHtml(record.photo_urls ?? [], record.id);

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8"/>
  <title>Kahvaltı Teyidi — ${escapeHtml(record.record_date)}</title>
  <style>
    @page { size: A4 portrait; margin: 14mm; }
    body { font-family: system-ui, -apple-system, sans-serif; font-size: 11pt; color: #0f172a; line-height: 1.5; }
    h1 { font-size: 18pt; margin: 0 0 8px; }
    .meta { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 14px; margin-bottom: 14px; }
    .meta p { margin: 0 0 4px; }
    .caption { white-space: pre-wrap; margin-bottom: 16px; }
    .photos { display: flex; flex-wrap: wrap; gap: 10px; }
    .photo { width: calc(50% - 5px); page-break-inside: avoid; }
    .photo img { width: 100%; height: auto; border-radius: 8px; border: 1px solid #e2e8f0; }
    .muted { color: #64748b; font-size: 9pt; }
    .footer { margin-top: 20px; padding-top: 8px; border-top: 1px solid #e2e8f0; font-size: 8pt; color: #94a3b8; text-align: center; }
  </style>
</head>
<body>
  <h1>Kahvaltı Teyit Kaydı</h1>
  <div class="meta">
    <p><strong>Tarih:</strong> ${escapeHtml(formatTrDate(record.record_date))}</p>
    <p><strong>Personel:</strong> ${escapeHtml(record.staff?.full_name ?? '—')}</p>
    <p><strong>Misafir sayısı:</strong> ${record.guest_count}</p>
    ${record.note?.trim() ? `<p><strong>Not:</strong> ${escapeHtml(record.note.trim())}</p>` : ''}
  </div>
  ${text ? `<div class="caption">${escapeHtml(text)}</div>` : ''}
  ${photosHtml}
  <div class="footer">Valoria · ${escapeHtml(new Date().toLocaleString('tr-TR'))}</div>
</body>
</html>`;
}

async function createBreakfastPdf(record: BreakfastShareRecord, caption?: string): Promise<{ uri: string; fileName: string }> {
  const html = await buildBreakfastConfirmPdfHtml(record, caption);
  const file = await Print.printToFileAsync({ html, base64: false });
  const fileName = `kahvalti-teyit-${record.record_date}.pdf`;
  return { uri: file.uri, fileName };
}

export async function downloadBreakfastPhotoLocal(url: string, cacheKey: string): Promise<string | null> {
  try {
    const ext = url.split('?')[0]?.split('.').pop()?.toLowerCase();
    const suffix = ext === 'png' ? 'png' : ext === 'webp' ? 'webp' : 'jpg';
    const local = `${FileSystem.cacheDirectory ?? ''}bf-share-${cacheKey}.${suffix}`;
    const dl = await FileSystem.downloadAsync(url, local);
    return dl.status === 200 ? dl.uri : null;
  } catch (e) {
    log.warn('breakfastConfirmShare', 'download photo', e);
    return null;
  }
}

function ensureFileUri(uri: string): string {
  return uri.startsWith('file://') ? uri : `file://${uri}`;
}

function mimeForLocalImage(uri: string): string {
  const ext = uri.split('?')[0]?.split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}

async function trySharePhotosWithRNShare(
  localUris: string[],
  text: string,
  subject: string
): Promise<boolean> {
  if (Platform.OS === 'web' || !TurboModuleRegistry.get('RNShare')) {
    return false;
  }

  try {
    const RNShare = require('react-native-share').default as {
      open: (options: {
        title: string;
        subject: string;
        message: string;
        urls: string[];
        failOnCancel: boolean;
      }) => Promise<unknown>;
    };
    await RNShare.open({
      title: subject,
      subject,
      message: text,
      urls: localUris.map(ensureFileUri),
      failOnCancel: false,
    });
    return true;
  } catch (e) {
    const msg = String((e as Error)?.message ?? e ?? '');
    if (/cancel|did not share|User did not/i.test(msg)) return true;
    log.warn('breakfastConfirmShare', 'RNShare.open', e);
    return false;
  }
}

async function shareBreakfastPhotosViaNativeSheet(
  localUris: string[],
  text: string,
  subject: string
): Promise<void> {
  if (Platform.OS === 'web') {
    if (text.trim()) await Share.share({ message: text, title: subject });
    for (const local of localUris) {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(local, { mimeType: mimeForLocalImage(local), dialogTitle: subject });
      }
    }
    return;
  }

  if (await trySharePhotosWithRNShare(localUris, text, subject)) {
    return;
  }

  if (text.trim()) {
    await Share.share({ message: text, title: subject });
  }
  for (const local of localUris) {
    if (!(await Sharing.isAvailableAsync())) break;
    await Sharing.shareAsync(local, {
      mimeType: mimeForLocalImage(local),
      dialogTitle: subject,
    });
  }
}

export async function shareBreakfastConfirmationExternally(
  record: BreakfastShareRecord,
  caption?: string
): Promise<void> {
  const text = (caption ?? buildDefaultBreakfastShareCaption(record)).trim();
  const subject = `Kahvaltı Teyidi — ${formatTrDate(record.record_date)}`;
  const photoUrls = (record.photo_urls ?? []).filter(Boolean);

  if (photoUrls.length > 0) {
    const locals = (
      await Promise.all(photoUrls.map((url, i) => downloadBreakfastPhotoLocal(url, `${record.id}-${i}`)))
    ).filter(Boolean) as string[];

    if (locals.length > 0) {
      await shareBreakfastPhotosViaNativeSheet(locals, text, subject);
      return;
    }
  }

  if (text) {
    await Share.share({ message: text, title: subject });
    return;
  }

  const { uri } = await createBreakfastPdf(record, caption);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: subject });
  } else {
    Alert.alert('PDF hazır', uri);
  }
}

export async function exportBreakfastConfirmation(
  record: BreakfastShareRecord,
  action: 'share' | 'print' | 'printer',
  caption?: string
): Promise<void> {
  const { uri, fileName } = await createBreakfastPdf(record, caption);
  const subject = `Kahvaltı Teyidi — ${formatTrDate(record.record_date)}`;

  if (action === 'printer') {
    await sendPdfToPrinterEmail({ pdfUri: uri, subject, fileName });
    Alert.alert('Gönderildi', 'Kahvaltı teyit belgesi yazıcı e-postasına iletildi.');
    return;
  }

  if (action === 'print') {
    if (Platform.OS === 'web') {
      const html = await buildBreakfastConfirmPdfHtml(record, caption);
      await Print.printAsync({ html });
    } else {
      await Print.printAsync({ uri });
    }
    return;
  }

  await shareBreakfastConfirmationExternally(record, caption);
}

export async function publishBreakfastConfirmationToFeed(params: {
  record: BreakfastShareRecord;
  staffId: string;
  staffName: string;
  caption: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { record, staffId, staffName, caption } = params;
  const title = caption.trim() || buildDefaultBreakfastShareCaption(record);
  const photoUrls = (record.photo_urls ?? []).filter(Boolean);

  const finalMediaType = photoUrls.length > 0 ? 'image' : 'text';
  const mediaUrl = photoUrls[0] ?? null;
  const thumbnailUrl = photoUrls[0] ?? null;

  const { data: insertedPost, error: insertErr } = await supabase
    .from('feed_posts')
    .insert({
      staff_id: staffId,
      media_type: finalMediaType,
      media_url: mediaUrl,
      thumbnail_url: thumbnailUrl,
      title: title || null,
      visibility: 'customers',
    })
    .select('id')
    .single();

  if (insertErr || !insertedPost?.id) {
    return { ok: false, error: insertErr?.message ?? 'Gönderi kaydedilemedi' };
  }

  const postId = insertedPost.id as string;

  if (photoUrls.length > 1) {
    await supabase.from('feed_post_media_items').insert(
      photoUrls.map((url, i) => ({
        post_id: postId,
        media_type: 'image' as const,
        media_url: url,
        thumbnail_url: url,
        sort_order: i,
      }))
    );
  }

  const titlePreview = title.slice(0, 120) + (title.length > 120 ? '…' : '');

  void (async () => {
    try {
      await notifyStaffOfNewFeedPost({
        postId,
        authorDisplayName: staffName,
        titlePreview,
        excludeStaffId: staffId,
        createdByStaffId: staffId,
      });
      await notifyGuestsOfNewFeedPost(postId);
    } catch (e) {
      log.warn('breakfastConfirmShare', 'feed notifications', e);
    }
  })();

  return { ok: true };
}
