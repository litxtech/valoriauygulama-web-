import { buildGalleryOcrRegions } from '@/lib/kbsOcrDocumentFocus';
import { buildKbsOcrEnhancedVariantsCached } from '@/lib/kbsOcrSessionCache';
import { prepareProfessionalKbsOcrUri } from '@/lib/kbsOcrImageEnhance';
import { extractMrzFromLinesBest } from '@/lib/scanner/mrzExtractLines';
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

const GALLERY_REGION_PRIORITY = [
  'mrz_band',
  'bottom_half',
  'document_crop',
  'full',
  'center',
  'top_half',
] as const;

const GALLERY_OCR_CONCURRENCY = 3;

function pickEngine(...engines: string[]): string {
  return engines.some((e) => e === MRZ_OCR_ENGINE_VISION_MLKIT)
    ? MRZ_OCR_ENGINE_VISION_MLKIT
    : engines[0] ?? MRZ_OCR_ENGINE_VISION_MLKIT;
}

function hasConfidentMrz(lineSets: MrzDocumentOcrLineSet[]): boolean {
  const flat = flattenMrzDocumentOcrLineSets(lineSets);
  const best = extractMrzFromLinesBest(flat, { kbsRelaxed: true });
  return !!best && (best.parsed.checksumsValid === true || best.score >= 72);
}

async function prepareKbsOcrUri(uri: string, imagePrepared?: boolean): Promise<string> {
  return imagePrepared ? uri : prepareProfessionalKbsOcrUri(uri);
}

async function runPass(
  ocr: typeof ocrLinesFromImage,
  pass: MrzDocumentOcrPassId,
  imageUri: string,
  fast: boolean,
  imagePrepared?: boolean
): Promise<MrzDocumentOcrLineSet | null> {
  try {
    const result = await ocr(imageUri, { document: true, fast, imagePrepared });
    if (!result.lines.length) return null;
    return { pass, lines: result.lines };
  } catch {
    return null;
  }
}

function pushSet(
  lineSets: MrzDocumentOcrLineSet[],
  engines: string[],
  set: MrzDocumentOcrLineSet | null
): void {
  if (!set) return;
  lineSets.push(set);
  engines.push(MRZ_OCR_ENGINE_VISION_MLKIT);
}

function hasEnoughFastLines(lineSets: MrzDocumentOcrLineSet[], mrzFocused: boolean): boolean {
  if (hasConfidentMrz(lineSets)) return true;
  const flat = flattenMrzDocumentOcrLineSets(lineSets);
  if (flat.length < 4) return false;
  if (mrzFocused) return lineSets.some((s) => s.pass === 'mrz_band');
  return lineSets.some((s) => s.pass === 'document_crop') && flat.length >= 6;
}

/**
 * Kimlik / pasaport görseli OCR.
 * fast: belge kırpımı + tam görüntü (2 geçiş, ~3× daha hızlı).
 */
