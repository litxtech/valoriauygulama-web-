// Mobil uygulamanın OCR okuma mantığının web portu:
//   lib/kbsCaptureParsedFields.ts + lib/kbsDisplayFormat.ts + lib/kbsCaptureOcrMerge.ts
// Amaç: parsed_payload + belge/misafir sütunlarından TÜM bilgileri temiz okumak.

import type { KbsCapturedDocumentRow, KbsCopyField, ParsedDocument } from './types';
import { isUsablePersonName, sanitizePersonName } from './personName';
import { formatIcao3ForTr } from './nationality';

const GENDER_LABEL: Record<string, string> = { M: 'Erkek', F: 'Kadın', X: 'Diğer' };
const MARITAL_LABEL: Record<string, string> = { married: 'Evli', single: 'Bekâr' };
const PLACEHOLDER_FIRST = 'MISAFIR';

function str(v: string | null | undefined): string | null {
  const s = (v ?? '').trim();
  return s || null;
}

function pickPayloadString(obj: Record<string, unknown>, camel: string, snake: string): string | null {
  const v = obj[camel] ?? obj[snake];
  return typeof v === 'string' ? str(v) : null;
}

export function formatKbsTrDate(iso: string | null | undefined): string | null {
  if (!iso?.trim()) return null;
  const m = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso.trim();
  return `${m[3]}.${m[2]}.${m[1]}`;
}

export function formatKbsNationality(code: string | null | undefined): string | null {
  if (!code?.trim()) return null;
  return formatIcao3ForTr(code);
}

export function kbsAgeYearsFromBirthDate(iso: string | null | undefined): number | null {
  if (!iso?.trim() || iso.length < 10) return null;
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  const years = Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000));
  return years >= 0 && years <= 120 ? years : null;
}

export function kbsDisplayFullName(parsed: ParsedDocument | null | undefined): string | null {
  if (!parsed) return null;
  const fn = sanitizePersonName(parsed.firstName);
  const ln = sanitizePersonName(parsed.lastName);
  if (isUsablePersonName(fn) && isUsablePersonName(ln)) return `${fn} ${ln}`.trim();
  const raw = sanitizePersonName(parsed.fullName);
  if (raw && isUsablePersonName(raw.split(/\s+/)[0]) && raw.length <= 48) return raw;
  return fn || ln || null;
}

function normNameKey(v: string | null | undefined): string {
  return sanitizePersonName(v)?.replace(/\s+/g, ' ') ?? '';
}

export function isKbsPlaceholderName(parsed: ParsedDocument | null | undefined): boolean {
  if (!parsed) return false;
  const fn = normNameKey(parsed.firstName);
  const ln = (parsed.lastName ?? '').trim();
  return fn === PLACEHOLDER_FIRST && /^\S+-\d+$/.test(ln);
}

export function normalizeKbsParsedPayload(
  raw: ParsedDocument | Record<string, unknown> | null | undefined
): ParsedDocument | null {
  if (!raw || typeof raw !== 'object') return null;
  const root = raw as Record<string, unknown>;
  const inner =
    root.parsed && typeof root.parsed === 'object'
      ? (root.parsed as Record<string, unknown>)
      : root;

  const genderRaw = pickPayloadString(inner, 'gender', 'gender');
  const gender = genderRaw === 'M' || genderRaw === 'F' || genderRaw === 'X' ? genderRaw : null;

  const docTypeRaw = pickPayloadString(inner, 'documentType', 'document_type');
  const documentType =
    docTypeRaw === 'passport' ||
    docTypeRaw === 'id_card' ||
    docTypeRaw === 'residence_permit' ||
    docTypeRaw === 'other'
      ? docTypeRaw
      : 'other';

  const maritalRaw = pickPayloadString(inner, 'maritalStatus', 'marital_status');
  const maritalStatus = maritalRaw === 'married' || maritalRaw === 'single' ? maritalRaw : null;

  const warningsRaw = inner.warnings;
  const warnings = Array.isArray(warningsRaw)
    ? warningsRaw.filter((w): w is string => typeof w === 'string')
    : [];

  return {
    documentType,
    fullName: pickPayloadString(inner, 'fullName', 'full_name'),
    firstName: pickPayloadString(inner, 'firstName', 'first_name'),
    lastName: pickPayloadString(inner, 'lastName', 'last_name'),
    middleName: pickPayloadString(inner, 'middleName', 'middle_name'),
    documentNumber: pickPayloadString(inner, 'documentNumber', 'document_number'),
    documentSeries: pickPayloadString(inner, 'documentSeries', 'document_series'),
    nationalityCode: pickPayloadString(inner, 'nationalityCode', 'nationality_code'),
    issuingCountryCode: pickPayloadString(inner, 'issuingCountryCode', 'issuing_country_code'),
    birthDate: pickPayloadString(inner, 'birthDate', 'birth_date'),
    expiryDate: pickPayloadString(inner, 'expiryDate', 'expiry_date'),
    gender,
    motherName: pickPayloadString(inner, 'motherName', 'mother_name'),
    fatherName: pickPayloadString(inner, 'fatherName', 'father_name'),
    maritalStatus,
    rawMrz: pickPayloadString(inner, 'rawMrz', 'raw_mrz'),
    confidence: typeof inner.confidence === 'number' ? inner.confidence : null,
    checksumsValid: typeof inner.checksumsValid === 'boolean' ? inner.checksumsValid : null,
    warnings,
  };
}

