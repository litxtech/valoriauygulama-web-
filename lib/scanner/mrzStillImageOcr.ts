import { Image } from 'react-native';
import { linesFromMlKitOcr, type MrzOcrBlock } from '@/lib/scanner/mrzOcrFromMlKit';
import { MRZ_OCR_ENGINE_VISION_MLKIT } from '@/lib/scanner/mrzOcrEngine';
import { isMrzVisionScannerAvailable } from '@/lib/scanner/mrzVisionAvailability';

type MlKitLine = { text?: string; bounds?: { centerY?: number; top?: number; height?: number } };
type MlKitBlock = { lines?: MlKitLine[] };
type MlKitResult = { text?: string; blocks?: MlKitBlock[] };

function blocksFromMlKitResult(result: MlKitResult, imageHeight: number): MrzOcrBlock[] {
  const fh = imageHeight > 0 ? imageHeight : 1;
  const out: MrzOcrBlock[] = [];
  for (const block of result.blocks ?? []) {
    for (const line of block.lines ?? []) {
      const t = line.text?.trim() ?? '';
      if (t.length < 4) continue;
      const b = line.bounds;
      const centerY = b?.centerY ?? b?.top ?? 0;
      out.push({
        text: t,
        top: centerY / fh,
        height: (b?.height ?? 0) / fh,
      });
    }
  }
  return out;
}

/** MRZ canlı tarama ile aynı ML Kit motoru — tek kare (galeri / kimlik çekim). */
export async function ocrLinesFromMrzStillImage(
  uri: string
): Promise<{ lines: string[]; engine: typeof MRZ_OCR_ENGINE_VISION_MLKIT } | null> {
  if (!isMrzVisionScannerAvailable()) return null;
  try {
    const mlkit = await import('react-native-vision-camera-mlkit');
    const processImageTextRecognition = mlkit.processImageTextRecognition as (
      imageUri: string,
      options?: { language?: string; scaleFactor?: number }
    ) => Promise<MlKitResult>;

    const { height } = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      Image.getSize(uri, (width, h) => resolve({ width, height: h }), reject);
    });

    const result = await processImageTextRecognition(uri, {
      language: 'LATIN',
      scaleFactor: 1.5,
    });
    const blocks = blocksFromMlKitResult(result, height);
    const lines = linesFromMlKitOcr(result.text ?? '', blocks);
    if (lines.length === 0) return null;
    return { lines, engine: MRZ_OCR_ENGINE_VISION_MLKIT };
  } catch {
    return null;
  }
}