export async function ocrLinesForKbsDocument(
  uri: string,
  opts?: { expoOnly?: boolean; mrzFocused?: boolean; fast?: boolean; imagePrepared?: boolean }
): Promise<MrzDocumentOcrResult> {
  const ocr = opts?.expoOnly ? ocrLinesFromImageExpoOnly : ocrLinesFromImage;
  const fast = opts?.fast !== false;
  const mrzFocused = !!opts?.mrzFocused;
  const lineSets: MrzDocumentOcrLineSet[] = [];
  const engines: string[] = [];

  if (fast) {
    const prepared = await prepareKbsOcrUri(uri, opts?.imagePrepared);
    const variants = await buildKbsOcrEnhancedVariantsCached(prepared);
    const ocrOpts = { imagePrepared: true as const };

    if (mrzFocused) {
      const [bandSet, docSet] = await Promise.all([
        runPass(ocr, 'mrz_band', variants.mrzBand, true, ocrOpts.imagePrepared),
        runPass(ocr, 'document_crop', variants.documentCrop, true, ocrOpts.imagePrepared),
      ]);
      pushSet(lineSets, engines, bandSet);
      pushSet(lineSets, engines, docSet);
    } else {
      pushSet(
        lineSets,
        engines,
        await runPass(ocr, 'document_crop', variants.documentCrop, true, ocrOpts.imagePrepared)
      );
    }

    if (mrzFocused && hasConfidentMrz(lineSets)) {
      return { lineSets, engine: pickEngine(...engines) };
    }
    if (hasEnoughFastLines(lineSets, mrzFocused)) {
      return { lineSets, engine: pickEngine(...engines) };
    }

    const fullSet = await runPass(ocr, 'full', variants.full, true, ocrOpts.imagePrepared);
    pushSet(lineSets, engines, fullSet);

    return { lineSets, engine: pickEngine(...engines) };
  }

  const prepared = await prepareKbsOcrUri(uri, opts?.imagePrepared);
  const variants = await buildKbsOcrEnhancedVariantsCached(prepared);
  const passes: { pass: MrzDocumentOcrPassId; imageUri: string }[] = mrzFocused
    ? [
        { pass: 'mrz_band', imageUri: variants.mrzBand },
        { pass: 'document_crop', imageUri: variants.documentCrop },
        { pass: 'full', imageUri: variants.full },
      ]
    : [
        { pass: 'document_crop', imageUri: variants.documentCrop },
        { pass: 'full', imageUri: variants.full },
      ];

  for (const { pass, imageUri } of passes) {
    const set = await runPass(ocr, pass, imageUri, false, true);
    pushSet(lineSets, engines, set);
  }

  return { lineSets, engine: pickEngine(...engines) };
}

async function ocrGalleryRegion(
  region: string,
  regionUri: string,
  lineSets: MrzDocumentOcrLineSet[],
  engines: string[]
): Promise<void> {
  const pass = region as MrzDocumentOcrPassId;
  try {
    const hybrid = await ocrLinesFromImage(regionUri, { document: true, fast: false, imagePrepared: true });
    if (hybrid.lines.length) {
      lineSets.push({ pass, lines: hybrid.lines });
      engines.push(hybrid.engine);
    }
  } catch {
    /* sonraki bölge */
  }

  if (hasConfidentMrz(lineSets)) return;

  try {
    const expo = await ocrLinesFromImageExpoOnly(regionUri, { document: true, fast: false, imagePrepared: true });
    if (expo.lines.length) {
      lineSets.push({ pass: `${pass}_expo` as MrzDocumentOcrPassId, lines: expo.lines });
      engines.push(expo.engine);
    }
  } catch {
    /* expo yedek */
  }
}

/**
 * Galeri — belge bölgeleri paralel; MRZ bulununca erken çık.
 */
export async function ocrLinesForGalleryDocument(uri: string): Promise<MrzDocumentOcrResult> {
  const prepared = await prepareProfessionalKbsOcrUri(uri);
  const regions = await buildGalleryOcrRegions(prepared);
  const lineSets: MrzDocumentOcrLineSet[] = [];
  const engines: string[] = [];

  const ordered = [...regions].sort((a, b) => {
    const ia = GALLERY_REGION_PRIORITY.indexOf(a.region as (typeof GALLERY_REGION_PRIORITY)[number]);
    const ib = GALLERY_REGION_PRIORITY.indexOf(b.region as (typeof GALLERY_REGION_PRIORITY)[number]);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });

  for (let i = 0; i < ordered.length; i += GALLERY_OCR_CONCURRENCY) {
    const batch = ordered.slice(i, i + GALLERY_OCR_CONCURRENCY);
    await Promise.all(
      batch.map((entry) => ocrGalleryRegion(entry.region, entry.uri, lineSets, engines))
    );
    if (hasConfidentMrz(lineSets)) break;
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
