import { Image } from 'react-native';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

/** Masa / tezgah / otel yazıları — belge dışı gürültü. */
const SURFACE_NOISE_RE =
  /(?:masa|tezgah|table|desk|hotel|otel|oda\s*no|reception|resepsiyon|valoria|www\.|https?:|instagram|facebook|whatsapp|menü|menu|wifi|wi-fi|kahve|coffee|restoran)/i;

const MRZ_CHARS_RE = /^[A-Z0-9<][A-Z0-9<\s]{18,}$/i;
const LABEL_RE =
  /(?:soyad|surname|family|given\s*name|ad[ıi]|do[gğ]um|birth|uyruk|nationality|kimlik|pasaport|passport|valid|geçerl|seri|anne|baba|mother|father|cinsiyet|sex|gender|medeni|<<<|IDTUR|IDTUR|t\.?\s*c\.?\s*kimlik)/i;
const TC_RE = /\b[1-9]\d{10}\b/;
const YKN_RE = /\b99\d{9}\b/;
const DATE_RE = /\b\d{2}[./]\d{2}[./]\d{4}\b/;
const SERIAL_RE = /\b[A-Z]{1,3}\s*\d{5,9}\b/i;

function isDocumentRelevantLine(line: string): boolean {
  const t = line.trim();
  if (t.length < 2) return false;
  if (SURFACE_NOISE_RE.test(t)) return false;
  const compact = t.replace(/\s/g, '');
  if (compact.includes('<<') || MRZ_CHARS_RE.test(t)) return true;
  if (LABEL_RE.test(t)) return true;
  if (TC_RE.test(t) || YKN_RE.test(t) || DATE_RE.test(t)) return true;
  if (SERIAL_RE.test(t)) return true;
  if (t.length > 80) return false;
  if (/^[A-Za-zÇĞİÖŞÜçğıöşü\s'.-]+$/.test(t)) {
    const letters = (t.match(/[A-Za-zÇĞİÖŞÜçğıöşü]/g) || []).length;
    const digits = (t.match(/\d/g) || []).length;
    return letters >= 3 && digits <= Math.max(2, Math.floor(letters * 0.2));
  }
  return false;
}

/** OCR satırları: kimlik / pasaport alanları; masa ve arka plan metni elenir. */
function isMrzLikeLine(line: string): boolean {
  const compact = line.replace(/\s/g, '');
  return compact.includes('<<') || MRZ_CHARS_RE.test(line);
}

export function filterKbsOcrLines(lines: string[]): string[] {
  const trimmed = lines.map((l) => l.trim()).filter((l) => l.length > 0);
  const mrzKeep = trimmed.filter(isMrzLikeLine);
  const withoutSurface = trimmed.filter((l) => !SURFACE_NOISE_RE.test(l));
  const focused = withoutSurface.filter(isDocumentRelevantLine);

  if (focused.length >= 1) return [...new Set([...mrzKeep, ...focused])];

  const soft = withoutSurface.filter((l) => l.length <= 120 && !/^[0-9\s./-]+$/.test(l));
  const merged = soft.length > 0 ? soft : trimmed;
  return [...new Set([...mrzKeep, ...merged])];
}

/** Yalnızca MRZ şeridine benzeyen satırlar (merkez OCR gürültüsü hariç). */
export function filterMrzOnlyOcrLines(lines: string[]): string[] {
  return lines.map((l) => l.trim()).filter((l) => l.length > 0 && isMrzLikeLine(l));
}

/** MRZ satırlarını asla filtreleme — pasaport adı / no için ham satırlar. */
export function mergeKbsOcrLineSets(...sets: string[][]): string[] {
  const all = sets.flatMap((s) => s.map((l) => l.trim()).filter(Boolean));
  return [...new Set(all)];
}

/**
 * Kimlik fotoğrafının merkez bölgesi (belge alanı); kenar/tezgah metni OCR’a girmez.
 */
/** Pasaport / kimlik MRZ şeridi — alt bant (MRZ kesilmesin diye ayrı OCR). */
export async function cropMrzBandForKbsOcr(uri: string): Promise<string> {
  try {
    const { width, height } = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      Image.getSize(uri, (w, h) => resolve({ width: w, height: h }), reject);
    });
    const cropH = Math.round(height * 0.52);
    const originY = Math.max(0, height - cropH);
    const cropW = Math.round(width * 0.96);
    const originX = Math.max(0, Math.round((width - cropW) / 2));
    const safeW = Math.min(cropW, width - originX);
    const safeH = Math.min(cropH, height - originY);
    if (safeW < 80 || safeH < 40) return uri;

    const out = await manipulateAsync(
      uri,
      [{ crop: { originX, originY, width: safeW, height: safeH } }],
      { compress: 0.98, format: SaveFormat.JPEG }
    );
    return out.uri;
  } catch {
    return uri;
  }
}

