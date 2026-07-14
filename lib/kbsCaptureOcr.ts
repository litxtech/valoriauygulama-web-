import {
  enrichMrzParsedWithFrontOcr,
  parseIdCardFromOcrLines,
  shouldPreferKbsFrontIdParse,
} from '@/lib/guestScan/idCardOcrParser';
import { listCoreMissingIdFields, listMissingIdFields } from '@/lib/kbsCaptureParsedFields';
import { isUsablePersonName } from '@/lib/guestScan/personNameUtils';
import { hasPlausibleKbsDocumentNumber } from '@/lib/kbsDocumentNumberValidate';
import { filterKbsOcrLines, filterMrzOnlyOcrLines } from '@/lib/kbsOcrDocumentFocus';
import { extractMrzFromLinesBest } from '@/lib/scanner/mrzExtractLines';
import { MRZ_OCR_ENGINE_VISION_MLKIT } from '@/lib/scanner/mrzOcrEngine';
import {
  flattenMrzDocumentOcrLineSets,
  ocrLinesForKbsDocument,
  type MrzDocumentOcrLineSet,
} from '@/lib/scanner/mrzDocumentOcr';
import { KBS_OCR_ENGINE_AI_FALLBACK, KBS_OCR_ENGINE_FRONT_VISUAL } from '@/lib/kbsOcrEngineLabel';
import { sanitizeKbsOcrForApply } from '@/lib/kbsCaptureOcrMerge';
import { applyBestPassportNamesToParsed } from '@/lib/kbsPassportNameResolve';
import { formatKbsNationality, formatKbsTrDate, kbsDisplayFullName } from '@/lib/kbsDisplayFormat';
import { log } from '@/lib/logger';
import type { ParsedDocument } from '@/lib/scanner/types';

/** Geliştirici teşhis — üretimde kapalı (OCR gecikmesini azaltır). */
export const KBS_OCR_DEBUG = __DEV__;

export type KbsCaptureSide = 'front' | 'mrz_back';

export type KbsOcrResult = {
  parsed: ParsedDocument;
  missingFields: string[];
  engine: string;
};

export type KbsOcrOptions = {
  /** Kimlik arkası / pasaport MRZ — MRZ şeridi öncelikli OCR. */
  captureSide?: KbsCaptureSide;
  /** Yalnızca expo-text-extractor (AI yedek). */
  expoOnly?: boolean;
  /** Arka plan okuma — hızlı geçiş (default true). */
  fast?: boolean;
  /** Galeri derin tarama — tüm bölgeler, yavaş ama eksiksiz. */
  galleryDeep?: boolean;
  /** Görüntü zaten prepareProfessionalKbsOcrUri ile işlendi — tekrar ölçekleme atlanır. */
  imagePrepared?: boolean;
};

export { listMissingIdFields };

function pickOcrEngine(...engines: string[]): string {
  return engines.some((e) => e === MRZ_OCR_ENGINE_VISION_MLKIT)
    ? MRZ_OCR_ENGINE_VISION_MLKIT
    : engines[0] ?? MRZ_OCR_ENGINE_VISION_MLKIT;
}

function tryExtractMrzFromLines(lineSets: string[][]): ReturnType<typeof extractMrzFromLinesBest> {
  for (const lines of lineSets) {
    if (!lines.length) continue;
    const best = extractMrzFromLinesBest(lines, { kbsRelaxed: true });
    if (best) return best;
  }
  return null;
}

