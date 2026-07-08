import * as FileSystem from 'expo-file-system/legacy';
import type { KbsCapturedDocumentRow } from '@/lib/kbsCaptureHistory';
import {
  applyKbsCaptureOcrCorrection,
  markKbsCaptureOcrState,
} from '@/lib/kbsCaptureHistory';
import { parseIdCardImageUriGalleryDeep } from '@/lib/kbsCaptureGalleryDeepOcr';
import { parseKbsCaptureSideFromWarnings } from '@/lib/kbsCaptureSideMeta';
import { listCoreMissingIdFields, normalizeKbsParsedPayload } from '@/lib/kbsCaptureParsedFields';
import { sanitizeKbsOcrForApply } from '@/lib/kbsCaptureOcrMerge';
import { applyBestPassportNamesToParsed } from '@/lib/kbsPassportNameResolve';
import { prepareProfessionalKbsOcrUri } from '@/lib/kbsOcrImageEnhance';
import type { ParsedDocument } from '@/lib/scanner/types';

async function downloadForCorrection(url: string, docId: string): Promise<string> {
  const local = `${FileSystem.cacheDirectory ?? ''}kbs-fix-${docId}.jpg`;
  const res = await FileSystem.downloadAsync(url, local);
  return res.uri;
}

function buildCorrectionParsed(existing: ParsedDocument, ocrParsed: ParsedDocument, lines: string[]): ParsedDocument {
  let next = sanitizeKbsOcrForApply(ocrParsed);
  next = applyBestPassportNamesToParsed(next, lines);
  return next;
}

/**
 * Yanlış okunan pasaport/kimlik — tam belge taraması + ad/soyad düzeltmesi.
 * Yalnızca kullanıcı "Düzelt" dediğinde çalışır.
 */
export async function correctKbsCapturedDocument(
  row: KbsCapturedDocumentRow,
  opts?: { localUri?: string | null }
): Promise<{ ok: true; coreComplete: boolean } | { ok: false; message: string }> {
  const url = row.front_image_url?.trim();
  if (!url) return { ok: false, message: 'Görsel bulunamadı' };
  if (!row.guest_id) return { ok: false, message: 'Misafir kaydı yok' };

  await markKbsCaptureOcrState(row.id, 'processing');

  try {
    let local = opts?.localUri?.trim() || '';
    if (local) {
      const info = await FileSystem.getInfoAsync(local);
      if (!info.exists) local = '';
    }
    if (!local) {
      local = await downloadForCorrection(url, row.id);
    }

    const prepared = await prepareProfessionalKbsOcrUri(local);
    const warnings = (row.parsed_payload as ParsedDocument | null)?.warnings;
    const captureSide = parseKbsCaptureSideFromWarnings(warnings);

    const ocr = await parseIdCardImageUriGalleryDeep(prepared, { captureSide });
    const allLines = ocr.parsed.rawMrz
      ? ocr.parsed.rawMrz.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean)
      : [];
    const existing = normalizeKbsParsedPayload(row.parsed_payload) ?? ocr.parsed;
    const corrected = buildCorrectionParsed(existing, ocr.parsed, allLines);

    const res = await applyKbsCaptureOcrCorrection(
      row.id,
      row.guest_id,
      corrected,
      corrected.confidence ?? ocr.parsed.confidence,
      ocr.engine
    );
    if (!res.ok) {
      await markKbsCaptureOcrState(row.id, 'failed');
      return res;
    }

    const coreComplete = listCoreMissingIdFields(corrected).length === 0;
    if (!coreComplete) {
      await markKbsCaptureOcrState(row.id, 'failed');
    }

    return { ok: true, coreComplete };
  } catch (e) {
    await markKbsCaptureOcrState(row.id, 'failed');
    return { ok: false, message: e instanceof Error ? e.message : 'Düzeltme başarısız' };
  }
}
