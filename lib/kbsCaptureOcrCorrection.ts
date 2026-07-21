import * as FileSystem from 'expo-file-system/legacy';
import type { KbsCapturedDocumentRow } from '@/lib/kbsCaptureHistory';
import {
  applyKbsCaptureOcrCorrection,
  markKbsCaptureOcrState,
} from '@/lib/kbsCaptureHistory';
import { parseIdCardImageUriGalleryDeep } from '@/lib/kbsCaptureGalleryDeepOcr';
import {
  hasKbsOcrApplyableData,
  parseIdCardImageUriProfessional,
} from '@/lib/kbsCaptureProfessionalOcr';
import { parseKbsCaptureSideFromWarnings } from '@/lib/kbsCaptureSideMeta';
import {
  listCoreMissingIdFields,
  withMissingFieldWarnings,
} from '@/lib/kbsCaptureParsedFields';
import { sanitizeKbsOcrForApply } from '@/lib/kbsCaptureOcrMerge';
import { applyBestPassportNamesToParsed } from '@/lib/kbsPassportNameResolve';
import { applyBestPassportIdentityToParsed } from '@/lib/kbsPassportFieldResolve';
import { prepareProfessionalKbsOcrUri } from '@/lib/kbsOcrImageEnhance';
import type { ParsedDocument } from '@/lib/scanner/types';
import type { KbsOcrResult } from '@/lib/kbsCaptureOcr';
import { applyDocumentOcrResultRpc, requestServerOcrFallback } from '@/lib/kbsDocumentOcrJobs';

async function downloadForCorrection(url: string, docId: string): Promise<string> {
  const local = `${FileSystem.cacheDirectory ?? ''}kbs-fix-${docId}.jpg`;
  const res = await FileSystem.downloadAsync(url, local);
  return res.uri;
}

function collectOcrLines(ocr: KbsOcrResult): string[] {
  if (ocr.ocrLines?.length) return ocr.ocrLines;
  if (ocr.parsed.rawMrz) {
    return ocr.parsed.rawMrz.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);
  }
  return [];
}

function buildCorrectionParsed(ocrParsed: ParsedDocument, lines: string[]): ParsedDocument {
  let next = sanitizeKbsOcrForApply(ocrParsed);
  next = applyBestPassportNamesToParsed(next, lines);
  next = applyBestPassportIdentityToParsed(next, lines);
  return next;
}

/**
 * Okunmayan / eksik pasaport-kimlik — hızlı OCR önce; çekirdek hâlâ eksikse derin.
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

    // 1) Hızlı profesyonel (MRZ bandı dahil)
    let ocr = await parseIdCardImageUriProfessional(prepared, {
      captureSide,
      imagePrepared: true,
      fast: true,
    });
    let lines = collectOcrLines(ocr);
    let corrected = buildCorrectionParsed(ocr.parsed, lines);
    let coreMissing = listCoreMissingIdFields(corrected);

    // 2) MRZ yoksa hızlı MRZ odaklı geçiş
    if (coreMissing.length > 0 && !corrected.rawMrz) {
      const mrzFast = await parseIdCardImageUriProfessional(prepared, {
        captureSide: 'mrz_back',
        imagePrepared: true,
        fast: true,
      });
      const mrzLines = collectOcrLines(mrzFast);
      const mrzParsed = buildCorrectionParsed(mrzFast.parsed, mrzLines);
      if (listCoreMissingIdFields(mrzParsed).length < coreMissing.length || mrzParsed.rawMrz) {
        ocr = mrzFast;
        lines = mrzLines;
        corrected = mrzParsed;
        coreMissing = listCoreMissingIdFields(corrected);
      }
    }

    // 3) Hâlâ çekirdek eksik veya zorla derin → Maximum (yalnızca gerekliyse)
    const needDeep =
      opts?.deep === true ||
      (coreMissing.length > 0 && (!corrected.rawMrz || coreMissing.length >= 3));

    if (needDeep && coreMissing.length > 0) {
      const deep = await parseIdCardImageUriGalleryDeep(prepared, { captureSide });
      const deepLines = collectOcrLines(deep);
      const deepParsed = buildCorrectionParsed(deep.parsed, deepLines);
      if (
        listCoreMissingIdFields(deepParsed).length <= coreMissing.length ||
        deepParsed.rawMrz
      ) {
        corrected = deepParsed;
        ocr = deep;
        lines = deepLines;
        coreMissing = listCoreMissingIdFields(corrected);
      }
    }

    const correctedWithScan = withMissingFieldWarnings(corrected);
    const rpc = await applyDocumentOcrResultRpc({
      guestDocumentId: row.id,
      parsed: correctedWithScan,
      scanConfidence: correctedWithScan.confidence ?? ocr.parsed.confidence,
      ocrEngine: ocr.engine,
      outcome: 'auto',
    });

    if (!rpc.ok) {
      const res = await applyKbsCaptureOcrCorrection(
        row.id,
        row.guest_id,
        correctedWithScan,
        correctedWithScan.confidence ?? ocr.parsed.confidence,
        ocr.engine
      );
      if (!res.ok) {
        await markKbsCaptureOcrState(row.id, 'failed');
        return res;
      }
    }

    const coreComplete = coreMissing.length === 0;
    if (!coreComplete) {
      // Eksik alan kaldıysa sunucu OCR dene; gelmezse manuel kontrol
      void requestServerOcrFallback({ guestDocumentId: row.id }).catch(() => null);
      await markKbsCaptureOcrState(
        row.id,
        hasKbsOcrApplyableData(ocr) || coreMissing.length < 4 ? 'partial' : 'manual_review'
      );
    }

    return { ok: true, coreComplete };
  } catch (e) {
    await markKbsCaptureOcrState(row.id, 'failed');
    return { ok: false, message: e instanceof Error ? e.message : 'Düzeltme başarısız' };
  }
}
