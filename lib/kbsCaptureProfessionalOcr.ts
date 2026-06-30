import {
  parseKbsFromDocumentOcr,
  parseIdCardImageUriWithFallback,
  type KbsCaptureSide,
  type KbsOcrOptions,
  type KbsOcrResult,
} from '@/lib/kbsCaptureOcr';
import { buildKbsCopyFields, listCoreMissingIdFields, listMissingIdFields } from '@/lib/kbsCaptureParsedFields';
import { prepareProfessionalKbsOcrUriCached } from '@/lib/kbsOcrSessionCache';
import { MRZ_OCR_ENGINE_VISION_MLKIT } from '@/lib/scanner/mrzOcrEngine';
import { ocrLinesForKbsDocument } from '@/lib/scanner/mrzDocumentOcr';
import type { ParsedDocument } from '@/lib/scanner/types';

export { type KbsOcrResult };

const STRONG_SCORE = 42;
const WEAK_SCORE = 28;

function pickOcrEngine(...engines: string[]): string {
  return engines.some((e) => e === MRZ_OCR_ENGINE_VISION_MLKIT)
    ? MRZ_OCR_ENGINE_VISION_MLKIT
    : engines[0] ?? MRZ_OCR_ENGINE_VISION_MLKIT;
}

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

function isGoodEnough(result: KbsOcrResult, galleryDeep: boolean): boolean {
  if (galleryDeep) return false;
  const missing = listCoreMissingIdFields(result.parsed).length;
  if (missing === 0) return true;
  if (shouldApplyKbsOcrResult(result)) return true;
  if (missing <= 1 && result.parsed.rawMrz) return true;
  return hasKbsOcrApplyableData(result) && missing <= 1;
}

/** Tek OCR taraması — ön yüz + MRZ parse aynı satırlardan (tekrar OCR yok). */
async function parseFromOcrBatch(
  prepared: string,
  opts: { fast: boolean; galleryDeep: boolean; side: KbsCaptureSide }
): Promise<KbsOcrResult> {
  const docOcr = await ocrLinesForKbsDocument(prepared, {
    fast: opts.fast,
    imagePrepared: true,
    mrzFocused: opts.side === 'mrz_back',
  });
  const engine = pickOcrEngine(docOcr.engine);
  const front = parseKbsFromDocumentOcr({
    lineSets: docOcr.lineSets,
    engine,
    mrzFocused: false,
  });
  const mrz = parseKbsFromDocumentOcr({
    lineSets: docOcr.lineSets,
    engine,
    mrzFocused: true,
  });
  return pickBetterKbsOcrResult(front, mrz);
}

/**
 * Hızlı kimlik okuma — tek paralel OCR, ön+MRZ birleşik parse; yetersizse bir yavaş geçiş.
 */
export async function parseIdCardImageUriProfessional(
  uri: string,
  options?: KbsOcrOptions
): Promise<KbsOcrResult> {
  const side = options?.captureSide ?? 'front';
  const galleryDeep = options?.galleryDeep === true;
  const prepared = options?.imagePrepared ? uri : await prepareProfessionalKbsOcrUriCached(uri);
  const wantFast = !galleryDeep && options?.fast !== false;

  let best = await parseFromOcrBatch(prepared, { fast: wantFast, galleryDeep, side });
  if (isGoodEnough(best, galleryDeep)) return best;

  if (wantFast) {
    const slow = await parseFromOcrBatch(prepared, { fast: false, galleryDeep, side });
    best = pickBetterKbsOcrResult(best, slow);
    if (isGoodEnough(best, galleryDeep)) return best;
  }

  if (!galleryDeep && hasKbsOcrApplyableData(best)) return best;

  const fallback = await parseIdCardImageUriWithFallback(prepared, {
    captureSide: side,
    fast: false,
    galleryDeep,
    imagePrepared: true,
  });
  return pickBetterKbsOcrResult(best, fallback);
}

/**
 * Sisteme yüklenen belgeler — hızlı profesyonel okuma, gerekirse derin tarama.
 */
export async function parseIdCardImageUriForUpload(
  uri: string,
  options?: Pick<KbsOcrOptions, 'captureSide' | 'galleryDeep'>
): Promise<KbsOcrResult> {
  const side = options?.captureSide ?? 'front';
  const prepared = await prepareProfessionalKbsOcrUriCached(uri);
  const baseOpts: KbsOcrOptions = { captureSide: side, imagePrepared: true, fast: true };

  const best = await parseIdCardImageUriProfessional(prepared, baseOpts);
  if (shouldApplyKbsOcrResult(best)) return best;
  if (hasKbsOcrApplyableData(best) && listCoreMissingIdFields(best.parsed).length <= 1) return best;

  const refined = await parseIdCardImageUriProfessional(prepared, {
    ...baseOpts,
    fast: false,
    galleryDeep: options?.galleryDeep,
  });
  if (shouldApplyKbsOcrResult(refined) || hasKbsOcrApplyableData(refined)) {
    return pickBetterKbsOcrResult(best, refined);
  }

  const { parseIdCardImageUriMaximum } = await import('@/lib/kbsCaptureGalleryDeepOcr');
  return parseIdCardImageUriMaximum(prepared, { captureSide: side });
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
