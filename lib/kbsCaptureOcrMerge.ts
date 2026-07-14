import { isUsablePersonName, sanitizePersonName } from '@/lib/guestScan/personNameUtils';
import { isNationalityLikeText } from '@/lib/kbsNationalityMap';
import { hasPlausibleKbsDocumentNumber } from '@/lib/kbsDocumentNumberValidate';
import { sanitizeParsedDocumentSeries } from '@/lib/kbsDocumentSeries';
import { listCoreMissingIdFields } from '@/lib/kbsCaptureParsedFields';
import { mrzNamesLookValid, parseChevronNamesFromMrz, stripSurnameFromGivenNames, trimMrzPersonNameTokens } from '@/lib/scanner/mrzPersonNames';
import type { ParsedDocument } from '@/lib/scanner/types';

export type KbsOcrPassMergeInput = {
  parsed: ParsedDocument;
  engine: string;
};

const PLACEHOLDER_FIRST = 'MISAFIR';

const OCR_NOISE_NAME_RE =
  /^(?:TÜRKİYE|TURKEY|REPUBLIC|CUMHURIYET|CUMHURIYET|KİMLİK|KIMLIK|IDENTITY|CARD|DOCUMENT|NÜFUS|NUFUS|PASAPORT|PASSPORT|PASSEPORT|PASAPORTE|UYRUK|NATIONALITY|VATANDAŞ|VATANDAS|GEÇİCİ|GECICI|KORUMA|BELGESİ|BELGESI|VALID|SERİ|SERI|CİLT|CILT|MAHALLE|KAYIT|İLÇE|ILCE|CİNSİYET|CINSIYET|ERKEK|KADIN|MEDENİ|MEDENI|DOGUM|DOĞUM|MASA|TEZGAH|TABLE|DESK|HOTEL|OTEL|RESEPSİYON|RECEPTION|VALORIA|WIFI|MENÜ|MENU|KAHOVE|COFFEE|RESTORAN|INSTAGRAM|FACEBOOK|WHATSAPP|SPECIMEN|TYPE|REISE|REISEPASS|AUTHORITY|BERILGAN|TOMONIDAN|OTASINING|FATHER|MOTHER|SIGNATURE|HOLDERS|FUQAROLIG|SAMARKAND|REGION|UZBEKISTAN|OZBEKISTON|KIM\s+TOMONIDAN)/i;

/** OCR’da etiketin değer sanılması — "SURNAME", "GIVEN NAMES" vb. tamamı etiket kelimesi. */
const OCR_LABEL_ONLY_NAME_RE =
  /^(?:SURNAME|SURNAMES|GIVEN|GIVEN\s*NAMES?|FORENAMES?|FIRST\s*NAMES?|FAMILY\s*NAMES?|NAME|NAMES|SOYAD[İI]?|SOYADI|AD[İI]|ADI|NOM|PRENOMS?|APELLIDOS?)$/i;

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
  if (/AUTHORITY|TOMONIDAN|OTASINING|FATHER'?S?\s*NAME|GIVEN\s*NAMES|SURNAME|FUQAROLIG|NATIONALITY/i.test(s)) {
    return true;
  }
  if (OCR_LABEL_ONLY_NAME_RE.test(s.replace(/\s+/g, ' ').trim())) return true;
  if (isNationalityLikeText(s)) return true;
  if (s.length > 48) return true;
  return false;
}

function isValidDocNumber(raw: string | null | undefined, documentType?: ParsedDocument['documentType']): boolean {
  return hasPlausibleKbsDocumentNumber(raw, documentType);
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
  return isValidDocNumber(parsed.documentNumber, parsed.documentType);
}