function buildMrzLineSets(
  lineSets: MrzDocumentOcrLineSet[],
  mrzFocused: boolean
): string[][] {
  const flat = flattenMrzDocumentOcrLineSets(lineSets);
  const sets: string[][] = [];

  const bandLines = [
    ...(lineSets.find((s) => s.pass === 'mrz_band')?.lines ?? []),
    ...(lineSets.find((s) => s.pass === 'pro_mrz_band')?.lines ?? []),
  ];
  const docLines = [
    ...(lineSets.find((s) => s.pass === 'document_crop')?.lines ?? []),
    ...(lineSets.find((s) => s.pass === 'pro_document_crop')?.lines ?? []),
  ];
  const fullLines = [
    ...(lineSets.find((s) => s.pass === 'full')?.lines ?? []),
    ...(lineSets.find((s) => s.pass === 'pro_full')?.lines ?? []),
  ];

  const fromBand = filterMrzOnlyOcrLines(bandLines);
  const fromFull = filterMrzOnlyOcrLines(fullLines).filter((l) => l.includes('<<'));
  const fromDoc = filterMrzOnlyOcrLines(docLines).filter((l) => l.includes('<<'));
  const fromFullLoose = filterMrzOnlyOcrLines(fullLines);
  const fromDocLoose = filterMrzOnlyOcrLines(docLines);

  if (mrzFocused) {
    if (fromBand.length >= 1) sets.push(fromBand);
    if (fromBand.length) sets.push(bandLines.map((l) => l.trim()).filter(Boolean));
    if (fromFull.length >= 2) sets.push(fromFull);
    if (fromDoc.length >= 2) sets.push(fromDoc);
    if (fromFullLoose.length >= 2) sets.push(fromFullLoose);
  } else {
    if (fromBand.length >= 1) sets.push(fromBand);
    if (fromFull.length >= 2) sets.push(fromFull);
    if (fromDoc.length >= 2) sets.push(fromDoc);
    if (fromFullLoose.length >= 2) sets.push(fromFullLoose);
    if (fromBand.length) sets.push(bandLines.map((l) => l.trim()).filter(Boolean));
  }

  if (fromBand.length && fromFull.length) {
    sets.push([...new Set([...fromBand, ...fromFull])]);
  }
  if (fromBand.length && fromDocLoose.length) {
    sets.push([...new Set([...fromBand, ...fromDocLoose])]);
  }
  if (flat.length) sets.push(flat);

  return sets;
}

function tagFrontOnlyRead(parsed: ParsedDocument): ParsedDocument {
  const warnings = [...(parsed.warnings ?? [])];
  if (!parsed.rawMrz && !warnings.includes('front_ocr_only')) {
    warnings.push('front_ocr_only');
  }
  return { ...parsed, warnings };
}

export function parseKbsFromDocumentOcr(args: {
  lineSets: MrzDocumentOcrLineSet[];
  engine: string;
  mrzFocused: boolean;
}): KbsOcrResult {
  const allLines = flattenMrzDocumentOcrLineSets(args.lineSets);
  const frontFiltered = filterKbsOcrLines(allLines);
  const mrzLineSets = buildMrzLineSets(args.lineSets, args.mrzFocused);
  const mrzBest = tryExtractMrzFromLines(mrzLineSets);
  const frontParsed = parseIdCardFromOcrLines(frontFiltered);
  const preferFrontId = !args.mrzFocused && shouldPreferKbsFrontIdParse(frontParsed);

  let parsed: ParsedDocument;
  let engine = args.engine;

  if (preferFrontId) {
    engine = KBS_OCR_ENGINE_FRONT_VISUAL;
    parsed = frontParsed;
  } else if (mrzBest) {
    parsed = {
      ...mrzBest.parsed,
      rawMrz: mrzBest.mrz,
      documentType: mrzBest.parsed.documentType ?? 'passport',
      confidence: mrzBest.parsed.confidence ?? mrzBest.score / 100,
    };
    parsed = enrichMrzParsedWithFrontOcr(parsed, frontFiltered);
  } else if (args.mrzFocused) {
    engine = KBS_OCR_ENGINE_FRONT_VISUAL;
    parsed = parseIdCardFromOcrLines(frontFiltered);
    const retry = tryExtractMrzFromLines(mrzLineSets);
    if (retry) {
      engine = args.engine;
      parsed = enrichMrzParsedWithFrontOcr(
        {
          ...retry.parsed,
          rawMrz: retry.mrz,
          documentType: retry.parsed.documentType ?? 'passport',
          confidence: retry.parsed.confidence ?? retry.score / 100,
        },
        frontFiltered
      );
    } else if (!parsed.documentNumber && !parsed.birthDate && !parsed.expiryDate) {
      parsed = {
        ...parsed,
        warnings: [...(parsed.warnings ?? []), 'mrz_not_found'],
      };
    }
  } else {
    engine = KBS_OCR_ENGINE_FRONT_VISUAL;
    parsed = frontParsed;
    const retry = tryExtractMrzFromLines([
      filterMrzOnlyOcrLines(frontFiltered).filter((l) => l.includes('<<')),
    ]);
    if (retry && !shouldPreferKbsFrontIdParse(frontParsed)) {
      engine = args.engine;
      parsed = enrichMrzParsedWithFrontOcr(
        {
          ...retry.parsed,
          rawMrz: retry.mrz,
          documentType: retry.parsed.documentType ?? 'passport',
          confidence: retry.parsed.confidence ?? retry.score / 100,
        },
        frontFiltered
      );
    }
  }

  parsed = sanitizeKbsOcrForApply(tagFrontOnlyRead(parsed));
  parsed = applyBestPassportNamesToParsed(parsed, frontFiltered);

  if (KBS_OCR_DEBUG) {
    log.info('kbsOcrDebug', {
      mrzFocused: args.mrzFocused,
      engine,
      rawLines: allLines,
      frontFilteredLines: frontFiltered,
      mrzFound: !!mrzBest,
      parsed: {
        documentType: parsed.documentType,
        firstName: parsed.firstName,
        lastName: parsed.lastName,
        documentNumber: parsed.documentNumber,
        documentSeries: parsed.documentSeries,
        birthDate: parsed.birthDate,
        expiryDate: parsed.expiryDate,
        nationalityCode: parsed.nationalityCode,
        gender: parsed.gender,
        rawMrz: parsed.rawMrz,
      },
    });
  }

  return {
    parsed,
    missingFields: listMissingIdFields(parsed),
    engine,
  };
}

