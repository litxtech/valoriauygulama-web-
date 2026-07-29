/**
 * POS fiş OCR — MRZ/kimlik filtresi YOK.
 * (Genel ocrLinesFromImage alt bölge MRZ kesiti kullandığı için
 *  bazen SATIŞ TUTARI / TOPLAM kayboluyordu.)
 */
import { Image } from 'react-native';
import { isMrzVisionScannerAvailable } from '@/lib/scanner/mrzVisionAvailability';

type MlKitLine = { text?: string; bounds?: { centerY?: number; top?: number; height?: number } };
type MlKitBlock = { lines?: MlKitLine[]; text?: string };
type MlKitResult = { text?: string; blocks?: MlKitBlock[] };

function linesFromFullReceiptText(result: MlKitResult): string[] {
  const fromText = (result.text ?? '')
    .split(/[\r\n]+/)
    .map((l) => l.trim())
    .filter((l) => l.length >= 1);

  const fromBlocks: { t: string; y: number }[] = [];
  for (const block of result.blocks ?? []) {
    for (const line of block.lines ?? []) {
      const t = line.text?.trim() ?? '';
      if (t.length < 1) continue;
      const y = line.bounds?.centerY ?? line.bounds?.top ?? 0;
      fromBlocks.push({ t, y });
    }
    const bt = block.text?.trim();
    if (bt && bt.length >= 2 && !(block.lines?.length)) {
      fromBlocks.push({ t: bt, y: 0 });
    }
  }

  fromBlocks.sort((a, b) => a.y - b.y);
  const blockLines = fromBlocks.map((x) => x.t);

  // Daha zengin olanı tercih et; ikisini birleştir (sıra koru)
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const l of [...fromText, ...blockLines]) {
    const key = l.toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(l);
  }
  return merged;
}

const FAST_SCALES = [2.0, 2.5] as const;
const QUALITY_SCALES = [1.5, 2.0, 2.5, 3.0, 3.5] as const;

/**
 * ML Kit Latin metin tanıma — fişin tamamı (üst+orta+alt).
 */
export async function ocrPosLinesFromMlKit(
  uri: string,
  opts?: { quality?: boolean }
): Promise<{ lines: string[]; engine: string } | null> {
  if (!isMrzVisionScannerAvailable()) return null;

  try {
    const mlkit = await import('react-native-vision-camera-mlkit');
    const processImageTextRecognition = mlkit.processImageTextRecognition as (
      imageUri: string,
      options?: { language?: string; scaleFactor?: number }
    ) => Promise<MlKitResult>;

    // getSize başarısız olsa da OCR dene
    try {
      await new Promise<void>((resolve, reject) => {
        Image.getSize(uri, () => resolve(), reject);
      });
    } catch {
      /* content:// bazen getSize vermez — devam */
    }

    const scales = opts?.quality ? QUALITY_SCALES : FAST_SCALES;
    let best: string[] = [];

    for (const scaleFactor of scales) {
      try {
        const result = await processImageTextRecognition(uri, {
          language: 'LATIN',
          scaleFactor,
        });
        const lines = linesFromFullReceiptText(result);
        if (lines.length > best.length) best = lines;
        // Yeterince dolu + tutar kuruşlu varsa erken çık (hız)
        if (
          !opts?.quality &&
          lines.length >= 6 &&
          lines.some((l) => /\d+[.,]\d{2}\s*(?:TL|TRY|₺)?/i.test(l)) &&
          lines.some((l) => /t[o0]plam|tutar|odenecek|sat[iı][sş]/i.test(l))
        ) {
          break;
        }
      } catch {
        /* sonraki ölçek */
      }
    }

    if (!best.length) {
      try {
        const result = await processImageTextRecognition(uri, {
          language: 'LATIN',
          scaleFactor: 2,
        });
        best = linesFromFullReceiptText(result);
      } catch {
        return null;
      }
    }

    if (!best.length) return null;
    return { lines: best, engine: 'vision-camera-mlkit-pos' };
  } catch {
    return null;
  }
}
