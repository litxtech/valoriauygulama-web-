import { isUsablePersonName, sanitizePersonName } from '@/lib/guestScan/personNameUtils';
import { mrzNamesLookValid, stripSurnameFromGivenNames } from '@/lib/scanner/mrzPersonNames';
import type { ParsedDocument } from '@/lib/scanner/types';

const PLACEHOLDER_FIRST = 'MISAFIR';

const OCR_NOISE_NAME_RE =
  /^(?:TÜRKİYE|TURKEY|REPUBLIC|CUMHURİYET|KİMLİK|KIMLIK|IDENTITY|CARD|DOCUMENT|NÜFUS|NUFUS|PASAPORT|PASSPORT|UYRUK|NATIONALITY|VATANDAŞ|VATANDAS|GEÇİCİ|GECICI|KORUMA|BELGESİ|BELGESI|VALID|SERİ|SERI|CİLT|CILT|MAHALLE|KAYIT|İLÇE|ILCE|CİNSİYET|CINSIYET|ERKEK|KADIN|MEDENİ|MEDENI|DOGUM|DOĞUM|MASA|TEZGAH|TABLE|DESK|HOTEL|OTEL|RESEPSİYON|RECEPTION|VALORIA|WIFI|MENÜ|MENU|KAHOVE|COFFEE|RESTORAN|INSTAGRAM|FACEBOOK|WHATSAPP)/i;

function normNameKey(v: string | null | undefined): string {
  return sanitizePersonName(v)?.replace(/\s+/g, ' ') ?? '';
}

/** Kayıt sırasında otomatik atanan geçici ad (Misafir + oda-seq). */
export function isKbsPlaceholderName(parsed: ParsedDocument | null | undefined): boolean {
  if (!parsed) return false;
  const fn = normNameKey(parsed.firstName);
  const ln = (parsed.lastName ?? '').trim();
  return fn === PLACEHOLDER_FIRST && /^\S+-\d+$/.test(ln);
}

export function isPlausibleBirthDate(iso: string | null | undefined): boolean {
  if (!iso || iso.length < 10) return false;
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  const now = Date.now();
  const ageYears = (now - d.getTime()) / (365.25 * 24 * 3600 * 1000);
  return ageYears >= 0 && ageYears <= 120;
}

export function isPlausibleExpiryDate(iso: string | null | undefined): boolean {
  if (!iso || iso.length < 10) return false;
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  const yearsAhead = (d.getTime() - Date.now()) / (365.25 * 24 * 3600 * 1000);
  return yearsAhead >= -1 && yearsAhead <= 30;
}

function isLikelyOcrNoiseName(raw: string | null | undefined): boolean {
  const s = sanitizePersonName(raw);
  if (!s) return true;
  if (OCR_NOISE_NAME_RE.test(s)) return true;
  if (s.length > 48) return true;
  return false;
}

function isValidDocNumber(raw: string | null | undefined): boolean {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (digits.length === 11 && /^[1-9]/.test(digits)) return true;
  if (digits.length === 11 && digits.startsWith('99')) return true;
  return digits.length >= 6 && digits.length <= 14;
}

function hasManualName(parsed: ParsedDocument): boolean {
  const w = parsed.warnings ?? [];
  return w.includes('manual_name');
}

function hasTrustedName(parsed: ParsedDocument): boolean {
  if (isKbsPlaceholderName(parsed)) return false;
  if (hasManualName(parsed)) return true;
  return (
    isUsablePersonName(parsed.firstName) &&
    isUsablePersonName(parsed.lastName) &&
    !isLikelyOcrNoiseName(parsed.firstName) &&
    !isLikelyOcrNoiseName(parsed.lastName)
  );
}

function hasTrustedDocNumber(parsed: ParsedDocument): boolean {
  return isValidDocNumber(parsed.documentNumber);
}

/** OCR çıktısından şüpheli / alakasız alanları temizle (kayıttan önce). */
export function sanitizeKbsOcrForApply(parsed: ParsedDocument): ParsedDocument {
  const p: ParsedDocument = { ...parsed, warnings: [...(parsed.warnings ?? [])] };
  const mrzTrusted =
    !!p.rawMrz && mrzNamesLookValid(p.firstName, p.lastName) && !isLikelyOcrNoiseName(p.firstName);

  const frontOnly = (p.warnings ?? []).includes('front_ocr_only');

  if (!mrzTrusted) {
    if (isLikelyOcrNoiseName(p.firstName) || !isUsablePersonName(p.firstName)) p.firstName = null;
    if (isLikelyOcrNoiseName(p.lastName) || !isUsablePersonName(p.lastName)) p.lastName = null;

    if (
      !frontOnly &&
      p.firstName &&
      p.lastName &&
      !p.rawMrz &&
      (!mrzNamesLookValid(p.firstName, p.lastName) || p.warnings.includes('name_uncertain'))
    ) {
      p.firstName = null;
      p.lastName = null;
    }
  }

  if (!isValidDocNumber(p.documentNumber)) p.documentNumber = null;

  if (p.birthDate && !isPlausibleBirthDate(p.birthDate)) p.birthDate = null;
  if (p.expiryDate && !isPlausibleExpiryDate(p.expiryDate)) p.expiryDate = null;

  if (isLikelyOcrNoiseName(p.motherName) || !isUsablePersonName(p.motherName)) p.motherName = null;
  if (isLikelyOcrNoiseName(p.fatherName) || !isUsablePersonName(p.fatherName)) p.fatherName = null;

  if (p.rawMrz) {
    const stripped = stripSurnameFromGivenNames(p.firstName, p.lastName);
    p.firstName = stripped.firstName;
    p.lastName = stripped.lastName;
  }

  const fn = isUsablePersonName(p.firstName) ? sanitizePersonName(p.firstName) : null;
  const ln = isUsablePersonName(p.lastName) ? sanitizePersonName(p.lastName) : null;
  p.fullName = fn && ln ? `${fn} ${ln}`.trim() : fn || ln || null;

  return p;
}

