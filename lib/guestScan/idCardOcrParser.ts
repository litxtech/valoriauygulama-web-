import type { ParsedDocument } from '@/lib/scanner/types';
import { normalizeOcrLines } from '@/lib/guestScan/ocrLineNormalize';
import {
  coalescePersonName,
  isUsablePersonName,
  sanitizePersonName,
  splitFullNameToFirstLast,
} from '@/lib/guestScan/personNameUtils';
import {
  correctSwappedMrzNames,
  mrzNamesLookSwapped,
  mrzNamesLookValid,
} from '@/lib/scanner/mrzPersonNames';

const TC_RE = /\b([1-9]\d{10})\b/;
const DATE_RE = /\b(\d{2})[./](\d{2})[./](\d{4})\b/;
const YKN_RE = /\b(99\d{9})\b/;
const SERIAL_TOKEN_RE = /\b([A-Z]{1,3}\s*\d{5,9})\b/i;
const SERIAL_FALLBACK_RE = /\b([A-Z]{1,3}\d{5,9})\b/i;

const MOTHER_LABEL_RE =
  /(?:^|\b)(?:anne(?:\s*n[iı]n)?\s*ad[ıi]|ana\s*ad[ıi]|mother(?:'s)?\s*name?)(?:\s*[:\-]\s*|\s+)(.*)$/i;
const FATHER_LABEL_RE =
  /(?:^|\b)(?:baba(?:\s*n[iı]n)?\s*ad[ıi]|father(?:'s)?\s*name?)(?:\s*[:\-]\s*|\s+)(.*)$/i;
const MOTHER_LINE_LABEL_RE = /^(?:anne(?:\s*n[iı]n)?\s*ad[ıi]|ana\s*ad[ıi]|mother)/i;
const FATHER_LINE_LABEL_RE = /^(?:baba(?:\s*n[iı]n)?\s*ad[ıi]|father)/i;
const SERIAL_LINE_LABEL_RE = /seri\s*(?:no|n[°o]|s[ıi]ra)|belge\s*seri/i;

const SURNAME_INLINE_RE =
  /(?:^|\b)(?:soyad[ıi]?|soyadi|surname|family\s*name|last\s*name|nom)(?:\s*[:\-]\s*|\s+)(.*)$/i;
const GIVEN_INLINE_RE =
  /(?:^|\b)(?:ad[ıi]?|adi|given\s*names?|first\s*names?|forename|prenom)(?:\s*[:\-]\s*|\s+)(.*)$/i;
const SURNAME_LINE_LABEL_RE = /^(?:soyad[ıi]?|soyadi|surname|family\s*name|last\s*name|nom)\s*$/i;
const GIVEN_LINE_LABEL_RE = /^(?:ad[ıi]?|adi|given\s*names?|first\s*names?|forename)\s*$/i;

const BIRTH_LINE_LABEL_RE = /^(?:do[gğ]um\s*tarih|date\s*of\s*birth|birth\s*date)/i;
const GENDER_LINE_RE = /^(?:cinsiyet|sex|gender|erkek|kad[iı]n)\b/i;

const NOISE_NAME_RE =
  /^(?:türkiye|turkey|republic|cim|cumhuriyeti|kimlik|geçici|gecici|koruma|belgesi|identity|card|document|republic\s+of|valid|geçerlilik|uyruk|nationality|vatandas|vatandaş)/i;

export type TurkishIdOcrExtras = {
  documentSeries: string | null;
  motherName: string | null;
  fatherName: string | null;
  maritalStatus?: 'married' | 'single' | null;
};

const MARITAL_LINE_RE = /^(?:medeni\s*hal|civil\s*status|marital\s*status)/i;
const MARITAL_EVLI_RE = /\b(?:evli|married)\b/i;
const MARITAL_BEKAR_RE = /\b(?:bekar|single|unmarried)\b/i;

function normLines(lines: string[]): string[] {
  return normalizeOcrLines(lines);
}

function isoFromTrDate(m: RegExpMatchArray): string | null {
  const d = m[1];
  const mo = m[2];
  const y = m[3];
  if (!d || !mo || !y) return null;
  return `${y}-${mo}-${d}`;
}

function cleanPersonName(raw: string | null | undefined): string | null {
  const s = sanitizePersonName(raw);
  if (!s || NOISE_NAME_RE.test(s)) return null;
  if (TC_RE.test(s) || YKN_RE.test(s) || DATE_RE.test(s)) return null;
  if (SERIAL_FALLBACK_RE.test(s) && s.replace(/\s/g, '').length <= 12) return null;
  if (GENDER_LINE_RE.test(s)) return null;
  return s;
}

function compactSerial(raw: string): string | null {
  const c = raw.replace(/\s/g, '').toUpperCase();
  if (!SERIAL_FALLBACK_RE.test(c)) return null;
  if (YKN_RE.test(c)) return null;
  if (TC_RE.test(c) && c.length === 11) return null;
  return c;
}

function isNameCandidateLine(line: string): boolean {
  if (!line || line.length < 3) return false;
  if (TC_RE.test(line) || YKN_RE.test(line) || DATE_RE.test(line)) return false;
  if (MOTHER_LINE_LABEL_RE.test(line) || FATHER_LINE_LABEL_RE.test(line)) return false;
  if (SERIAL_LINE_LABEL_RE.test(line) || BIRTH_LINE_LABEL_RE.test(line)) return false;
  if (GENDER_LINE_RE.test(line)) return false;
  if (SURNAME_LINE_LABEL_RE.test(line) || GIVEN_LINE_LABEL_RE.test(line)) return false;
  if (NOISE_NAME_RE.test(line)) return false;
  if (!/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(line)) return false;
  const letters = (line.match(/[A-Za-zÇĞİÖŞÜçğıöşü]/g) || []).length;
  const digits = (line.match(/\d/g) || []).length;
  return letters >= 3 && digits <= Math.max(2, Math.floor(letters * 0.15));
}

/** Seri no — etiket satırı, aynı satır değer veya seri benzeri token. */
export function extractDocumentSerialFromOcr(lines: string[]): string | null {
  const L = normLines(lines);

  for (let i = 0; i < L.length; i++) {
    const line = L[i]!;
    if (!SERIAL_LINE_LABEL_RE.test(line)) continue;
    const inline = line.match(SERIAL_TOKEN_RE);
    if (inline?.[1]) {
      const s = compactSerial(inline[1]);
      if (s) return s;
    }
    const next = L[i + 1];
    if (next) {
      const m = next.match(SERIAL_TOKEN_RE);
      if (m?.[1]) {
        const s = compactSerial(m[1]);
        if (s) return s;
      }
    }
  }

  for (const line of L) {
    if (SERIAL_LINE_LABEL_RE.test(line)) continue;
    const m = line.match(SERIAL_TOKEN_RE);
    if (m?.[1]) {
      const s = compactSerial(m[1]);
      if (s && s.length >= 6 && s.length <= 12) return s;
    }
  }

  return null;
}

export function extractParentNamesFromOcr(lines: string[]): { motherName: string | null; fatherName: string | null } {
  const L = normLines(lines);
  let motherName: string | null = null;
  let fatherName: string | null = null;

  for (let i = 0; i < L.length; i++) {
    const line = L[i]!;

    const motherInline = line.match(MOTHER_LABEL_RE);
    if (motherInline?.[1]) {
      motherName = cleanPersonName(motherInline[1]) ?? motherName;
    } else if (MOTHER_LINE_LABEL_RE.test(line) && !motherInline) {
      const next = cleanPersonName(L[i + 1]);
      if (next) motherName = next;
    }

    const fatherInline = line.match(FATHER_LABEL_RE);
    if (fatherInline?.[1]) {
      fatherName = cleanPersonName(fatherInline[1]) ?? fatherName;
    } else if (FATHER_LINE_LABEL_RE.test(line) && !fatherInline) {
      const next = cleanPersonName(L[i + 1]);
      if (next) fatherName = next;
    }
  }

  if (!motherName || !fatherName) {
    const joined = L.join('\n');
    if (!motherName) {
      const m =
        joined.match(/(?:ANNE|ANA)\s*AD[İI]?\s*[:\s]*([A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜa-zçğıöşü\s'-]{1,40})/i) ??
        joined.match(/(?:ANNE|ANA)\s*[:\s]+([A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜa-zçğıöşü\s'-]{1,40})/i);
      motherName = cleanPersonName(m?.[1]) ?? motherName;
    }
    if (!fatherName) {
      const f = joined.match(/(?:BABA)\s*AD[İI]?\s*[:\s]*([A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜa-zçğıöşü\s'-]{1,40})/i);
      fatherName = cleanPersonName(f?.[1]) ?? fatherName;
    }
  }

  return { motherName, fatherName };
}

/** Kimlik ön yüz — medeni hal (EVLİ / BEKAR). */
export function extractMaritalStatusFromOcr(lines: string[]): 'married' | 'single' | null {
  const L = normLines(lines);
  for (let i = 0; i < L.length; i++) {
    const line = L[i]!;
    if (!MARITAL_LINE_RE.test(line) && !MARITAL_EVLI_RE.test(line) && !MARITAL_BEKAR_RE.test(line)) {
      continue;
    }
    const chunk = `${line} ${L[i + 1] ?? ''}`;
    if (MARITAL_EVLI_RE.test(chunk)) return 'married';
    if (MARITAL_BEKAR_RE.test(chunk)) return 'single';
  }
  const joined = L.join(' ');
  if (/\bMEDEN[Iİ]\s*HAL[Iİ]?\s*[:\s]*EVL[Iİ]/i.test(joined)) return 'married';
  if (/\bMEDEN[Iİ]\s*HAL[Iİ]?\s*[:\s]*BEKAR/i.test(joined)) return 'single';
  return null;
}

/** Ad / soyad — etiketli satırlar, MRZ’siz ön yüz. */
export function extractNamesFromOcr(lines: string[]): { firstName: string | null; lastName: string | null } {
  const L = normLines(lines);
  let firstName: string | null = null;
  let lastName: string | null = null;

  for (let i = 0; i < L.length; i++) {
    const line = L[i]!;

    const givenInline = line.match(GIVEN_INLINE_RE);
    if (givenInline?.[1]) {
      firstName = cleanPersonName(givenInline[1]) ?? firstName;
    } else if (GIVEN_LINE_LABEL_RE.test(line)) {
      const next = cleanPersonName(L[i + 1]);
      if (next) firstName = next;
    }

    const surnameInline = line.match(SURNAME_INLINE_RE);
    if (surnameInline?.[1]) {
      lastName = cleanPersonName(surnameInline[1]) ?? lastName;
    } else if (SURNAME_LINE_LABEL_RE.test(line)) {
      const next = cleanPersonName(L[i + 1]);
      if (next) lastName = next;
    }
  }

  if (!firstName || !lastName) {
    const joined = L.join('\n');
    if (!lastName) {
      const m = joined.match(/(?:SOYAD[İI]?)\s*[:\s]*([A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜa-zçğıöşü\s'-]{1,40})/i);
      lastName = cleanPersonName(m?.[1]) ?? lastName;
    }
    if (!firstName) {
      const m =
        joined.match(/(?:^|\n)\s*AD[İI]?\s*[:\s]+([A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜa-zçğıöşü\s'-]{1,40})/i) ??
        joined.match(/(?:GIVEN\s*NAMES?)\s*[:\s]*([A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜa-zçğıöşü\s'-]{1,40})/i);
      firstName = cleanPersonName(m?.[1]) ?? firstName;
    }
  }

  if (!firstName || !lastName) {
    const candidates = L.map((l) => cleanPersonName(l)).filter((n): n is string => !!n);
    const uniq = [...new Set(candidates)];
    if (!lastName && !firstName && uniq.length >= 2) {
      lastName = uniq[0]!;
      firstName = uniq[1]!;
    } else if (!lastName && uniq.length >= 1) {
      lastName = uniq.find((n) => n !== firstName) ?? uniq[0]!;
    } else if (!firstName && uniq.length >= 1) {
      firstName = uniq.find((n) => n !== lastName) ?? null;
    }
  }

  return { firstName, lastName };
}

function guessNamesFromLayout(lines: string[]): { firstName: string | null; lastName: string | null } {
  const L = normLines(lines);
  const ordered = L.filter((l) => isNameCandidateLine(l))
    .map((l) => cleanPersonName(l))
    .filter((n): n is string => !!n);

  if (ordered.length >= 2) {
    return { lastName: ordered[0]!, firstName: ordered[1]! };
  }
  if (ordered.length === 1) {
    const parts = ordered[0]!.split(/\s+/);
    if (parts.length >= 2) {
      return { lastName: parts[0]!, firstName: parts.slice(1).join(' ') };
    }
  }
  return { firstName: null, lastName: null };
}

function resolveNames(lines: string[]): { firstName: string | null; lastName: string | null } {
  const labeled = extractNamesFromOcr(lines);
  if (isUsablePersonName(labeled.firstName) && isUsablePersonName(labeled.lastName)) {
    return labeled;
  }
  const guessed = guessNamesFromLayout(lines);
  return {
    firstName: coalescePersonName(labeled.firstName, guessed.firstName),
    lastName: coalescePersonName(labeled.lastName, guessed.lastName),
  };
}

function detectTemporaryProtection(lines: string[]): boolean {
  const j = normLines(lines).join(' ').toUpperCase();
  return j.includes('GECICI KORUMA') || j.includes('GEÇİCİ KORUMA') || j.includes('GECICI KORUMA KIMLIK');
}

function extractBirthDate(lines: string[]): string | null {
  const L = normLines(lines);
  for (let i = 0; i < L.length; i++) {
    if (BIRTH_LINE_LABEL_RE.test(L[i]!)) {
      const dm = L[i]!.match(DATE_RE) ?? L[i + 1]?.match(DATE_RE);
      if (dm) return isoFromTrDate(dm);
    }
    const dm = L[i]!.match(DATE_RE);
    if (dm) return isoFromTrDate(dm);
  }
  return null;
}

function pickDocumentNumber(joined: string, tc: string | null, ykn: string | null): string | null {
  return tc ?? ykn ?? null;
}

function mergeNameFields(
  parsed: ParsedDocument,
  id: ParsedDocument & TurkishIdOcrExtras,
  lines: string[]
): Pick<ParsedDocument, 'firstName' | 'lastName' | 'fullName' | 'middleName'> {
  const ocrNames = extractNamesFromOcr(lines);
  const fromFull = splitFullNameToFirstLast(parsed.fullName);
  const fromIdFull = splitFullNameToFirstLast(id.fullName);

  const mrzCorrected = correctSwappedMrzNames({
    firstName: parsed.firstName,
    lastName: parsed.lastName,
    nationalityCode: parsed.nationalityCode,
    issuingCountryCode: parsed.issuingCountryCode,
  });

  const ocrLabeled =
    isUsablePersonName(ocrNames.firstName) && isUsablePersonName(ocrNames.lastName);
  const preferOcrNames =
    ocrLabeled &&
    (mrzNamesLookSwapped(parsed.firstName, parsed.lastName) ||
      !mrzNamesLookValid(parsed.firstName, parsed.lastName));

  const mrzGiven = parsed.middleName
    ? `${mrzCorrected.firstName ?? ''} ${parsed.middleName}`.trim()
    : mrzCorrected.firstName;

  const firstName = preferOcrNames
    ? ocrNames.firstName
    : coalescePersonName(
        mrzGiven,
        ocrNames.firstName,
        id.firstName,
        fromFull.firstName,
        fromIdFull.firstName
      );

  const lastName = preferOcrNames
    ? ocrNames.lastName
    : coalescePersonName(
        mrzCorrected.lastName,
        ocrNames.lastName,
        id.lastName,
        fromFull.lastName,
        fromIdFull.lastName
      );

  const fullName =
    [firstName, lastName].filter(Boolean).join(' ').trim() ||
    coalescePersonName(parsed.fullName, id.fullName) ||
    null;

  let middleName = parsed.middleName;
  if (firstName && parsed.firstName && parsed.middleName) {
    const extra = sanitizePersonName(
      `${parsed.middleName}`.trim()
    );
    if (extra && !firstName.includes(extra)) middleName = parsed.middleName;
    else middleName = null;
  }

  return { firstName, lastName, fullName, middleName };
}

/**
 * TC / YKN / geçici koruma kimliği ön yüz OCR (NFC yok).
 */
export function parseIdCardFromOcrLines(lines: string[]): ParsedDocument & TurkishIdOcrExtras {
  const L = normLines(lines);
  const joined = L.join('\n');

  const tc = joined.match(TC_RE)?.[1] ?? null;
  const ykn = joined.match(YKN_RE)?.[1] ?? null;
  const serial = extractDocumentSerialFromOcr(L);
  const birthDate = extractBirthDate(L);
  const { firstName, lastName } = resolveNames(L);
  const isYkn = !!ykn && !tc;
  const isTc = !!tc;
  const isGkk = detectTemporaryProtection(L);
  const docNo = pickDocumentNumber(joined, tc, ykn);

  const warnings: string[] = [];
  if (!docNo) warnings.push('no_identity_number');
  if (!isUsablePersonName(firstName) || !isUsablePersonName(lastName)) warnings.push('name_uncertain');
  if (isGkk && !serial) warnings.push('serial_uncertain');

  const confidence =
    docNo && isUsablePersonName(firstName) && isUsablePersonName(lastName) && birthDate ? 0.82 : docNo ? 0.58 : 0.35;

  let documentType: ParsedDocument['documentType'] = 'other';
  if (isTc) documentType = 'id_card';
  else if (isYkn || isGkk) documentType = 'residence_permit';

  return {
    documentType,
    fullName: [firstName, lastName].filter(Boolean).join(' ') || null,
    firstName,
    lastName,
    middleName: null,
    documentNumber: docNo,
    nationalityCode: isTc ? 'TUR' : null,
    issuingCountryCode: isTc ? 'TUR' : null,
    birthDate,
    expiryDate: null,
    gender: null,
    rawMrz: null,
    confidence,
    checksumsValid: null,
    warnings,
    documentSeries: serial,
    motherName: null,
    fatherName: null,
  };
}

/**
 * Galeri / karma görüntü: MRZ + ön yüz OCR birleşimi (ad, soyad, seri, anne-baba, YKN).
 */
export function enrichParsedWithIdCardOcr(
  parsed: ParsedDocument,
  lines: string[]
): ParsedDocument & TurkishIdOcrExtras {
  const id = parseIdCardFromOcrLines(lines);
  const serial = extractDocumentSerialFromOcr(lines) ?? id.documentSeries;
  const joined = normLines(lines).join('\n');
  const ykn = joined.match(YKN_RE)?.[1] ?? null;
  const tc = joined.match(TC_RE)?.[1] ?? null;

  let documentNumber = parsed.documentNumber;
  if (ykn && (!documentNumber || !/^99\d{9}$/.test(String(documentNumber).replace(/\D/g, '')))) {
    documentNumber = ykn;
  } else if (tc && (!documentNumber || String(documentNumber).replace(/\D/g, '').length !== 11)) {
    documentNumber = tc;
  } else if (!documentNumber && id.documentNumber) {
    documentNumber = id.documentNumber;
  }

  const names = mergeNameFields(parsed, id, lines);
  const parents = extractParentNamesFromOcr(lines);
  const maritalStatus = extractMaritalStatusFromOcr(lines);

  let documentType = parsed.documentType;
  if (documentType === 'other' && (id.documentType === 'residence_permit' || detectTemporaryProtection(lines))) {
    documentType = 'residence_permit';
  }

  const natCode = parsed.nationalityCode ?? id.nationalityCode;
  const issuing = parsed.issuingCountryCode ?? id.issuingCountryCode;

  return {
    ...parsed,
    documentType,
    documentNumber,
    firstName: names.firstName,
    lastName: names.lastName,
    fullName: names.fullName,
    middleName: names.middleName,
    birthDate: parsed.birthDate ?? id.birthDate,
    expiryDate: parsed.expiryDate ?? id.expiryDate,
    gender: parsed.gender ?? id.gender,
    nationalityCode: natCode,
    issuingCountryCode: issuing,
    documentSeries: serial,
    motherName: parents.motherName,
    fatherName: parents.fatherName,
    maritalStatus: maritalStatus ?? parsed.maritalStatus ?? null,
    confidence: parsed.confidence ?? id.confidence,
  };
}

/** Galeri sonucu yeterli alan içeriyor mu. */
export function galleryParsedHasMinimumFields(parsed: ParsedDocument): boolean {
  const hasId = !!(parsed.documentNumber && String(parsed.documentNumber).replace(/\D/g, '').length >= 6);
  const hasNames = isUsablePersonName(parsed.firstName) && isUsablePersonName(parsed.lastName);
  return hasId && hasNames;
}
