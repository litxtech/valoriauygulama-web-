import { cropImageForKbsOcr, cropMrzBandForKbsOcr, buildGalleryOcrRegions } from '@/lib/kbsOcrDocumentFocus';
import { prepareProfessionalKbsOcrUri } from '@/lib/kbsOcrImageEnhance';
import { MRZ_OCR_ENGINE_VISION_MLKIT } from '@/lib/scanner/mrzOcrEngine';
import { ocrLinesFromImage, ocrLinesFromImageExpoOnly } from '@/lib/scanner/ocrLinesFromImage';

export type MrzDocumentOcrPassId =
  | 'document_crop'
  | 'full'
  | 'mrz_band'
  | 'pro_full'
  | 'pro_document_crop'
  | 'pro_mrz_band'
  | 'top_half'
  | 'bottom_half'
  | 'center'
  | `${string}_expo`;

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

async function runPass(
  ocr: typeof ocrLinesFromImage,
  pass: MrzDocumentOcrPassId,
  imageUri: string,
  fast: boolean
): Promise<MrzDocumentOcrLineSet | null> {
  try {
    const result = await ocr(imageUri, { document: true, fast });
    if (!result.lines.length) return null;
    return { pass, lines: result.lines };
  } catch {
    return null;
  }
}

/**
 * Kimlik / pasaport görseli OCR.
 * fast: belge kırpımı + tam görüntü (2 geçiş, ~3× daha hızlı).
 */
export async function ocrLinesForKbsDocument(
  uri: string,
  opts?: { expoOnly?: boolean; mrzFocused?: boolean; fast?: boolean }
): Promise<MrzDocumentOcrResult> {
  const ocr = opts?.expoOnly ? ocrLinesFromImageExpoOnly : ocrLinesFromImage;
  const fast = opts?.fast !== false;
  const mrzFocused = !!opts?.mrzFocused;
  const lineSets: MrzDocumentOcrLineSet[] = [];
  const engines: string[] = [];

  if (fast) {
    const prepared = await prepareProfessionalKbsOcrUri(uri);
    const docUri = await cropImageForKbsOcr(prepared);
    const bandUri = await cropMrzBandForKbsOcr(prepared);
    const order: { pass: MrzDocumentOcrPassId; imageUri: string }[] = mrzFocused
      ? [
          { pass: 'mrz_band', imageUri: bandUri },
          { pass: 'document_crop', imageUri: docUri },
          { pass: 'full', imageUri: prepared },
        ]
      : [
          { pass: 'mrz_band', imageUri: bandUri },
          { pass: 'document_crop', imageUri: docUri },
          { pass: 'full', imageUri: prepared },
        ];

    for (const { pass, imageUri } of order) {
      const set = await runPass(ocr, pass, imageUri, true);
      if (set) {
        lineSets.push(set);
        engines.push(MRZ_OCR_ENGINE_VISION_MLKIT);
      }
    }

    return { lineSets, engine: pickEngine(...engines) };
  }

  const prepared = await prepareProfessionalKbsOcrUri(uri);
  const [docUri, bandUri] = await Promise.all([
    cropImageForKbsOcr(prepared),
    cropMrzBandForKbsOcr(prepared),
  ]);
  const passes: { pass: MrzDocumentOcrPassId; imageUri: string }[] = mrzFocused
    ? [
        { pass: 'mrz_band', imageUri: bandUri },
        { pass: 'document_crop', imageUri: docUri },
        { pass: 'full', imageUri: prepared },
      ]
    : [
        { pass: 'mrz_band', imageUri: bandUri },
        { pass: 'document_crop', imageUri: docUri },
        { pass: 'full', imageUri: prepared },
      ];

  for (const { pass, imageUri } of passes) {
    const set = await runPass(ocr, pass, imageUri, false);
    if (set) {
      lineSets.push(set);
      engines.push(MRZ_OCR_ENGINE_VISION_MLKIT);
    }
  }

  return { lineSets, engine: pickEngine(...engines) };
}

/**
 * Galeri — tüm belge bölgeleri + ML Kit + expo; yavaş, eksiksiz okuma.
 */
export async function ocrLinesForGalleryDocument(uri: string): Promise<MrzDocumentOcrResult> {
  const prepared = await prepareProfessionalKbsOcrUri(uri);
  const regions = await buildGalleryOcrRegions(prepared);
  const lineSets: MrzDocumentOcrLineSet[] = [];
  const engines: string[] = [];

  for (const { region, uri: regionUri } of regions) {
    const pass = region as MrzDocumentOcrPassId;
    try {
      const hybrid = await ocrLinesFromImage(regionUri, { document: true, fast: false });
      if (hybrid.lines.length) {
        lineSets.push({ pass, lines: hybrid.lines });
        engines.push(hybrid.engine);
      }
    } catch {
      /* sonraki bölge */
    }
    try {
      const expo = await ocrLinesFromImageExpoOnly(regionUri, { document: true, fast: false });
      if (expo.lines.length) {
        lineSets.push({ pass: `${pass}_expo` as MrzDocumentOcrPassId, lines: expo.lines });
        engines.push(expo.engine);
      }
    } catch {
      /* expo yedek */
    }
  }

  return { lineSets, engine: pickEngine(...engines) };
}

/** Tüm geçişlerden birleşik satır listesi (MRZ çıkarımı için). */
export function flattenMrzDocumentOcrLineSets(lineSets: MrzDocumentOcrLineSet[]): string[] {
  const ordered = [...lineSets].sort((a, b) => {
    const rank: Record<string, number> = {
      pro_mrz_band: 0,
      mrz_band: 1,
      bottom_half: 2,
      pro_document_crop: 3,
      document_crop: 4,
      center: 5,
      top_half: 6,
      pro_full: 7,
      full: 8,
    };
    const ra = rank[a.pass] ?? (String(a.pass).endsWith('_expo') ? 9 : 10);
    const rb = rank[b.pass] ?? (String(b.pass).endsWith('_expo') ? 9 : 10);
    return ra - rb;
  });
  return [...new Set(ordered.flatMap((s) => s.lines.map((l) => l.trim()).filter(Boolean)))];
}