type EnrichSource = {
  document_number?: string | null;
  nationality_code?: string | null;
  issuing_country_code?: string | null;
  expiry_date?: string | null;
  document_type?: string | null;
  guest?: {
    first_name?: string | null;
    last_name?: string | null;
    birth_date?: string | null;
    gender?: string | null;
    nationality_code?: string | null;
  } | null;
};

export function enrichKbsParsedFromSources(
  raw: ParsedDocument | Record<string, unknown> | null | undefined,
  source?: EnrichSource | null
): ParsedDocument | null {
  const base = normalizeKbsParsedPayload(raw);
  if (!source) return base;

  const docTypeRaw = source.document_type?.trim();
  const documentType =
    docTypeRaw === 'passport' ||
    docTypeRaw === 'id_card' ||
    docTypeRaw === 'residence_permit' ||
    docTypeRaw === 'other'
      ? docTypeRaw
      : base?.documentType ?? 'other';

  const guest = source.guest;
  const guestGender = guest?.gender?.trim();
  const gender =
    base?.gender ??
    (guestGender === 'M' || guestGender === 'F' || guestGender === 'X' ? guestGender : null);

  const baseForPlaceholder = {
    ...(base ?? {}),
    firstName: base?.firstName ?? null,
    lastName: base?.lastName ?? null,
  } as ParsedDocument;
  const baseIsPlaceholder = isKbsPlaceholderName(baseForPlaceholder);

  const firstName =
    base?.firstName && !baseIsPlaceholder ? base.firstName : str(guest?.first_name) ?? base?.firstName ?? null;
  const lastName =
    base?.lastName && !baseIsPlaceholder ? base.lastName : str(guest?.last_name) ?? base?.lastName ?? null;
  const fullName =
    base?.fullName ??
    kbsDisplayFullName({ ...(base ?? {}), firstName, lastName } as ParsedDocument) ??
    ([firstName, lastName].filter(Boolean).join(' ').trim() || null);

  const birthRaw = base?.birthDate ?? guest?.birth_date;
  const birthDate =
    typeof birthRaw === 'string' && birthRaw.length >= 10 ? birthRaw.slice(0, 10) : birthRaw ?? null;

  const expiryRaw = base?.expiryDate ?? source.expiry_date;
  const expiryDate =
    typeof expiryRaw === 'string' && expiryRaw.length >= 10 ? expiryRaw.slice(0, 10) : expiryRaw ?? null;

  return {
    documentType,
    fullName,
    firstName,
    lastName,
    middleName: base?.middleName ?? null,
    documentNumber: base?.documentNumber ?? str(source.document_number),
    documentSeries: base?.documentSeries ?? null,
    nationalityCode: base?.nationalityCode ?? str(source.nationality_code) ?? str(guest?.nationality_code),
    issuingCountryCode: base?.issuingCountryCode ?? str(source.issuing_country_code),
    birthDate,
    expiryDate,
    gender,
    motherName: base?.motherName ?? null,
    fatherName: base?.fatherName ?? null,
    maritalStatus: base?.maritalStatus ?? null,
    rawMrz: base?.rawMrz ?? null,
    confidence: base?.confidence ?? null,
    checksumsValid: base?.checksumsValid ?? null,
    warnings: base?.warnings ?? [],
  };
}

