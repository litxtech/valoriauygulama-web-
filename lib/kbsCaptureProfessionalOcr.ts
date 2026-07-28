import {
  parseKbsFromDocumentOcr,
  parseIdCardImageUriWithFallback,
  type KbsCaptureSide,
  type KbsOcrOptions,
  type KbsOcrResult,
} from '@/lib/kbsCaptureOcr';
import { hasPlausibleKbsDocumentNumber } from '@/lib/kbsDocumentNumberValidate';
import { buildKbsCopyFields, listCoreMissingIdFields, listMissingIdFields } from '@/lib/kbsCaptureParsedFields';
import { isMrzChecksumSuspicious } from '@/lib/kbsMrzSuspicion';
import { prepareProfessionalKbsOcrUriCached } from '@/lib/kbsOcrSessionCache';
import { shouldPreferKbsFrontIdParse } from '@/lib/guestScan/idCardOcrParser';
import { isValidTurkishTc } from '@/lib/kbsTcValidation';
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
  if (p.checksumsValid === false) s -= 18;
  if (isMrzChecksumSuspicious(p)) s -= 10;
  if (hasPlausibleKbsDocumentNumber(p.documentNumber, p.documentType)) s += 12;
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

/** A: Şüpheli MRZ ile erken çıkma — yavaş / Maximum geçişe zorla. */
function isGoodEnough(result: KbsOcrResult, galleryDeep: boolean): boolean {
  if (galleryDeep) return false;
  if (isMrzChecksumSuspicious(result.parsed)) return false;
  const missing = listCoreMissingIdFields(result.parsed).length;
  if (missing === 0 && result.parsed.checksumsValid === true) return true;
  if (missing === 0 && !result.parsed.rawMrz && shouldApplyKbsOcrResult(result)) return true;
  if (shouldApplyKbsOcrResult(result) && result.parsed.checksumsValid === true) return true;
  if (missing <= 1 && result.parsed.rawMrz && result.parsed.checksumsValid === true) return true;
  return false;
}

function isTurkishTcDigits(docNumber: string | null | undefined): boolean {
  return isValidTurkishTc((docNumber ?? '').replace(/\D/g, ''));
}

/** Ön yüz / MRZ çekim moduna göre en uygun OCR geçişini seç. */
function pickKbsOcrResultForSide(
  front: KbsOcrResult,
  mrz: KbsOcrResult,
  side: KbsCaptureSide
): KbsOcrResult {
  if (side === 'front') {
    if (shouldPreferKbsFrontIdParse(front.parsed)) return front;
    if (isTurkishTcDigits(front.parsed.documentNumber)) {
      const frontScore = kbsOcrQualityScore(front);
      const mrzScore = kbsOcrQualityScore(mrz);
      if (frontScore >= mrzScore - 18) return front;
    }
    return pickBetterKbsOcrResult(front, mrz);
  }
  if (side === 'mrz_back') {
    if (mrz.parsed.rawMrz || hasKbsOcrApplyableData(mrz)) {
      return pickBetterKbsOcrResult(mrz, front);
    }
  }
  return pickBetterKbsOcrResult(front, mrz);
}

/** Tek OCR — MRZ band öncelikli; aynı satırlardan ön yüz + MRZ parse (yükleme hızlı yolu). */
async function parseUploadOcrBatch(
  prepared: string,
  opts: { fast: boolean; side: KbsCaptureSide }
): Promise<KbsOcrResult> {
  const docOcr = await ocrLinesForKbsDocument(prepared, {
    fast: opts.fast,
    imagePrepared: true,
    mrzFocused: true,
  });
  const engine = pickOcrEngine(docOcr.engine);
  const front = parseKbsFromDocumentOcr({
    lineSets: docOcr.lineSets,
    engine,
    mrzFocused: false,
  });
  if (opts.side === 'front' && shouldPreferKbsFrontIdParse(front.parsed)) {
    return front;
  }
  const mrz = parseKbsFromDocumentOcr({
    lineSets: docOcr.lineSets,
    engine,
    mrzFocused: true,
  });
  // Pasaport: MRZ öncelikli seçim
  return pickKbsOcrResultForSide(front, mrz, opts.side === 'front' ? 'mrz_back' : opts.side);
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
  if (opts.side === 'front' && shouldPreferKbsFrontIdParse(front.parsed)) {
    return front;
  }
  const mrz = parseKbsFromDocumentOcr({
    lineSets: docOcr.lineSets,
    engine,
    mrzFocused: true,
  });
  return pickKbsOcrResultForSide(front, mrz, opts.side);
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

  // A: şüpheli MRZ’de erken çıkma — fallback / Maximum’a bırak
  if (!galleryDeep && hasKbsOcrApplyableData(best) && !isMrzChecksumSuspicious(best.parsed)) {
    return best;
  }

  const fallback = await parseIdCardImageUriWithFallback(prepared, {
    captureSide: side,
    fast: false,
    galleryDeep,
    imagePrepared: true,
  });
  return pickBetterKbsOcrResult(best, fallback);
}

/**
 * Sisteme yüklenen belgeler — MRZ al → aynı görüntüden doğrula (tek hızlı OCR).
 * Sağlıklıysa erken çık; değilse bir yavaş geçiş, gerekirse Maximum.
 */
