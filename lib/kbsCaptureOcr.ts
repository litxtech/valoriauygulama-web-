import {
  enrichMrzParsedWithFrontOcr,
  parseIdCardFromOcrLines,
} from '@/lib/guestScan/idCardOcrParser';
import { listMissingIdFields } from '@/lib/kbsCaptureParsedFields';
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
import { formatKbsNationality, formatKbsTrDate, kbsDisplayFullName } from '@/lib/kbsDisplayFormat';
import type { ParsedDocument } from '@/lib/scanner/types';

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
    const best = extractMrzFromLinesBest(lines);
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

  const bandLines = lineSets.find((s) => s.pass === 'mrz_band')?.lines ?? [];
  const docLines = lineSets.find((s) => s.pass === 'document_crop')?.lines ?? [];
  const fullLines = lineSets.find((s) => s.pass === 'full')?.lines ?? [];

  const fromBand = filterMrzOnlyOcrLines(bandLines);
  const fromFull = filterMrzOnlyOcrLines(fullLines).filter((l) => l.includes('<<'));
  const fromDoc = filterMrzOnlyOcrLines(docLines).filter((l) => l.includes('<<'));

  if (mrzFocused) {
    if (fromBand.length >= 2) sets.push(fromBand);
    if (fromBand.length) sets.push(bandLines.map((l) => l.trim()).filter(Boolean));
    if (fromFull.length >= 2) sets.push(fromFull);
    if (fromDoc.length >= 2) sets.push(fromDoc);
  } else {
    if (fromBand.length >= 2) sets.push(fromBand);
    if (fromFull.length >= 2) sets.push(fromFull);
    if (fromDoc.length >= 2) sets.push(fromDoc);
    if (fromBand.length) sets.push(bandLines.map((l) => l.trim()).filter(Boolean));
  }

  if (fromBand.length && fromFull.length) {
    sets.push([...new Set([...fromBand, ...fromFull])]);
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

function parseKbsFromDocumentOcr(args: {
  lineSets: MrzDocumentOcrLineSet[];
  engine: string;
  mrzFocused: boolean;
}): KbsOcrResult {
  const allLines = flattenMrzDocumentOcrLineSets(args.lineSets);
  const frontFiltered = filterKbsOcrLines(allLines);
  const mrzLineSets = buildMrzLineSets(args.lineSets, args.mrzFocused);
  const mrzBest = tryExtractMrzFromLines(mrzLineSets);

  let parsed: ParsedDocument;
  let engine = args.engine;

  if (mrzBest) {
    parsed = {
      ...mrzBest.parsed,
      rawMrz: mrzBest.mrz,
      documentType: mrzBest.parsed.documentType ?? 'passport',
      confidence: mrzBest.parsed.confidence ?? mrzBest.score / 100,
    };
    if (parsed.documentType === 'passport' && !args.mrzFocused) {
      const front = parseIdCardFromOcrLines(frontFiltered);
      parsed = {
        ...parsed,
        documentSeries: parsed.documentSeries ?? front.documentSeries,
        motherName: parsed.motherName ?? front.motherName,
        fatherName: parsed.fatherName ?? front.fatherName,
        nationalityCode: parsed.nationalityCode ?? front.nationalityCode,
        expiryDate: parsed.expiryDate ?? front.expiryDate,
      };
    } else if (!args.mrzFocused) {
      parsed = enrichMrzParsedWithFrontOcr(parsed, frontFiltered);
    }
  } else if (args.mrzFocused) {
    engine = KBS_OCR_ENGINE_FRONT_VISUAL;
    parsed = {
      documentType: 'other',
      fullName: null,
      firstName: null,
      lastName: null,
      middleName: null,
      documentNumber: null,
      nationalityCode: null,
      issuingCountryCode: null,
      birthDate: null,
      expiryDate: null,
      gender: null,
      rawMrz: null,
      confidence: null,
      checksumsValid: null,
      warnings: ['mrz_not_found'],
    };
  } else {
    engine = KBS_OCR_ENGINE_FRONT_VISUAL;
    parsed = parseIdCardFromOcrLines(frontFiltered);
    const retry = tryExtractMrzFromLines([
      filterMrzOnlyOcrLines(frontFiltered).filter((l) => l.includes('<<')),
    ]);
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
    }
  }

  parsed = sanitizeKbsOcrForApply(tagFrontOnlyRead(parsed));

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
  const missing = primary.missingFields.length;
  const hasMrz = !!primary.parsed.rawMrz;

  if (hasMrz && missing <= 1) return primary;
  if (!hasMrz && missing >= 4) {
    const fallback = await parseIdCardImageUriAiFallback(uri, options);
    return pickBetterKbsOcrResult(primary, fallback);
  }
  if (!hasMrz || missing >= 2) {
    const fallback = await parseIdCardImageUriAiFallback(uri, options);
    return pickBetterKbsOcrResult(primary, fallback);
  }
  return primary;
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
