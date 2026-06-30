import {
  parseIdCardImageUri,
  parseIdCardImageUriAiFallback,
  parseKbsFromDocumentOcr,
  type KbsCaptureSide,
  type KbsOcrResult,
} from '@/lib/kbsCaptureOcr';
import { listCoreMissingIdFields } from '@/lib/kbsCaptureParsedFields';
import { mergeKbsOcrPassResults } from '@/lib/kbsCaptureOcrMerge';
import { parseIdCardImageUriProfessional } from '@/lib/kbsCaptureProfessionalOcr';
import { prepareProfessionalKbsOcrUri } from '@/lib/kbsOcrImageEnhance';
import { getKbsOcrCapability } from '@/lib/kbsOcrCapability';
import { ocrLinesForGalleryDocument } from '@/lib/scanner/mrzDocumentOcr';

function coreComplete(parsed: import('@/lib/scanner/types').ParsedDocument): boolean {
  return listCoreMissingIdFields(parsed).length === 0;
}

function toResult(
  merged: ReturnType<typeof mergeKbsOcrPassResults>
): KbsOcrResult {
  return {
    parsed: merged.parsed,
    missingFields: merged.missingFields,
    engine: merged.engine,
  };
}

/**
 * Maksimum OCR — bulanık / karanlık / kötü çekimler için.
 * Tüm belge bölgeleri, MRZ + ön yüz, ML Kit + expo; geçişler alan bazında birleştirilir.
 */
export async function parseIdCardImageUriMaximum(
  uri: string,
  options?: { captureSide?: KbsCaptureSide }
): Promise<KbsOcrResult> {
  const side = options?.captureSide ?? 'front';
  const prepared = await prepareProfessionalKbsOcrUri(uri);
  const passes: KbsOcrResult[] = [];

  const docOcr = await ocrLinesForGalleryDocument(prepared);
  passes.push(
    parseKbsFromDocumentOcr({
      lineSets: docOcr.lineSets,
      engine: docOcr.engine,
      mrzFocused: side === 'mrz_back',
    })
  );
  if (side === 'mrz_back') {
    passes.push(
      parseKbsFromDocumentOcr({
        lineSets: docOcr.lineSets,
        engine: docOcr.engine,
        mrzFocused: false,
      })
    );
  }

  let merged = toResult(mergeKbsOcrPassResults(passes));
  if (coreComplete(merged.parsed) && merged.parsed.rawMrz) return merged;

  passes.push(
    await parseIdCardImageUriProfessional(prepared, {
      captureSide: 'front',
      fast: false,
      galleryDeep: true,
    })
  );
  passes.push(
    await parseIdCardImageUriProfessional(prepared, {
      captureSide: 'mrz_back',
      fast: false,
      galleryDeep: true,
    })
  );
  merged = toResult(mergeKbsOcrPassResults(passes));
  if (coreComplete(merged.parsed)) return merged;

  passes.push(await parseIdCardImageUriAiFallback(prepared, { captureSide: side }));
  passes.push(
    await parseIdCardImageUriAiFallback(prepared, {
      captureSide: side === 'mrz_back' ? 'front' : 'mrz_back',
    })
  );
  merged = toResult(mergeKbsOcrPassResults(passes));
  if (coreComplete(merged.parsed) || merged.parsed.rawMrz) return merged;

  passes.push(
    await parseIdCardImageUri(prepared, { captureSide: side, fast: false, galleryDeep: true })
  );
  passes.push(
    await parseIdCardImageUri(prepared, {
      captureSide: side === 'mrz_back' ? 'front' : 'mrz_back',
      fast: false,
      galleryDeep: true,
    })
  );

  return toResult(mergeKbsOcrPassResults(passes));
}

/** @deprecated parseIdCardImageUriMaximum kullanın */
export async function parseIdCardImageUriGalleryDeep(
  uri: string,
  options?: { captureSide?: KbsCaptureSide }
): Promise<KbsOcrResult> {
  return parseIdCardImageUriMaximum(uri, options);
}

export type GalleryOcrProgress = {
  phase: 'prepare' | 'scan' | 'merge' | 'done' | 'failed';
  capability: ReturnType<typeof getKbsOcrCapability>;
  score?: number;
  coreMissing?: number;
};

/** Galeri OCR — ilerleme geri çağrısı (UI). */
export async function runGalleryDeepOcrWithProgress(
  uri: string,
  options?: {
    captureSide?: KbsCaptureSide;
    onProgress?: (p: GalleryOcrProgress) => void;
  }
): Promise<KbsOcrResult> {
  const cap = getKbsOcrCapability();
  options?.onProgress?.({ phase: 'prepare', capability: cap });
  try {
    options?.onProgress?.({ phase: 'scan', capability: cap });
    const result = await parseIdCardImageUriMaximum(uri, {
      captureSide: options?.captureSide,
    });
    options?.onProgress?.({
      phase: 'done',
      capability: cap,
      coreMissing: listCoreMissingIdFields(result.parsed).length,
    });
    return result;
  } catch {
    options?.onProgress?.({ phase: 'failed', capability: cap });
    throw new Error('Galeri OCR başarısız');
  }
}

export function isGalleryOcrComplete(result: KbsOcrResult): boolean {
  return listCoreMissingIdFields(result.parsed).length === 0;
}