export async function parseIdCardImageUriForUpload(
  uri: string,
  options?: Pick<KbsOcrOptions, 'captureSide' | 'galleryDeep'>
): Promise<KbsOcrResult> {
  const side = options?.captureSide ?? 'front';
  const galleryDeep = options?.galleryDeep === true;
  const prepared = await prepareProfessionalKbsOcrUriCached(uri);
  const passes: { parsed: ParsedDocument; engine: string }[] = [];

  // 1) Tek hızlı OCR (MRZ band + belge kırpımı paralel) — çift tarama yok
  let best = await parseUploadOcrBatch(prepared, { fast: true, side });
  passes.push({ parsed: best.parsed, engine: best.engine });

  const { isMrzVisualVerifyReady, verifyMrzWithVisualOcr } = await import('@/lib/kbsMrzVisualVerify');
  const verifiedFast = verifyMrzWithVisualOcr(best.parsed, best.ocrLines ?? []);
  best = {
    ...best,
    parsed: verifiedFast.parsed,
    missingFields: listMissingIdFields(verifiedFast.parsed),
  };
  passes[0] = { parsed: best.parsed, engine: best.engine };

  const turkishOk =
    listCoreMissingIdFields(best.parsed).length === 0 &&
    !!best.parsed.documentNumber &&
    (best.parsed.nationalityCode === 'TUR' ||
      best.parsed.nationalityCode === 'TR' ||
      best.parsed.nationalityCode === 'TC');

  const mrzReady =
    listCoreMissingIdFields(best.parsed).length === 0 &&
    !isMrzChecksumSuspicious(best.parsed) &&
    isMrzVisualVerifyReady(verifiedFast);

  if (mrzReady || turkishOk) {
    const { mergeKbsOcrPassResults } = await import('@/lib/kbsCaptureOcrMerge');
    const merged = mergeKbsOcrPassResults(passes);
    return {
      parsed: merged.parsed,
      missingFields: merged.missingFields,
      engine: merged.engine || best.engine,
      ocrLines: best.ocrLines,
    };
  }

  // 2) Tek yavaş OCR — hâlâ aynı MRZ-önce + görsel doğrula modeli
  const slow = await parseUploadOcrBatch(prepared, { fast: false, side });
  const verifiedSlow = verifyMrzWithVisualOcr(slow.parsed, slow.ocrLines ?? []);
  const slowResult: KbsOcrResult = {
    ...slow,
    parsed: verifiedSlow.parsed,
    missingFields: listMissingIdFields(verifiedSlow.parsed),
  };
  passes.push({ parsed: slowResult.parsed, engine: slowResult.engine });
  best = pickBetterKbsOcrResult(best, slowResult);

  if (
    listCoreMissingIdFields(best.parsed).length === 0 &&
    best.parsed.rawMrz &&
    best.parsed.checksumsValid === true &&
    !isMrzChecksumSuspicious(best.parsed)
  ) {
    const { mergeKbsOcrPassResults } = await import('@/lib/kbsCaptureOcrMerge');
    const merged = mergeKbsOcrPassResults(passes);
    return {
      parsed: merged.parsed,
      missingFields: merged.missingFields,
      engine: merged.engine || best.engine,
      ocrLines: best.ocrLines,
    };
  }

  // 3) Maximum — yalnız galleryDeep veya hâlâ eksik/şüpheli
  if (
    galleryDeep ||
    listCoreMissingIdFields(best.parsed).length > 0 ||
    best.parsed.checksumsValid !== true
  ) {
    if (galleryDeep) {
      const { parseIdCardImageUriMaximum } = await import('@/lib/kbsCaptureGalleryDeepOcr');
      const max = await parseIdCardImageUriMaximum(prepared, { captureSide: side });
      const verifiedMax = verifyMrzWithVisualOcr(max.parsed, max.ocrLines ?? []);
      passes.push({ parsed: verifiedMax.parsed, engine: max.engine });
      best = pickBetterKbsOcrResult(best, {
        ...max,
        parsed: verifiedMax.parsed,
        missingFields: listMissingIdFields(verifiedMax.parsed),
      });
    }
  }

  const { mergeKbsOcrPassResults } = await import('@/lib/kbsCaptureOcrMerge');
  const merged = mergeKbsOcrPassResults(passes);
  return {
    parsed: merged.parsed,
    missingFields: merged.missingFields,
    engine: merged.engine || best.engine,
    ocrLines: best.ocrLines,
  };
}

/** Kayda yazılacak anlamlı OCR verisi var mı (kısmi sonuç dahil; documentType tek başına yetmez). */
export function hasKbsOcrApplyableData(result: KbsOcrResult): boolean {
  if (shouldApplyKbsOcrResult(result)) return true;
  const p = result.parsed;
  if (p.rawMrz) return true;
  if (hasPlausibleKbsDocumentNumber(p.documentNumber, p.documentType)) return true;
  if (p.firstName || p.lastName || p.birthDate || p.expiryDate || p.nationalityCode) return true;
  if (p.gender === 'M' || p.gender === 'F' || p.gender === 'X') return true;
  // documentType tek başına uygulanabilir sayılmaz.
  const identityFields = buildKbsCopyFields(p).filter((f) => f.key !== 'documentType' && f.key !== 'age');
  return identityFields.length >= 1;
}

export function shouldApplyKbsOcrResult(result: KbsOcrResult): boolean {
  const p = result.parsed;
  const score = kbsOcrQualityScore(result);
  const coreMissing = listCoreMissingIdFields(p).length;
  const tcDigits = (p.documentNumber ?? '').replace(/\D/g, '');
  const suspicious = isMrzChecksumSuspicious(p);

  if (isTurkishTcDigits(tcDigits)) return true;
  if (p.rawMrz && p.checksumsValid === true) return true;
  // A: checksum’suz / fallback MRZ — yalnız skor yüksekse kısmi uygula
  if (p.rawMrz && suspicious) {
    return coreMissing <= 1 && score >= STRONG_SCORE - 4;
  }
  if (p.rawMrz && p.documentNumber) return score >= WEAK_SCORE - 6;
  if (p.rawMrz && (p.birthDate || p.expiryDate)) return score >= WEAK_SCORE - 4;
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