/** OCR çıktısından şüpheli / alakasız alanları temizle (kayıttan önce). */
export function sanitizeKbsOcrForApply(parsed: ParsedDocument): ParsedDocument {
  const p: ParsedDocument = { ...parsed, warnings: [...(parsed.warnings ?? [])] };
  const mrzTrusted =
    !!p.rawMrz && mrzNamesLookValid(p.firstName, p.lastName) && !isLikelyOcrNoiseName(p.firstName);

  const frontOnly = (p.warnings ?? []).includes('front_ocr_only');
  const tcDigits = (p.documentNumber ?? '').replace(/\D/g, '');
  const isTurkishIdFront =
    p.documentType === 'id_card' && /^[1-9]\d{10}$/.test(tcDigits) && !p.rawMrz;
  const frontPassportNamesOk =
    frontOnly &&
    p.documentType === 'passport' &&
    mrzNamesLookValid(p.firstName, p.lastName) &&
    !isLikelyOcrNoiseName(p.firstName) &&
    !isLikelyOcrNoiseName(p.lastName);

  if (!mrzTrusted && !frontPassportNamesOk) {
    if (isLikelyOcrNoiseName(p.firstName) || !isUsablePersonName(p.firstName)) p.firstName = null;
    if (isLikelyOcrNoiseName(p.lastName) || !isUsablePersonName(p.lastName)) p.lastName = null;

    if (
      !frontOnly &&
      !isTurkishIdFront &&
      p.firstName &&
      p.lastName &&
      !p.rawMrz &&
      (!mrzNamesLookValid(p.firstName, p.lastName) || p.warnings.includes('name_uncertain'))
    ) {
      p.firstName = null;
      p.lastName = null;
    }
  }

  if (!isValidDocNumber(p.documentNumber, p.documentType)) p.documentNumber = null;

  if (p.birthDate && !isPlausibleBirthDate(p.birthDate)) p.birthDate = null;
  if (p.expiryDate && !isPlausibleExpiryDate(p.expiryDate)) p.expiryDate = null;

  if (p.nationalityCode && p.firstName && p.firstName.toUpperCase() === p.nationalityCode.toUpperCase()) {
    p.firstName = null;
  }
  if (p.nationalityCode && p.lastName && p.lastName.toUpperCase() === p.nationalityCode.toUpperCase()) {
    p.lastName = null;
  }

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

  // Pasaport no asla Seri alanına düşmesin.
  return sanitizeParsedDocumentSeries(p);
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
  incoming: ParsedDocument,
  opts?: { correction?: boolean }
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
  } else if (
    opts?.correction &&
    isUsablePersonName(inc.firstName) &&
    isUsablePersonName(inc.lastName) &&
    !isLikelyOcrNoiseName(inc.firstName) &&
    !isLikelyOcrNoiseName(inc.lastName)
  ) {
    firstName = inc.firstName;
    lastName = inc.lastName;
  } else if (opts?.correction && incNamesTrusted) {
    firstName = inc.firstName;
    lastName = inc.lastName;
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

  if (!hasManualName(ex) && incomingMrz && inc.rawMrz) {
    const chevron = parseChevronNamesFromMrz(inc.rawMrz);
    if (isUsablePersonName(chevron.surname)) {
      const exLn = normNameKey(lastName);
      const trimmedSurname =
        trimMrzPersonNameTokens(chevron.surname, { role: 'surname' }) ?? chevron.surname;
      const chLn = normNameKey(trimmedSurname);
      if (exLn !== chLn) {
        lastName = trimmedSurname;
        const stripped = stripSurnameFromGivenNames(firstName, lastName);
        firstName = stripped.firstName ?? firstName;
      }
    }
  }

  if (
    !hasManualName(ex) &&
    isKbsPlaceholderName({ ...ex, firstName, lastName } as ParsedDocument) &&
    isUsablePersonName(inc.firstName) &&
    isUsablePersonName(inc.lastName)
  ) {
    firstName = inc.firstName;
    lastName = inc.lastName;
  }

  const fullName =
    [firstName, lastName].filter(Boolean).join(' ').trim() ||
    pickString(ex.fullName, inc.fullName, incNamesTrusted);

  const documentNumber =
    opts?.correction && hasTrustedDocNumber(inc)
      ? inc.documentNumber
      : hasTrustedDocNumber(ex)
        ? ex.documentNumber
        : hasTrustedDocNumber(inc)
          ? inc.documentNumber
          : pickString(ex.documentNumber, inc.documentNumber, !!inc.rawMrz);

  const birthDate =
    opts?.correction && inc.birthDate && isPlausibleBirthDate(inc.birthDate)
      ? inc.birthDate
      : ex.birthDate && isPlausibleBirthDate(ex.birthDate)
        ? ex.birthDate
        : inc.birthDate && isPlausibleBirthDate(inc.birthDate)
          ? inc.birthDate
          : null;

  const expiryDate =
    opts?.correction && inc.expiryDate && isPlausibleExpiryDate(inc.expiryDate)
      ? inc.expiryDate
      : ex.expiryDate && isPlausibleExpiryDate(ex.expiryDate)
        ? ex.expiryDate
        : inc.expiryDate && isPlausibleExpiryDate(inc.expiryDate)
          ? inc.expiryDate
          : null;

  const mergedWarnings = [
    ...(ex.warnings ?? []).filter(
      (w) =>
        w !== 'ocr_pending' &&
        w !== 'ocr_processing' &&
        w !== 'ocr_failed' &&
        !w.startsWith('kbs_side:')
    ),
    ...(inc.warnings ?? []).filter(
      (w) =>
        w !== 'ocr_pending' &&
        w !== 'ocr_processing' &&
        w !== 'ocr_failed' &&
        w !== 'manual_capture' &&
        !w.startsWith('kbs_side:')
    ),
  ];
  const warnings = [...new Set(mergedWarnings)];
  if (ex.warnings?.includes('manual_capture') && !warnings.includes('manual_capture')) {
    warnings.push('manual_capture');
  }

  const mergedRawMrz = ex.rawMrz ?? inc.rawMrz;
  // TD3 pasaport MRZ'si varsa ön yüz OCR 'id_card' tahminini ezer.
  const mergedDocumentType = /^P[A-Z<]/.test(mergedRawMrz ?? '')
    ? 'passport'
    : ex.documentType !== 'other'
      ? ex.documentType
      : inc.documentType;

  return {
    ...ex,
    documentType: mergedDocumentType,
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
    rawMrz: mergedRawMrz,
    confidence: Math.max(ex.confidence ?? 0, inc.confidence ?? 0) || inc.confidence || ex.confidence,
    checksumsValid: ex.checksumsValid ?? inc.checksumsValid,
    warnings,
  };
}

