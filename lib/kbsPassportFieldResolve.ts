/**
 * Pasaport kimlik alanları (no / doğum / son geçerlilik / cinsiyet / uyruk):
 * Checksum’lu MRZ otoriter; şüphede MRZ hâlâ kimlik için öncelikli (görsel ezmesin);
 * belge no check-digit onarımı; çelişkide mrz_needs_review.
 */
import {
  extractGenderFromOcr,
  extractNationalityFromOcr,
  extractPassportIdentityFromOcr,
} from '@/lib/guestScan/idCardOcrParser';
import { hasPlausibleKbsDocumentNumber } from '@/lib/kbsDocumentNumberValidate';
import { isPlausibleBirthDate, isPlausibleExpiryDate } from '@/lib/kbsCaptureOcrMerge';
import {
  MRZ_DOC_REPAIRED_WARNING,
  MRZ_IDENTITY_CONFLICT_WARNING,
  isMrzChecksumSuspicious,
  pushParsedWarning,
  withMrzNeedsReviewWarning,
} from '@/lib/kbsMrzSuspicion';
import { repairDocumentNumberFromRawMrz } from '@/lib/scanner/mrzDocumentNumberRepair';
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

/**
 * Belge no: MRZ (onarılmış dahil) öncelikli.
 * Çelişkide görsel MRZ’yi ezmez — yalnız MRZ yok/geçersizse görsel.
 */
function pickDocumentNumber(
  mrz: string | null | undefined,
  visual: string | null | undefined,
  mrzTrusted: boolean
): { value: string | null; conflict: boolean } {
  const m = (mrz ?? '').trim().toUpperCase() || null;
  const v = (visual ?? '').trim().toUpperCase() || null;
  const mOk = hasPlausibleKbsDocumentNumber(m, 'passport');
  const vOk = hasPlausibleKbsDocumentNumber(v, 'passport');

  if (mOk && vOk && docsAgree(m, v)) return { value: m!, conflict: false };
  if (mOk && vOk && !docsAgree(m, v)) {
    // A: çelişkide her zaman MRZ (görsel ezmesin)
    return { value: m!, conflict: true };
  }
  if (mrzTrusted && mOk) return { value: m!, conflict: false };
  if (mOk) return { value: m!, conflict: false };
  if (vOk) return { value: v!, conflict: false };
  return { value: m ?? v, conflict: false };
}

function pickIsoDate(
  mrz: string | null | undefined,
  visual: string | null | undefined,
  kind: 'birth' | 'expiry',
  mrzTrusted: boolean
): { value: string | null; conflict: boolean } {
  const m = (mrz ?? '').slice(0, 10) || null;
  const v = (visual ?? '').slice(0, 10) || null;
  const ok = kind === 'birth' ? isPlausibleBirthDate : isPlausibleExpiryDate;
  const mOk = !!(m && ok(m));
  const vOk = !!(v && ok(v));

  if (mOk && vOk && m === v) return { value: m!, conflict: false };
  if (mOk && vOk && m !== v) {
    return { value: mrzTrusted || mOk ? m! : v!, conflict: true };
  }
  if (mrzTrusted && mOk) return { value: m!, conflict: false };
  if (mOk) return { value: m!, conflict: false };
  if (vOk) return { value: v!, conflict: false };
  return { value: null, conflict: false };
}

/**
 * Pasaport no / doğum / son geçerlilik / cinsiyet / uyruk.
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
  const uncertain = isMrzChecksumSuspicious(mrz);
  // Görsel yalnız cinsiyet/uyruk boşken; kimlik no/tarihte MRZ’yi ezmesin.
  const preferVisualGenderNat =
    uncertain ||
    isGccNationality(parsed.nationalityCode) ||
    isGccNationality(parsed.issuingCountryCode) ||
    isGccNationality(mrz.nationalityCode);

  const visual = extractPassportIdentityFromOcr(lines);

  // B: raw MRZ check digit ile belge no onar
  const repaired = repairDocumentNumberFromRawMrz(mrz.rawMrz ?? parsed.rawMrz);
  let mrzDoc = mrz.documentNumber ?? parsed.documentNumber;
  let docRepaired = false;
  if (repaired?.documentNumber) {
    if (!mrzDoc || !docsAgree(mrzDoc, repaired.documentNumber) || repaired.repaired) {
      if (repaired.repaired || !mrzDoc) {
        mrzDoc = repaired.documentNumber;
        docRepaired = repaired.repaired;
      } else if (hasPlausibleKbsDocumentNumber(repaired.documentNumber, 'passport')) {
        // Check geçen MRZ alanı mevcut no ile uyumlu — check’li versiyonu tercih et
        mrzDoc = repaired.documentNumber;
      }
    }
  }

  const docPick = pickDocumentNumber(mrzDoc, visual.documentNumber, mrzTrusted);
  const birthPick = pickIsoDate(
    mrz.birthDate ?? parsed.birthDate,
    visual.birthDate,
    'birth',
    mrzTrusted
  );
  const expiryPick = pickIsoDate(
    mrz.expiryDate ?? parsed.expiryDate,
    visual.expiryDate,
    'expiry',
    mrzTrusted
  );

  let birthDate = birthPick.value;
  let expiryDate = expiryPick.value;

  // Doğum son geçerlilikten sonra olamaz
  if (birthDate && expiryDate && birthDate > expiryDate) {
    if (mrzTrusted && isPlausibleBirthDate(mrz.birthDate) && isPlausibleExpiryDate(mrz.expiryDate)) {
      birthDate = mrz.birthDate!.slice(0, 10);
      expiryDate = mrz.expiryDate!.slice(0, 10);
    } else if (visual.birthDate && visual.expiryDate && visual.birthDate <= visual.expiryDate) {
      birthDate = visual.birthDate;
      expiryDate = visual.expiryDate;
    } else if (isPlausibleBirthDate(mrz.birthDate) && isPlausibleExpiryDate(mrz.expiryDate)) {
      birthDate = mrz.birthDate!.slice(0, 10);
      expiryDate = mrz.expiryDate!.slice(0, 10);
    } else {
      expiryDate = null;
    }
  }

  const gender =
    (mrzTrusted ? mrz.gender : null) ??
    (preferVisualGenderNat ? visual.gender ?? mrz.gender ?? parsed.gender : null) ??
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

  let next: ParsedDocument = {
    ...parsed,
    documentType: 'passport',
    documentNumber: docPick.value ?? parsed.documentNumber,
    birthDate,
    expiryDate,
    gender,
    nationalityCode,
    issuingCountryCode,
  };

  if (docRepaired) next = pushParsedWarning(next, MRZ_DOC_REPAIRED_WARNING);
  if (docPick.conflict || birthPick.conflict || expiryPick.conflict) {
    next = pushParsedWarning(next, MRZ_IDENTITY_CONFLICT_WARNING);
  }
  if (uncertain || docPick.conflict || birthPick.conflict || expiryPick.conflict) {
    next = withMrzNeedsReviewWarning(next);
  }

  return next;
}
