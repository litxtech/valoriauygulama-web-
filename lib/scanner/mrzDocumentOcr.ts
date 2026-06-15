import { cropImageForKbsOcr, cropMrzBandForKbsOcr } from '@/lib/kbsOcrDocumentFocus';
import { MRZ_OCR_ENGINE_VISION_MLKIT } from '@/lib/scanner/mrzOcrEngine';
import { ocrLinesFromImage, ocrLinesFromImageExpoOnly } from '@/lib/scanner/ocrLinesFromImage';

export type MrzDocumentOcrPassId = 'document_crop' | 'full' | 'mrz_band';

export type MrzDocumentOcrLineSet = {
  pass: MrzDocumentOcrPassId;
  lines: string[];
};

export type MrzDocumentOcrResult = {
  lineSets: MrzDocumentOcrLineSet[];
  engine: string;
};

function pickEngine(...engines: string[]): string {
  return engines.some((e) => e === MRZ_OCR_ENGINE_VISION_MLKIT)
    ? MRZ_OCR_ENGINE_VISION_MLKIT
    : engines[0] ?? MRZ_OCR_ENGINE_VISION_MLKIT;
}

/**
 * Kimlik / pasaport görseli — profesyonel çok geçişli OCR.
 * 1) Belge kadrajı (kenar gürültüsü az)
 * 2) Tam görüntü
 * 3) MRZ alt şerit (her zaman; pasaport / kimlik arkası)
 */
export async function ocrLinesForKbsDocument(
  uri: string,
  opts?: { expoOnly?: boolean; mrzFocused?: boolean }
): Promise<MrzDocumentOcrResult> {
  const ocr = opts?.expoOnly ? ocrLinesFromImageExpoOnly : ocrLinesFromImage;
  const lineSets: MrzDocumentOcrLineSet[] = [];
  const engines: string[] = [];

  const [docUri, bandUri] = await Promise.all([
    cropImageForKbsOcr(uri),
    cropMrzBandForKbsOcr(uri),
  ]);

  const passes: { pass: MrzDocumentOcrPassId; imageUri: string }[] = opts?.mrzFocused
    ? [
        { pass: 'mrz_band', imageUri: bandUri },
        { pass: 'document_crop', imageUri: docUri },
        { pass: 'full', imageUri: uri },
      ]
    : [
        { pass: 'document_crop', imageUri: docUri },
        { pass: 'full', imageUri: uri },
        { pass: 'mrz_band', imageUri: bandUri },
      ];

  for (const { pass, imageUri } of passes) {
    try {
      const result = await ocr(imageUri, { document: true });
      engines.push(result.engine);
      if (result.lines.length) {
        lineSets.push({ pass, lines: result.lines });
      }
    } catch {
      /* yedek geçiş */
    }
  }

  return {
    lineSets,
    engine: pickEngine(...engines),
  };
}

/** Tüm geçişlerden birleşik satır listesi (MRZ çıkarımı için). */
export function flattenMrzDocumentOcrLineSets(lineSets: MrzDocumentOcrLineSet[]): string[] {
  const ordered = [...lineSets].sort((a, b) => {
    const rank: Record<MrzDocumentOcrPassId, number> = {
      mrz_band: 0,
      document_crop: 1,
      full: 2,
    };
    return rank[a.pass] - rank[b.pass];
  });
  return [...new Set(ordered.flatMap((s) => s.lines.map((l) => l.trim()).filter(Boolean)))];
}