export type KbsOcrRegionId =
  | 'full'
  | 'document_crop'
  | 'mrz_band'
  | 'top_half'
  | 'bottom_half'
  | 'center';

async function cropRect(
  uri: string,
  originX: number,
  originY: number,
  cropW: number,
  cropH: number
): Promise<string> {
  try {
    const { width, height } = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      Image.getSize(uri, (w, h) => resolve({ width: w, height: h }), reject);
    });
    const safeW = Math.min(Math.round(cropW), width - originX);
    const safeH = Math.min(Math.round(cropH), height - originY);
    if (safeW < 80 || safeH < 40) return uri;
    const out = await manipulateAsync(
      uri,
      [{ crop: { originX: Math.max(0, originX), originY: Math.max(0, originY), width: safeW, height: safeH } }],
      { compress: 0.98, format: SaveFormat.JPEG }
    );
    return out.uri;
  } catch {
    return uri;
  }
}

/** Galeri derin tarama — belgenin üst yarısı. */
export async function cropTopHalfForKbsOcr(uri: string): Promise<string> {
  const { width, height } = await new Promise<{ width: number; height: number }>((resolve, reject) => {
    Image.getSize(uri, (w, h) => resolve({ width: w, height: h }), reject);
  });
  return cropRect(uri, Math.round(width * 0.02), Math.round(height * 0.02), width * 0.96, height * 0.48);
}

/** Galeri derin tarama — belgenin alt yarısı (MRZ + alt alanlar). */
export async function cropBottomHalfForKbsOcr(uri: string): Promise<string> {
  const { width, height } = await new Promise<{ width: number; height: number }>((resolve, reject) => {
    Image.getSize(uri, (w, h) => resolve({ width: w, height: h }), reject);
  });
  const cropH = height * 0.5;
  const originY = Math.max(0, height - cropH - Math.round(height * 0.02));
  return cropRect(uri, Math.round(width * 0.02), originY, width * 0.96, cropH);
}

/** Galeri derin tarama — merkez bölge (ad / soyad alanı). */
export async function cropCenterForKbsOcr(uri: string): Promise<string> {
  const { width, height } = await new Promise<{ width: number; height: number }>((resolve, reject) => {
    Image.getSize(uri, (w, h) => resolve({ width: w, height: h }), reject);
  });
  return cropRect(uri, Math.round(width * 0.06), Math.round(height * 0.18), width * 0.88, height * 0.58);
}

/** Galeri OCR — tüm belge bölgeleri. */
export async function buildGalleryOcrRegions(uri: string): Promise<{ region: KbsOcrRegionId; uri: string }[]> {
  const [documentCrop, mrzBand, topHalf, bottomHalf, center] = await Promise.all([
    cropImageForKbsOcr(uri),
    cropMrzBandForKbsOcr(uri),
    cropTopHalfForKbsOcr(uri),
    cropBottomHalfForKbsOcr(uri),
    cropCenterForKbsOcr(uri),
  ]);
  return [
    { region: 'full', uri },
    { region: 'document_crop', uri: documentCrop },
    { region: 'mrz_band', uri: mrzBand },
    { region: 'top_half', uri: topHalf },
    { region: 'bottom_half', uri: bottomHalf },
    { region: 'center', uri: center },
  ];
}

/** Ön yüz / tam kart — alt MRZ şeridi kesilmesin (pasaport biyometrik sayfa). */
export async function cropImageForKbsOcr(uri: string): Promise<string> {
  try {
    const { width, height } = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      Image.getSize(uri, (w, h) => resolve({ width: w, height: h }), reject);
    });
    const cropW = Math.round(width * 0.96);
    const cropH = Math.round(height * 0.94);
    const originX = Math.max(0, Math.round((width - cropW) / 2));
    const originY = Math.max(0, Math.round(height * 0.03));
    const safeW = Math.min(cropW, width - originX);
    const safeH = Math.min(cropH, height - originY);
    if (safeW < 80 || safeH < 80) return uri;

    const out = await manipulateAsync(
      uri,
      [{ crop: { originX, originY, width: safeW, height: safeH } }],
      { compress: 0.96, format: SaveFormat.JPEG }
    );
    return out.uri;
  } catch {
    return uri;
  }
}
