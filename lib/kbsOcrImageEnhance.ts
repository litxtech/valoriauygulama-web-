import { Image } from 'react-native';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { cropImageForKbsOcr, cropMrzBandForKbsOcr } from '@/lib/kbsOcrDocumentFocus';

/** Profesyonel OCR — ML Kit / MRZ için hedef çözünürlük (fotokopi için yüksek). */
export const KBS_OCR_PRO_MIN_LONG_EDGE = 2800;
export const KBS_OCR_PRO_MAX_LONG_EDGE = 3600;
const PRO_JPEG_QUALITY = 0.98;

async function imageSize(uri: string): Promise<{ width: number; height: number; long: number }> {
  const { width, height } = await new Promise<{ width: number; height: number }>((resolve, reject) => {
    Image.getSize(uri, (w, h) => resolve({ width: w, height: h }), reject);
  });
  return { width, height, long: Math.max(width, height) };
}

/**
 * Kimlik / pasaport OCR öncesi — küçük fotoğrafları büyüt, dev görselleri sınırla, yüksek kalite JPEG.
 * `fast`: kamera hızlı yolu — daha düşük çözünürlük, daha az süre.
 */
export async function prepareProfessionalKbsOcrUri(
  uri: string,
  opts?: { fast?: boolean }
): Promise<string> {
  try {
    const { width, height, long } = await imageSize(uri);
    const minEdge = opts?.fast ? 2000 : KBS_OCR_PRO_MIN_LONG_EDGE;
    const maxEdge = opts?.fast ? 2600 : KBS_OCR_PRO_MAX_LONG_EDGE;
    const quality = opts?.fast ? 0.92 : PRO_JPEG_QUALITY;
    const actions: { resize: { width?: number; height?: number } }[] = [];

    if (long < minEdge) {
      actions.push(width >= height ? { resize: { width: minEdge } } : { resize: { height: minEdge } });
    } else if (long > maxEdge) {
      actions.push(width >= height ? { resize: { width: maxEdge } } : { resize: { height: maxEdge } });
    }

    if (!actions.length) {
      const out = await manipulateAsync(uri, [], { compress: quality, format: SaveFormat.JPEG });
      return out.uri;
    }

    const out = await manipulateAsync(uri, actions, { compress: quality, format: SaveFormat.JPEG });
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