function pickString(
  existing: string | null | undefined,
  incoming: string | null | undefined,
  incomingTrusted: boolean
): string | null {
  const ex = (existing ?? '').trim() || null;
  const inc = (incoming ?? '').trim() || null;
  if (!inc) return ex;
  if (!ex) return inc;
  if (!incomingTrusted) return ex;
  return inc;
}

/**
 * Mevcut belge verisini korur; OCR yalnızca boş / geçici alanları doldurur.
 * MRZ ile gelen güvenilir sonuç, önceki zayıf OCR’ı güncelleyebilir.
 */
export function mergeKbsOcrIntoExisting(
  existing: ParsedDocument,
  incoming: ParsedDocument
): ParsedDocument {
  const inc = sanitizeKbsOcrForApply(incoming);
  const ex = existing;
  const incomingMrz = !!inc.rawMrz;
  const existingMrz = !!ex.rawMrz;
  const incNamesTrusted = hasTrustedName(inc) && (!!inc.rawMrz || mrzNamesLookValid(inc.firstName, inc.lastName));

  let firstName = ex.firstName;
  let lastName = ex.lastName;
  const exNeedsName =
    isKbsPlaceholderName(ex) ||
    !isUsablePersonName(ex.firstName) ||
    !isUsablePersonName(ex.lastName);

  if (hasManualName(ex)) {
    firstName = ex.firstName;
    lastName = ex.lastName;
  } else if (incNamesTrusted && exNeedsName) {
    firstName = inc.firstName;
    lastName = inc.lastName;
  } else if (hasTrustedName(ex) && !isKbsPlaceholderName(ex)) {
    if (incNamesTrusted && incomingMrz && !existingMrz) {
      firstName = inc.firstName;
      lastName = inc.lastName;
    }
  } else if (incNamesTrusted) {
    firstName = inc.firstName;
    lastName = inc.lastName;
  } else {
    if (
      !isUsablePersonName(firstName) &&
      isUsablePersonName(inc.firstName) &&
      !isLikelyOcrNoiseName(inc.firstName)
    ) {
      firstName = inc.firstName;
    }
    if (
      !isUsablePersonName(lastName) &&
      isUsablePersonName(inc.lastName) &&
      !isLikelyOcrNoiseName(inc.lastName)
    ) {
      lastName = inc.lastName;
    }
  }

  const fullName =
    [firstName, lastName].filter(Boolean).join(' ').trim() ||
    pickString(ex.fullName, inc.fullName, incNamesTrusted);

  const documentNumber = hasTrustedDocNumber(ex)
    ? ex.documentNumber
    : hasTrustedDocNumber(inc)
      ? inc.documentNumber
      : pickString(ex.documentNumber, inc.documentNumber, !!inc.rawMrz);

  const birthDate =
    ex.birthDate && isPlausibleBirthDate(ex.birthDate)
      ? ex.birthDate
      : inc.birthDate && isPlausibleBirthDate(inc.birthDate)
        ? inc.birthDate
        : null;

  const expiryDate =
    ex.expiryDate && isPlausibleExpiryDate(ex.expiryDate)
      ? ex.expiryDate
      : inc.expiryDate && isPlausibleExpiryDate(inc.expiryDate)
        ? inc.expiryDate
        : null;

  const mergedWarnings = [
    ...(ex.warnings ?? []).filter(
      (w) => w !== 'ocr_pending' && w !== 'ocr_processing' && w !== 'ocr_failed'
    ),
    ...(inc.warnings ?? []).filter(
      (w) =>
        w !== 'ocr_pending' &&
        w !== 'ocr_processing' &&
        w !== 'ocr_failed' &&
        w !== 'manual_capture'
    ),
  ];
  const warnings = [...new Set(mergedWarnings)];
  if (ex.warnings?.includes('manual_capture') && !warnings.includes('manual_capture')) {
    warnings.push('manual_capture');
  }

  return {
    ...ex,
    documentType: ex.documentType !== 'other' ? ex.documentType : inc.documentType,
    firstName,
    lastName,
    fullName,
    middleName: ex.middleName ?? inc.middleName,
    documentNumber,
    documentSeries: ex.documentSeries ?? inc.documentSeries,
    nationalityCode: ex.nationalityCode ?? inc.nationalityCode,
    issuingCountryCode: ex.issuingCountryCode ?? inc.issuingCountryCode,
    birthDate,
    expiryDate,
    gender: ex.gender ?? inc.gender,
    motherName: ex.motherName ?? inc.motherName,
    fatherName: ex.fatherName ?? inc.fatherName,
    maritalStatus: ex.maritalStatus ?? inc.maritalStatus,
    rawMrz: ex.rawMrz ?? inc.rawMrz,
    confidence: Math.max(ex.confidence ?? 0, inc.confidence ?? 0) || inc.confidence || ex.confidence,
    checksumsValid: ex.checksumsValid ?? inc.checksumsValid,
    warnings,
  };
}
