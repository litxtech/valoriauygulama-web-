import * as FileSystem from 'expo-file-system/legacy';
import { parsePosReceiptFromText } from '@/lib/posReceiptInvoice/parsePosReceipt';
import { scanPosReceiptDocument } from '@/lib/posReceiptInvoice/scanPosReceipt';
import type { ParsedPosReceipt } from '@/lib/posReceiptInvoice/types';
import { isImageContractUrl } from '@/lib/financeAgreementContract';

function extFromUrl(url: string): string {
  try {
    const path = url.split('?')[0] ?? url;
    const i = path.lastIndexOf('.');
    if (i < 0) return 'jpg';
    const e = path.slice(i + 1).toLowerCase();
    if (['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'gif', 'pdf'].includes(e)) return e;
  } catch {
    /* ignore */
  }
  return 'jpg';
}

async function localUriForStored(url: string): Promise<string> {
  if (
    url.startsWith('file:') ||
    url.startsWith('content:') ||
    url.startsWith('ph://') ||
    url.startsWith('assets-library:')
  ) {
    return url;
  }
  const base = FileSystem.cacheDirectory ?? '';
  const dest = `${base}pos-rescan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extFromUrl(url)}`;
  const dl = await FileSystem.downloadAsync(url, dest);
  if (!dl?.uri) throw new Error('Fiş görseli indirilemedi');
  return dl.uri;
}

/**
 * Kayıtlı görselleri son OCR motoruyla yeniden okur.
 * Birden fazla sayfa varsa metinler birleştirilir.
 */
export async function rescanPosReceiptFromStoredUrls(
  urls: string[]
): Promise<ParsedPosReceipt & { sourceUris: string[] }> {
  const imageUrls = urls.filter((u) => u && (isImageContractUrl(u) || u.startsWith('file:') || u.startsWith('content:') || /^https?:/i.test(u)));
  if (!imageUrls.length) {
    throw new Error('Yeniden okunacak fiş görseli yok');
  }

  const parts: ParsedPosReceipt[] = [];
  const localUris: string[] = [];
  for (const url of imageUrls.slice(0, 4)) {
    const local = await localUriForStored(url);
    localUris.push(local);
    const parsed = await scanPosReceiptDocument(local, `fis.${extFromUrl(url)}`);
    parts.push(parsed);
  }

  if (parts.length === 1) {
    return { ...parts[0], sourceUris: localUris };
  }

  const text = parts.map((p) => p.rawText).filter(Boolean).join('\n');
  const engines = parts.map((p) => p.ocrEngine).filter(Boolean);
  const merged = parsePosReceiptFromText(text, {
    ocrEngine: engines.join('+') || 'rescan',
    sourceKind: 'mixed',
  });
  return { ...merged, sourceUris: localUris };
}

/** Kayıtlı OCR metnini yeni parser ile yeniden işler (görsel indirmeden). */
export function reparsePosReceiptFromStoredText(
  rawText: string,
  opts?: { ocrEngine?: string | null }
): ParsedPosReceipt {
  return parsePosReceiptFromText(rawText, {
    ocrEngine: opts?.ocrEngine ?? 'reparse',
    sourceKind: 'text',
  });
}
