import {
  enrichMrzParsedWithFrontOcr,
  parseIdCardFromOcrLines,
} from '@/lib/guestScan/idCardOcrParser';
import { listMissingIdFields } from '@/lib/kbsCaptureParsedFields';
import {
  cropMrzBandForKbsOcr,
  filterKbsOcrLines,
  filterMrzOnlyOcrLines,
} from '@/lib/kbsOcrDocumentFocus';
import { extractMrzFromLinesBest } from '@/lib/scanner/mrzExtractLines';
import { MRZ_OCR_ENGINE_VISION_MLKIT } from '@/lib/scanner/mrzOcrEngine';
import { ocrLinesFromImage, ocrLinesFromImageExpoOnly } from '@/lib/scanner/ocrLinesFromImage';
import { KBS_OCR_ENGINE_AI_FALLBACK, KBS_OCR_ENGINE_FRONT_VISUAL } from '@/lib/kbsOcrEngineLabel';
import { sanitizeKbsOcrForApply } from '@/lib/kbsCaptureOcrMerge';
import { formatKbsNationality, formatKbsTrDate, kbsDisplayFullName } from '@/lib/kbsDisplayFormat';
import type { ParsedDocument } from '@/lib/scanner/types';

export type KbsOcrResult = {
  parsed: ParsedDocument;
  missingFields: string[];
  engine: string;
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

function buildMrzLineSets(mrzBandLines: string[], fullLines: string[]): string[][] {
  const fromBand = filterMrzOnlyOcrLines(mrzBandLines);
  const fromFull = filterMrzOnlyOcrLines(fullLines).filter((l) => l.includes('<<'));
  const sets: string[][] = [];
  if (fromBand.length >= 2) sets.push(fromBand);
  if (fromBand.length) sets.push(mrzBandLines.map((l) => l.trim()).filter(Boolean));
  if (fromFull.length >= 2) sets.push(fromFull);
  if (fromBand.length && fromFull.length) {
    sets.push([...new Set([...fromBand, ...fromFull])]);
  }
  return sets;
}

function tagFrontOnlyRead(parsed: ParsedDocument): ParsedDocument {
  const warnings = [...(parsed.warnings ?? [])];
  if (!parsed.rawMrz && !warnings.includes('front_ocr_only')) {
    warnings.push('front_ocr_only');
  }
  return { ...parsed, warnings };
}

function parseKbsFromSplitOcr(args: {
  mrzBandLines: string[];
  fullImageLines: string[];
  engine: string;
}): KbsOcrResult {
  const frontFiltered = filterKbsOcrLines(args.fullImageLines);
  const mrzBest = tryExtractMrzFromLines(buildMrzLineSets(args.mrzBandLines, args.fullImageLines));

  let parsed: ParsedDocument;
  let engine = args.engine;

  if (mrzBest) {
    parsed = {
      ...mrzBest.parsed,
      rawMrz: mrzBest.mrz,
      documentType: mrzBest.parsed.documentType ?? 'passport',
    };
    if (parsed.documentType === 'passport') {
      const front = parseIdCardFromOcrLines(frontFiltered);
      parsed = {
        ...parsed,
        documentSeries: parsed.documentSeries ?? front.documentSeries,
        motherName: parsed.motherName ?? front.motherName,
        fatherName: parsed.fatherName ?? front.fatherName,
        nationalityCode: parsed.nationalityCode ?? front.nationalityCode,
        expiryDate: parsed.expiryDate ?? front.expiryDate,
      };
    } else {
      parsed = enrichMrzParsedWithFrontOcr(parsed, frontFiltered);
    }
  } else {
    engine = KBS_OCR_ENGINE_FRONT_VISUAL;
    parsed = parseIdCardFromOcrLines(frontFiltered);
    const retry = tryExtractMrzFromLines([filterMrzOnlyOcrLines(frontFiltered).filter((l) => l.includes('<<'))]);
    if (retry) {
      engine = args.engine;
      parsed = enrichMrzParsedWithFrontOcr(
        { ...retry.parsed, rawMrz: retry.mrz, documentType: retry.parsed.documentType ?? 'passport' },
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

function mrzSignalInLines(lines: string[]): boolean {
  return filterMrzOnlyOcrLines(lines).some((l) => l.includes('<<'));
}

/** Önce tam kare; MRZ şeridi yalnızca << sinyali varsa (2. OCR’ı atlar). */
async function ocrForKbsCapture(uri: string, expoOnly: boolean) {
  const ocr = expoOnly ? ocrLinesFromImageExpoOnly : ocrLinesFromImage;
  const fullOcr = await ocr(uri, { document: true });
  let mrzBandLines: string[] = [];
  if (mrzSignalInLines(fullOcr.lines)) {
    const mrzUri = await cropMrzBandForKbsOcr(uri);
    const bandOcr = await ocr(mrzUri, { document: true });
    mrzBandLines = bandOcr.lines;
  }
  return { fullOcr, mrzBandLines };
}

/**
 * Kimlik / pasaport ön yüzü (tam kadraj).
 * T.C. kimlik önünde MRZ yok → yazılı alanlar (Ad, Soyad, TC).
 */
export async function parseIdCardImageUri(uri: string): Promise<KbsOcrResult> {
  const { fullOcr, mrzBandLines } = await ocrForKbsCapture(uri, false);
  const engine = pickOcrEngine(fullOcr.engine);
  return parseKbsFromSplitOcr({
    mrzBandLines,
    fullImageLines: fullOcr.lines,
    engine,
  });
}

export async function parseIdCardImageUriAiFallback(uri: string): Promise<KbsOcrResult> {
  const { fullOcr, mrzBandLines } = await ocrForKbsCapture(uri, true);
  return parseKbsFromSplitOcr({
    mrzBandLines,
    fullImageLines: fullOcr.lines,
    engine: KBS_OCR_ENGINE_AI_FALLBACK,
  });
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
