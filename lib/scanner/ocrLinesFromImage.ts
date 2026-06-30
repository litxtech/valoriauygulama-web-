import { Image } from 'react-native';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { MRZ_OCR_ENGINE_VISION_MLKIT } from '@/lib/scanner/mrzOcrEngine';
import { isMrzVisionScannerAvailable } from '@/lib/scanner/mrzVisionAvailability';

/**
 * `ops.guest_documents.ocr_engine` — yedek / AI yolu.
 * Birincil kimlik çekim okuması: MRZ_OCR_ENGINE_VISION_MLKIT (mrzStillImageOcr).
 */
export const MRZ_OCR_ENGINE_EXPO = 'expo-text-extractor' as const;

export type OcrLinesEngine = typeof MRZ_OCR_ENGINE_VISION_MLKIT | typeof MRZ_OCR_ENGINE_EXPO;

type OcrImageOpts = {
  document?: boolean;
  /** Arka plan okuma — tek ML Kit ölçeği, hafif resize. */
  fast?: boolean;
};

/** MRZ OCR öncesi kare boyutunu ayarlar. */
async function normalizeImageForOcr(uri: string, opts?: OcrImageOpts): Promise<string> {
  const maxEdge = opts?.fast ? 2600 : opts?.document ? 3200 : 2000;
  const minEdge = opts?.fast ? 1800 : opts?.document ? 2400 : 0;
  try {
    const { width, height } = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      Image.getSize(uri, (w, h) => resolve({ width: w, height: h }), reject);
    });
    const long = Math.max(width, height);
    const short = Math.min(width, height);
    const actions: { resize: { width?: number; height?: number } }[] = [];
    if (opts?.document && long < minEdge) {
      actions.push(width >= height ? { resize: { width: minEdge } } : { resize: { height: minEdge } });
    } else if (long > maxEdge) {
      actions.push(width >= height ? { resize: { width: maxEdge } } : { resize: { height: maxEdge } });
    } else if (opts?.document && short < 1100) {
      actions.push(width >= height ? { resize: { width: minEdge } } : { resize: { height: minEdge } });
    }
    if (!actions.length) return uri;
    const out = await manipulateAsync(uri, actions, { compress: opts?.document ? 0.96 : 0.92, format: SaveFormat.JPEG });
    return out.uri;
  } catch {
    return uri;
  }
}

async function ocrLinesFromExpo(
  uri: string,
  opts?: OcrImageOpts
): Promise<{ lines: string[]; engine: typeof MRZ_OCR_ENGINE_EXPO }> {
  const prepared = await normalizeImageForOcr(uri, opts);
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('expo-text-extractor') as {
    extractTextFromImage: (u: string) => Promise<string[]>;
    isSupported?: boolean;
  };
  if (mod?.isSupported === false) throw new Error('OCR_NOT_SUPPORTED');
  const lines = await mod.extractTextFromImage(prepared);
  return { lines, engine: MRZ_OCR_ENGINE_EXPO };
}

/**
 * Kimlik / pasaport görseli — önce MRZ (ML Kit, canlı tarama ile aynı), olmazsa expo yedek.
 */
export async function ocrLinesFromImage(
  uri: string,
  opts?: OcrImageOpts
): Promise<{ lines: string[]; engine: OcrLinesEngine }> {
  const prepared = await normalizeImageForOcr(uri, opts);
  let visionLines: string[] = [];
  if (isMrzVisionScannerAvailable()) {
    try {
      const { ocrLinesFromMrzStillImage } = await import('@/lib/scanner/mrzStillImageOcr');
      const mrz = await ocrLinesFromMrzStillImage(prepared, { fast: opts?.fast });
      if (mrz?.lines.length) {
        visionLines = mrz.lines;
        if (visionLines.length >= 4) {
          return mrz;
        }
      }
    } catch {
      /* ML Kit yüklenemedi — expo yedek */
    }
  }
  const expo = await ocrLinesFromExpo(prepared, opts);
  if (visionLines.length === 0) return expo;
  const merged = [...new Set([...visionLines, ...expo.lines])];
  return { lines: merged, engine: MRZ_OCR_ENGINE_VISION_MLKIT };
}

/** Yalnızca expo (AI yedek / manuel). */
export async function ocrLinesFromImageExpoOnly(
  uri: string,
  opts?: OcrImageOpts
): Promise<{ lines: string[]; engine: typeof MRZ_OCR_ENGINE_EXPO }> {
  const prepared = await normalizeImageForOcr(uri, opts);
  return ocrLinesFromExpo(prepared, opts);
}
