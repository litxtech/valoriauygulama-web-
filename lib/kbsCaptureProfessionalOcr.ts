import {
  parseIdCardImageUriWithFallback,
  type KbsCaptureSide,
  type KbsOcrOptions,
  type KbsOcrResult,
} from '@/lib/kbsCaptureOcr';
import { shouldPreferKbsFrontIdParse } from '@/lib/guestScan/idCardOcrParser';
import { buildKbsCopyFields, listCoreMissingIdFields, listMissingIdFields } from '@/lib/kbsCaptureParsedFields';
import { cropImageForKbsOcr, cropMrzBandForKbsOcr } from '@/lib/kbsOcrDocumentFocus';
import { prepareProfessionalKbsOcrUri } from '@/lib/kbsOcrImageEnhance';
import type { ParsedDocument } from '@/lib/scanner/types';

export { type KbsOcrResult };

const STRONG_SCORE = 42;
const WEAK_SCORE = 28;

/** OCR sonucu kalite puanı — en iyi geçiş seçimi. */
export function kbsOcrQualityScore(result: KbsOcrResult): number {
  const p = result.parsed;
  let s = (p.confidence ?? 0) * 45;
  if (p.rawMrz) s += 28;
  if (p.checksumsValid === true) s += 22;
  if (p.checksumsValid === false) s -= 12;
  if (p.documentNumber?.replace(/\D/g, '').length >= 6) s += 12;
  if (p.firstName && p.lastName) s += 10;
  if (p.birthDate) s += 8;
  if (p.expiryDate) s += 8;
  if (p.nationalityCode) s += 5;
  if (p.gender) s += 3;
  s -= listCoreMissingIdFields(p).length * 6;
  return s;
}

export function pickBetterKbsOcrResult(a: KbsOcrResult, b: KbsOcrResult): KbsOcrResult {
  return kbsOcrQualityScore(b) > kbsOcrQualityScore(a) ? b : a;
}

function altCaptureSide(side: KbsCaptureSide): KbsCaptureSide {
  return side === 'mrz_back' ? 'front' : 'mrz_back';
}

async function parseFast(uri: string, side: KbsCaptureSide, galleryDeep?: boolean): Promise<KbsOcrResult> {
  const prepared = await prepareProfessionalKbsOcrUri(uri);
  return parseIdCardImageUriWithFallback(prepared, {
    captureSide: side,
    fast: galleryDeep ? false : true,
    galleryDeep,
  });
}

/**
 * Hızlı kimlik okuma — önce tek geçiş, eksik alan varsa hedefli 1–2 ek geçiş.
 * galleryDeep: galeri seçimi — tüm geçişler, erken çıkış yok.
 */
export async function parseIdCardImageUriProfessional(
  uri: string,
  options?: KbsOcrOptions
): Promise<KbsOcrResult> {
  const side = options?.captureSide ?? 'front';
  const galleryDeep = options?.galleryDeep === true;
  const prepared = await prepareProfessionalKbsOcrUri(uri);

  let best = await parseFast(prepared, side, galleryDeep);
  if (!galleryDeep && listCoreMissingIdFields(best.parsed).length === 0) return best;

  const alt = await parseFast(prepared, altCaptureSide(side), galleryDeep);
  best = pickBetterKbsOcrResult(best, alt);
  if (!galleryDeep && listCoreMissingIdFields(best.parsed).length <= 1) return best;

  try {
    const docUri = await cropImageForKbsOcr(prepared);
    const docPass = await parseFast(docUri, side, galleryDeep);
    best = pickBetterKbsOcrResult(best, docPass);
    if (!galleryDeep && listCoreMissingIdFields(best.parsed).length <= 1) return best;

    const missing = listCoreMissingIdFields(best.parsed);
    const strongTcFront = side === 'front' && shouldPreferKbsFrontIdParse(best.parsed);
    const needsMrz =
      !strongTcFront &&
      (galleryDeep ||
        missing.length > 0 ||
        best.parsed.documentType === 'passport' ||
        !best.parsed.rawMrz);
    if (needsMrz) {
      const bandUri = await cropMrzBandForKbsOcr(prepared);
      const mrzPass = await parseFast(bandUri, 'mrz_back', galleryDeep);
      best = pickBetterKbsOcrResult(best, mrzPass);
    }
  } catch {
    /* ilk geçiş sonucu yeterli olabilir */
  }

  return best;
}

/** Kayda yazılacak anlamlı OCR verisi var mı (kısmi sonuç dahil). */
export function hasKbsOcrApplyableData(result: KbsOcrResult): boolean {
  if (shouldApplyKbsOcrResult(result)) return true;
  if (buildKbsCopyFields(result.parsed).length >= 1) return true;
  const p = result.parsed;
  if (p.rawMrz) return true;
  const docDigits = (p.documentNumber ?? '').replace(/\D/g, '');
  return docDigits.length >= 6;
}

export function shouldApplyKbsOcrResult(result: KbsOcrResult): boolean {
  const p = result.parsed;
  const score = kbsOcrQualityScore(result);
  const coreMissing = listCoreMissingIdFields(p).length;

  if (p.rawMrz && p.checksumsValid === true) return true;
  if (p.rawMrz && p.documentNumber) return score >= WEAK_SCORE - 10;
  if (p.rawMrz && (p.birthDate || p.expiryDate)) return true;
  if (p.documentNumber && (p.firstName || p.lastName)) return score >= WEAK_SCORE - 10;
  if (coreMissing <= 1 && score >= STRONG_SCORE - 16) return true;
  if (coreMissing <= 3 && score >= STRONG_SCORE - 10) return true;
  if (coreMissing <= 4 && buildKbsCopyFields(p).length >= 3) return true;
  return score >= STRONG_SCORE - 4;
}

export function describeKbsOcrOutcome(result: KbsOcrResult): {
  applied: boolean;
  score: number;
  missing: string[];
} {
  const p = result.parsed as ParsedDocument;
  return {
    applied: shouldApplyKbsOcrResult(result),
    score: kbsOcrQualityScore(result),
    missing: listMissingIdFields(p),
  };
}
