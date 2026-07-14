import * as FileSystem from 'expo-file-system/legacy';
import type { KbsCapturedDocumentRow } from '@/lib/kbsCaptureHistory';
import {
  applyKbsCaptureOcrCorrection,
  markKbsCaptureOcrState,
} from '@/lib/kbsCaptureHistory';
import { parseIdCardImageUriGalleryDeep } from '@/lib/kbsCaptureGalleryDeepOcr';
import { parseIdCardImageUriProfessional } from '@/lib/kbsCaptureProfessionalOcr';
import { parseKbsCaptureSideFromWarnings } from '@/lib/kbsCaptureSideMeta';
import {
  listCoreMissingIdFields,
  normalizeKbsParsedPayload,
} from '@/lib/kbsCaptureParsedFields';
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

function collectOcrLines(parsed: ParsedDocument): string[] {
  return parsed.rawMrz
    ? parsed.rawMrz.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean)
    : [];
}

/**
 * Okunmayan / eksik pasaport-kimlik — önce hızlı OCR, çekirdek eksikse derin tarama.
 */
export async function correctKbsCapturedDocument(
  row: KbsCapturedDocumentRow,
  opts?: { localUri?: string | null; deep?: boolean }
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
    const existing = normalizeKbsParsedPayload(row.parsed_payload);

    // 1) Hızlı profesyonel tarama
    let ocr = await parseIdCardImageUriProfessional(prepared, {
      captureSide,
      imagePrepared: true,
      fast: true,
    });
    let lines = collectOcrLines(ocr.parsed);
    let corrected = buildCorrectionParsed(existing ?? ocr.parsed, ocr.parsed, lines);
    let coreMissing = listCoreMissingIdFields(corrected);

    // 2) Eksik çekirdek alan varsa derin tarama
    if (opts?.deep === true || coreMissing.length > 0) {
      const deep = await parseIdCardImageUriGalleryDeep(prepared, { captureSide });
      const deepLines = collectOcrLines(deep.parsed);
      const deepParsed = buildCorrectionParsed(corrected, deep.parsed, deepLines);
      corrected = deepParsed;
      ocr = deep;
      lines = deepLines;
      coreMissing = listCoreMissingIdFields(corrected);
    }

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

    const coreComplete = coreMissing.length === 0;
    if (!coreComplete) {
      await markKbsCaptureOcrState(row.id, 'failed');
    }

    return { ok: true, coreComplete };
  } catch (e) {
    await markKbsCaptureOcrState(row.id, 'failed');
    return { ok: false, message: e instanceof Error ? e.message : 'Düzeltme başarısız' };
  }
}
