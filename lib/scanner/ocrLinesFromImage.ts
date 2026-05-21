import { Image } from 'react-native';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

/**
 * `ops.guest_documents.ocr_engine` değeri.
 * Önerilen kurumsal yığın (harici, lisanslı): Regula / Microblink; cihaz üstü
 * hız ve offline için VisionCamera+MLKit mümkün ama EAS iOS bu projede
 * expo-text-extractor ile sınırlandı.
 */
export const MRZ_OCR_ENGINE_EXPO = 'expo-text-extractor' as const;

type OcrImageOpts = { /** Galeri kimlik/pasaport: küçük fotoğrafları büyüt, çok büyükleri küçült. */ document?: boolean };

/** MRZ OCR öncesi kare boyutunu ayarlar. */
async function normalizeImageForOcr(uri: string, opts?: OcrImageOpts): Promise<string> {
  const maxEdge = opts?.document ? 2800 : 2000;
  const minEdge = opts?.document ? 2000 : 0;
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
    } else if (opts?.document && short < 900) {
      actions.push(width >= height ? { resize: { width: minEdge } } : { resize: { height: minEdge } });
    }
    if (!actions.length) return uri;
    const out = await manipulateAsync(uri, actions, { compress: opts?.document ? 0.96 : 0.92, format: SaveFormat.JPEG });
    return out.uri;
  } catch {
    return uri;
  }
}

/**
 * Cihaz üstü OCR (expo-text-extractor). VisionCamera/ML Kit kaldırıldı (EAS iOS derlemesi).
 */
export async function ocrLinesFromImage(
  uri: string,
  opts?: OcrImageOpts
): Promise<{ lines: string[]; engine: 'expo' }> {
  const prepared = await normalizeImageForOcr(uri, opts);
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('expo-text-extractor') as {
    extractTextFromImage: (u: string) => Promise<string[]>;
    isSupported?: boolean;
  };
  if (mod?.isSupported === false) throw new Error('OCR_NOT_SUPPORTED');
  const lines = await mod.extractTextFromImage(prepared);
  return { lines, engine: 'expo' };
}
