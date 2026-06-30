import { Image } from 'react-native';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { cropImageForKbsOcr, cropMrzBandForKbsOcr } from '@/lib/kbsOcrDocumentFocus';

/** Profesyonel OCR — ML Kit / MRZ için hedef çözünürlük. */
export const KBS_OCR_PRO_MIN_LONG_EDGE = 2400;
export const KBS_OCR_PRO_MAX_LONG_EDGE = 3000;
const PRO_JPEG_QUALITY = 0.98;

async function imageSize(uri: string): Promise<{ width: number; height: number; long: number }> {
  const { width, height } = await new Promise<{ width: number; height: number }>((resolve, reject) => {
    Image.getSize(uri, (w, h) => resolve({ width: w, height: h }), reject);
  });
  return { width, height, long: Math.max(width, height) };
}

/**
 * Kimlik / pasaport OCR öncesi — küçük fotoğrafları büyüt, dev görselleri sınırla, yüksek kalite JPEG.
 */
export async function prepareProfessionalKbsOcrUri(uri: string): Promise<string> {
  try {
    const { width, height, long } = await imageSize(uri);
    const actions: { resize: { width?: number; height?: number } }[] = [];

    if (long < KBS_OCR_PRO_MIN_LONG_EDGE) {
      actions.push(width >= height ? { resize: { width: KBS_OCR_PRO_MIN_LONG_EDGE } } : { resize: { height: KBS_OCR_PRO_MIN_LONG_EDGE } });
    } else if (long > KBS_OCR_PRO_MAX_LONG_EDGE) {
      actions.push(width >= height ? { resize: { width: KBS_OCR_PRO_MAX_LONG_EDGE } } : { resize: { height: KBS_OCR_PRO_MAX_LONG_EDGE } });
    }

    if (!actions.length) {
      const out = await manipulateAsync(uri, [], { compress: PRO_JPEG_QUALITY, format: SaveFormat.JPEG });
      return out.uri;
    }

    const out = await manipulateAsync(uri, actions, { compress: PRO_JPEG_QUALITY, format: SaveFormat.JPEG });
    return out.uri;
  } catch {
    return uri;
  }
}

export type KbsOcrEnhancedVariants = {
  full: string;
  documentCrop: string;
  mrzBand: string;
};

/** Profesyonel OCR geçişleri — tam, belge kırpımı, MRZ şeridi. */
export async function buildKbsOcrEnhancedVariants(
  uri: string,
  alreadyPrepared = false
): Promise<KbsOcrEnhancedVariants> {
  const full = alreadyPrepared ? uri : await prepareProfessionalKbsOcrUri(uri);
  const [documentCrop, mrzBand] = await Promise.all([
    cropImageForKbsOcr(full),
    cropMrzBandForKbsOcr(full),
  ]);
  return { full, documentCrop, mrzBand };
}