/**
 * Kimlik / pasaport — çok geçişli MRZ + ön yüz OCR.
 */
export async function parseIdCardImageUri(uri: string, options?: KbsOcrOptions): Promise<KbsOcrResult> {
  const mrzFocused = options?.captureSide === 'mrz_back';
  const docOcr = await ocrLinesForKbsDocument(uri, {
    expoOnly: options?.expoOnly,
    mrzFocused,
    fast: options?.galleryDeep ? false : options?.fast !== false,
    imagePrepared: options?.imagePrepared,
  });
  const engine = pickOcrEngine(docOcr.engine);
  return parseKbsFromDocumentOcr({
    lineSets: docOcr.lineSets,
    engine,
    mrzFocused,
  });
}

export async function parseIdCardImageUriAiFallback(
  uri: string,
  options?: Pick<KbsOcrOptions, 'captureSide'>
): Promise<KbsOcrResult> {
  return parseIdCardImageUri(uri, { expoOnly: true, captureSide: options?.captureSide });
}

/** Birincil + yedek OCR; daha iyi skorlu sonucu döner. */
export async function parseIdCardImageUriWithFallback(
  uri: string,
  options?: KbsOcrOptions
): Promise<KbsOcrResult> {
  const primary = await parseIdCardImageUri(uri, options);
  const coreMissing = listCoreMissingIdFields(primary.parsed).length;
  const hasMrz = !!primary.parsed.rawMrz;

  if (options?.galleryDeep) {
    const fallback = await parseIdCardImageUriAiFallback(uri, options);
    return pickBetterKbsOcrResult(primary, fallback);
  }

  if (coreMissing === 0) return primary;

  const weakNames =
    !isUsablePersonName(primary.parsed.firstName) || !isUsablePersonName(primary.parsed.lastName);
  const weakDoc = !hasPlausibleKbsDocumentNumber(
    primary.parsed.documentNumber,
    primary.parsed.documentType
  );
  const needsFallback = coreMissing >= 2 || weakNames || (!hasMrz && weakDoc);

  if (options?.fast !== false && !needsFallback) return primary;

  const fallback = await parseIdCardImageUriAiFallback(uri, options);
  return pickBetterKbsOcrResult(primary, fallback);
}

function ocrQualityScore(result: KbsOcrResult): number {
  const p = result.parsed;
  let s = (p.confidence ?? 0) * 40;
  if (p.rawMrz) s += 25;
  if (p.checksumsValid === true) s += 20;
  s -= result.missingFields.length * 8;
  return s;
}

function pickBetterKbsOcrResult(a: KbsOcrResult, b: KbsOcrResult): KbsOcrResult {
  return ocrQualityScore(b) > ocrQualityScore(a) ? b : a;
}

export function formatParsedSummary(parsed: ParsedDocument): string {
  const name = kbsDisplayFullName(parsed) || '—';
  const parts = [name];
  if (parsed.documentNumber) parts.push(`No: ${parsed.documentNumber}`);
  if (parsed.documentSeries) parts.push(`Seri: ${parsed.documentSeries}`);
  const birth = formatKbsTrDate(parsed.birthDate);
  if (birth) parts.push(`D.T: ${birth}`);
  const nat = formatKbsNationality(parsed.nationalityCode);
  if (nat) parts.push(`Uyruk: ${nat}`);
  const exp = formatKbsTrDate(parsed.expiryDate);
  if (exp) parts.push(`Son kullanım: ${exp}`);
  if (parsed.motherName) parts.push(`Anne: ${parsed.motherName}`);
  if (parsed.fatherName) parts.push(`Baba: ${parsed.fatherName}`);
  return parts.join(' · ');
}
