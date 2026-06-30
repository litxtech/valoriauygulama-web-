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

/** MRZ canlı tarama ile aynı ML Kit motoru. */
const MLKIT_SCALE_FACTORS = [1.5, 2.0, 2.5] as const;
const MLKIT_SCALE_FAST = 1.75;

function looksMrzRich(lines: string[]): boolean {
  const mrzish = lines.filter((l) => l.includes('<<') || /^[A-Z0-9<]{28,}$/i.test(l.replace(/\s/g, '')));
  return mrzish.length >= 2;
}

export async function ocrLinesFromMrzStillImage(
  uri: string,
  opts?: { fast?: boolean }
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

    const scales = opts?.fast !== false ? [MLKIT_SCALE_FAST] : [...MLKIT_SCALE_FACTORS];
    const lineSets: string[][] = [];
    for (const scaleFactor of scales) {
      try {
        const result = await processImageTextRecognition(uri, {
          language: 'LATIN',
          scaleFactor,
        });
        const blocks = blocksFromMlKitResult(result, height);
        const lines = linesFromMlKitOcr(result.text ?? '', blocks);
        if (lines.length >= 2) {
          lineSets.push(lines);
          if (opts?.fast !== false && looksMrzRich(lines)) break;
        }
      } catch {
        /* sonraki ölçek */
      }
    }

    if (lineSets.length === 0) {
      const result = await processImageTextRecognition(uri, { language: 'LATIN', scaleFactor: 2 });
      const blocks = blocksFromMlKitResult(result, height);
      const lines = linesFromMlKitOcr(result.text ?? '', blocks);
      if (lines.length === 0) return null;
      return { lines, engine: MRZ_OCR_ENGINE_VISION_MLKIT };
    }

    const merged = [...new Set(lineSets.flatMap((s) => s.map((l) => l.trim()).filter(Boolean)))];
    return { lines: merged, engine: MRZ_OCR_ENGINE_VISION_MLKIT };
  } catch {
    return null;
  }
}