function emptyKbsParsed(): ParsedDocument {
  return {
    documentType: 'other',
    fullName: null,
    firstName: null,
    lastName: null,
    middleName: null,
    documentNumber: null,
    nationalityCode: null,
    issuingCountryCode: null,
    birthDate: null,
    expiryDate: null,
    gender: null,
    rawMrz: null,
    confidence: null,
    checksumsValid: null,
    warnings: [],
  };
}

function parsedPassRank(p: ParsedDocument): number {
  let s = 0;
  const tcDigits = (p.documentNumber ?? '').replace(/\D/g, '');
  const isTurkishId = p.documentType === 'id_card' && /^[1-9]\d{10}$/.test(tcDigits);
  if (p.checksumsValid === true) s += 120;
  else if (p.checksumsValid === false) s -= 24;
  if (p.rawMrz) s += isTurkishId && p.checksumsValid !== true ? 18 : 80;
  if (isTurkishId) s += 55;
  if (hasTrustedDocNumber(p)) s += 28;
  if (hasTrustedName(p)) s += 22;
  if (p.birthDate && isPlausibleBirthDate(p.birthDate)) s += 14;
  if (p.expiryDate && isPlausibleExpiryDate(p.expiryDate)) s += 14;
  if (p.nationalityCode) s += 8;
  if (p.gender) s += 4;
  s -= listCoreMissingIdFields(p).length * 10;
  s += (p.confidence ?? 0) * 20;
  return s;
}

/** Birden fazla OCR geçişinden tek en iyi birleşik sonuç — boş alanlar diğer geçişlerden dolar. */
export function mergeKbsOcrPassResults(
  results: KbsOcrPassMergeInput[]
): { parsed: ParsedDocument; missingFields: string[]; engine: string } {
  const usable = results.filter((r) => r && typeof r.parsed === 'object');
  if (usable.length === 0) {
    const empty = emptyKbsParsed();
    return {
      parsed: empty,
      missingFields: listCoreMissingIdFields(empty),
      engine: 'none',
    };
  }
  if (usable.length === 1) {
    const one = usable[0]!;
    return {
      parsed: sanitizeKbsOcrForApply(one.parsed),
      missingFields: listCoreMissingIdFields(one.parsed),
      engine: one.engine,
    };
  }

  const ranked = [...usable].sort((a, b) => parsedPassRank(b.parsed) - parsedPassRank(a.parsed));
  let merged = ranked[0]!.parsed;

  for (let i = 1; i < ranked.length; i++) {
    merged = mergeKbsOcrIntoExisting(merged, ranked[i]!.parsed);
  }

  const mrzTrusted =
    ranked.find((r) => r.parsed.checksumsValid === true && r.parsed.rawMrz) ??
    ranked.find((r) => r.parsed.rawMrz);
  if (mrzTrusted) {
    merged = mergeKbsOcrIntoExisting(merged, mrzTrusted.parsed);
  }

  const namesTrusted = ranked.find(
    (r) =>
      !!r.parsed.rawMrz &&
      hasTrustedName(r.parsed) &&
      mrzNamesLookValid(r.parsed.firstName, r.parsed.lastName)
  );
  if (namesTrusted && namesTrusted !== mrzTrusted) {
    merged = mergeKbsOcrIntoExisting(merged, namesTrusted.parsed);
  }

  const engine =
    ranked.find((r) => r.parsed.checksumsValid === true)?.engine ??
    ranked.find((r) => r.parsed.rawMrz)?.engine ??
    ranked[0]!.engine;

  return {
    parsed: sanitizeKbsOcrForApply(merged),
    missingFields: listCoreMissingIdFields(merged),
    engine,
  };
}