export function buildKbsCopyFields(
  parsed: ParsedDocument | null | undefined,
  opts?: { showEmpty?: boolean }
): KbsCopyField[] {
  if (!parsed) return [];
  const showEmpty = opts?.showEmpty === true;
  const out: KbsCopyField[] = [];
  const push = (key: string, label: string, raw: string | null | undefined) => {
    const value = str(raw);
    if (value) out.push({ key, label, value });
    else if (showEmpty) out.push({ key, label, value: '—' });
  };

  push('lastName', 'Soyad', isUsablePersonName(parsed.lastName) ? parsed.lastName : null);
  push('firstName', 'Ad', isUsablePersonName(parsed.firstName) ? parsed.firstName : null);
  push('middleName', 'İkinci ad', parsed.middleName);
  push('fullName', 'Tam ad', kbsDisplayFullName(parsed));

  push('documentNumber', 'Kimlik / pasaport no', parsed.documentNumber);
  push('documentSeries', 'Seri no', parsed.documentSeries);
  push('personalNumber', 'Kişisel / ulusal no', parsed.personalNumber);

  push('birthDate', 'Doğum tarihi', formatKbsTrDate(parsed.birthDate) ?? parsed.birthDate);
  push('placeOfBirth', 'Doğum yeri', parsed.placeOfBirth);

  const age = kbsAgeYearsFromBirthDate(parsed.birthDate);
  push('age', 'Yaş', age != null ? String(age) : null);

  push(
    'nationalityCode',
    'Ülke / Uyruk',
    formatKbsNationality(parsed.nationalityCode) ?? parsed.nationalityCode
  );
  push(
    'issuingCountryCode',
    'Veren ülke',
    formatKbsNationality(parsed.issuingCountryCode) ?? parsed.issuingCountryCode
  );
  push('expiryDate', 'Son geçerlilik', formatKbsTrDate(parsed.expiryDate) ?? parsed.expiryDate);

  push('gender', 'Cinsiyet', parsed.gender ? GENDER_LABEL[parsed.gender] ?? parsed.gender : null);
  push(
    'maritalStatus',
    'Medeni hal',
    parsed.maritalStatus ? MARITAL_LABEL[parsed.maritalStatus] ?? parsed.maritalStatus : null
  );
  push('motherName', 'Anne adı', isUsablePersonName(parsed.motherName) ? parsed.motherName : null);
  push('fatherName', 'Baba adı', isUsablePersonName(parsed.fatherName) ? parsed.fatherName : null);

  const docType =
    parsed.documentType === 'passport'
      ? 'Pasaport'
      : parsed.documentType === 'id_card'
        ? 'Kimlik'
        : parsed.documentType === 'residence_permit'
          ? 'İkamet'
          : parsed.documentType === 'other'
            ? 'Diğer belge'
            : null;
  push('documentType', 'Belge türü', docType);

  return out;
}

export function listCoreMissingIdFields(parsed: ParsedDocument): string[] {
  const missing: string[] = [];
  if (!isUsablePersonName(parsed.firstName)) missing.push('Ad');
  if (!isUsablePersonName(parsed.lastName)) missing.push('Soyad');
  const docDigits = (parsed.documentNumber ?? '').replace(/\D/g, '');
  if (docDigits.length < 6) missing.push('Kimlik / pasaport no');
  if (!parsed.birthDate) missing.push('Doğum tarihi');
  if (!parsed.nationalityCode) missing.push('Uyruk');
  if (!parsed.expiryDate) missing.push('Son kullanım tarihi');
  return missing;
}

export function isKbsCaptureOcrCoreComplete(parsed: ParsedDocument | null | undefined): boolean {
  if (!parsed) return false;
  return listCoreMissingIdFields(parsed).length === 0;
}

export function kbsCaptureHasReadableData(parsed: ParsedDocument | null | undefined): boolean {
  if (!parsed) return false;
  return buildKbsCopyFields(parsed).length >= 1;
}

function isKbsOcrInProgress(parsed: ParsedDocument | null | undefined): boolean {
  const w = parsed?.warnings;
  return Array.isArray(w) && (w.includes('ocr_pending') || w.includes('ocr_processing'));
}

function isKbsOcrFailed(parsed: ParsedDocument | null | undefined): boolean {
  const w = parsed?.warnings;
  return Array.isArray(w) && w.includes('ocr_failed');
}

export type KbsCaptureCardStatus = { label: string; tone: 'ok' | 'muted' | 'progress' };

export function kbsCaptureCardStatus(parsed: ParsedDocument | null | undefined): KbsCaptureCardStatus {
  if (!parsed) return { label: 'Bekleniyor', tone: 'muted' };
  if (isKbsOcrInProgress(parsed)) return { label: 'Okunuyor…', tone: 'progress' };
  if (kbsCaptureHasReadableData(parsed)) {
    return { label: isKbsCaptureOcrCoreComplete(parsed) ? 'Tamam' : 'Okundu', tone: 'ok' };
  }
  if (isKbsOcrFailed(parsed)) return { label: 'Okunamadı', tone: 'muted' };
  return { label: 'Bekleniyor', tone: 'muted' };
}

/** Bir satırdan (payload + sütunlar) zenginleştirilmiş temiz parsed üretir. */
export function parseRow(row: KbsCapturedDocumentRow, guest?: EnrichSource['guest']): ParsedDocument | null {
  return enrichKbsParsedFromSources(row.parsed_payload, {
    document_number: row.document_number,
    nationality_code: row.nationality_code,
    issuing_country_code: row.issuing_country_code,
    expiry_date: row.expiry_date,
    document_type: row.document_type,
    guest: guest ?? null,
  });
}
