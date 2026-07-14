/**
 * Pasaport kimlik alanları (no / doğum / son geçerlilik / cinsiyet / uyruk):
 * İsimlerdeki gibi — MRZ güvenilirken MRZ; bozulunca etiketli görsel OCR; ezber yok.
 */
import {
  extractGenderFromOcr,
  extractNationalityFromOcr,
  extractPassportIdentityFromOcr,
} from '@/lib/guestScan/idCardOcrParser';
import { hasPlausibleKbsDocumentNumber } from '@/lib/kbsDocumentNumberValidate';
import { isPlausibleBirthDate, isPlausibleExpiryDate } from '@/lib/kbsCaptureOcrMerge';
import { isGccNationality } from '@/lib/scanner/mrzPersonNames';
import type { ParsedDocument } from '@/lib/scanner/types';

function normDoc(raw: string | null | undefined): string | null {
  const s = String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  return s || null;
}

/** OCR harf/rakam karışıklığını pasaport no karşılaştırması için hizala. */
function normalizeDocForCompare(raw: string | null | undefined): string | null {
  const s = normDoc(raw);
  if (!s) return null;
  return s
    .replace(/O/g, '0')
    .replace(/[Il]/g, '1')
    .replace(/S/g, '5')
    .replace(/B/g, '8')
    .replace(/Z/g, '2')
    .replace(/G/g, '6');
}

function docsAgree(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeDocForCompare(a);
  const nb = normalizeDocForCompare(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  // Tek karakter fark (OCR gürültüsü) — aynı uzunluk
  if (na.length === nb.length && na.length >= 6) {
    let diff = 0;
    for (let i = 0; i < na.length; i++) if (na[i] !== nb[i]) diff++;
    return diff <= 1;
  }
  return na.includes(nb) || nb.includes(na);
}

function pickDocumentNumber(
  mrz: string | null | undefined,
  visual: string | null | undefined,
  mrzTrusted: boolean,
  preferVisual: boolean
): string | null {
  const m = (mrz ?? '').trim().toUpperCase() || null;
  const v = (visual ?? '').trim().toUpperCase() || null;
  const mOk = hasPlausibleKbsDocumentNumber(m, 'passport');
  const vOk = hasPlausibleKbsDocumentNumber(v, 'passport');

  if (mOk && vOk && docsAgree(m, v)) return m!;
  if (mrzTrusted && mOk) return m!;
  if (preferVisual && vOk) return v!;
  if (!mrzTrusted && vOk && (!mOk || !docsAgree(m, v))) return v!;
  if (mOk) return m!;
  if (vOk) return v!;
  return m ?? v;
}

function pickIsoDate(
  mrz: string | null | undefined,
  visual: string | null | undefined,
  kind: 'birth' | 'expiry',
  mrzTrusted: boolean,
  preferVisual: boolean
): string | null {
  const m = (mrz ?? '').slice(0, 10) || null;
  const v = (visual ?? '').slice(0, 10) || null;
  const ok = kind === 'birth' ? isPlausibleBirthDate : isPlausibleExpiryDate;
  const mOk = !!(m && ok(m));
  const vOk = !!(v && ok(v));

  if (mOk && vOk && m === v) return m!;
  if (mrzTrusted && mOk) return m!;
  if (preferVisual && vOk) return v!;
  if (!mrzTrusted && vOk && (!mOk || m !== v)) return v!;
  if (mOk) return m!;
  if (vOk) return v!;
  return null;
}

function mrzIdentityUncertain(parsed: ParsedDocument): boolean {
  if (parsed.checksumsValid === false) return true;
  const w = parsed.warnings ?? [];
  return w.some(
    (x) =>
      x === 'mrz_fallback_parse' ||
      x.includes('uncertain') ||
      x.includes('checksum') ||
      x === 'MRZ checksum validation failed'
  );
}

/**
 * Pasaport no / doğum / son geçerlilik / cinsiyet / uyruk — isimlerle aynı hassasiyet.
 */
export function applyBestPassportIdentityToParsed(
  parsed: ParsedDocument,
  lines: string[],
  mrzSource?: ParsedDocument | null
): ParsedDocument {
  const isPassport =
    parsed.documentType === 'passport' ||
    !!parsed.rawMrz ||
    lines.join(' ').toUpperCase().includes('PASSPORT');
  if (!isPassport) return parsed;

  const mrz = mrzSource ?? parsed;
  const mrzTrusted = mrz.checksumsValid === true;
  const uncertain = mrzIdentityUncertain(mrz) || !mrzTrusted;
  const preferVisual =
    uncertain ||
    isGccNationality(parsed.nationalityCode) ||
    isGccNationality(parsed.issuingCountryCode) ||
    isGccNationality(mrz.nationalityCode);

  const visual = extractPassportIdentityFromOcr(lines);

  const documentNumber = pickDocumentNumber(
    mrz.documentNumber ?? parsed.documentNumber,
    visual.documentNumber,
    mrzTrusted,
    preferVisual
  );

  let birthDate = pickIsoDate(
    mrz.birthDate ?? parsed.birthDate,
    visual.birthDate,
    'birth',
    mrzTrusted,
    preferVisual
  );
  let expiryDate = pickIsoDate(
    mrz.expiryDate ?? parsed.expiryDate,
    visual.expiryDate,
    'expiry',
    mrzTrusted,
    preferVisual
  );

  // Doğum son geçerlilikten sonra olamaz
  if (birthDate && expiryDate && birthDate > expiryDate) {
    if (mrzTrusted && isPlausibleBirthDate(mrz.birthDate) && isPlausibleExpiryDate(mrz.expiryDate)) {
      birthDate = mrz.birthDate!.slice(0, 10);
      expiryDate = mrz.expiryDate!.slice(0, 10);
    } else if (visual.birthDate && visual.expiryDate && visual.birthDate <= visual.expiryDate) {
      birthDate = visual.birthDate;
      expiryDate = visual.expiryDate;
    } else if (preferVisual) {
      // Çelişkide görsel etiketlileri tercih et; yoksa doğumu tut expiry'yi temizle
      if (visual.birthDate) birthDate = visual.birthDate;
      if (visual.expiryDate && (!birthDate || visual.expiryDate >= birthDate)) {
        expiryDate = visual.expiryDate;
      } else {
        expiryDate = null;
      }
    }
  }

  const gender =
    (mrzTrusted ? mrz.gender : null) ??
    (preferVisual ? visual.gender ?? mrz.gender ?? parsed.gender : null) ??
    mrz.gender ??
    parsed.gender ??
    visual.gender ??
    extractGenderFromOcr(lines);

  const nationalityCode =
    (mrzTrusted ? mrz.nationalityCode : null) ??
    parsed.nationalityCode ??
    mrz.nationalityCode ??
    visual.nationalityCode ??
    extractNationalityFromOcr(lines);

  const issuingCountryCode =
    (mrzTrusted ? mrz.issuingCountryCode : null) ??
    parsed.issuingCountryCode ??
    mrz.issuingCountryCode ??
    nationalityCode;

  return {
    ...parsed,
    documentType: 'passport',
    documentNumber: documentNumber ?? parsed.documentNumber,
    birthDate,
    expiryDate,
    gender,
    nationalityCode,
    issuingCountryCode,
  };
}
